import { useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { engine, useGameStore, cancelPlacing } from "../data/store";
import { HouseScene } from "./HouseScene";
import { PlayerMesh, collidables } from "./PlayerMesh";
import { CameraRig } from "./CameraRig";
import { ObjectInstanceMesh } from "./ObjectInstanceMesh";
import "./World.css";

export function World() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const placingInstanceId = useGameStore((s) => s.placingInstanceId);

  const player = engine.getPlayer(currentPlayerId);
  const house = player ? engine.getHouse(player.houseId) : undefined;
  const posRef = useRef({ x: player?.position.x ?? 0, z: player?.position.z ?? 0 });

  const instances = house ? engine.listInstancesInHouse(house.id) : [];
  const speech = engine.getSpeechBubbles();
  const boxes = collidables(instances);

  if (!player || !house) return null;

  function handleFloorClick(e: ThreeEvent<MouseEvent>) {
    if (!placingInstanceId) return;
    e.stopPropagation();
    const halfW = house!.width / 2 - 0.5;
    const halfD = house!.depth / 2 - 0.5;
    const x = THREE.MathUtils.clamp(e.point.x, -halfW, halfW);
    const z = THREE.MathUtils.clamp(e.point.z, -halfD, halfD);
    const result = engine.placeFromInventory(placingInstanceId, house!.id, x, z, 0);
    if (result.ok) cancelPlacing();
  }

  return (
    <div className={placingInstanceId ? "world world--placing" : "world"}>
      <Canvas shadows>
        <CameraRig targetRef={posRef} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 4]} intensity={0.9} castShadow />

        <HouseScene house={house} onFloorClick={handleFloorClick} />

        <PlayerMesh playerId={player.id} house={house} boxes={boxes} posRef={posRef} />

        {instances.map((inst) => {
          const def = engine.getDefinition(inst.defId);
          if (!def) return null;
          const b = speech.find((s) => s.targetInstanceId === inst.id);
          return (
            <ObjectInstanceMesh
              key={inst.id}
              instance={inst}
              def={def}
              speech={b?.text}
              onInteract={() => engine.interact(inst.id, currentPlayerId)}
              onPickup={() => engine.pickupToInventory(inst.id, currentPlayerId)}
            />
          );
        })}
      </Canvas>
      {placingInstanceId && (
        <div className="world__placing-hint">
          Cliquez au sol pour placer l'objet — <button onClick={cancelPlacing}>Annuler</button>
        </div>
      )}
      <div className="world__controls-hint">WASD / flèches pour se déplacer · clic gauche = interagir · clic droit = ramasser</div>
    </div>
  );
}
