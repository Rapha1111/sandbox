import { tokenize, type Token } from "./lexer";
import { ScriptSyntaxError } from "./errors";
import type { Expr, FunctionDef, Stmt } from "./ast";

/**
 * Recursive-descent parser for the restricted Python-like object script language.
 * Only a deliberately small grammar is supported (see spec §8/§9): function defs,
 * if/elif/else, for/while, return/pass/break/continue, assignment, boolean/compare/
 * arithmetic expressions, attribute access and calls. No imports, classes, lambdas,
 * comprehensions, or multiple assignment targets.
 */
export function parseProgram(source: string): FunctionDef[] {
  const tokens = tokenize(source);
  const p = new Parser(tokens);
  return p.parseProgram();
}

class Parser {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private check(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  private match(type: Token["type"], value?: string): Token | null {
    if (this.check(type, value)) return this.next();
    return null;
  }
  private expect(type: Token["type"], value?: string): Token {
    const t = this.match(type, value);
    if (!t) {
      const found = this.peek();
      throw new ScriptSyntaxError(
        `Attendu ${value ?? type} mais trouvé '${found.value || found.type}'`,
        found.line
      );
    }
    return t;
  }

  parseProgram(): FunctionDef[] {
    const defs: FunctionDef[] = [];
    while (this.match("NEWLINE")) {
      /* skip blank lines */
    }
    while (!this.check("EOF")) {
      defs.push(this.parseFunctionDef());
      while (this.match("NEWLINE")) {
        /* skip blank lines between defs */
      }
    }
    return defs;
  }

  private parseFunctionDef(): FunctionDef {
    const start = this.expect("NAME", "def");
    const name = this.expect("NAME").value;
    this.expect("OP", "(");
    const params: string[] = [];
    if (!this.check("OP", ")")) {
      params.push(this.expect("NAME").value);
      while (this.match("OP", ",")) {
        params.push(this.expect("NAME").value);
      }
    }
    this.expect("OP", ")");
    this.expect("OP", ":");
    this.expect("NEWLINE");
    const body = this.parseBlock();
    return { type: "FunctionDef", name, params, body, line: start.line };
  }

  private parseBlock(): Stmt[] {
    this.expect("INDENT");
    const stmts: Stmt[] = [];
    while (!this.check("DEDENT") && !this.check("EOF")) {
      if (this.match("NEWLINE")) continue;
      stmts.push(this.parseStatement());
    }
    this.expect("DEDENT");
    return stmts;
  }

  private parseStatement(): Stmt {
    const t = this.peek();
    if (t.type === "NAME") {
      switch (t.value) {
        case "if":
          return this.parseIf();
        case "for":
          return this.parseFor();
        case "while":
          return this.parseWhile();
        case "return":
          return this.parseReturn();
        case "pass":
          this.next();
          this.expect("NEWLINE");
          return { type: "Pass", line: t.line };
        case "break":
          this.next();
          this.expect("NEWLINE");
          return { type: "Break", line: t.line };
        case "continue":
          this.next();
          this.expect("NEWLINE");
          return { type: "Continue", line: t.line };
      }
    }
    return this.parseSimpleStatement();
  }

  private parseIf(): Stmt {
    const start = this.expect("NAME", "if");
    const branches: { test: Expr; body: Stmt[] }[] = [];
    let test = this.parseExpr();
    this.expect("OP", ":");
    this.expect("NEWLINE");
    branches.push({ test, body: this.parseBlock() });
    let orelse: Stmt[] = [];
    for (;;) {
      if (this.check("NAME", "elif")) {
        this.next();
        test = this.parseExpr();
        this.expect("OP", ":");
        this.expect("NEWLINE");
        branches.push({ test, body: this.parseBlock() });
        continue;
      }
      if (this.check("NAME", "else")) {
        this.next();
        this.expect("OP", ":");
        this.expect("NEWLINE");
        orelse = this.parseBlock();
      }
      break;
    }
    return { type: "If", branches, orelse, line: start.line };
  }

  private parseFor(): Stmt {
    const start = this.expect("NAME", "for");
    const varName = this.expect("NAME").value;
    this.expect("NAME", "in");
    const iter = this.parseExpr();
    this.expect("OP", ":");
    this.expect("NEWLINE");
    const body = this.parseBlock();
    return { type: "For", varName, iter, body, line: start.line };
  }

  private parseWhile(): Stmt {
    const start = this.expect("NAME", "while");
    const test = this.parseExpr();
    this.expect("OP", ":");
    this.expect("NEWLINE");
    const body = this.parseBlock();
    return { type: "While", test, body, line: start.line };
  }

  private parseReturn(): Stmt {
    const start = this.expect("NAME", "return");
    if (this.check("NEWLINE")) {
      this.next();
      return { type: "Return", value: null, line: start.line };
    }
    const value = this.parseExpr();
    this.expect("NEWLINE");
    return { type: "Return", value, line: start.line };
  }

  private parseSimpleStatement(): Stmt {
    const start = this.peek();
    const expr = this.parseExpr();
    if (this.match("OP", "=")) {
      const value = this.parseExpr();
      this.expect("NEWLINE");
      if (expr.type === "Name") {
        return { type: "Assign", target: expr.name, value, line: start.line };
      }
      if (expr.type === "Attribute") {
        return { type: "AttrAssign", obj: expr.obj, attr: expr.attr, value, line: start.line };
      }
      throw new ScriptSyntaxError("Cible d'affectation invalide", start.line);
    }
    for (const aug of ["+=", "-=", "*=", "/="]) {
      if (this.match("OP", aug)) {
        const value = this.parseExpr();
        this.expect("NEWLINE");
        if (expr.type !== "Name") {
          throw new ScriptSyntaxError("Cible d'affectation invalide", start.line);
        }
        const binOp: Expr = { type: "BinOp", op: aug[0], left: expr, right: value, line: start.line };
        return { type: "Assign", target: expr.name, value: binOp, line: start.line };
      }
    }
    this.expect("NEWLINE");
    return { type: "ExprStmt", expr, line: start.line };
  }

  // ---- expressions, lowest to highest precedence ----

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.check("NAME", "or")) {
      const t = this.next();
      const right = this.parseAnd();
      left = { type: "BoolOp", op: "or", left, right, line: t.line };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.check("NAME", "and")) {
      const t = this.next();
      const right = this.parseNot();
      left = { type: "BoolOp", op: "and", left, right, line: t.line };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.check("NAME", "not")) {
      const t = this.next();
      const operand = this.parseNot();
      return { type: "UnaryOp", op: "not", operand, line: t.line };
    }
    return this.parseComparison();
  }

  private static readonly COMPARE_OPS = new Set(["==", "!=", "<", "<=", ">", ">="]);

  private parseComparison(): Expr {
    let left = this.parseAddSub();
    while (this.check("OP") && Parser.COMPARE_OPS.has(this.peek().value)) {
      const t = this.next();
      const right = this.parseAddSub();
      left = { type: "Compare", op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.check("OP", "+") || this.check("OP", "-")) {
      const t = this.next();
      const right = this.parseMulDiv();
      left = { type: "BinOp", op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseMulDiv(): Expr {
    let left = this.parseUnary();
    while (this.check("OP", "*") || this.check("OP", "/") || this.check("OP", "%")) {
      const t = this.next();
      const right = this.parseUnary();
      left = { type: "BinOp", op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.check("OP", "-")) {
      const t = this.next();
      const operand = this.parseUnary();
      return { type: "UnaryOp", op: "-", operand, line: t.line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.match("OP", ".")) {
        const attr = this.expect("NAME").value;
        expr = { type: "Attribute", obj: expr, attr, line: expr.line };
      } else if (this.check("OP", "(")) {
        const t = this.next();
        const args: Expr[] = [];
        if (!this.check("OP", ")")) {
          args.push(this.parseExpr());
          while (this.match("OP", ",")) args.push(this.parseExpr());
        }
        this.expect("OP", ")");
        expr = { type: "Call", callee: expr, args, line: t.line };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === "NUMBER") {
      this.next();
      return { type: "Num", value: parseFloat(t.value), line: t.line };
    }
    if (t.type === "STRING") {
      this.next();
      return { type: "Str", value: t.value, line: t.line };
    }
    if (t.type === "NAME") {
      if (t.value === "True" || t.value === "False") {
        this.next();
        return { type: "Bool", value: t.value === "True", line: t.line };
      }
      if (t.value === "None") {
        this.next();
        return { type: "NoneLit", line: t.line };
      }
      this.next();
      return { type: "Name", name: t.value, line: t.line };
    }
    if (this.check("OP", "(")) {
      this.next();
      const expr = this.parseExpr();
      this.expect("OP", ")");
      return expr;
    }
    if (this.check("OP", "[")) {
      const start = this.next();
      const items: Expr[] = [];
      if (!this.check("OP", "]")) {
        items.push(this.parseExpr());
        while (this.match("OP", ",")) items.push(this.parseExpr());
      }
      this.expect("OP", "]");
      return { type: "ListLit", items, line: start.line };
    }
    throw new ScriptSyntaxError(`Expression inattendue: '${t.value || t.type}'`, t.line);
  }
}
