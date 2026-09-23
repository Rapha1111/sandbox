import { hostObject, type HostObject, type ScriptValue } from "../script-lang";
import { ScriptRuntimeError, ScriptSecurityError } from "../script-lang/errors";

export interface TransactionOutcome {
  accepted: boolean;
  reason?: string;
}

export interface SensitiveOutcome {
  ok: boolean;
  reason?: string;
}

export interface PromptOutcome {
  accepted: boolean;
  value?: string | number | boolean;
}

/** Hooks GameEngine supplies for one script event call. Every whitelisted API
 * method bottoms out in exactly one of these — nothing else is reachable. */
export interface ScriptEngineHooks {
  requestMoney(amount: number): Promise<TransactionOutcome>;
  /** Symmetric to requestMoney: asks the player to hand over one instance of `defIdOrName` instead of coins. */
  requestObject(defIdOrName: string): Promise<TransactionOutcome>;
  giveItem(defIdOrName: string): Promise<SensitiveOutcome>;
  spawn(defIdOrName: string): Promise<SensitiveOutcome>;
  /** Walks the interacting player (at normal speed, not instantly) to this instance's own location. Only works when this instance is a non-collidable "objet simple". */
  teleportTo(): SensitiveOutcome;
  say(text: string): void;
  /** `name` is a key into the object's own texture library (see object.get_texture()), not a raw texture id. */
  setTexture(nameOrFace: string, maybeName?: string): void;
  /** Without a face, returns the current "all faces" override name (or null). With a face, returns what's currently showing there. */
  getTexture(face?: string): ScriptValue;
  playAnimation(name: string): void;
  getState(key: string): ScriptValue;
  setState(key: string, value: string | number | boolean): void;
  getProperty(key: string): ScriptValue;
  getMoney(): number;
  getName(): string;
  getPlayerId(): string;
  /** This object instance's own unique, stable identifier. */
  getInstanceId(): string;
  /** Coins this object has collected via accepted player.request_money() calls. */
  getBalance(): number;
  /** Pays out of the object's own collected balance to any player id — never touches a player's own wallet. */
  sendMoney(targetPlayerId: string, amount: number): SensitiveOutcome;
  /** Generic input dialogs a script can pop up for the player. */
  askText(question: string): Promise<PromptOutcome>;
  askChoice(question: string, choices: string[]): Promise<PromptOutcome>;
  askYesNo(question: string): Promise<boolean>;
  askNumber(question: string, min: number, max: number, slider: boolean): Promise<PromptOutcome>;
}

function requireString(v: ScriptValue, what: string, line: number): string {
  if (typeof v !== "string") throw new ScriptRuntimeError(`${what} attend une chaîne`, line);
  return v;
}
function requireNumber(v: ScriptValue, what: string, line: number): number {
  if (typeof v !== "number") throw new ScriptRuntimeError(`${what} attend un nombre`, line);
  return v;
}
function requirePrimitive(v: ScriptValue, what: string, line: number): string | number | boolean {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  throw new ScriptRuntimeError(`${what} n'accepte que du texte, un nombre ou un booléen`, line);
}
function requireStringList(v: ScriptValue, what: string, line: number): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new ScriptRuntimeError(`${what} attend une liste d'options non vide`, line);
  return v.map((item, i) => requireString(item, `${what} (option #${i})`, line));
}

export function buildPlayerHost(hooks: ScriptEngineHooks): HostObject {
  return hostObject("Player", {
    say: (_i, args, line) => {
      hooks.say(requireString(args[0], "player.say()", line));
      return null;
    },
    get_money: () => hooks.getMoney(),
    get_name: () => hooks.getName(),
    get_id: () => hooks.getPlayerId(),
    request_money: async (_i, args, line) => {
      const amount = requireNumber(args[0], "player.request_money()", line);
      if (amount <= 0) throw new ScriptRuntimeError("player.request_money() attend un montant positif", line);
      const outcome = await hooks.requestMoney(amount);
      return hostObject("TransactionResult", {
        accepted: outcome.accepted,
        reason: outcome.reason ?? "",
      });
    },
    request_object: async (_i, args, line) => {
      const name = requireString(args[0], "player.request_object()", line);
      const outcome = await hooks.requestObject(name);
      return hostObject("TransactionResult", {
        accepted: outcome.accepted,
        reason: outcome.reason ?? "",
      });
    },
    ask_text: async (_i, args, line) => {
      const question = requireString(args[0], "player.ask_text()", line);
      const outcome = await hooks.askText(question);
      return hostObject("PromptResult", { accepted: outcome.accepted, value: outcome.value ?? "" });
    },
    ask_choice: async (_i, args, line) => {
      const question = requireString(args[0], "player.ask_choice()", line);
      const choices = requireStringList(args[1], "player.ask_choice()", line);
      const outcome = await hooks.askChoice(question, choices);
      return hostObject("PromptResult", { accepted: outcome.accepted, value: outcome.value ?? "" });
    },
    ask_yes_no: async (_i, args, line) => {
      const question = requireString(args[0], "player.ask_yes_no()", line);
      return await hooks.askYesNo(question);
    },
    ask_number: async (_i, args, line) => {
      const question = requireString(args[0], "player.ask_number()", line);
      const min = requireNumber(args[1], "player.ask_number()", line);
      const max = requireNumber(args[2], "player.ask_number()", line);
      if (min > max) throw new ScriptRuntimeError("player.ask_number(): min doit être <= max", line);
      const slider = args.length > 3 ? Boolean(requirePrimitive(args[3], "player.ask_number()", line)) : false;
      const outcome = await hooks.askNumber(question, min, max, slider);
      return hostObject("PromptResult", { accepted: outcome.accepted, value: outcome.value ?? min });
    },
  });
}

export function buildObjectHost(hooks: ScriptEngineHooks): HostObject {
  return hostObject("GameObject", {
    set_texture: (_i, args, line) => {
      if (args.length === 1) {
        hooks.setTexture(requireString(args[0], "object.set_texture()", line));
      } else {
        hooks.setTexture(
          requireString(args[0], "object.set_texture()", line),
          requireString(args[1], "object.set_texture()", line)
        );
      }
      return null;
    },
    get_texture: (_i, args, line) => {
      const face = args.length ? requireString(args[0], "object.get_texture()", line) : undefined;
      return hooks.getTexture(face);
    },
    play_animation: (_i, args, line) => {
      hooks.playAnimation(requireString(args[0], "object.play_animation()", line));
      return null;
    },
    get_state: (_i, args, line) => hooks.getState(requireString(args[0], "object.get_state()", line)),
    set_state: (_i, args, line) => {
      const key = requireString(args[0], "object.set_state()", line);
      hooks.setState(key, requirePrimitive(args[1], "object.set_state()", line));
      return null;
    },
    get_property: (_i, args, line) => hooks.getProperty(requireString(args[0], "object.get_property()", line)),
    give_item: async (_i, args, line) => {
      assertIsPlayerArg(args[0], "object.give_item()", line);
      const itemId = requireString(args[1], "object.give_item()", line);
      const result = await hooks.giveItem(itemId);
      if (!result.ok) throw new ScriptRuntimeError(`object.give_item() a échoué: ${result.reason ?? "inconnu"}`, line);
      return null;
    },
    spawn: async (_i, args, line) => {
      const defId = requireString(args[0], "object.spawn()", line);
      const result = await hooks.spawn(defId);
      if (!result.ok) throw new ScriptRuntimeError(`object.spawn() a échoué: ${result.reason ?? "inconnu"}`, line);
      return null;
    },
    teleport_to: (_i, args, line) => {
      assertIsPlayerArg(args[0], "object.teleport_to()", line);
      const result = hooks.teleportTo();
      if (!result.ok) throw new ScriptRuntimeError(`object.teleport_to() a échoué: ${result.reason ?? "inconnu"}`, line);
      return null;
    },
    get_id: () => hooks.getInstanceId(),
    get_balance: () => hooks.getBalance(),
    send_money: (_i, args, line) => {
      const targetPlayerId = requireString(args[0], "object.send_money()", line);
      const amount = requireNumber(args[1], "object.send_money()", line);
      const result = hooks.sendMoney(targetPlayerId, amount);
      if (!result.ok) throw new ScriptRuntimeError(`object.send_money() a échoué: ${result.reason ?? "inconnu"}`, line);
      return null;
    },
  });
}

function assertIsPlayerArg(v: ScriptValue, what: string, line: number): void {
  if (typeof v !== "object" || v === null || !("__host" in v) || (v as HostObject).name !== "Player") {
    throw new ScriptSecurityError(`${what} attend un joueur en premier argument`, line);
  }
}
