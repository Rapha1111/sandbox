import { engine, useGameStore, toggleInventory, startPlacing, openEditor } from "../data/store";
import "./Inventory.css";

export function Inventory() {
  useGameStore((s) => s.tick);
  const open = useGameStore((s) => s.inventoryOpen);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  if (!open) return null;

  const stacks = engine.listInventory(currentPlayerId);

  return (
    <div className="inventory__backdrop" onClick={toggleInventory}>
      <div className="inventory" onClick={(e) => e.stopPropagation()}>
        <div className="inventory__header">
          <h3>Inventaire</h3>
          <button onClick={toggleInventory}>✕</button>
        </div>
        {stacks.length === 0 && (
          <p className="inventory__empty">
            Vide pour l'instant. Cliquez sur « Créer un objet » pour fabriquer votre premier objet.
          </p>
        )}
        <div className="inventory__grid">
          {stacks.map((stack) => {
            const def = engine.getDefinition(stack.defId);
            if (!def) return null;
            return (
              <div key={stack.defId} className="inventory__item">
                <div className="inventory__thumb">
                  <TextureThumb defId={def.id} />
                  <span className="inventory__count">×{stack.instanceIds.length}</span>
                </div>
                <div className="inventory__name">{def.name}</div>
                <div className="inventory__actions">
                  <button onClick={() => startPlacing(stack.instanceIds[0])}>Placer</button>
                  <button onClick={() => openEditor(def.id)}>Éditer</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TextureThumb({ defId }: { defId: string }) {
  const def = engine.getDefinition(defId);
  const texId = def?.textures.front ?? def?.textures.top ?? Object.values(def?.textures ?? {})[0];
  const tex = texId ? engine.getTexture(texId) : undefined;
  if (!tex) return <div className="inventory__thumb-placeholder">?</div>;
  return <PixelThumb pixels={tex.pixels} size={tex.size} />;
}

function PixelThumb({ pixels, size }: { pixels: string[]; size: number }) {
  return (
    <svg width={40} height={40} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: "pixelated" }}>
      {pixels.map((c, i) =>
        c ? <rect key={i} x={i % size} y={Math.floor(i / size)} width={1} height={1} fill={c} /> : null
      )}
    </svg>
  );
}
