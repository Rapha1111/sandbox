import { engine, useGameStore, toggleInventory, createAndOpenNewObject } from "../data/store";
import { HOUSE_MAX_SIZE, houseExpandCost } from "../engine/GameEngine";
import { RoomPanel } from "./RoomPanel";
import "./HUD.css";

export function HUD() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const mpConnected = useGameStore((s) => s.mpConnected);
  const onlinePlayerIds = useGameStore((s) => s.onlinePlayerIds);
  const player = engine.getPlayer(currentPlayerId);
  if (!player) return null;

  const house = engine.getHouse(player.houseId);
  const atMaxSize = !house || house.width >= HOUSE_MAX_SIZE;
  const cost = house ? houseExpandCost(house.expansions) : 0;

  function handleExpand() {
    if (!house) return;
    engine.expandHouse(currentPlayerId, house.id);
  }

  const others = onlinePlayerIds.filter((id) => id !== currentPlayerId);

  return (
    <div className="hud">
      <div className="hud__left">
        <div className="hud__player">
          <span className="hud__name">{player.name}</span>
          <span className="hud__coins">🪙 {player.money}</span>
        </div>
        {house && (
          <button
            className="hud__button"
            onClick={handleExpand}
            disabled={atMaxSize || player.money < cost}
            title={atMaxSize ? "Taille maximale atteinte" : `Agrandir votre maison (${house.width}×${house.depth} → ${house.width + 2}×${house.depth + 2})`}
          >
            🏡 {atMaxSize ? "Maison au maximum" : `Agrandir (${cost} 🪙)`}
          </button>
        )}
        <div className="hud__presence" title={mpConnected ? "Connecté au serveur multijoueur" : "Hors ligne — monde local uniquement"}>
          <span className={mpConnected ? "hud__presence-dot hud__presence-dot--on" : "hud__presence-dot"} />
          {mpConnected ? `${others.length} joueur(s) en ligne` : "Hors ligne"}
        </div>
        <RoomPanel />
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
