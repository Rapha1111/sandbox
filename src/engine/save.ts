import type { SaveGame } from "./types";

const STORAGE_KEY = "sandbox-save-v1";

/**
 * Persistence is isolated behind this tiny interface on purpose: the solo
 * prototype saves to localStorage, but a later networked version only needs
 * to swap this implementation for one that talks to a server — nothing in
 * GameEngine depends on *how* the save happens.
 */
export interface SaveManager {
  load(): SaveGame | null;
  save(game: SaveGame): void;
  clear(): void;
}

export class LocalStorageSaveManager implements SaveManager {
  load(): SaveGame | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveGame;
      if (parsed.version !== 1) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(game: SaveGame): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch (e) {
      console.error("Échec de la sauvegarde", e);
    }
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
