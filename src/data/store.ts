import { create } from "zustand";
import { GameEngine } from "../engine/GameEngine";
import { LocalStorageSaveManager } from "../engine/save";

export const engine = new GameEngine(new LocalStorageSaveManager());

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
}

const firstPlayer = engine.listPlayers()[0];

export const useGameStore = create<UiState>()(() => ({
  tick: 0,
  currentPlayerId: firstPlayer.id,
  activeHouseId: firstPlayer.houseId,
  editingDefId: null,
  view: "world",
  inventoryOpen: false,
  placingInstanceId: null,
  apiHelpOpen: false,
  contextMenu: null,
  viewingInstanceInventoryId: null,
}));

engine.subscribe(() => {
  useGameStore.setState((s) => ({ tick: s.tick + 1 }));
});

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
