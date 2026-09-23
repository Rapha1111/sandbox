import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { FaceName, ObjectDefinition, ObjectInstance } from "../engine/types";
import { engine, useGameStore } from "../data/store";
import { fallbackColorTexture, pixelsToThreeTexture } from "./textureUtils";

const FACE_ORDER: FaceName[] = ["right", "left", "top", "bottom", "front", "back"];

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export function ObjectInstanceMesh({
  instance,
  def,
  onInteract,
  onContextMenu,
  speech,
}: {
  instance: ObjectInstance;
  def: ObjectDefinition;
  onInteract: () => void;
  onContextMenu: (clientX: number, clientY: number) => void;
  speech?: string;
}) {
  const { width, height, depth } = def.dimensions;
  const fallback = useMemo(() => fallbackColorTexture(hashColor(def.id)), [def.id]);
  // GameEngine mutates def/instance in place rather than replacing them, so those objects'
  // references never change — `tick` (bumped on every engine.notify()) is what actually makes
  // this recompute when a script changes a texture on an already-mounted instance.
  const tick = useGameStore((s) => s.tick);

  const materials = useMemo(() => {
    return FACE_ORDER.map((face) => {
      const tex = engine.resolveVisibleTexture(def, instance, face);
      const map = tex ? pixelsToThreeTexture(tex) : fallback;
      return new THREE.MeshLambertMaterial({ map });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, instance, fallback, tick]);

  if (instance.location.kind !== "house") return null;
  const { x, z, rotationY } = instance.location;

  return (
    <group position={[x, height / 2, z]} rotation={[0, rotationY, 0]}>
      <mesh
        castShadow
        material={materials}
        onClick={(e) => {
          e.stopPropagation();
          onInteract();
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
      >
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      {speech && (
        <Html center position={[0, height / 2 + 0.6, 0]} style={{ pointerEvents: "none" }}>
          <div className="speech-bubble">{speech}</div>
        </Html>
      )}
    </group>
  );
}
