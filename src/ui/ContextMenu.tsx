import { engine, useGameStore, closeContextMenu, openMachineInventory, startMoving } from "../data/store";
import "./ContextMenu.css";

export function ContextMenu() {
  useGameStore((s) => s.tick);
  const menu = useGameStore((s) => s.contextMenu);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  if (!menu) return null;

  const instance = engine.getInstance(menu.instanceId);
  const def = instance ? engine.getDefinition(instance.defId) : undefined;

  function handleDelete() {
    if (!menu) return;
    engine.deleteInstance(menu.instanceId, currentPlayerId);
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
        <button className="context-menu__danger" onClick={handleDelete}>🗑️ Supprimer</button>
      </div>
    </div>
  );
}
