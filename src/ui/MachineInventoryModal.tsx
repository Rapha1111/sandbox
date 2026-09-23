import { useState } from "react";
import { engine, useGameStore, closeMachineInventory } from "../data/store";
import "./MachineInventoryModal.css";

export function MachineInventoryModal() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const instanceId = useGameStore((s) => s.viewingInstanceInventoryId);
  const [depositAmount, setDepositAmount] = useState(10);
  const [withdrawAmount, setWithdrawAmount] = useState(10);
  const [error, setError] = useState<string | null>(null);

  if (!instanceId) return null;
  const instance = engine.getInstance(instanceId);
  const def = instance ? engine.getDefinition(instance.defId) : undefined;
  if (!instance || !def) {
    closeMachineInventory();
    return null;
  }

  const player = engine.getPlayer(currentPlayerId);
  const heldStacks = engine.listInstanceInventory(instanceId);
  const playerStacks = engine.listInventory(currentPlayerId);

  function run(action: () => { ok: boolean; reason?: string }) {
    const result = action();
    setError(result.ok ? null : result.reason ?? "Erreur");
  }

  return (
    <div className="machine-inv__backdrop" onClick={closeMachineInventory}>
      <div className="machine-inv" onClick={(e) => e.stopPropagation()}>
        <div className="machine-inv__header">
          <h3>📦 {def.name}</h3>
          <button onClick={closeMachineInventory}>✕</button>
        </div>
        {error && <div className="machine-inv__error">{error}</div>}

        <section className="machine-inv__section">
          <div className="machine-inv__section-title">Solde de la machine : 🪙 {instance.wallet}</div>
          <div className="machine-inv__money-row">
            <input
              type="number"
              min={1}
              value={depositAmount}
              onChange={(e) => setDepositAmount(Math.max(1, Number(e.target.value) || 1))}
            />
            <button onClick={() => run(() => engine.depositMoneyToInstance(currentPlayerId, instanceId, depositAmount))}>
              Déposer (vous avez 🪙 {player?.money ?? 0})
            </button>
          </div>
          <div className="machine-inv__money-row">
            <input
              type="number"
              min={1}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(Math.max(1, Number(e.target.value) || 1))}
            />
            <button onClick={() => run(() => engine.withdrawMoneyFromInstance(currentPlayerId, instanceId, withdrawAmount))}>
              Retirer
            </button>
          </div>
        </section>

        <div className="machine-inv__columns">
          <section className="machine-inv__section">
            <div className="machine-inv__section-title">Contenu de la machine</div>
            {heldStacks.length === 0 && <p className="machine-inv__empty">Vide.</p>}
            {heldStacks.map((stack) => {
              const stackDef = engine.getDefinition(stack.defId);
              if (!stackDef) return null;
              return (
                <div className="machine-inv__row" key={stack.defId}>
                  <span>{stackDef.name} ×{stack.instanceIds.length}</span>
                  <button onClick={() => run(() => engine.withdrawItemFromInstance(currentPlayerId, instanceId, stack.instanceIds[0]))}>
                    Retirer
                  </button>
                </div>
              );
            })}
          </section>

          <section className="machine-inv__section">
            <div className="machine-inv__section-title">Votre inventaire</div>
            {playerStacks.length === 0 && <p className="machine-inv__empty">Vide.</p>}
            {playerStacks.map((stack) => {
              const stackDef = engine.getDefinition(stack.defId);
              if (!stackDef) return null;
              return (
                <div className="machine-inv__row" key={stack.defId}>
                  <span>{stackDef.name} ×{stack.instanceIds.length}</span>
                  <button onClick={() => run(() => engine.depositItemToInstance(currentPlayerId, instanceId, stack.instanceIds[0]))}>
                    Déposer
                  </button>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
