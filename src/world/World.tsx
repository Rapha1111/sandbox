import { useEffect, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { engine, useGameStore, cancelPlacing, openContextMenu } from "../data/store";
import { computeHouseLayout } from "../engine/houseLayout";
import { HouseScene } from "./HouseScene";
import { PlayerMesh, RemotePlayerMesh, collidables, type CollidableBox, type HouseFootprint } from "./PlayerMesh";
import { CameraRig } from "./CameraRig";
import { ObjectInstanceMesh } from "./ObjectInstanceMesh";
import "./World.css";

const WALL_THICKNESS = 0.15;
const STREET_DEPTH = 6; // how far south of the houses players can walk
const WORLD_MARGIN = 3;

export function World() {
  useGameStore((s) => s.tick);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const placingInstanceId = useGameStore((s) => s.placingInstanceId);
  const onlinePlayerIds = useGameStore((s) => s.onlinePlayerIds);

  const player = engine.getPlayer(currentPlayerId);
  const houses = engine.listHouses();
  const layout = computeHouseLayout(houses);
  const posRef = useRef({ x: player?.position.x ?? 0, z: player?.position.z ?? 0 });

  // A big, instantaneous jump in the engine's stored position (never produced by our own
  // movement — that always flows the other way, posRef -> engine.movePlayer) means something
  // external moved us: right now that's only applyAssignedSlot's house-reflow correction, but
  // this stays correct for any future server-driven repositioning too.
  useEffect(() => {
    if (!player) return;
    const dx = player.position.x - posRef.current.x;
    const dz = player.position.z - posRef.current.z;
    if (Math.hypot(dx, dz) > 1) {
      posRef.current.x = player.position.x;
      posRef.current.z = player.position.z;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.position.x, player?.position.z]);

  if (!player) return null;

  let minX = -WORLD_MARGIN;
  let maxX = WORLD_MARGIN;
  let maxDepth = 10;
  const boxes: CollidableBox[] = [];
  const footprints: HouseFootprint[] = [];

  for (const entry of layout) {
    const house = houses.find((h) => h.id === entry.houseId)!;
    minX = Math.min(minX, entry.originX - house.width / 2 - WORLD_MARGIN);
    maxX = Math.max(maxX, entry.originX + house.width / 2 + WORLD_MARGIN);
    maxDepth = Math.max(maxDepth, house.depth);
    footprints.push({ id: house.id, originX: entry.originX, width: house.width, depth: house.depth });

    // Walls, as thin collidable boxes in world space — the open (south) side has none, so
    // walking in from the street works for every house, not just your own.
    boxes.push(
      { x: entry.originX, z: -house.depth / 2, halfW: house.width / 2, halfD: WALL_THICKNESS / 2 },
      { x: entry.originX - house.width / 2, z: 0, halfW: WALL_THICKNESS / 2, halfD: house.depth / 2 },
      { x: entry.originX + house.width / 2, z: 0, halfW: WALL_THICKNESS / 2, halfD: house.depth / 2 }
    );
    for (const b of collidables(engine.listInstancesInHouse(house.id))) {
      boxes.push({ ...b, x: b.x + entry.originX });
    }
  }

  const bounds = { minX, maxX, minZ: -maxDepth / 2 - 1, maxZ: STREET_DEPTH };
  const speech = engine.getSpeechBubbles();

  function handleHouseChange(houseId: string | null): void {
    if (houseId) void engine.enterHouse(currentPlayerId, houseId);
  }

  return (
    <div className={placingInstanceId ? "world world--placing" : "world"}>
      <Canvas shadows>
        <CameraRig targetRef={posRef} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 4]} intensity={0.9} castShadow />

        {layout.map((entry) => {
          const house = houses.find((h) => h.id === entry.houseId)!;
          const isOwn = house.ownerId === currentPlayerId;
          const owner = engine.getPlayer(house.ownerId);
          const instances = engine.listInstancesInHouse(house.id);

          function handleFloorClick(e: ThreeEvent<MouseEvent>) {
            if (!placingInstanceId || !isOwn) return;
            e.stopPropagation();
            const halfW = house.width / 2 - 0.5;
            const halfD = house.depth / 2 - 0.5;
            const x = THREE.MathUtils.clamp(e.point.x - entry.originX, -halfW, halfW);
            const z = THREE.MathUtils.clamp(e.point.z, -halfD, halfD);
            const result = engine.placeFromInventory(placingInstanceId, currentPlayerId, house.id, x, z, 0);
            if (result.ok) cancelPlacing();
          }

          return (
            <group key={house.id} position={[entry.originX, 0, 0]}>
              <HouseScene
                house={house}
                onFloorClick={isOwn ? handleFloorClick : undefined}
                isOwn={isOwn}
                label={isOwn ? undefined : `Chez ${owner?.name ?? "?"}`}
              />
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
                    onContextMenu={(clientX, clientY) => {
                      if (isOwn && inst.ownerId === currentPlayerId) openContextMenu(inst.id, clientX, clientY);
                    }}
                  />
                );
              })}
            </group>
          );
        })}

        <PlayerMesh
          playerId={player.id}
          bounds={bounds}
          boxes={boxes}
          houses={footprints}
          posRef={posRef}
          onHouseChange={handleHouseChange}
        />

        {engine
          .listPlayers()
          .filter((p) => p.id !== currentPlayerId)
          .map((p) => (
            <RemotePlayerMesh key={p.id} player={p} online={onlinePlayerIds.includes(p.id)} />
          ))}
      </Canvas>
      {placingInstanceId && (
        <div className="world__placing-hint">
          Cliquez au sol (dans votre maison) pour placer l'objet — <button onClick={cancelPlacing}>Annuler</button>
        </div>
      )}
      <div className="world__controls-hint">WASD / flèches pour se déplacer · clic gauche = interagir · clic droit = menu</div>
    </div>
  );
}
