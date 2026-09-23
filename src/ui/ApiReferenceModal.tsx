import { useGameStore, toggleApiHelp } from "../data/store";
import { API_GROUP_LABEL, API_REFERENCE, type ApiGroup } from "../engine/apiReference";
import "./ApiReferenceModal.css";

const GROUPS: ApiGroup[] = ["events", "player", "object", "builtins"];

export function ApiReferenceModal() {
  const open = useGameStore((s) => s.apiHelpOpen);
  if (!open) return null;

  return (
    <div className="api-help__backdrop" onClick={toggleApiHelp}>
      <div className="api-help" onClick={(e) => e.stopPropagation()}>
        <div className="api-help__header">
          <h3>📖 Commandes disponibles</h3>
          <button onClick={toggleApiHelp}>✕</button>
        </div>
        <p className="api-help__intro">
          Liste complète de ce qu'un script peut appeler. Les commandes <span className="api-help__tag api-help__tag--sensitive">sensibles</span> sont
          validées par le moteur (et peuvent demander une confirmation au joueur) ; les commandes <span className="api-help__tag api-help__tag--local">locales</span> s'exécutent
          immédiatement.
        </p>
        <div className="api-help__body">
          {GROUPS.map((group) => (
            <div key={group} className="api-help__group">
              <h4>{API_GROUP_LABEL[group]}</h4>
              {API_REFERENCE.filter((e) => e.group === group).map((entry) => (
                <div className="api-help__entry" key={entry.signature}>
                  <div className="api-help__sig-row">
                    <code className="api-help__sig">{entry.signature}</code>
                    {entry.kind && <span className={`api-help__tag api-help__tag--${entry.kind}`}>{entry.kind === "sensitive" ? "sensible" : "local"}</span>}
                  </div>
                  <p className="api-help__desc">{entry.description}</p>
                  {entry.example && <pre className="api-help__example">{entry.example}</pre>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
