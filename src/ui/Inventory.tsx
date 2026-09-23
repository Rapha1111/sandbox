import { useState } from "react";
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

        <SelfGivePanel currentPlayerId={currentPlayerId} />
      </div>
    </div>
  );
}

function SelfGivePanel({ currentPlayerId }: { currentPlayerId: string }) {
  const created = engine.listDefinitionsByCreator(currentPlayerId).filter((d) => d.published);
  const [selectedDefId, setSelectedDefId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  if (created.length === 0) return null;
  const defId = selectedDefId || created[0].id;

  function handleSelfGive() {
    const result = engine.selfGiveInstances(currentPlayerId, defId, quantity);
    setMessage(result.ok ? `✅ ${quantity}× ajouté(s)` : `❌ ${result.reason}`);
  }

  return (
    <div className="inventory__selfgive">
      <div className="inventory__selfgive-header">Se donner un objet (vos créations)</div>
      <div className="inventory__selfgive-row">
        <select value={defId} onChange={(e) => setSelectedDefId(e.target.value)}>
          {created.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
        />
        <button onClick={handleSelfGive}>Se le donner</button>
      </div>
      {message && <p className="inventory__selfgive-msg">{message}</p>}
    </div>
  );
}

function TextureThumb({ defId }: { defId: string }) {
  const def = engine.getDefinition(defId);
  if (!def) return <div className="inventory__thumb-placeholder">?</div>;
  const tex = engine.resolveLibraryTexture(def, def.textures.front ?? def.textures.top);
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
