// The "beginning of multiplayer" relay (see README "Multijoueur"). Deliberately dumb: it
// does not run any game logic (no scripts, no economy rules) — each connected browser runs
// its own full copy of GameEngine and is trusted to compute its own mutations correctly
// (exactly what "prototype" means here). This process only does two authoritative things,
// scoped to a *room* (a short code one player gives another — see src/net/room.ts, the whole
// access-control model: knowing the code is what "these players know each other" means, and
// nothing else is checked once you're in a room together — any member can edit anyone's house):
//   1. within a room, hand out a stable, unique house slot (left-to-right position in that
//      room's street) the first time it ever sees a given player id there,
//   2. store the latest version of every entity any room member has pushed, and relay it to
//      the rest of that room — last write wins, per entity, forever (in memory only, per room:
//      restarting this process forgets everything, which is fine since every client re-pushes
//      its own slice the moment it reconnects).
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

function emptyStore(): Store {
  return { players: new Map(), houses: new Map(), defs: new Map(), textures: new Map(), instances: new Map() };
}

interface Room {
  store: Store;
  slotByPlayer: Map<string, number>;
  nextSlot: number;
  socketPlayer: Map<WebSocket, string>;
  socketsByPlayer: Map<string, Set<WebSocket>>;
}

function emptyRoom(): Room {
  return { store: emptyStore(), slotByPlayer: new Map(), nextSlot: 0, socketPlayer: new Map(), socketsByPlayer: new Map() };
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    room = emptyRoom();
    rooms.set(code, room);
  }
  return room;
}

function assignSlot(room: Room, playerId: string): number {
  const existing = room.slotByPlayer.get(playerId);
  if (existing !== undefined) return existing;
  const slot = room.nextSlot++;
  room.slotByPlayer.set(playerId, slot);
  return slot;
}

function fullWorld(room: Room): WorldPatch {
  return {
    players: [...room.store.players.values()],
    houses: [...room.store.houses.values()],
    defs: [...room.store.defs.values()],
    textures: [...room.store.textures.values()],
    instances: [...room.store.instances.values()],
  };
}

function mergePatch(room: Room, patch: WorldPatch): void {
  for (const p of patch.players) room.store.players.set(p.id, p);
  for (const h of patch.houses) room.store.houses.set(h.id, h);
  for (const d of patch.defs) room.store.defs.set(d.id, d);
  for (const t of patch.textures) room.store.textures.set(t.id, t);
  for (const i of patch.instances) room.store.instances.set(i.id, i);
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, exclude?: WebSocket): void {
  const payload = JSON.stringify(msg);
  for (const ws of room.socketPlayer.keys()) {
    if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// Which room each live socket currently belongs to — a socket only ever sends messages other
// than "hello" after joining one, but message handling needs to look the room back up.
const roomBySocket = new Map<WebSocket, string>();

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
      const roomCode = msg.roomCode;
      roomBySocket.set(ws, roomCode);
      const room = getOrCreateRoom(roomCode);

      room.socketPlayer.set(ws, msg.playerId);
      let sockets = room.socketsByPlayer.get(msg.playerId);
      if (!sockets) { sockets = new Set(); room.socketsByPlayer.set(msg.playerId, sockets); }
      const wasOnline = sockets.size > 0;
      sockets.add(ws);

      const slotIndex = assignSlot(room, msg.playerId);
      send(ws, {
        type: "welcome",
        slotIndex,
        world: fullWorld(room),
        online: [...room.socketsByPlayer.keys()].filter((id) => (room.socketsByPlayer.get(id)?.size ?? 0) > 0),
      });
      if (!wasOnline) broadcast(room, { type: "presence", playerId: msg.playerId, online: true }, ws);
      return;
    }

    const roomCode = roomBySocket.get(ws);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    if (!room) return; // no "hello" (and therefore no room) yet — ignore

    if (msg.type === "sync") {
      if (isPatchEmpty(msg.patch)) return;
      mergePatch(room, msg.patch);
      broadcast(room, { type: "patch", patch: msg.patch }, ws);
      return;
    }

    if (msg.type === "speech") {
      broadcast(room, { type: "speech", targetInstanceId: msg.targetInstanceId, text: msg.text }, ws);
      return;
    }
  });

  ws.on("close", () => {
    const roomCode = roomBySocket.get(ws);
    roomBySocket.delete(ws);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    if (!room) return;

    const playerId = room.socketPlayer.get(ws);
    room.socketPlayer.delete(ws);
    if (!playerId) return;
    const sockets = room.socketsByPlayer.get(playerId);
    sockets?.delete(ws);
    if (sockets && sockets.size === 0) {
      room.socketsByPlayer.delete(playerId);
      broadcast(room, { type: "presence", playerId, online: false });
    }
    // An empty room is just left in `rooms` (harmless, in-memory only) so a lone member who
    // briefly reconnects doesn't lose their slot assignment.
  });
});

// eslint-disable-next-line no-console
console.log(`[sandbox] serveur multijoueur en écoute sur ws://localhost:${PORT}`);
