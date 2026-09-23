import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ObjectInstance, ObjectDefinition, Player } from "../engine/types";
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

/** Furniture-only collision boxes for one house's instances, in that house's own local space. */
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

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface HouseFootprint {
  id: string;
  originX: number;
  width: number;
  depth: number;
}

function houseAt(x: number, z: number, houses: HouseFootprint[]): string | null {
  for (const h of houses) {
    if (x >= h.originX - h.width / 2 && x <= h.originX + h.width / 2 && z >= -h.depth / 2 && z <= h.depth / 2) {
      return h.id;
    }
  }
  return null;
}

export function PlayerMesh({
  playerId,
  bounds,
  boxes,
  houses,
  posRef,
  onHouseChange,
}: {
  playerId: string;
  bounds: WorldBounds;
  boxes: CollidableBox[];
  houses: HouseFootprint[];
  posRef: React.MutableRefObject<{ x: number; z: number }>;
  onHouseChange?: (houseId: string | null) => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const keys = useKeyboard();
  const syncAccumulator = useRef(0);
  const lastHouseId = useRef<string | null | undefined>(undefined);

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

      const nextX = THREE.MathUtils.clamp(posRef.current.x + dx, bounds.minX, bounds.maxX);
      if (!collides(nextX, posRef.current.z, boxes)) posRef.current.x = nextX;

      const nextZ = THREE.MathUtils.clamp(posRef.current.z + dz, bounds.minZ, bounds.maxZ);
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

      const currentHouseId = houseAt(posRef.current.x, posRef.current.z, houses);
      if (currentHouseId !== lastHouseId.current) {
        lastHouseId.current = currentHouseId;
        onHouseChange?.(currentHouseId);
      }
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

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 55%)`;
}

/** Another connected player, rendered from their last-synced position — no physics/keyboard, just a body + name tag. */
export function RemotePlayerMesh({ player, online }: { player: Player; online: boolean }) {
  const color = hashColor(player.id);
  return (
    <group position={[player.position.x, 0, player.position.z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
        <meshLambertMaterial color={color} transparent opacity={online ? 1 : 0.45} />
      </mesh>
      <Html center position={[0, 1.35, 0]} style={{ pointerEvents: "none" }}>
        <div className={online ? "player-label" : "player-label player-label--offline"}>{player.name}</div>
      </Html>
    </group>
  );
}
