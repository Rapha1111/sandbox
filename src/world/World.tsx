import { useEffect, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { engine, useGameStore, cancelPlacing, openContextMenu, clearWalkRequest } from "../data/store";
import { computeHouseLayout } from "../engine/houseLayout";
import { HouseScene } from "./HouseScene";
import {
  PlayerMesh,
  RemotePlayerMesh,
  boxOverlapsAny,
  type CollidableBox,
  type HouseFootprint,
  type WalkableFootprint,
  type WalkTarget,
} from "./PlayerMesh";
import { CameraRig } from "./CameraRig";
import { ObjectInstanceMesh } from "./ObjectInstanceMesh";
import { PlacementGhost } from "./PlacementGhost";
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
  const walkTargetRef = useRef<WalkTarget | null>(null);

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

  // object.teleport_to() lands here as a store field (GameEngine has no React/Three.js
  // reference of its own) — convert its house-local coordinates to world space and hand
  // them to the same walk-at-normal-speed mechanism a click-to-interact uses.
  const pendingWalkRequest = useGameStore((s) => s.pendingWalkRequest);
  useEffect(() => {
    if (!pendingWalkRequest || pendingWalkRequest.forPlayerId !== currentPlayerId) return;
    const entry = computeHouseLayout(engine.listHouses()).find((e) => e.houseId === pendingWalkRequest.houseId);
    if (entry) {
      walkTargetRef.current = { x: entry.originX + pendingWalkRequest.x, z: pendingWalkRequest.z, onArrive: () => {} };
    }
    clearWalkRequest();
  }, [pendingWalkRequest, currentPlayerId]);

  // Live placement/move preview: house-local coords + whether it currently overlaps a wall or
  // another block (see handleFloorPointerMove below). Reset whenever placement mode ends.
  const [ghost, setGhost] = useState<{ x: number; z: number; blocked: boolean } | null>(null);
  useEffect(() => {
    if (!placingInstanceId) setGhost(null);
  }, [placingInstanceId]);

  if (!player) return null;

  let minX = -WORLD_MARGIN;
  let maxX = WORLD_MARGIN;
  let maxDepth = 10;
  const boxes: CollidableBox[] = [];
  const footprints: HouseFootprint[] = [];
  const walkables: WalkableFootprint[] = [];

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
    for (const inst of engine.listInstancesInHouse(house.id)) {
      if (inst.location.kind !== "house") continue;
      const def = engine.getDefinition(inst.defId);
      if (!def) continue;
      if (def.collidable) {
        boxes.push({
          x: inst.location.x + entry.originX,
          z: inst.location.z,
          halfW: def.dimensions.width / 2,
          halfD: def.dimensions.depth / 2,
        });
      } else {
        // Non-collidable ("objet simple") instances aren't obstacles, but a player can walk
        // onto them — that's exactly what on_walk_on detects, see PlayerMesh's onWalkOn.
        walkables.push({
          instanceId: inst.id,
          x: inst.location.x + entry.originX,
          z: inst.location.z,
          halfW: def.dimensions.width / 2,
          halfD: def.dimensions.depth / 2,
        });
      }
    }
  }

  const bounds = { minX, maxX, minZ: -maxDepth / 2 - 1, maxZ: STREET_DEPTH };
  const speech = engine.getSpeechBubbles();

  function handleHouseChange(houseId: string | null): void {
    if (houseId) void engine.enterHouse(currentPlayerId, houseId);
  }

  function handleWalkOn(instanceId: string): void {
    void engine.runWalkOnEvent(instanceId, currentPlayerId);
  }

  /** Left-click on an object: walk there at normal speed first (spec), then fire on_interact. */
  function handleInteract(instanceId: string, worldX: number, worldZ: number): void {
    walkTargetRef.current = { x: worldX, z: worldZ, onArrive: () => void engine.interact(instanceId, currentPlayerId) };
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

          function placingGhostBox(localX: number, localZ: number): CollidableBox | null {
            if (!placingInstanceId) return null;
            const placingInst = engine.getInstance(placingInstanceId);
            const def = placingInst ? engine.getDefinition(placingInst.defId) : undefined;
            if (!def) return null;
            return {
              x: localX + entry.originX,
              z: localZ,
              halfW: def.dimensions.width / 2,
              halfD: def.dimensions.depth / 2,
            };
          }

          function clampToFloor(pointX: number, pointZ: number): { x: number; z: number } {
            const halfW = house.width / 2 - 0.5;
            const halfD = house.depth / 2 - 0.5;
            return {
              x: THREE.MathUtils.clamp(pointX - entry.originX, -halfW, halfW),
              z: THREE.MathUtils.clamp(pointZ, -halfD, halfD),
            };
          }

          function handleFloorClick(e: ThreeEvent<MouseEvent>) {
            if (!placingInstanceId || !isOwn) return;
            e.stopPropagation();
            const { x, z } = clampToFloor(e.point.x, e.point.z);
            const box = placingGhostBox(x, z);
            if (box && boxOverlapsAny(box, boxes)) return; // would hit a wall/another block — refuse silently
            const result = engine.placeFromInventory(placingInstanceId, currentPlayerId, house.id, x, z, 0);
            if (result.ok) cancelPlacing();
          }

          function handleFloorPointerMove(e: ThreeEvent<PointerEvent>) {
            if (!placingInstanceId || !isOwn) return;
            const { x, z } = clampToFloor(e.point.x, e.point.z);
            const box = placingGhostBox(x, z);
            const blocked = box ? boxOverlapsAny(box, boxes) : false;
            setGhost({ x, z, blocked });
          }

          return (
            <group key={house.id} position={[entry.originX, 0, 0]}>
              <HouseScene
                house={house}
                onFloorClick={isOwn ? handleFloorClick : undefined}
                onFloorPointerMove={isOwn ? handleFloorPointerMove : undefined}
                onFloorPointerLeave={isOwn ? () => setGhost(null) : undefined}
                isOwn={isOwn}
                label={isOwn ? undefined : `Chez ${owner?.name ?? "?"}`}
              />
              {isOwn && ghost && placingInstanceId && (() => {
                const placingInst = engine.getInstance(placingInstanceId);
                const placingDef = placingInst ? engine.getDefinition(placingInst.defId) : undefined;
                return placingDef ? <PlacementGhost def={placingDef} x={ghost.x} z={ghost.z} blocked={ghost.blocked} /> : null;
              })()}
              {instances.map((inst) => {
                const def = engine.getDefinition(inst.defId);
                if (!def || inst.location.kind !== "house") return null;
                const b = speech.find((s) => s.targetInstanceId === inst.id);
                const worldX = inst.location.x + entry.originX;
                const worldZ = inst.location.z;
                return (
                  <ObjectInstanceMesh
                    key={inst.id}
                    instance={inst}
                    def={def}
                    speech={b?.text}
                    onInteract={() => handleInteract(inst.id, worldX, worldZ)}
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
          walkables={walkables}
          posRef={posRef}
          walkTargetRef={walkTargetRef}
          onHouseChange={handleHouseChange}
          onWalkOn={handleWalkOn}
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
