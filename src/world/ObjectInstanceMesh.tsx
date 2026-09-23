import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { FaceName, ObjectDefinition, ObjectInstance } from "../engine/types";
import { engine } from "../data/store";
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
  onPickup,
  speech,
}: {
  instance: ObjectInstance;
  def: ObjectDefinition;
  onInteract: () => void;
  onPickup: () => void;
  speech?: string;
}) {
  const { width, height, depth } = def.dimensions;
  const fallback = useMemo(() => fallbackColorTexture(hashColor(def.id)), [def.id]);

  const materials = useMemo(() => {
    return FACE_ORDER.map((face) => {
      const name = (instance.state[`textureOverride_${face}`] as string | undefined)
        ?? (instance.state["textureOverride___all__"] as string | undefined)
        ?? def.textures[face];
      const tex = engine.resolveLibraryTexture(def, name);
      const map = tex ? pixelsToThreeTexture(tex) : fallback;
      return new THREE.MeshLambertMaterial({ map });
    });
  }, [def, instance.state, fallback]);

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
          onPickup();
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
