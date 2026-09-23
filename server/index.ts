// The "beginning of multiplayer" relay (see README "Multijoueur"). Deliberately dumb: it
// does not run any game logic (no scripts, no economy rules) — each connected browser runs
// its own full copy of GameEngine and is trusted to compute its own mutations correctly
// (exactly what "prototype" means here). This process only does two authoritative things:
//   1. hand out a stable, unique house slot (left-to-right position in the street) the first
//      time it ever sees a given player id,
//   2. store the latest version of every entity any client has pushed, and relay it to
//      everyone else — last write wins, per entity, forever (in memory only: restarting this
//      process forgets everything, which is fine since every client re-pushes its own slice
//      the moment it reconnects).
// A real backend would replace this with an authoritative simulation and a database; nothing
// in the client depends on *how* this process is implemented, only on the protocol in
// src/net/protocol.ts — same boundary GameEngine's own save.ts draws for persistence.
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage, WorldPatch } from "../src/net/protocol";
import { isPatchEmpty } from "../src/net/protocol";

const PORT = Number(process.env.PORT) || 8787;

interface Store {
  players: Map<string, WorldPatch["players"][number]>;
  houses: Map<string, WorldPatch["houses"][number]>;
  defs: Map<string, WorldPatch["defs"][number]>;
  textures: Map<string, WorldPatch["textures"][number]>;
  instances: Map<string, WorldPatch["instances"][number]>;
}

const store: Store = {
  players: new Map(),
  houses: new Map(),
  defs: new Map(),
  textures: new Map(),
  instances: new Map(),
};

const slotByPlayer = new Map<string, number>();
let nextSlot = 0;

function assignSlot(playerId: string): number {
  const existing = slotByPlayer.get(playerId);
  if (existing !== undefined) return existing;
  const slot = nextSlot++;
  slotByPlayer.set(playerId, slot);
  return slot;
}

function fullWorld(): WorldPatch {
  return {
    players: [...store.players.values()],
    houses: [...store.houses.values()],
    defs: [...store.defs.values()],
    textures: [...store.textures.values()],
    instances: [...store.instances.values()],
  };
}

function mergePatch(patch: WorldPatch): void {
  for (const p of patch.players) store.players.set(p.id, p);
  for (const h of patch.houses) store.houses.set(h.id, h);
  for (const d of patch.defs) store.defs.set(d.id, d);
  for (const t of patch.textures) store.textures.set(t.id, t);
  for (const i of patch.instances) store.instances.set(i.id, i);
}

const socketPlayer = new Map<WebSocket, string>();
const socketsByPlayer = new Map<string, Set<WebSocket>>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage, exclude?: WebSocket): void {
  const payload = JSON.stringify(msg);
  for (const ws of socketPlayer.keys()) {
    if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "hello") {
      socketPlayer.set(ws, msg.playerId);
      let sockets = socketsByPlayer.get(msg.playerId);
      if (!sockets) { sockets = new Set(); socketsByPlayer.set(msg.playerId, sockets); }
      const wasOnline = sockets.size > 0;
      sockets.add(ws);

      const slotIndex = assignSlot(msg.playerId);
      send(ws, { type: "welcome", slotIndex, world: fullWorld(), online: [...socketsByPlayer.keys()].filter((id) => (socketsByPlayer.get(id)?.size ?? 0) > 0) });
      if (!wasOnline) broadcast({ type: "presence", playerId: msg.playerId, online: true }, ws);
      return;
    }

    if (msg.type === "sync") {
      if (isPatchEmpty(msg.patch)) return;
      mergePatch(msg.patch);
      broadcast({ type: "patch", patch: msg.patch }, ws);
      return;
    }

    if (msg.type === "speech") {
      broadcast({ type: "speech", targetInstanceId: msg.targetInstanceId, text: msg.text }, ws);
      return;
    }
  });

  ws.on("close", () => {
    const playerId = socketPlayer.get(ws);
    socketPlayer.delete(ws);
    if (!playerId) return;
    const sockets = socketsByPlayer.get(playerId);
    sockets?.delete(ws);
    if (sockets && sockets.size === 0) {
      socketsByPlayer.delete(playerId);
      broadcast({ type: "presence", playerId, online: false });
    }
  });
});

// eslint-disable-next-line no-console
console.log(`[sandbox] serveur multijoueur en écoute sur ws://localhost:${PORT}`);
