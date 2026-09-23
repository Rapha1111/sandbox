import type { Interpreter } from "./interpreter";
import { ScriptSecurityError } from "./errors";

export type ScriptValue =
  | number
  | string
  | boolean
  | null
  | ScriptValue[]
  | ScriptCallable
  | HostObject;

export interface ScriptCallable {
  __call: (interp: Interpreter, args: ScriptValue[], line: number) => Promise<ScriptValue> | ScriptValue;
  name: string;
}

export interface HostObject {
  __host: true;
  name: string;
  get(attr: string, line: number): ScriptValue;
}

export function isCallable(v: ScriptValue): v is ScriptCallable {
  return typeof v === "object" && v !== null && "__call" in v;
}

export function isHostObject(v: ScriptValue): v is HostObject {
  return typeof v === "object" && v !== null && "__host" in v;
}

type HostTableEntry =
  | ScriptValue
  | ((interp: Interpreter, args: ScriptValue[], line: number) => Promise<ScriptValue> | ScriptValue);

/** Builds a read-only whitelisted host object exposing only the methods/props listed in `table`. */
export function hostObject(name: string, table: Record<string, HostTableEntry>): HostObject {
  return {
    __host: true,
    name,
    get(attr: string, line: number): ScriptValue {
      if (!(attr in table)) {
        throw new ScriptSecurityError(`'${name}' n'a pas d'attribut ou de méthode '${attr}'`, line);
      }
      const entry = table[attr];
      if (typeof entry === "function") {
        const fn = entry;
        return { __call: (interp, args, callLine) => fn(interp, args, callLine), name: attr };
      }
      return entry as ScriptValue;
    },
  };
}

export function truthy(v: ScriptValue): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function toDisplayString(v: ScriptValue): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(toDisplayString).join(", ")}]`;
  if (isHostObject(v)) return `<${v.name}>`;
  if (isCallable(v)) return `<function ${v.name}>`;
  return String(v);
}
