// Wire format for the multiplayer relay (client <-> server/index.ts). Kept separate from
// engine/types.ts because these are network-transport concerns, not simulation concerns —
// see GameEngine's own "framework-agnostic" note for why that boundary matters.
import type { House, ObjectDefinition, ObjectInstance, Player, Texture } from "../engine/types";

/** A partial slice of the shared world: only the entities someone actually touched. */
export interface WorldPatch {
  players: Player[];
  houses: House[];
  defs: ObjectDefinition[];
  textures: Texture[];
  instances: ObjectInstance[];
}

export function emptyPatch(): WorldPatch {
  return { players: [], houses: [], defs: [], textures: [], instances: [] };
}

export function isPatchEmpty(patch: WorldPatch): boolean {
  return (
    patch.players.length === 0 &&
    patch.houses.length === 0 &&
    patch.defs.length === 0 &&
    patch.textures.length === 0 &&
    patch.instances.length === 0
  );
}

export type ClientMessage =
  | { type: "hello"; playerId: string; name: string }
  | { type: "sync"; patch: WorldPatch }
  | { type: "speech"; targetInstanceId: string; text: string };

export type ServerMessage =
  | { type: "welcome"; slotIndex: number; world: WorldPatch; online: string[] }
  | { type: "patch"; patch: WorldPatch }
  | { type: "presence"; playerId: string; online: boolean }
  | { type: "speech"; targetInstanceId: string; text: string };
