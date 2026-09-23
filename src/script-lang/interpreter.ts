import type { Expr, FunctionDef, Stmt } from "./ast";
import { ScriptBudgetExceededError, ScriptRuntimeError, ScriptSecurityError } from "./errors";
import { type ScriptValue, isCallable, isHostObject, truthy } from "./values";

class ReturnSignal {
  value: ScriptValue;
  constructor(value: ScriptValue) {
    this.value = value;
  }
}
class BreakSignal {}
class ContinueSignal {}

const MAX_RANGE_LENGTH = 50_000;
const MAX_CALL_DEPTH = 60;

class Environment {
  private vars = new Map<string, ScriptValue>();
  get(name: string): ScriptValue {
    return this.vars.has(name) ? this.vars.get(name)! : null;
  }
  has(name: string): boolean {
    return this.vars.has(name);
  }
  set(name: string, value: ScriptValue): void {
    this.vars.set(name, value);
  }
}

export interface InterpreterOptions {
  /** Hard cap on number of AST nodes evaluated, per top-level event call. Guards against infinite loops. */
  maxSteps?: number;
  /** Called for host-level debug logging (e.g. a `log()` builtin call from the script). */
  onLog?: (message: string) => void;
}

/**
 * Async tree-walking interpreter for the restricted object-script language.
 * Execution is async so that "sensitive" API calls (e.g. player.request_money)
 * can suspend the script while the engine waits for the player to confirm a
 * transaction in the UI, then resume with the result — without blocking the
 * JS event loop or requiring a bytecode VM.
 */
export class Interpreter {
  private functions = new Map<string, FunctionDef>();
  private steps = 0;
  private readonly maxSteps: number;
  private readonly onLog?: (message: string) => void;
  private readonly globals: Record<string, ScriptValue>;

  constructor(program: FunctionDef[], globals: Record<string, ScriptValue>, options: InterpreterOptions = {}) {
    this.globals = globals;
    for (const fn of program) this.functions.set(fn.name, fn);
    this.maxSteps = options.maxSteps ?? 200_000;
    this.onLog = options.onLog;
  }

  hasEvent(name: string): boolean {
    return this.functions.has(name);
  }

  log(message: string): void {
    this.onLog?.(message);
  }

  async callEvent(name: string, args: ScriptValue[] = []): Promise<ScriptValue> {
    const fn = this.functions.get(name);
    if (!fn) return null;
    this.steps = 0;
    return this.callFunction(fn, args, 0);
  }

  private tick(line: number): void {
    this.steps++;
    if (this.steps > this.maxSteps) throw new ScriptBudgetExceededError();
    void line;
  }

  private async callFunction(fn: FunctionDef, args: ScriptValue[], depth: number): Promise<ScriptValue> {
    if (depth > MAX_CALL_DEPTH) {
      throw new ScriptRuntimeError("Profondeur d'appel de fonction trop importante", fn.line);
    }
    const env = new Environment();
    fn.params.forEach((p, i) => env.set(p, args[i] ?? null));
    try {
      await this.execBlock(fn.body, env, depth);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return null;
  }

  private async execBlock(stmts: Stmt[], env: Environment, depth: number): Promise<void> {
    for (const s of stmts) {
      await this.execStmt(s, env, depth);
    }
  }

  private async execStmt(s: Stmt, env: Environment, depth: number): Promise<void> {
    this.tick(s.line);
    switch (s.type) {
      case "Assign":
        env.set(s.target, await this.evalExpr(s.value, env, depth));
        return;
      case "AttrAssign": {
        const obj = await this.evalExpr(s.obj, env, depth);
        if (isHostObject(obj)) {
          throw new ScriptSecurityError(
            `Impossible de modifier directement '${obj.name}.${s.attr}' — utilisez une méthode de l'API`,
            s.line
          );
        }
        throw new ScriptRuntimeError("Affectation d'attribut invalide", s.line);
      }
      case "ExprStmt":
        await this.evalExpr(s.expr, env, depth);
        return;
      case "If": {
        for (const branch of s.branches) {
          if (truthy(await this.evalExpr(branch.test, env, depth))) {
            await this.execBlock(branch.body, env, depth);
            return;
          }
        }
        await this.execBlock(s.orelse, env, depth);
        return;
      }
      case "Return":
        throw new ReturnSignal(s.value ? await this.evalExpr(s.value, env, depth) : null);
      case "Pass":
        return;
      case "Break":
        throw new BreakSignal();
      case "Continue":
        throw new ContinueSignal();
      case "For": {
        const iterable = await this.evalExpr(s.iter, env, depth);
        if (!Array.isArray(iterable)) {
          throw new ScriptRuntimeError("La boucle 'for' attend une liste (ex: range(...))", s.line);
        }
        for (const item of iterable) {
          this.tick(s.line);
          env.set(s.varName, item);
          try {
            await this.execBlock(s.body, env, depth);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "While": {
        while (truthy(await this.evalExpr(s.test, env, depth))) {
          this.tick(s.line);
          try {
            await this.execBlock(s.body, env, depth);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
    }
  }

  private async evalExpr(e: Expr, env: Environment, depth: number): Promise<ScriptValue> {
    this.tick(e.line);
    switch (e.type) {
      case "Num":
        return e.value;
      case "Str":
        return e.value;
      case "Bool":
        return e.value;
      case "NoneLit":
        return null;
      case "ListLit": {
        const items: ScriptValue[] = [];
        for (const item of e.items) items.push(await this.evalExpr(item, env, depth));
        return items;
      }
      case "Name": {
        if (env.has(e.name)) return env.get(e.name);
        if (e.name in this.globals) return this.globals[e.name];
        if (e.name in BUILTINS) return BUILTINS[e.name];
        throw new ScriptRuntimeError(`Nom non défini: '${e.name}'`, e.line);
      }
      case "Attribute": {
        const obj = await this.evalExpr(e.obj, env, depth);
        return this.getAttr(obj, e.attr, e.line);
      }
      case "Call": {
        const args: ScriptValue[] = [];
        for (const a of e.args) args.push(await this.evalExpr(a, env, depth));
        if (e.callee.type === "Name" && !env.has(e.callee.name) && this.functions.has(e.callee.name)) {
          return this.callFunction(this.functions.get(e.callee.name)!, args, depth + 1);
        }
        const callee = await this.evalExpr(e.callee, env, depth);
        if (!isCallable(callee)) {
          throw new ScriptRuntimeError("Cette valeur n'est pas appelable", e.line);
        }
        return callee.__call(this, args, e.line);
      }
      case "UnaryOp": {
        const v = await this.evalExpr(e.operand, env, depth);
        if (e.op === "not") return !truthy(v);
        if (e.op === "-") {
          if (typeof v !== "number") throw new ScriptRuntimeError("'-' attend un nombre", e.line);
          return -v;
        }
        throw new ScriptRuntimeError(`Opérateur unaire inconnu '${e.op}'`, e.line);
      }
      case "BoolOp": {
        const left = await this.evalExpr(e.left, env, depth);
        if (e.op === "and") return truthy(left) ? await this.evalExpr(e.right, env, depth) : left;
        return truthy(left) ? left : await this.evalExpr(e.right, env, depth);
      }
      case "Compare": {
        const left = await this.evalExpr(e.left, env, depth);
        const right = await this.evalExpr(e.right, env, depth);
        return this.compare(e.op, left, right, e.line);
      }
      case "BinOp": {
        const left = await this.evalExpr(e.left, env, depth);
        const right = await this.evalExpr(e.right, env, depth);
        return this.binOp(e.op, left, right, e.line);
      }
    }
  }

  private getAttr(obj: ScriptValue, attr: string, line: number): ScriptValue {
    if (isHostObject(obj)) return obj.get(attr, line);
    if (obj === null) throw new ScriptRuntimeError(`None n'a pas d'attribut '${attr}'`, line);
    throw new ScriptSecurityError(`Impossible d'accéder à '.${attr}' sur cette valeur`, line);
  }

  private compare(op: string, l: ScriptValue, r: ScriptValue, line: number): ScriptValue {
    switch (op) {
      case "==":
        return scriptEquals(l, r);
      case "!=":
        return !scriptEquals(l, r);
    }
    if (typeof l !== "number" || typeof r !== "number") {
      if (typeof l === "string" && typeof r === "string") {
        switch (op) {
          case "<": return l < r;
          case "<=": return l <= r;
          case ">": return l > r;
          case ">=": return l >= r;
        }
      }
      throw new ScriptRuntimeError(`Comparaison '${op}' invalide entre ces types`, line);
    }
    switch (op) {
      case "<": return l < r;
      case "<=": return l <= r;
      case ">": return l > r;
      case ">=": return l >= r;
    }
    throw new ScriptRuntimeError(`Opérateur de comparaison inconnu '${op}'`, line);
  }

  private binOp(op: string, l: ScriptValue, r: ScriptValue, line: number): ScriptValue {
    if (op === "+" && typeof l === "string" && typeof r === "string") return l + r;
    if (op === "+" && Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
    if (typeof l !== "number" || typeof r !== "number") {
      throw new ScriptRuntimeError(`Opérateur '${op}' invalide entre ces types`, line);
    }
    switch (op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/":
        if (r === 0) throw new ScriptRuntimeError("Division par zéro", line);
        return l / r;
      case "%":
        if (r === 0) throw new ScriptRuntimeError("Division par zéro", line);
        return l % r;
    }
    throw new ScriptRuntimeError(`Opérateur inconnu '${op}'`, line);
  }
}

function scriptEquals(a: ScriptValue, b: ScriptValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => scriptEquals(v, b[i]));
  }
  return a === b;
}

const BUILTINS: Record<string, ScriptValue> = {
  range: {
    name: "range",
    __call: (_interp, args, line) => {
      let start = 0;
      let stop: number;
      let step = 1;
      const nums = args.map((a) => {
        if (typeof a !== "number") throw new ScriptRuntimeError("range() attend des nombres", line);
        return a;
      });
      if (nums.length === 1) [stop] = nums;
      else if (nums.length === 2) [start, stop] = nums;
      else if (nums.length === 3) [start, stop, step] = nums;
      else throw new ScriptRuntimeError("range() attend 1 à 3 arguments", line);
      if (step === 0) throw new ScriptRuntimeError("range() step ne peut pas être 0", line);
      const out: number[] = [];
      if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
      else for (let i = start; i > stop; i += step) out.push(i);
      if (out.length > MAX_RANGE_LENGTH) {
        throw new ScriptRuntimeError(`range() trop grand (max ${MAX_RANGE_LENGTH})`, line);
      }
      return out;
    },
  },
  len: {
    name: "len",
    __call: (_interp, args, line) => {
      const v = args[0];
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      throw new ScriptRuntimeError("len() attend une chaîne ou une liste", line);
    },
  },
  str: { name: "str", __call: (_i, args) => String(args[0] ?? "") },
  int: {
    name: "int",
    __call: (_i, args, line) => {
      const n = typeof args[0] === "string" ? parseInt(args[0], 10) : Number(args[0]);
      if (Number.isNaN(n)) throw new ScriptRuntimeError("int() a échoué sur cette valeur", line);
      return Math.trunc(n);
    },
  },
  abs: { name: "abs", __call: (_i, args, line) => { assertNum(args[0], line); return Math.abs(args[0] as number); } },
  min: { name: "min", __call: (_i, args, line) => { args.forEach((a) => assertNum(a, line)); return Math.min(...(args as number[])); } },
  max: { name: "max", __call: (_i, args, line) => { args.forEach((a) => assertNum(a, line)); return Math.max(...(args as number[])); } },
  round: { name: "round", __call: (_i, args, line) => { assertNum(args[0], line); return Math.round(args[0] as number); } },
  floor: { name: "floor", __call: (_i, args, line) => { assertNum(args[0], line); return Math.floor(args[0] as number); } },
  ceil: { name: "ceil", __call: (_i, args, line) => { assertNum(args[0], line); return Math.ceil(args[0] as number); } },
  /** Seconds since 1970-01-01 (like Python's time.time()) — use it for cooldowns/timers: e.g.
   * store `time()` in object state on an action, then compare against it later in on_tick. */
  time: { name: "time", __call: () => Date.now() / 1000 },
  /** Random integer in [a, b], both inclusive (like Python's random.randint). */
  randint: {
    name: "randint",
    __call: (_i, args, line) => {
      assertNum(args[0], line);
      assertNum(args[1], line);
      const a = Math.trunc(args[0] as number);
      const b = Math.trunc(args[1] as number);
      if (a > b) throw new ScriptRuntimeError("randint(a, b) attend a <= b", line);
      return a + Math.floor(Math.random() * (b - a + 1));
    },
  },
  /** Random float in [0, 1) (like Python's random.random()). */
  random: { name: "random", __call: () => Math.random() },
  /** Picks a random element from a non-empty list (like Python's random.choice()). */
  choice: {
    name: "choice",
    __call: (_i, args, line) => {
      const list = args[0];
      if (!Array.isArray(list) || list.length === 0) {
        throw new ScriptRuntimeError("choice() attend une liste non vide", line);
      }
      return list[Math.floor(Math.random() * list.length)];
    },
  },
  log: {
    name: "log",
    __call: (interp, args) => {
      interp.log(args.map((a) => String(a)).join(" "));
      return null;
    },
  },
};

function assertNum(v: ScriptValue, line: number): asserts v is number {
  if (typeof v !== "number") throw new ScriptRuntimeError("Un nombre est attendu ici", line);
}
