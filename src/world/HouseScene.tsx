import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { House } from "../engine/types";

export function HouseScene({
  house,
  onFloorClick,
  label,
  isOwn,
}: {
  house: House;
  onFloorClick?: (e: ThreeEvent<MouseEvent>) => void;
  /** Name shown above the house — "Chez <name>" for a visitable house, nothing for your own. */
  label?: string;
  isOwn?: boolean;
}) {
  const { width, depth } = house;
  const wallHeight = 2.6;
  const wallThickness = 0.15;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[width, depth]} />
        <meshLambertMaterial color={isOwn ? "#e7d9c0" : "#dcd3c4"} />
      </mesh>

      {/* North wall */}
      <mesh position={[0, wallHeight / 2, -depth / 2]}>
        <boxGeometry args={[width, wallHeight, wallThickness]} />
        <meshLambertMaterial color="#cbb994" />
      </mesh>
      {/* West wall */}
      <mesh position={[-width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, depth]} />
        <meshLambertMaterial color="#cbb994" />
      </mesh>
      {/* East wall */}
      <mesh position={[width / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[wallThickness, wallHeight, depth]} />
        <meshLambertMaterial color="#cbb994" />
      </mesh>

      {label && (
        <Html center position={[0, wallHeight + 0.3, -depth / 2]} style={{ pointerEvents: "none" }}>
          <div className="house-label">{label}</div>
        </Html>
      )}
    </group>
  );
}
