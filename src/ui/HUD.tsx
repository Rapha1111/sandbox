import { engine, useGameStore, toggleInventory, createAndOpenNewObject } from "../data/store";
import "./HUD.css";

export function HUD() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const player = engine.getPlayer(currentPlayerId);
  if (!player) return null;

  return (
    <div className="hud">
      <div className="hud__left">
        <div className="hud__player">
          <span className="hud__name">{player.name}</span>
          <span className="hud__coins">🪙 {player.money}</span>
        </div>
      </div>
      <div className="hud__right">
        <button className="hud__button" onClick={toggleInventory}>🎒 Inventaire</button>
        <button className="hud__button hud__button--accent" onClick={createAndOpenNewObject}>
          ✨ Créer un objet
        </button>
      </div>
    </div>
  );
}
