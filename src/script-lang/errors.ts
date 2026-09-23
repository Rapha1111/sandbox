export class ScriptSyntaxError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Ligne ${line}: ${message}`);
    this.name = "ScriptSyntaxError";
    this.line = line;
  }
}

export class ScriptRuntimeError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(line ? `Ligne ${line}: ${message}` : message);
    this.name = "ScriptRuntimeError";
    this.line = line;
  }
}

/** Raised when a script exceeds its CPU step budget (infinite loop guard). */
export class ScriptBudgetExceededError extends ScriptRuntimeError {
  constructor() {
    super("Le script a dépassé la limite de calcul autorisée (boucle infinie ?)");
    this.name = "ScriptBudgetExceededError";
  }
}

/** Raised when a script calls something outside the whitelisted API. */
export class ScriptSecurityError extends ScriptRuntimeError {
  constructor(message: string, line?: number) {
    super(message, line);
    this.name = "ScriptSecurityError";
  }
}
