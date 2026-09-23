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
