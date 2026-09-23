import {
  Interpreter,
  parseProgram,
  ScriptRuntimeError,
  ScriptSyntaxError,
  type HostObject,
  type ScriptValue,
} from "../script-lang";
import { buildObjectHost, buildPlayerHost, type ScriptEngineHooks, type TransactionOutcome } from "./scriptApi";
import { genId } from "./idgen";
import type { SaveManager } from "./save";
import { kindOf } from "./permissions";
import type {
  DebugLogEntry,
  FaceName,
  House,
  HouseId,
  InventoryStack,
  ObjectDefId,
  ObjectDefinition,
  ObjectInstance,
  ObjectInstanceId,
  PendingTransaction,
  Player,
  PlayerId,
  SaveGame,
  Texture,
  TextureId,
} from "./types";

const DEBUG_LOG_CAP = 250;
export const STARTING_MONEY = 500;

export interface SpeechBubble {
  targetInstanceId: string;
  text: string;
  expiresAt: number;
}

/**
 * The whole runtime, in-process. Composes what spec §23 draws as separate
 * boxes (Object Manager, Transaction Manager, Inventory Manager, Economy
 * Manager, Permission Manager) as clearly-delimited method groups on one
 * class, because the solo prototype has no network boundary between them
 * yet. Nothing here talks to the DOM or Three.js — `subscribe()` is the only
 * way out, which is what will let a server process host this same class
 * later without a rewrite of the game logic.
 */
export class GameEngine {
  private players = new Map<PlayerId, Player>();
  private houses = new Map<HouseId, House>();
  private defs = new Map<ObjectDefId, ObjectDefinition>();
  private textures = new Map<TextureId, Texture>();
  private instances = new Map<ObjectInstanceId, ObjectInstance>();

  private pendingTransactions = new Map<string, PendingTransaction>();
  private transactionResolvers = new Map<string, (r: TransactionOutcome) => void>();
  private debugLog: DebugLogEntry[] = [];
  private speechBubbles: SpeechBubble[] = [];

  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveManager: SaveManager;

  constructor(saveManager: SaveManager) {
    this.saveManager = saveManager;
    const saved = saveManager.load();
    if (saved) this.loadSaveGame(saved);
    else this.seedDefaultWorld();
  }

  // ---------------------------------------------------------------------
  // Subscription / persistence plumbing
  // ---------------------------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const l of this.listeners) l();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 300);
  }

  private persist(): void {
    this.saveManager.save(this.toSaveGame());
  }

  toSaveGame(): SaveGame {
    return {
      version: 1,
      players: [...this.players.values()],
      houses: [...this.houses.values()],
      objectDefinitions: [...this.defs.values()],
      textures: [...this.textures.values()],
      objectInstances: [...this.instances.values()],
    };
  }

  private loadSaveGame(save: SaveGame): void {
    this.players = new Map(save.players.map((p) => [p.id, p]));
    this.houses = new Map(save.houses.map((h) => [h.id, h]));
    this.defs = new Map(save.objectDefinitions.map((d) => [d.id, d]));
    this.textures = new Map(save.textures.map((t) => [t.id, t]));
    this.instances = new Map(save.objectInstances.map((i) => [i.id, i]));
  }

  resetSave(): void {
    this.saveManager.clear();
    this.players.clear();
    this.houses.clear();
    this.defs.clear();
    this.textures.clear();
    this.instances.clear();
    this.debugLog = [];
    this.seedDefaultWorld();
    this.notify();
  }

  private seedDefaultWorld(): void {
    const playerId = genId("player");
    const houseId = genId("house");
    this.houses.set(houseId, { id: houseId, ownerId: playerId, width: 10, depth: 10 });
    this.players.set(playerId, {
      id: playerId,
      name: "Joueur",
      money: STARTING_MONEY,
      houseId,
      position: { x: 0, z: 3 },
    });
    this.seedDemoObjects(playerId, houseId);
  }

  /** A few pre-built, published objects so the world isn't empty on first launch (spec §29-31 examples). */
  private seedDemoObjects(playerId: PlayerId, houseId: HouseId): void {
    const allFaces = (libName: string) => ({
      top: libName, bottom: libName, front: libName, back: libName, left: libName, right: libName,
    });
    const publishAt = (
      name: string,
      script: string,
      color: string,
      x: number,
      z: number,
      dims?: Partial<ObjectDefinition["dimensions"]>,
      extraTextures?: Record<string, string>
    ) => {
      const draft = this.createDraftDefinition(playerId);
      const defaultTex = this.createTexture(playerId, "défaut", 16);
      this.updateTexturePixels(defaultTex.id, new Array(16 * 16).fill(color));
      const textureLibrary: Record<string, TextureId> = { défaut: defaultTex.id };
      if (extraTextures) {
        for (const [libName, extraColor] of Object.entries(extraTextures)) {
          const tex = this.createTexture(playerId, libName, 16);
          this.updateTexturePixels(tex.id, new Array(16 * 16).fill(extraColor));
          textureLibrary[libName] = tex.id;
        }
      }
      this.updateDefinition(draft.id, {
        name,
        script,
        textureLibrary,
        textures: allFaces("défaut"),
        collidable: name !== "Ticket",
        dimensions: { width: 1, height: 1, depth: 1, ...dims },
      });
      const result = this.publishDefinition(draft.id);
      if (result.instance) this.placeFromInventory(result.instance.id, houseId, x, z, 0);
      return draft.id;
    };

    publishAt(
      "Ticket",
      'def on_interact(player):\n    player.say("C\'est un ticket !")\n',
      "#facc15",
      -3, 1,
      { width: 0.4, height: 0.05, depth: 0.6 }
    );

    publishAt(
      "Cube Bonjour",
      'def on_interact(player):\n    player.say("Hello !")\n',
      "#60a5fa",
      -2, -1
    );

    // Demonstrates object.set_texture()/get_texture(): flashes to "actif" on a
    // successful payment, then on_tick reverts it on the next tick.
    publishAt(
      "Machine à soda",
      [
        "def on_interact(player):",
        "    transaction = player.request_money(100)",
        "    if transaction.accepted:",
        '        object.set_texture("actif")',
        '        player.say("Merci !")',
        "    else:",
        '        player.say("Reviens avec plus de coins !")',
        "",
        "def on_tick():",
        '    if object.get_texture() == "actif":',
        '        object.set_texture("défaut")',
        "",
      ].join("\n"),
      "#ef4444",
      0, -2,
      { width: 0.8, height: 1.4, depth: 0.8 },
      { actif: "#7f1d1d" }
    );

    publishAt(
      "Distributeur de tickets",
      [
        "def on_interact(player):",
        "    transaction = player.request_money(50)",
        "    if transaction.accepted:",
        '        object.give_item(player, "Ticket")',
        '        player.say("Voici votre ticket !")',
        "    else:",
        '        player.say("Le ticket coûte 50 coins.")',
        "",
      ].join("\n"),
      "#22c55e",
      2, -1,
      { width: 0.8, height: 1.4, depth: 0.8 }
    );

    // Demonstrates object.get_balance()/send_money(): the object escrows what it
    // collects and pays itself out once its own wallet reaches 100 coins.
    publishAt(
      "Cagnotte",
      [
        "def on_interact(player):",
        "    transaction = player.request_money(20)",
        "    if transaction.accepted:",
        "        solde = object.get_balance()",
        '        player.say("Cagnotte : " + str(solde) + " coins")',
        "        if solde >= 100:",
        "            object.send_money(player.get_id(), solde)",
        '            player.say("Cagnotte pleine, je la reverse !")',
        "    else:",
        '        player.say("La cagnotte demande 20 coins.")',
        "",
      ].join("\n"),
      "#a855f7",
      0, 1
    );
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  getPlayer(id: PlayerId): Player | undefined { return this.players.get(id); }
  listPlayers(): Player[] { return [...this.players.values()]; }
  getHouse(id: HouseId): House | undefined { return this.houses.get(id); }
  getDefinition(id: ObjectDefId): ObjectDefinition | undefined { return this.defs.get(id); }
  listDefinitionsByCreator(creatorId: PlayerId): ObjectDefinition[] {
    return [...this.defs.values()].filter((d) => d.creatorId === creatorId);
  }
  getTexture(id: TextureId): Texture | undefined { return this.textures.get(id); }
  listTexturesByOwner(ownerId: PlayerId): Texture[] {
    return [...this.textures.values()].filter((t) => t.ownerId === ownerId);
  }
  getInstance(id: ObjectInstanceId): ObjectInstance | undefined { return this.instances.get(id); }

  listInstancesInHouse(houseId: HouseId): ObjectInstance[] {
    return [...this.instances.values()].filter(
      (i) => i.location.kind === "house" && i.location.houseId === houseId
    );
  }

  listInventory(playerId: PlayerId): InventoryStack[] {
    const byDef = new Map<ObjectDefId, ObjectInstanceId[]>();
    for (const inst of this.instances.values()) {
      if (inst.location.kind !== "inventory" || inst.ownerId !== playerId) continue;
      const arr = byDef.get(inst.defId) ?? [];
      arr.push(inst.id);
      byDef.set(inst.defId, arr);
    }
    return [...byDef.entries()].map(([defId, instanceIds]) => ({ defId, instanceIds }));
  }

  getPendingTransactions(): PendingTransaction[] { return [...this.pendingTransactions.values()]; }
  getDebugLog(): DebugLogEntry[] { return this.debugLog; }
  getSpeechBubbles(): SpeechBubble[] {
    const now = Date.now();
    this.speechBubbles = this.speechBubbles.filter((b) => b.expiresAt > now);
    return this.speechBubbles;
  }

  // ---------------------------------------------------------------------
  // Debug log
  // ---------------------------------------------------------------------

  private pushLog(level: DebugLogEntry["level"], message: string): void {
    this.debugLog.unshift({ id: genId("log"), timestamp: Date.now(), level, message });
    if (this.debugLog.length > DEBUG_LOG_CAP) this.debugLog.length = DEBUG_LOG_CAP;
  }

  clearDebugLog(): void {
    this.debugLog = [];
    this.notify();
  }

  // ---------------------------------------------------------------------
  // Texture manager
  // ---------------------------------------------------------------------

  createTexture(ownerId: PlayerId, name: string, size: number): Texture {
    const now = Date.now();
    const tex: Texture = {
      id: genId("tex"),
      name,
      size,
      pixels: new Array(size * size).fill(""),
      ownerId,
      createdAt: now,
      updatedAt: now,
    };
    this.textures.set(tex.id, tex);
    this.notify();
    return tex;
  }

  updateTexturePixels(textureId: TextureId, pixels: string[]): void {
    const tex = this.textures.get(textureId);
    if (!tex) return;
    tex.pixels = pixels;
    tex.updatedAt = Date.now();
    this.notify();
  }

  resizeTexture(textureId: TextureId, newSize: number): void {
    const tex = this.textures.get(textureId);
    if (!tex || tex.size === newSize) return;
    const next = new Array(newSize * newSize).fill("");
    const copySize = Math.min(tex.size, newSize);
    for (let y = 0; y < copySize; y++) {
      for (let x = 0; x < copySize; x++) {
        next[y * newSize + x] = tex.pixels[y * tex.size + x];
      }
    }
    tex.size = newSize;
    tex.pixels = next;
    tex.updatedAt = Date.now();
    this.notify();
  }

  renameTexture(textureId: TextureId, name: string): void {
    const tex = this.textures.get(textureId);
    if (!tex) return;
    tex.name = name;
    tex.updatedAt = Date.now();
    this.notify();
  }

  deleteTexture(textureId: TextureId): { ok: boolean; reason?: string } {
    for (const def of this.defs.values()) {
      if (Object.values(def.textureLibrary).includes(textureId)) {
        return { ok: false, reason: `Utilisée par l'objet "${def.name}"` };
      }
    }
    this.textures.delete(textureId);
    this.notify();
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Texture library manager — the named textures a script can switch to
  // via object.set_texture(nom)/get_texture(nom) (spec §7.3, §9.2).
  // ---------------------------------------------------------------------

  addLibraryTexture(defId: ObjectDefId, name: string, size = 16): { ok: boolean; reason?: string; texture?: Texture } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, reason: "Objet introuvable" };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: "Le nom ne peut pas être vide" };
    if (trimmed in def.textureLibrary) return { ok: false, reason: `Une texture nommée "${trimmed}" existe déjà` };
    const tex = this.createTexture(def.creatorId, trimmed, size);
    def.textureLibrary = { ...def.textureLibrary, [trimmed]: tex.id };
    def.updatedAt = Date.now();
    this.notify();
    return { ok: true, texture: tex };
  }

  renameLibraryTexture(defId: ObjectDefId, oldName: string, newName: string): { ok: boolean; reason?: string } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, reason: "Objet introuvable" };
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, reason: "Le nom ne peut pas être vide" };
    if (trimmed === oldName) return { ok: true };
    if (trimmed in def.textureLibrary) return { ok: false, reason: `Une texture nommée "${trimmed}" existe déjà` };
    const texId = def.textureLibrary[oldName];
    if (!texId) return { ok: false, reason: "Texture introuvable" };
    const nextLibrary = { ...def.textureLibrary };
    delete nextLibrary[oldName];
    nextLibrary[trimmed] = texId;
    const nextFaces = { ...def.textures };
    for (const face of Object.keys(nextFaces) as FaceName[]) {
      if (nextFaces[face] === oldName) nextFaces[face] = trimmed;
    }
    def.textureLibrary = nextLibrary;
    def.textures = nextFaces;
    def.updatedAt = Date.now();
    this.notify();
    return { ok: true };
  }

  deleteLibraryTexture(defId: ObjectDefId, name: string): { ok: boolean; reason?: string } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, reason: "Objet introuvable" };
    if (Object.values(def.textures).includes(name)) {
      return { ok: false, reason: "Cette texture est utilisée par une face — réassignez la face avant de la supprimer" };
    }
    const nextLibrary = { ...def.textureLibrary };
    delete nextLibrary[name];
    def.textureLibrary = nextLibrary;
    def.updatedAt = Date.now();
    this.notify();
    return { ok: true };
  }

  assignFaceTexture(defId: ObjectDefId, face: FaceName, name: string): { ok: boolean; reason?: string } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, reason: "Objet introuvable" };
    if (!(name in def.textureLibrary)) return { ok: false, reason: "Texture introuvable dans la bibliothèque" };
    def.textures = { ...def.textures, [face]: name };
    def.updatedAt = Date.now();
    this.notify();
    return { ok: true };
  }

  /** Resolves a texture library entry (by name) to its actual pixel data. */
  resolveLibraryTexture(def: ObjectDefinition, name: string | undefined): Texture | undefined {
    if (!name) return undefined;
    const texId = def.textureLibrary[name];
    return texId ? this.textures.get(texId) : undefined;
  }

  // ---------------------------------------------------------------------
  // Object definition manager (Object Creator)
  // ---------------------------------------------------------------------

  createDraftDefinition(creatorId: PlayerId): ObjectDefinition {
    const now = Date.now();
    const def: ObjectDefinition = {
      id: genId("def"),
      name: "Nouvel objet",
      creatorId,
      version: 0,
      createdAt: now,
      updatedAt: now,
      dimensions: { width: 1, height: 1, depth: 1 },
      textureLibrary: {},
      textures: {},
      collidable: true,
      properties: {},
      script: "def on_interact(player):\n    player.say(\"Hello !\")\n",
      published: false,
    };
    this.defs.set(def.id, def);
    this.notify();
    return def;
  }

  updateDefinition(defId: ObjectDefId, patch: Partial<Omit<ObjectDefinition, "id" | "creatorId" | "createdAt">>): void {
    const def = this.defs.get(defId);
    if (!def) return;
    Object.assign(def, patch, { updatedAt: Date.now() });
    this.notify();
  }

  deleteDraft(defId: ObjectDefId): void {
    const def = this.defs.get(defId);
    if (!def || def.published) return;
    this.defs.delete(defId);
    this.notify();
  }

  /** Validates the script compiles, without running anything. Used by the editor's live check. */
  validateScript(source: string): { ok: true } | { ok: false; message: string } {
    try {
      parseProgram(source);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Publishes (or re-publishes) a definition and, on first publish, grants the creator one instance. */
  publishDefinition(defId: ObjectDefId): { ok: boolean; reason?: string; instance?: ObjectInstance } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, reason: "Objet introuvable" };
    const validation = this.validateScript(def.script);
    if (!validation.ok) return { ok: false, reason: validation.message };

    const wasPublished = def.published;
    def.published = true;
    def.version += 1;
    def.updatedAt = Date.now();
    this.pushLog("info", `Objet "${def.name}" publié (v${def.version})`);

    let instance: ObjectInstance | undefined;
    if (!wasPublished) {
      instance = this.instantiate(def.id, def.creatorId, { kind: "inventory" });
    }
    this.notify();
    return { ok: true, instance };
  }

  // ---------------------------------------------------------------------
  // Object instance manager
  // ---------------------------------------------------------------------

  instantiate(defId: ObjectDefId, ownerId: PlayerId | null, location: ObjectInstance["location"]): ObjectInstance {
    const def = this.defs.get(defId);
    const inst: ObjectInstance = {
      id: genId("inst"),
      defId,
      ownerId,
      location,
      state: {},
      wallet: 0,
      createdAt: Date.now(),
    };
    this.instances.set(inst.id, inst);
    if (def) void this.runEventForInstance(inst, def, "on_create", []);
    this.notify();
    return inst;
  }

  placeFromInventory(instanceId: ObjectInstanceId, houseId: HouseId, x: number, z: number, rotationY = 0): { ok: boolean; reason?: string } {
    const inst = this.instances.get(instanceId);
    if (!inst) return { ok: false, reason: "Objet introuvable" };
    if (inst.location.kind !== "inventory") return { ok: false, reason: "Cet objet n'est pas dans l'inventaire" };
    const house = this.houses.get(houseId);
    if (!house) return { ok: false, reason: "Maison introuvable" };
    inst.location = { kind: "house", houseId, x, y: 0, z, rotationY };
    this.notify();
    return { ok: true };
  }

  moveInstance(instanceId: ObjectInstanceId, x: number, z: number, rotationY?: number): void {
    const inst = this.instances.get(instanceId);
    if (!inst || inst.location.kind !== "house") return;
    inst.location = { ...inst.location, x, z, rotationY: rotationY ?? inst.location.rotationY };
    this.notify();
  }

  pickupToInventory(instanceId: ObjectInstanceId, requesterId: PlayerId): { ok: boolean; reason?: string } {
    const inst = this.instances.get(instanceId);
    if (!inst) return { ok: false, reason: "Objet introuvable" };
    if (inst.location.kind !== "house") return { ok: false, reason: "Cet objet n'est pas placé" };
    if (inst.ownerId !== requesterId) return { ok: false, reason: "Vous ne possédez pas cet objet" };
    inst.location = { kind: "inventory" };
    this.notify();
    return { ok: true };
  }

  deleteInstance(instanceId: ObjectInstanceId, requesterId: PlayerId): { ok: boolean; reason?: string } {
    const inst = this.instances.get(instanceId);
    if (!inst) return { ok: false, reason: "Objet introuvable" };
    if (inst.ownerId !== requesterId) return { ok: false, reason: "Vous ne possédez pas cet objet" };
    const def = this.defs.get(inst.defId);
    const cleanup = def ? this.runEventForInstance(inst, def, "on_destroy", []) : Promise.resolve();
    void cleanup.finally(() => {
      this.instances.delete(instanceId);
      this.notify();
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Script execution
  // ---------------------------------------------------------------------

  private buildHooksFor(instance: ObjectInstance, def: ObjectDefinition, playerId: PlayerId | null): ScriptEngineHooks {
    return {
      requestMoney: (amount) => {
        if (!playerId) throw new ScriptRuntimeError("Aucun joueur n'est présent pour cette transaction");
        return this.requestMoneyTransaction(playerId, amount, instance.id, def.name);
      },
      giveItem: (defIdOrName) => {
        if (!playerId) return Promise.resolve({ ok: false, reason: "Aucun joueur présent" });
        return Promise.resolve(this.giveItemSensitive(playerId, defIdOrName));
      },
      spawn: (defIdOrName) => Promise.resolve(this.spawnSensitive(instance, defIdOrName)),
      say: (text) => {
        if (playerId) {
          this.speechBubbles.push({ targetInstanceId: instance.id, text, expiresAt: Date.now() + 4000 });
        }
        this.pushLog("info", `💬 ${def.name}: "${text}"`);
        this.notify();
      },
      setTexture: (a, b) => {
        const face = b ? a : "__all__";
        const name = b ?? a;
        if (!(name in def.textureLibrary)) {
          throw new ScriptRuntimeError(
            `Texture inconnue: '${name}'. Créez-la dans l'onglet Textures ou consultez object.get_texture().`
          );
        }
        instance.state[`textureOverride_${face}`] = name;
        this.notify();
      },
      getTexture: (face) => {
        if (face) {
          return (
            (instance.state[`textureOverride_${face}`] as string | undefined) ??
            (instance.state["textureOverride___all__"] as string | undefined) ??
            def.textures[face as FaceName] ??
            null
          );
        }
        return (instance.state["textureOverride___all__"] as string | undefined) ?? null;
      },
      playAnimation: (name) => {
        instance.state["_animation"] = name;
        instance.state["_animationAt"] = Date.now();
        this.notify();
      },
      getState: (key) => (key in instance.state ? instance.state[key] : null),
      setState: (key, value) => {
        instance.state[key] = value;
        this.notify();
      },
      getProperty: (key) => (key in def.properties ? def.properties[key] : null),
      getMoney: () => {
        if (!playerId) throw new ScriptRuntimeError("Aucun joueur présent");
        return this.players.get(playerId)?.money ?? 0;
      },
      getName: () => {
        if (!playerId) throw new ScriptRuntimeError("Aucun joueur présent");
        return this.players.get(playerId)?.name ?? "?";
      },
      getPlayerId: () => {
        if (!playerId) throw new ScriptRuntimeError("Aucun joueur présent");
        return playerId;
      },
      getBalance: () => instance.wallet ?? 0,
      sendMoney: (targetPlayerId, amount) => this.sendMoneyFromInstance(instance, targetPlayerId, amount),
    };
  }

  /** Runs a single event handler for an instance. Never throws — script errors are caught and logged (spec §27). */
  async runEventForInstance(
    instance: ObjectInstance,
    def: ObjectDefinition,
    eventName: string,
    args: ScriptValue[]
  ): Promise<void> {
    let program;
    try {
      program = parseProgram(def.script);
    } catch (e) {
      if (e instanceof ScriptSyntaxError) {
        this.pushLog("error", `[${def.name}] Erreur de syntaxe: ${e.message}`);
        this.notify();
        return;
      }
      throw e;
    }

    const hooks = this.buildHooksFor(instance, def, this.playerIdFromHostArgs(args));
    const objectHost = buildObjectHost(hooks);
    const interpreter = new Interpreter(program, { object: objectHost }, {
      onLog: (msg) => this.pushLog("info", `[${def.name}] ${msg}`),
    });
    if (!interpreter.hasEvent(eventName)) return;

    this.pushLog("call", `[${def.name}] appel ${eventName}(${args.length ? "player" : ""})`);
    try {
      const result = await interpreter.callEvent(eventName, args);
      this.pushLog("result", `[${def.name}] ${eventName} terminé${result !== null ? ` -> ${String(result)}` : ""}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.pushLog("error", `[${def.name}] Erreur script: ${message}`);
    }
    this.notify();
  }

  private playerIdFromHostArgs(args: ScriptValue[]): PlayerId | null {
    const arg = args[0];
    if (arg && typeof arg === "object" && "__playerId" in (arg as unknown as Record<string, unknown>)) {
      return (arg as unknown as { __playerId: PlayerId }).__playerId;
    }
    return null;
  }

  private makePlayerArg(playerId: PlayerId, instance: ObjectInstance, def: ObjectDefinition): HostObject {
    const hooks = this.buildHooksFor(instance, def, playerId);
    const host = buildPlayerHost(hooks) as HostObject & { __playerId?: PlayerId };
    (host as unknown as { __playerId: PlayerId }).__playerId = playerId;
    return host;
  }

  /** The player interacts with a placed/instantiated object: fires on_interact. */
  async interact(instanceId: ObjectInstanceId, playerId: PlayerId): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    const def = this.defs.get(instance.defId);
    if (!def) return;
    const playerArg = this.makePlayerArg(playerId, instance, def);
    await this.runEventForInstance(instance, def, "on_interact", [playerArg]);
  }

  async enterHouse(playerId: PlayerId, houseId: HouseId): Promise<void> {
    for (const instance of this.listInstancesInHouse(houseId)) {
      const def = this.defs.get(instance.defId);
      if (!def) continue;
      const playerArg = this.makePlayerArg(playerId, instance, def);
      await this.runEventForInstance(instance, def, "on_player_enter", [playerArg]);
    }
  }

  async tickAll(): Promise<void> {
    for (const instance of this.instances.values()) {
      if (instance.location.kind !== "house") continue;
      const def = this.defs.get(instance.defId);
      if (!def) continue;
      await this.runEventForInstance(instance, def, "on_tick", []);
    }
  }

  /** Runs an event against a throwaway, unsaved instance of `def` — used by the editor's "Tester" button. */
  async testDefinition(def: ObjectDefinition, eventName: string, playerId: PlayerId): Promise<void> {
    const fake: ObjectInstance = {
      id: `test_${def.id}`,
      defId: def.id,
      ownerId: playerId,
      location: { kind: "inventory" },
      state: {},
      wallet: 0,
      createdAt: Date.now(),
    };
    this.pushLog("info", `— Test de "${def.name}" (${eventName}) —`);
    this.notify();
    const args = eventName === "on_interact" || eventName === "on_player_enter" ? [this.makePlayerArg(playerId, fake, def)] : [];
    await this.runEventForInstance(fake, def, eventName, args);
  }

  // ---------------------------------------------------------------------
  // Permission-tagged action log helper (spec §11)
  // ---------------------------------------------------------------------

  private logAction(action: string, detail: string): void {
    this.pushLog("call", `[${kindOf(action)}] ${action} ${detail}`);
  }

  // ---------------------------------------------------------------------
  // Economy / Transaction manager (spec §12–§14)
  // ---------------------------------------------------------------------

  requestMoneyTransaction(playerId: PlayerId, amount: number, sourceInstanceId: ObjectInstanceId | null, sourceDefName: string): Promise<TransactionOutcome> {
    this.logAction("player.request_money", `(${amount}) par ${playerId}`);
    const tx: PendingTransaction = {
      id: genId("tx"),
      kind: "request_money",
      playerId,
      amount,
      sourceInstanceId,
      sourceDefName,
      createdAt: Date.now(),
    };
    this.pendingTransactions.set(tx.id, tx);
    this.notify();
    return new Promise<TransactionOutcome>((resolve) => {
      this.transactionResolvers.set(tx.id, resolve);
    });
  }

  /** Atomic: balance check + debit happen together, or nothing happens (spec §13). */
  resolveTransaction(txId: string, accepted: boolean): void {
    const tx = this.pendingTransactions.get(txId);
    const resolve = this.transactionResolvers.get(txId);
    if (!tx || !resolve) return;
    this.pendingTransactions.delete(txId);
    this.transactionResolvers.delete(txId);

    if (!accepted) {
      this.pushLog("result", `Transaction refusée: ${tx.amount} coins (${tx.sourceDefName})`);
      resolve({ accepted: false, reason: "refusé par le joueur" });
      this.notify();
      return;
    }

    const player = this.players.get(tx.playerId);
    if (!player || player.money < tx.amount) {
      this.pushLog("error", `Transaction annulée: solde insuffisant (${tx.sourceDefName})`);
      resolve({ accepted: false, reason: "solde insuffisant" });
      this.notify();
      return;
    }

    player.money -= tx.amount;
    // The paying object escrows what it collects — object.get_balance()/send_money()
    // let its script redistribute it later (e.g. pay it back out to a player).
    const sourceInstance = tx.sourceInstanceId ? this.instances.get(tx.sourceInstanceId) : undefined;
    if (sourceInstance) sourceInstance.wallet = (sourceInstance.wallet ?? 0) + tx.amount;
    this.pushLog("result", `-${tx.amount} coins (${tx.sourceDefName})`);
    resolve({ accepted: true });
    this.notify();
  }

  /** Atomic: an object can only pay out coins it has actually collected (spec §13's guarantee, extended to object wallets). */
  private sendMoneyFromInstance(instance: ObjectInstance, targetPlayerId: PlayerId, amount: number): { ok: boolean; reason?: string } {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "montant invalide" };
    if ((instance.wallet ?? 0) < amount) return { ok: false, reason: "solde de l'objet insuffisant" };
    const target = this.players.get(targetPlayerId);
    if (!target) return { ok: false, reason: `joueur '${targetPlayerId}' introuvable` };
    instance.wallet -= amount;
    target.money += amount;
    this.pushLog("result", `💰 ${instance.id} envoie ${amount} coins à ${target.name}`);
    this.notify();
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Inventory manager — sensitive creation actions (spec §11, §15, §16)
  // ---------------------------------------------------------------------

  private resolveDefByIdOrName(defIdOrName: string): ObjectDefinition | undefined {
    return this.defs.get(defIdOrName) ??
      [...this.defs.values()].find((d) => d.published && d.name.toLowerCase() === defIdOrName.toLowerCase());
  }

  giveItemSensitive(playerId: PlayerId, defIdOrName: string): { ok: boolean; reason?: string } {
    const def = this.resolveDefByIdOrName(defIdOrName);
    if (!def || !def.published) return { ok: false, reason: `objet '${defIdOrName}' introuvable` };
    this.logAction("object.give_item", `(${def.name}) -> ${playerId}`);
    this.instantiate(def.id, playerId, { kind: "inventory" });
    this.pushLog("result", `Objet reçu: ${def.name}`);
    this.notify();
    return { ok: true };
  }

  spawnSensitive(source: ObjectInstance, defIdOrName: string): { ok: boolean; reason?: string } {
    if (source.location.kind !== "house") return { ok: false, reason: "l'objet n'est pas placé dans un lieu" };
    const def = this.resolveDefByIdOrName(defIdOrName);
    if (!def || !def.published) return { ok: false, reason: `objet '${defIdOrName}' introuvable` };
    this.logAction("object.spawn", `(${def.name}) près de ${source.id}`);
    const { houseId, x, z } = source.location;
    this.instantiate(def.id, source.ownerId, { kind: "house", houseId, x: x + 1, y: 0, z, rotationY: 0 });
    this.notify();
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Player movement (P0)
  // ---------------------------------------------------------------------

  movePlayer(playerId: PlayerId, x: number, z: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.position = { x, z };
    this.notify();
  }
}
