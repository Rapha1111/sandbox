import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";

const OFFSET = new THREE.Vector3(0, 11, 6.5);

export function CameraRig({ targetRef }: { targetRef: React.MutableRefObject<{ x: number; z: number }> }) {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const { camera } = useThree();

  useFrame(() => {
    const target = new THREE.Vector3(targetRef.current.x, 0, targetRef.current.z);
    const desired = target.clone().add(OFFSET);
    camera.position.lerp(desired, 0.08);
    camera.lookAt(target.x, 0, target.z);
  });

  return <OrthographicCamera ref={camRef} makeDefault position={[0, 11, 6.5]} zoom={70} near={0.1} far={100} />;
}
