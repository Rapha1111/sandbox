import { ScriptSyntaxError } from "./errors";

export type TokenType =
  | "NAME"
  | "NUMBER"
  | "STRING"
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "OP"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

const KEYWORDS = new Set([
  "def", "if", "elif", "else", "return", "pass", "and", "or", "not",
  "True", "False", "None", "for", "in", "while", "break", "continue",
]);

const MULTI_CHAR_OPS = ["==", "!=", "<=", ">=", "+=", "-=", "*=", "/="];
const SINGLE_CHAR_OPS = "+-*/%()=,:.<>[]";

/** Tokenizes Python-like indented source into a flat token stream with INDENT/DEDENT markers. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const indentStack = [0];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let lineNo = 0;

  for (const rawLine of lines) {
    lineNo++;
    // Strip comments (# ...) but keep '#' inside strings intact.
    const line = stripComment(rawLine);

    if (line.trim().length === 0) continue; // blank/comment-only lines don't affect indentation

    const indent = countIndent(line, lineNo);
    const content = line.slice(indent);

    if (indent > indentStack[indentStack.length - 1]) {
      indentStack.push(indent);
      tokens.push({ type: "INDENT", value: "", line: lineNo });
    }
    while (indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      tokens.push({ type: "DEDENT", value: "", line: lineNo });
    }

    tokenizeLine(content, lineNo, tokens);
    tokens.push({ type: "NEWLINE", value: "\n", line: lineNo });
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: "DEDENT", value: "", line: lineNo });
  }
  tokens.push({ type: "EOF", value: "", line: lineNo });
  return tokens;
}

function stripComment(line: string): string {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
    } else if (c === '"' || c === "'") {
      inString = c;
    } else if (c === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function countIndent(line: string, lineNo: number): number {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    if (line[i] === "\t") throw new ScriptSyntaxError("Les tabulations ne sont pas autorisées, utilisez des espaces", lineNo);
    i++;
  }
  return i;
}

function tokenizeLine(content: string, lineNo: number, out: Token[]): void {
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === " ") { i++; continue; }

    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < content.length && content[j] !== quote) {
        if (content[j] === "\\" && j + 1 < content.length) {
          const next = content[j + 1];
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          j += 2;
        } else {
          value += content[j];
          j++;
        }
      }
      if (j >= content.length) throw new ScriptSyntaxError("Chaîne de caractères non terminée", lineNo);
      out.push({ type: "STRING", value, line: lineNo });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < content.length && /[0-9.]/.test(content[j])) j++;
      out.push({ type: "NUMBER", value: content.slice(i, j), line: lineNo });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < content.length && /[A-Za-z0-9_]/.test(content[j])) j++;
      out.push({ type: "NAME", value: content.slice(i, j), line: lineNo });
      i = j;
      continue;
    }

    const two = content.slice(i, i + 2);
    if (MULTI_CHAR_OPS.includes(two)) {
      out.push({ type: "OP", value: two, line: lineNo });
      i += 2;
      continue;
    }

    if (SINGLE_CHAR_OPS.includes(c)) {
      out.push({ type: "OP", value: c, line: lineNo });
      i++;
      continue;
    }

    throw new ScriptSyntaxError(`Caractère inattendu: '${c}'`, lineNo);
  }
}

export function isKeyword(name: string): boolean {
  return KEYWORDS.has(name);
}
