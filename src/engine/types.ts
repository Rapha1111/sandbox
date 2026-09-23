// Core data model shared by the runtime and (eventually) a networked server.
// Kept free of any rendering/UI concerns so it can move server-side later
// without a rewrite (see README "Architecture").

export type PlayerId = string;
export type ObjectDefId = string;
export type ObjectInstanceId = string;
export type TextureId = string;
export type HouseId = string;

/** A hand-drawn pixel art texture. Colors are stored as CSS hex strings, "" = transparent. */
export interface Texture {
  id: TextureId;
  name: string;
  size: number; // width == height, e.g. 8/16/32/64
  pixels: string[]; // length size*size, row-major
  ownerId: PlayerId;
  createdAt: number;
  updatedAt: number;
}

/** The 6 physical faces of the box mesh a rendered instance actually has. */
export type FaceName = "top" | "bottom" | "front" | "back" | "left" | "right";
/**
 * Faces a creator actually paints. To keep the pixel-art workload small,
 * "bottom" never has a texture (it faces the floor, so it's never seen) and
 * "back"/"left"/"right" always mirror whatever is painted on "front" — so
 * only these two need drawing. See ObjectInstanceMesh's face resolution and
 * GameEngine's set_texture/get_texture hooks for where this is enforced.
 */
export const EDITABLE_FACE_NAMES: FaceName[] = ["top", "front"];

export interface Dimensions {
  width: number; // X
  height: number; // Y
  depth: number; // Z
}

/** The template a creator publishes. Analogous to a "class". */
export interface ObjectDefinition {
  id: ObjectDefId;
  name: string;
  creatorId: PlayerId;
  version: number;
  createdAt: number;
  updatedAt: number;
  dimensions: Dimensions;
  /**
   * The object's palette: every texture a creator has drawn for it, keyed by a name the
   * creator picks (e.g. "front", "ouvert", "clignote_1"). Faces below and scripts
   * (object.set_texture/get_texture) both refer to entries here by that name, never by
   * raw texture id — so a script can swap an object's look at runtime by name.
   */
  textureLibrary: Record<string, TextureId>;
  /** Which library entry each face shows by default. */
  textures: Partial<Record<FaceName, string>>;
  collidable: boolean;
  /** Arbitrary designer-defined properties, readable from scripts via object.get_property(). */
  properties: Record<string, string | number | boolean>;
  /** Python-like source code. See src/script-lang. */
  script: string;
  published: boolean;
}

/** A concrete placed/owned copy of a definition. Analogous to an "instance". */
export interface ObjectInstance {
  id: ObjectInstanceId;
  defId: ObjectDefId;
  ownerId: PlayerId | null;
  /** Where it lives right now. */
  location:
    | { kind: "inventory" }
    | { kind: "house"; houseId: HouseId; x: number; y: number; z: number; rotationY: number };
  /** Free-form per-instance state a script can read/write via object.get_state/set_state. */
  state: Record<string, string | number | boolean>;
  /** Coins this instance has collected via accepted player.request_money() calls (spec-extension: an
   * object escrows the money it's paid; object.get_balance()/send_money() let a script redistribute it). */
  wallet: number;
  createdAt: number;
}

export interface InventoryStack {
  defId: ObjectDefId;
  instanceIds: ObjectInstanceId[];
}

export interface Player {
  id: PlayerId;
  name: string;
  money: number;
  houseId: HouseId;
  position: { x: number; z: number };
}

export interface House {
  id: HouseId;
  ownerId: PlayerId;
  width: number;
  depth: number;
}

export interface PendingTransaction {
  id: string;
  kind: "request_money";
  playerId: PlayerId;
  amount: number;
  sourceInstanceId: ObjectInstanceId | null;
  sourceDefName: string;
  createdAt: number;
}

export interface TransactionResult {
  accepted: boolean;
  reason?: string;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  level: "info" | "call" | "result" | "error";
  message: string;
}

export interface SaveGame {
  version: 1;
  players: Player[];
  houses: House[];
  objectDefinitions: ObjectDefinition[];
  textures: Texture[];
  objectInstances: ObjectInstance[];
}
