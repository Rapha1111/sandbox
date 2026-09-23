import * as THREE from "three";
import type { Texture as TextureDef } from "../engine/types";

const cache = new Map<string, THREE.CanvasTexture>();

/** Renders a pixel-art Texture definition onto a canvas and wraps it as a THREE.CanvasTexture (nearest filtering, crisp). */
export function pixelsToThreeTexture(tex: TextureDef): THREE.CanvasTexture {
  const key = `${tex.id}:${tex.updatedAt}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = tex.size;
  canvas.height = tex.size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, tex.size, tex.size);
  for (let y = 0; y < tex.size; y++) {
    for (let x = 0; x < tex.size; x++) {
      const c = tex.pixels[y * tex.size + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const threeTex = new THREE.CanvasTexture(canvas);
  threeTex.magFilter = THREE.NearestFilter;
  threeTex.minFilter = THREE.NearestFilter;
  threeTex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, threeTex);
  return threeTex;
}

export function fallbackColorTexture(color: string): THREE.CanvasTexture {
  const key = `color:${color}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 4, 4);
  const threeTex = new THREE.CanvasTexture(canvas);
  threeTex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, threeTex);
  return threeTex;
}
