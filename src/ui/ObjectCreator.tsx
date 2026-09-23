import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { FACE_NAMES, type FaceName, type ObjectDefinition } from "../engine/types";
import { engine, useGameStore, closeEditor } from "../data/store";
import { PixelArtEditor } from "./PixelArtEditor";
import { DebugConsole } from "./DebugConsole";
import "./ObjectCreator.css";

type Tab = "info" | "textures" | "script";

const FACE_LABEL: Record<FaceName, string> = {
  top: "Haut",
  bottom: "Bas",
  front: "Avant",
  back: "Arrière",
  left: "Gauche",
  right: "Droite",
};

const TESTABLE_EVENTS = ["on_interact", "on_create", "on_player_enter", "on_tick", "on_destroy"];

export function ObjectCreator() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const editingDefId = useGameStore((s) => s.editingDefId);
  const [tab, setTab] = useState<Tab>("info");
  const [face, setFace] = useState<FaceName>("front");
  const [testEvent, setTestEvent] = useState("on_interact");
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const def = editingDefId ? engine.getDefinition(editingDefId) : undefined;

  // Side effect (creating a texture) belongs in an effect, not render — doing it inline during
  // render triggered React's "setState while rendering a different component" warning because
  // the resulting engine.notify() synchronously re-renders the whole subscribed tree (World included).
  // Hooks must run unconditionally, so this stays above the `!def` early return below.
  useEffect(() => {
    if (!def) return;
    const texId = def.textures[face];
    if (!texId || !engine.getTexture(texId)) {
      const tex = engine.createTexture(currentPlayerId, `${def.name} - ${FACE_LABEL[face]}`, 16);
      engine.updateDefinition(def.id, { textures: { ...def.textures, [face]: tex.id } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, editingDefId]);

  if (!def) return null;
  const defId = def.id;

  const validation = engine.validateScript(def.script);

  function patch(p: Partial<Omit<ObjectDefinition, "id" | "creatorId" | "createdAt">>) {
    engine.updateDefinition(defId, p);
  }

  function textureFor(f: FaceName) {
    const texId = def!.textures[f];
    return texId ? engine.getTexture(texId) : undefined;
  }

  async function handleTest() {
    setPublishMsg(null);
    await engine.testDefinition(def!, testEvent, currentPlayerId);
  }

  function handlePublish() {
    const result = engine.publishDefinition(defId);
    setPublishMsg(result.ok ? "✅ Objet publié et ajouté à l'inventaire." : `❌ ${result.reason}`);
  }

  return (
    <div className="object-creator__backdrop">
      <div className="object-creator">
        <div className="object-creator__header">
          <input
            className="object-creator__title"
            value={def.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <div className="object-creator__header-right">
            {def.published && <span className="object-creator__badge">Publié · v{def.version}</span>}
            <button onClick={closeEditor}>Fermer</button>
          </div>
        </div>

        <div className="object-creator__tabs">
          <TabButton active={tab === "info"} onClick={() => setTab("info")} label="Info" />
          <TabButton active={tab === "textures"} onClick={() => setTab("textures")} label="Textures" />
          <TabButton active={tab === "script"} onClick={() => setTab("script")} label="Script" />
        </div>

        <div className="object-creator__body">
          {tab === "info" && (
            <InfoTab def={def} onPatch={patch} />
          )}

          {tab === "textures" && (
            <div className="object-creator__textures">
              <div className="object-creator__faces">
                {FACE_NAMES.map((f) => (
                  <button
                    key={f}
                    className={f === face ? "object-creator__face object-creator__face--active" : "object-creator__face"}
                    onClick={() => setFace(f)}
                  >
                    <FaceThumb texture={textureFor(f)} />
                    {FACE_LABEL[f]}
                  </button>
                ))}
              </div>
              <div className="object-creator__pixel-editor">
                {textureFor(face) ? (
                  <PixelArtEditor
                    texture={textureFor(face)!}
                    onChange={(pixels) => engine.updateTexturePixels(textureFor(face)!.id, pixels)}
                    onResize={(size) => engine.resizeTexture(textureFor(face)!.id, size)}
                  />
                ) : (
                  <p className="object-creator__hint">Préparation de la texture…</p>
                )}
              </div>
            </div>
          )}

          {tab === "script" && (
            <div className="object-creator__script">
              <CodeMirror
                value={def.script}
                height="320px"
                theme="dark"
                extensions={[python()]}
                onChange={(value) => patch({ script: value })}
              />
              {!validation.ok && <div className="object-creator__error">Erreur de syntaxe: {validation.message}</div>}
              <div className="object-creator__test-row">
                <select value={testEvent} onChange={(e) => setTestEvent(e.target.value)}>
                  {TESTABLE_EVENTS.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
                <button onClick={handleTest} disabled={!validation.ok}>▶ Tester</button>
              </div>
              <DebugConsole compact />
            </div>
          )}
        </div>

        <div className="object-creator__footer">
          {publishMsg && <span className="object-creator__pubmsg">{publishMsg}</span>}
          <button className="object-creator__publish" onClick={handlePublish} disabled={!validation.ok}>
            {def.published ? "Republier" : "Créer / Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DefPatch = Partial<Omit<ObjectDefinition, "id" | "creatorId" | "createdAt">>;

function InfoTab({ def, onPatch }: { def: ObjectDefinition; onPatch: (p: DefPatch) => void }) {
  const props = Object.entries(def.properties);

  function setProp(key: string, value: string) {
    onPatch({ properties: { ...def.properties, [key]: value } });
  }
  function removeProp(key: string) {
    const next = { ...def.properties };
    delete next[key];
    onPatch({ properties: next });
  }
  function addProp() {
    let i = 1;
    let key = "propriete";
    while (key in def.properties) key = `propriete_${i++}`;
    setProp(key, "");
  }

  return (
    <div className="object-creator__info">
      <label>
        Dimensions (largeur × hauteur × profondeur)
        <div className="object-creator__dims">
          {(["width", "height", "depth"] as const).map((dim) => (
            <input
              key={dim}
              type="number"
              min={0.1}
              step={0.1}
              value={def.dimensions[dim]}
              onChange={(e) => onPatch({ dimensions: { ...def.dimensions, [dim]: Number(e.target.value) || 1 } })}
            />
          ))}
        </div>
      </label>

      <label className="object-creator__checkbox">
        <input
          type="checkbox"
          checked={def.collidable}
          onChange={(e) => onPatch({ collidable: e.target.checked })}
        />
        Collision (bloque le passage)
      </label>

      <div className="object-creator__props">
        <div className="object-creator__props-header">
          <span>Propriétés personnalisées</span>
          <button onClick={addProp}>+ Ajouter</button>
        </div>
        {props.length === 0 && <p className="object-creator__hint">Lisibles depuis le script via object.get_property("clé").</p>}
        {props.map(([key, value]) => (
          <div className="object-creator__prop-row" key={key}>
            <input
              value={key}
              onChange={(e) => {
                const next = { ...def.properties };
                delete next[key];
                next[e.target.value] = value;
                onPatch({ properties: next });
              }}
            />
            <input value={String(value)} onChange={(e) => setProp(key, e.target.value)} />
            <button onClick={() => removeProp(key)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "object-creator__tab object-creator__tab--active" : "object-creator__tab"} onClick={onClick}>
      {label}
    </button>
  );
}

function FaceThumb({ texture }: { texture: ReturnType<typeof engine.getTexture> }) {
  if (!texture) return <div className="object-creator__face-thumb object-creator__face-thumb--empty" />;
  return (
    <svg width={24} height={24} viewBox={`0 0 ${texture.size} ${texture.size}`} className="object-creator__face-thumb">
      {texture.pixels.map((c, i) =>
        c ? <rect key={i} x={i % texture.size} y={Math.floor(i / texture.size)} width={1} height={1} fill={c} /> : null
      )}
    </svg>
  );
}
