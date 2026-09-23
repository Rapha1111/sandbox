import { useGameStore, engine } from "../data/store";
import "./TransactionModal.css";

export function TransactionModal() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const tx = engine.getPendingTransactions().find((t) => t.playerId === currentPlayerId);
  if (!tx) return null;

  const isObject = tx.kind === "request_object";

  return (
    <div className="tx-modal__backdrop">
      <div className="tx-modal">
        <h3>{isObject ? "DEMANDE D'OBJET" : "DEMANDE DE PAIEMENT"}</h3>
        <p className="tx-modal__source">{tx.sourceDefName}</p>
        <p className="tx-modal__desc">Cette machine demande :</p>
        <p className="tx-modal__amount">{isObject ? `1× ${tx.objectDefName}` : `${tx.amount} coins`}</p>
        <div className="tx-modal__actions">
          <button className="tx-modal__refuse" onClick={() => engine.resolveTransaction(tx.id, false)}>
            Refuser
          </button>
          <button className="tx-modal__accept" onClick={() => engine.resolveTransaction(tx.id, true)}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
