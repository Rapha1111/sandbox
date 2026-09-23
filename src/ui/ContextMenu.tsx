import { engine, useGameStore, closeContextMenu, openMachineInventory, startMoving } from "../data/store";
import "./ContextMenu.css";

export function ContextMenu() {
  useGameStore((s) => s.tick);
  const menu = useGameStore((s) => s.contextMenu);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  if (!menu) return null;

  const instance = engine.getInstance(menu.instanceId);
  const def = instance ? engine.getDefinition(instance.defId) : undefined;

  function handleRecover() {
    if (!menu) return;
    engine.recoverInstance(menu.instanceId, currentPlayerId);
    closeContextMenu();
  }

  return (
    <div className="context-menu__backdrop" onClick={closeContextMenu} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="context-menu"
        style={{ left: menu.x, top: menu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {def && <div className="context-menu__title">{def.name}</div>}
        <button onClick={() => openMachineInventory(menu.instanceId)}>📦 Inventaire</button>
        <button onClick={() => startMoving(menu.instanceId)}>✋ Déplacer</button>
        <button onClick={handleRecover} title="Récupère le bloc, son solde et son contenu dans votre inventaire">
          ↩️ Récupérer
        </button>
      </div>
    </div>
  );
}
