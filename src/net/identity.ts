// Who *this browser* is, across sessions — deliberately kept out of the save-game blob
// (sandbox-save-v1), because that blob is becoming "everything this client currently knows
// about the shared world" (itself + everyone it has synced with) rather than just "me".
import { genId } from "../engine/idgen";

const IDENTITY_KEY = "sandbox-identity-v1";

export interface LocalIdentity {
  id: string;
  name: string;
}

const ADJECTIVES = ["Curieux", "Rapide", "Malin", "Discret", "Joyeux", "Vif", "Calme", "Hardi"];
const ANIMALS = ["Renard", "Loutre", "Faucon", "Lynx", "Héron", "Blaireau", "Martre", "Cerf"];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

export function getOrCreateLocalIdentity(): LocalIdentity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalIdentity;
      if (parsed.id && parsed.name) return parsed;
    }
  } catch {
    // fall through to creating a fresh one
  }
  const identity: LocalIdentity = { id: genId("player"), name: randomName() };
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // best-effort persistence only — worst case we generate a new one next load
  }
  return identity;
}

export function renameLocalIdentity(name: string): void {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    const current = raw ? (JSON.parse(raw) as LocalIdentity) : null;
    if (!current) return;
    const next: LocalIdentity = { ...current, name };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
