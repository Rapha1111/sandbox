import { useMemo } from "react";
import * as THREE from "three";
import type { FaceName, ObjectDefinition, ObjectInstance } from "../engine/types";
import { engine } from "../data/store";
import { fallbackColorTexture, pixelsToThreeTexture } from "./textureUtils";

const FACE_ORDER: FaceName[] = ["right", "left", "top", "bottom", "front", "back"];

/**
 * A semi-transparent live preview of the object currently being placed or moved, following the
 * mouse. Tinted red (and placement refused) when it would land on a wall or another block — see
 * World.tsx's boxOverlapsAny check, which decides `blocked`.
 */
export function PlacementGhost({ def, x, z, blocked }: { def: ObjectDefinition; x: number; z: number; blocked: boolean }) {
  const { width, height, depth } = def.dimensions;
  const fallback = useMemo(() => fallbackColorTexture("#94a3b8"), []);
  // resolveVisibleTexture only reads instance.state — this stand-in never exists in the engine.
  const fakeInstance: ObjectInstance = useMemo(
    () => ({ id: "ghost", defId: def.id, ownerId: null, location: { kind: "inventory" }, state: {}, wallet: 0, createdAt: 0 }),
    [def.id]
  );

  const materials = useMemo(() => {
    return FACE_ORDER.map((face) => {
      const tex = engine.resolveVisibleTexture(def, fakeInstance, face);
      const map = tex ? pixelsToThreeTexture(tex) : fallback;
      return new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0.5,
        color: blocked ? "#ef4444" : "#ffffff",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, fakeInstance, fallback, blocked]);

  return (
    <group position={[x, height / 2, z]}>
      <mesh material={materials}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
    </group>
  );
}
