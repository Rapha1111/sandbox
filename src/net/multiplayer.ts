// The client half of the relay in server/index.ts. Connects to a *room* (a short code — see
// src/net/room.ts, the whole access-control model: only players sharing a code exchange data),
// pushes this browser's own corner of the world at connection time (spec: "envoyé au serveur à
// la connexion"), then keeps flushing whatever the local GameEngine marks dirty (own edits, or
// the effects of building in a room-mate's house — no ownership check anymore, see GameEngine's
// placeFromInventory/recoverInstance) and applies whatever the server relays back. If the server
// is unreachable, the app just keeps working as a single-player world — nothing here is required
// for the base game.
import type { GameEngine } from "../engine/GameEngine";
import type { ClientMessage, ServerMessage } from "./protocol";
import type { LocalIdentity } from "./identity";

export interface ConnectionState {
  connected: boolean;
  roomCode: string;
  onlinePlayerIds: Set<string>;
}

type Listener = (state: ConnectionState) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const FLUSH_DEBOUNCE_MS = 400;

function resolveWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (typeof fromEnv === "string" && fromEnv) return fromEnv;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname}:8787`;
}

export interface MultiplayerHandle {
  subscribe(fn: Listener): () => void;
  /** Leaves the current room (if any) and joins a different one — drops everyone else's data first. */
  setRoom(roomCode: string): void;
}

export function connectMultiplayer(engine: GameEngine, identity: LocalIdentity, initialRoomCode: string): MultiplayerHandle {
  let ws: WebSocket | null = null;
  let roomCode = initialRoomCode;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const onlinePlayerIds = new Set<string>();
  const listeners = new Set<Listener>();
  let connected = false;

  function snapshot(): ConnectionState {
    return { connected, roomCode, onlinePlayerIds: new Set(onlinePlayerIds) };
  }

  function emit(): void {
    const state = snapshot();
    for (const l of listeners) l(state);
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  function flush(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return; // dirty set stays put, retried once reconnected
    if (!engine.hasDirty()) return;
    const patch = engine.consumeDirty();
    const msg: ClientMessage = { type: "sync", patch };
    ws.send(JSON.stringify(msg));
  }

  function handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "welcome": {
        engine.applyRemotePatch(msg.world);
        const me = engine.getPlayer(identity.id);
        if (me) engine.applyAssignedSlot(me.houseId, msg.slotIndex);
        onlinePlayerIds.clear();
        for (const id of msg.online) onlinePlayerIds.add(id);
        onlinePlayerIds.add(identity.id);
        emit();
        // The "at connection" push: everything this browser knows about itself.
        engine.markOwnSliceDirty();
        scheduleFlush();
        break;
      }
      case "patch":
        engine.applyRemotePatch(msg.patch);
        break;
      case "presence":
        if (msg.online) onlinePlayerIds.add(msg.playerId);
        else onlinePlayerIds.delete(msg.playerId);
        emit();
        break;
      case "speech":
        engine.pushRemoteSpeechBubble(msg.targetInstanceId, msg.text);
        break;
    }
  }

  function connect(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(resolveWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      connected = true;
      reconnectDelay = RECONNECT_BASE_MS;
      const hello: ClientMessage = { type: "hello", playerId: identity.id, name: identity.name, roomCode };
      socket.send(JSON.stringify(hello));
      emit();
    };
    socket.onmessage = (ev) => {
      try {
        handleMessage(JSON.parse(ev.data as string) as ServerMessage);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = () => {
      connected = false;
      ws = null;
      emit();
      scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 1.7);
  }

  engine.setOnLocalSpeech((targetInstanceId, text) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = { type: "speech", targetInstanceId, text };
    ws.send(JSON.stringify(msg));
  });

  engine.subscribe(() => {
    if (engine.hasDirty()) scheduleFlush();
  });

  connect();

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },
    setRoom(nextRoomCode: string) {
      if (nextRoomCode === roomCode) return;
      roomCode = nextRoomCode;
      onlinePlayerIds.clear();
      // Drop everyone else's data before the new room's "welcome" arrives, or their houses would
      // keep rendering (stale) right up until the first patch from the new room overwrites them.
      engine.pruneToLocalOnly();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectDelay = RECONNECT_BASE_MS;
      if (ws) {
        // Detach handlers first so the old socket's close doesn't also trigger scheduleReconnect
        // — connect() below opens the new one immediately, no need to wait for a backoff.
        const old = ws;
        old.onopen = null;
        old.onmessage = null;
        old.onclose = null;
        old.onerror = null;
        old.close();
        ws = null;
      }
      connected = false;
      connect();
      emit();
    },
  };
}
