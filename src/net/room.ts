// The whole access-control model for this prototype's multiplayer: a short code a player gives
// a friend. The server groups connections by this code and never mixes entities across rooms —
// so being in the same room *is* "these players know each other" (see server/index.ts). There is
// deliberately no further check once you're in: anyone sharing a room can edit anyone's house.
const ROOM_KEY = "sandbox-room-v1";
// No 0/O/1/I/L — easy to read aloud or type from a friend's screen.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/** Every browser starts in its own private room (its own freshly generated code) until it shares it or joins one. */
export function getOrCreateRoomCode(): string {
  try {
    const stored = localStorage.getItem(ROOM_KEY);
    if (stored) return stored;
  } catch {
    // fall through
  }
  const code = generateRoomCode();
  try {
    localStorage.setItem(ROOM_KEY, code);
  } catch {
    // best-effort persistence only
  }
  return code;
}

export function setRoomCode(code: string): string {
  const normalized = normalize(code) || generateRoomCode();
  try {
    localStorage.setItem(ROOM_KEY, normalized);
  } catch {
    // ignore
  }
  return normalized;
}
