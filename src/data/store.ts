import { create } from "zustand";
import { GameEngine } from "../engine/GameEngine";
import { LocalStorageSaveManager } from "../engine/save";
import { getOrCreateLocalIdentity } from "../net/identity";
import { connectMultiplayer } from "../net/multiplayer";
import { getOrCreateRoomCode, setRoomCode as persistRoomCode } from "../net/room";

export const localIdentity = getOrCreateLocalIdentity();
export const engine = new GameEngine(new LocalStorageSaveManager(), localIdentity.id, localIdentity.name);
const initialRoomCode = getOrCreateRoomCode();
const multiplayer = connectMultiplayer(engine, localIdentity, initialRoomCode);

interface UiState {
  /** Bumped on every engine change so components subscribed via useGameStore re-render. */
  tick: number;
  currentPlayerId: string;
  activeHouseId: string;
  editingDefId: string | null;
  view: "world" | "editor";
  inventoryOpen: boolean;
  placingInstanceId: string | null;
  apiHelpOpen: boolean;
  /** Right-click context menu on a placed block: which instance, and where on screen. */
  contextMenu: { instanceId: string; x: number; y: number } | null;
  /** Which placed block's own storage (wallet + items) is being viewed/managed. */
  viewingInstanceInventoryId: string | null;
  /** Multiplayer relay connection (server/index.ts) — see src/net/multiplayer.ts. */
  mpConnected: boolean;
  onlinePlayerIds: string[];
  /** The relay URL this client is actually trying to reach — shown in the HUD to make a misconfigured deployment (e.g. VITE_WS_URL unset) obvious instead of a silent "Hors ligne". */
  wsUrl: string;
  /** The room code (src/net/room.ts) this browser is currently in — the whole access-control model. */
  roomCode: string;
  /**
   * A script called object.teleport_to() and asked to walk the given player to a spot
   * (house-local coordinates — the target house isn't necessarily the one they're in right
   * now). World.tsx consumes this into its walkTargetRef (world coordinates, via the house
   * layout) and clears it — see GameEngine.setOnRequestWalk.
   */
  pendingWalkRequest: { forPlayerId: string; houseId: string; x: number; z: number } | null;
}

const localPlayer = engine.getPlayer(localIdentity.id)!;

export const useGameStore = create<UiState>()(() => ({
  tick: 0,
  currentPlayerId: localPlayer.id,
  activeHouseId: localPlayer.houseId,
  editingDefId: null,
  view: "world",
  inventoryOpen: false,
  placingInstanceId: null,
  apiHelpOpen: false,
  contextMenu: null,
  viewingInstanceInventoryId: null,
  mpConnected: false,
  onlinePlayerIds: [],
  wsUrl: "",
  roomCode: initialRoomCode,
  pendingWalkRequest: null,
}));

engine.subscribe(() => {
  useGameStore.setState((s) => ({ tick: s.tick + 1 }));
});

multiplayer.subscribe((state) => {
  useGameStore.setState({
    mpConnected: state.connected,
    onlinePlayerIds: [...state.onlinePlayerIds],
    roomCode: state.roomCode,
    wsUrl: state.wsUrl,
  });
});

/** Leaves the current room and joins another — share your own code with a friend, or enter theirs. */
export function joinRoom(code: string): void {
  const normalized = persistRoomCode(code);
  multiplayer.setRoom(normalized);
}

engine.setOnRequestWalk((playerId, houseId, x, z) => {
  useGameStore.setState({ pendingWalkRequest: { forPlayerId: playerId, houseId, x, z } });
});

export function clearWalkRequest(): void {
  useGameStore.setState({ pendingWalkRequest: null });
}

export function openEditor(defId: string): void {
  useGameStore.setState({ editingDefId: defId, view: "editor" });
}

export function createAndOpenNewObject(): void {
  const playerId = useGameStore.getState().currentPlayerId;
  const def = engine.createDraftDefinition(playerId);
  openEditor(def.id);
}

export function closeEditor(): void {
  useGameStore.setState({ editingDefId: null, view: "world" });
}

export function toggleInventory(): void {
  useGameStore.setState((s) => ({ inventoryOpen: !s.inventoryOpen }));
}

export function startPlacing(instanceId: string): void {
  useGameStore.setState({ placingInstanceId: instanceId, inventoryOpen: false });
}

export function cancelPlacing(): void {
  useGameStore.setState({ placingInstanceId: null });
}

export function toggleApiHelp(): void {
  useGameStore.setState((s) => ({ apiHelpOpen: !s.apiHelpOpen }));
}

export function openContextMenu(instanceId: string, x: number, y: number): void {
  useGameStore.setState({ contextMenu: { instanceId, x, y } });
}

export function closeContextMenu(): void {
  useGameStore.setState({ contextMenu: null });
}

export function openMachineInventory(instanceId: string): void {
  useGameStore.setState({ viewingInstanceInventoryId: instanceId, contextMenu: null });
}

export function closeMachineInventory(): void {
  useGameStore.setState({ viewingInstanceInventoryId: null });
}

/**
 * True whenever a modal/panel is covering the world — the Object Creator, a
 * transaction or prompt confirmation, the inventory, the API help, a block's
 * context menu or its storage panel. Used to stop WASD/arrow keys typed while
 * filling in a field (or just clicking a button) from also moving the player
 * behind the dialog.
 */
export function isWorldInputBlocked(): boolean {
  const s = useGameStore.getState();
  if (s.view === "editor") return true;
  if (s.inventoryOpen) return true;
  if (s.apiHelpOpen) return true;
  if (s.contextMenu) return true;
  if (s.viewingInstanceInventoryId) return true;
  if (engine.getPendingTransactions().some((t) => t.playerId === s.currentPlayerId)) return true;
  if (engine.getPendingPrompts().some((p) => p.playerId === s.currentPlayerId)) return true;
  return false;
}

/** Move an already-placed block: pick it up then immediately re-enter placement mode for it. */
export function startMoving(instanceId: string): void {
  const playerId = useGameStore.getState().currentPlayerId;
  const result = engine.pickupToInventory(instanceId, playerId);
  useGameStore.setState({ contextMenu: null });
  if (result.ok) startPlacing(instanceId);
}
