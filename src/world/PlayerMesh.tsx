import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { House, ObjectInstance, ObjectDefinition } from "../engine/types";
import { useKeyboard } from "./useKeyboard";
import { engine } from "../data/store";

const SPEED = 3.2;
const PLAYER_RADIUS = 0.35;

export interface CollidableBox {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

export function collidables(instances: ObjectInstance[]): CollidableBox[] {
  const boxes: CollidableBox[] = [];
  for (const inst of instances) {
    if (inst.location.kind !== "house") continue;
    const def = engine.getDefinition(inst.defId) as ObjectDefinition | undefined;
    if (!def || !def.collidable) continue;
    boxes.push({
      x: inst.location.x,
      z: inst.location.z,
      halfW: def.dimensions.width / 2,
      halfD: def.dimensions.depth / 2,
    });
  }
  return boxes;
}

function collides(x: number, z: number, boxes: CollidableBox[]): boolean {
  for (const b of boxes) {
    if (
      x + PLAYER_RADIUS > b.x - b.halfW &&
      x - PLAYER_RADIUS < b.x + b.halfW &&
      z + PLAYER_RADIUS > b.z - b.halfD &&
      z - PLAYER_RADIUS < b.z + b.halfD
    ) {
      return true;
    }
  }
  return false;
}

export function PlayerMesh({
  playerId,
  house,
  boxes,
  posRef,
}: {
  playerId: string;
  house: House;
  boxes: CollidableBox[];
  posRef: React.MutableRefObject<{ x: number; z: number }>;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const keys = useKeyboard();
  const syncAccumulator = useRef(0);

  useFrame((_state, delta) => {
    const pressed = keys.current;
    let dx = 0;
    let dz = 0;
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) dz -= 1;
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) dz += 1;
    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) dx -= 1;
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      dx = (dx / len) * SPEED * delta;
      dz = (dz / len) * SPEED * delta;

      const halfW = house.width / 2 - PLAYER_RADIUS;
      const halfD = house.depth / 2 - PLAYER_RADIUS;

      const nextX = THREE.MathUtils.clamp(posRef.current.x + dx, -halfW, halfW);
      if (!collides(nextX, posRef.current.z, boxes)) posRef.current.x = nextX;

      const nextZ = THREE.MathUtils.clamp(posRef.current.z + dz, -halfD, halfD);
      if (!collides(posRef.current.x, nextZ, boxes)) posRef.current.z = nextZ;

      if (meshRef.current) {
        meshRef.current.rotation.y = Math.atan2(dx, dz);
      }
    }

    if (meshRef.current) {
      meshRef.current.position.x = posRef.current.x;
      meshRef.current.position.z = posRef.current.z;
    }

    syncAccumulator.current += delta;
    if (syncAccumulator.current > 0.4) {
      syncAccumulator.current = 0;
      engine.movePlayer(playerId, posRef.current.x, posRef.current.z);
    }
  });

  return (
    <group ref={meshRef} position={[posRef.current.x, 0, posRef.current.z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
        <meshLambertMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 1.05, 0.2]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
    </group>
  );
}
