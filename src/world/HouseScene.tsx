import type { ThreeEvent } from "@react-three/fiber";
import type { House } from "../engine/types";

export function HouseScene({ house, onFloorClick }: { house: House; onFloorClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { width, depth } = house;
  const wallHeight = 2.6;
  const wallThickness = 0.15;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[width, depth]} />
        <meshLambertMaterial color="#e7d9c0" />
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
    </group>
  );
}
