import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Texture } from "../engine/types";
import "./PixelArtEditor.css";

type Tool = "pencil" | "eraser" | "fill" | "eyedropper";

const PALETTE = [
  "#000000", "#ffffff", "#7f7f7f", "#c3c3c3",
  "#ff0000", "#ff8c00", "#ffe135", "#2ecc71",
  "#00b3ff", "#1f4fd8", "#8e44ad", "#ff69b4",
  "#8b5a2b", "#d2b48c", "#556b2f", "#111827",
];

const CELL_PX = 18;
const MAX_HISTORY = 60;

export interface PixelArtEditorProps {
  texture: Texture;
  onChange: (pixels: string[]) => void;
  onResize: (size: number) => void;
}

export function PixelArtEditor({ texture, onChange, onResize }: PixelArtEditorProps) {
  const { size, pixels } = texture;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#1f4fd8");
  const [mirror, setMirror] = useState(false);
  const drawing = useRef(false);
  const history = useRef<string[][]>([]);
  const future = useRef<string[][]>([]);
  const strokeTouched = useRef(false);

  const displaySize = size * CELL_PX;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, displaySize, displaySize);
    // checkerboard for transparency
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const px = pixels[idx];
        if (!px) {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#e5e7eb" : "#f9fafb";
        } else {
          ctx.fillStyle = px;
        }
        ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i <= size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_PX, 0);
      ctx.lineTo(i * CELL_PX, displaySize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_PX);
      ctx.lineTo(displaySize, i * CELL_PX);
      ctx.stroke();
    }
  }, [pixels, size, displaySize]);

  useEffect(draw, [draw]);

  function pushHistory(): void {
    history.current.push(pixels.slice());
    if (history.current.length > MAX_HISTORY) history.current.shift();
    future.current = [];
  }

  function undo(): void {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(pixels.slice());
    onChange(prev);
  }

  function redo(): void {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(pixels.slice());
    onChange(next);
  }

  function coordsFromEvent(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  }

  function applyAt(x: number, y: number): void {
    const next = pixels.slice();
    const setPixel = (px: number, py: number, value: string) => {
      if (px < 0 || py < 0 || px >= size || py >= size) return;
      next[py * size + px] = value;
    };

    if (tool === "eyedropper") {
      const picked = pixels[y * size + x];
      if (picked) setColor(picked);
      return;
    }
    if (tool === "fill") {
      floodFill(next, size, x, y, color);
    } else {
      const value = tool === "eraser" ? "" : color;
      setPixel(x, y, value);
      if (mirror) setPixel(size - 1 - x, y, value);
    }
    strokeTouched.current = true;
    onChange(next);
  }

  function handleDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    const c = coordsFromEvent(e);
    if (!c) return;
    if (tool === "eyedropper") {
      applyAt(c.x, c.y);
      return;
    }
    pushHistory();
    strokeTouched.current = false;
    drawing.current = true;
    applyAt(c.x, c.y);
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    const c = coordsFromEvent(e);
    if (!c) return;
    applyAt(c.x, c.y);
  }

  function endStroke(): void {
    if (drawing.current && !strokeTouched.current) history.current.pop();
    drawing.current = false;
  }

  function rotate90(): void {
    pushHistory();
    const next = new Array(size * size).fill("");
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        next[x * size + (size - 1 - y)] = pixels[y * size + x];
      }
    }
    onChange(next);
  }

  function mirrorHorizontal(): void {
    pushHistory();
    const next = new Array(size * size).fill("");
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        next[y * size + (size - 1 - x)] = pixels[y * size + x];
      }
    }
    onChange(next);
  }

  function clearAll(): void {
    pushHistory();
    onChange(new Array(size * size).fill(""));
  }

  const sizes = useMemo(() => [8, 16, 32, 64], []);

  return (
    <div className="pixel-editor">
      <div className="pixel-editor__toolbar">
        <div className="pixel-editor__tools">
          <ToolButton active={tool === "pencil"} label="✏️ Crayon" onClick={() => setTool("pencil")} />
          <ToolButton active={tool === "eraser"} label="🧽 Gomme" onClick={() => setTool("eraser")} />
          <ToolButton active={tool === "fill"} label="🪣 Remplir" onClick={() => setTool("fill")} />
          <ToolButton active={tool === "eyedropper"} label="💧 Pipette" onClick={() => setTool("eyedropper")} />
        </div>
        <div className="pixel-editor__tools">
          <button onClick={undo} disabled={history.current.length === 0}>↶ Annuler</button>
          <button onClick={redo} disabled={future.current.length === 0}>↷ Rétablir</button>
          <ToolButton active={mirror} label="🪞 Miroir" onClick={() => setMirror((m) => !m)} />
          <button onClick={mirrorHorizontal}>Inverser</button>
          <button onClick={rotate90}>Rotation 90°</button>
          <button onClick={clearAll}>Vider</button>
        </div>
      </div>

      <div className="pixel-editor__body">
        <canvas
          ref={canvasRef}
          width={displaySize}
          height={displaySize}
          style={{ width: displaySize, height: displaySize }}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
        />
        <div className="pixel-editor__side">
          <div className="pixel-editor__preview">
            <span>Aperçu</span>
            <PreviewSwatch pixels={pixels} size={size} />
          </div>
          <div className="pixel-editor__palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className="pixel-editor__swatch"
                style={{ background: c, outline: color === c ? "2px solid #1f4fd8" : "none" }}
                onClick={() => setColor(c)}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Couleur personnalisée" />
          </div>
          <div className="pixel-editor__size">
            <label>Taille</label>
            <select value={size} onChange={(e) => onResize(Number(e.target.value))}>
              {sizes.map((s) => (
                <option key={s} value={s}>{s}×{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "pixel-editor__tool pixel-editor__tool--active" : "pixel-editor__tool"} onClick={onClick}>
      {label}
    </button>
  );
}

function PreviewSwatch({ pixels, size }: { pixels: string[]; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = pixels[y * size + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [pixels, size]);
  return <canvas ref={ref} width={size} height={size} style={{ width: 64, height: 64, imageRendering: "pixelated" }} />;
}

function floodFill(pixels: string[], size: number, startX: number, startY: number, newColor: string): void {
  const target = pixels[startY * size + startX];
  if (target === newColor) return;
  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const idx = y * size + x;
    if (pixels[idx] !== target) continue;
    pixels[idx] = newColor;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}
