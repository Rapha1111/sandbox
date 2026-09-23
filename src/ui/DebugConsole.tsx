import { useGameStore, engine } from "../data/store";
import "./DebugConsole.css";

const LEVEL_ICON: Record<string, string> = {
  info: "•",
  call: "→",
  result: "✓",
  error: "✕",
};

export function DebugConsole({ compact = false }: { compact?: boolean }) {
  useGameStore((s) => s.tick);
  const entries = engine.getDebugLog();
  const shown = compact ? entries.slice(0, 12) : entries;

  return (
    <div className={compact ? "debug-console debug-console--compact" : "debug-console"}>
      <div className="debug-console__header">
        <span>[DEBUG] Console</span>
        {!compact && <button onClick={() => engine.clearDebugLog()}>Effacer</button>}
      </div>
      <div className="debug-console__body">
        {shown.length === 0 && <div className="debug-console__empty">Aucun évènement pour l'instant.</div>}
        {shown.map((e) => (
          <div key={e.id} className={`debug-console__line debug-console__line--${e.level}`}>
            <span className="debug-console__icon">{LEVEL_ICON[e.level]}</span>
            <span>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
