import { useState } from "react";
import { useGameStore, joinRoom } from "../data/store";
import "./RoomPanel.css";

/**
 * The entire access-control model for multiplayer (see src/net/room.ts): a short code you give
 * a friend so the server knows "these two players know each other" and lets them see — and
 * fully edit — each other's houses. This panel shows your own code (to share) and a field to
 * join someone else's.
 */
export function RoomPanel() {
  const roomCode = useGameStore((s) => s.roomCode);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable (e.g. insecure context) — the code is still shown, selectable by hand
    }
  }

  function handleJoin() {
    if (!draft.trim()) return;
    joinRoom(draft);
    setDraft("");
    setOpen(false);
  }

  return (
    <div className="room-panel">
      <button className="hud__button" onClick={() => setOpen((o) => !o)} title="Salon multijoueur : qui peut voir et modifier votre maison">
        🔑 {roomCode}
      </button>
      {open && (
        <div className="room-panel__popover">
          <p className="room-panel__hint">
            Donnez ce code à un ami pour qu'il rejoigne votre salon — vous pourrez alors voir et
            modifier vos maisons respectives.
          </p>
          <div className="room-panel__code-row">
            <code className="room-panel__code">{roomCode}</code>
            <button onClick={handleCopy}>{copied ? "Copié !" : "Copier"}</button>
          </div>
          <p className="room-panel__hint">Ou rejoindre le salon d'un ami :</p>
          <div className="room-panel__join-row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Code du salon"
              maxLength={12}
            />
            <button onClick={handleJoin} disabled={!draft.trim()}>Rejoindre</button>
          </div>
        </div>
      )}
    </div>
  );
}
