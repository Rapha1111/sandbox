// Pure data math — no rendering/Three.js dependency — so both GameEngine (to pick a sane
// spawn position for a brand new house) and the 3D World (to render/collide against every
// house at once) share the exact same packing algorithm and can never disagree about where
// a house actually sits.
import type { House, HouseId } from "./types";

export const HOUSE_GAP = 3;

export interface HouseLayoutEntry {
  houseId: HouseId;
  originX: number;
  width: number;
  depth: number;
}

/**
 * Lays houses out left to right by `slotIndex`, houses touching + a street-width gap apart.
 * The lowest slotIndex is always centered on world x=0 (so a lone house sits exactly where
 * the single-house prototype always put it) and never moves again as new houses join — new
 * arrivals always get the next, highest slotIndex, so they only ever get appended to the
 * right. A house's own originX can still shift if a *lower-slotIndex* neighbour expands
 * (spec-extension: "agrandir sa maison"), which is an acceptable, expected bit of prototype
 * jank — everyone downstream of an expansion visibly reflows, nobody upstream does.
 */
export function computeHouseLayout(houses: House[]): HouseLayoutEntry[] {
  const sorted = [...houses].sort((a, b) => a.slotIndex - b.slotIndex);
  const entries: HouseLayoutEntry[] = [];
  let cursor = 0;
  sorted.forEach((h, i) => {
    if (i === 0) cursor = -h.width / 2;
    const originX = cursor + h.width / 2;
    entries.push({ houseId: h.id, originX, width: h.width, depth: h.depth });
    cursor += h.width + HOUSE_GAP;
  });
  return entries;
}
