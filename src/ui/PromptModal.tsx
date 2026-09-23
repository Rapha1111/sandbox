import { useState } from "react";
import { engine, useGameStore } from "../data/store";
import type { PendingPrompt } from "../engine/types";
import "./PromptModal.css";

export function PromptModal() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const prompt = engine.getPendingPrompts().find((p) => p.playerId === currentPlayerId);
  if (!prompt) return null;
  // Keyed on the prompt's id so switching to a new prompt resets the input widget's local state.
  return <PromptModalBody key={prompt.id} prompt={prompt} />;
}

function PromptModalBody({ prompt }: { prompt: PendingPrompt }) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState(prompt.choices?.[0] ?? "");
  const [num, setNum] = useState(prompt.min ?? 0);

  const cancel = () => engine.resolvePrompt(prompt.id, false);
  const confirmValue = (value: string | number | boolean) => engine.resolvePrompt(prompt.id, true, value);

  return (
    <div className="prompt-modal__backdrop">
      <div className="prompt-modal">
        <p className="prompt-modal__source">{prompt.sourceDefName}</p>
        <p className="prompt-modal__question">{prompt.question}</p>

        {prompt.kind === "text" && (
          <input
            autoFocus
            className="prompt-modal__text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmValue(text)}
          />
        )}

        {prompt.kind === "choice" && (
          <select className="prompt-modal__select" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {(prompt.choices ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {prompt.kind === "number" && (
          <div className="prompt-modal__number">
            {prompt.slider ? (
              <>
                <input
                  type="range"
                  min={prompt.min}
                  max={prompt.max}
                  value={num}
                  onChange={(e) => setNum(Number(e.target.value))}
                />
                <span className="prompt-modal__number-value">{num}</span>
              </>
            ) : (
              <input
                type="number"
                autoFocus
                min={prompt.min}
                max={prompt.max}
                value={num}
                onChange={(e) => setNum(Number(e.target.value))}
              />
            )}
            <p className="prompt-modal__range-hint">entre {prompt.min} et {prompt.max}</p>
          </div>
        )}

        <div className="prompt-modal__actions">
          {prompt.kind === "confirm" ? (
            <>
              <button className="prompt-modal__refuse" onClick={() => confirmValue(false)}>Non</button>
              <button className="prompt-modal__accept" onClick={() => confirmValue(true)}>Oui</button>
            </>
          ) : (
            <>
              <button className="prompt-modal__refuse" onClick={cancel}>Annuler</button>
              <button
                className="prompt-modal__accept"
                onClick={() => confirmValue(prompt.kind === "text" ? text : prompt.kind === "choice" ? choice : num)}
              >
                Valider
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
