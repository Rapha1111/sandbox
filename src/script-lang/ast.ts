export interface FunctionDef {
  type: "FunctionDef";
  name: string;
  params: string[];
  body: Stmt[];
  line: number;
}

export type Stmt =
  | { type: "Assign"; target: string; value: Expr; line: number }
  | { type: "AttrAssign"; obj: Expr; attr: string; value: Expr; line: number }
  | { type: "ExprStmt"; expr: Expr; line: number }
  | { type: "If"; branches: { test: Expr; body: Stmt[] }[]; orelse: Stmt[]; line: number }
  | { type: "Return"; value: Expr | null; line: number }
  | { type: "Pass"; line: number }
  | { type: "For"; varName: string; iter: Expr; body: Stmt[]; line: number }
  | { type: "While"; test: Expr; body: Stmt[]; line: number }
  | { type: "Break"; line: number }
  | { type: "Continue"; line: number };

export type Expr =
  | { type: "Num"; value: number; line: number }
  | { type: "Str"; value: string; line: number }
  | { type: "Bool"; value: boolean; line: number }
  | { type: "NoneLit"; line: number }
  | { type: "Name"; name: string; line: number }
  | { type: "Attribute"; obj: Expr; attr: string; line: number }
  | { type: "Call"; callee: Expr; args: Expr[]; line: number }
  | { type: "BinOp"; op: string; left: Expr; right: Expr; line: number }
  | { type: "Compare"; op: string; left: Expr; right: Expr; line: number }
  | { type: "BoolOp"; op: "and" | "or"; left: Expr; right: Expr; line: number }
  | { type: "UnaryOp"; op: string; operand: Expr; line: number }
  | { type: "ListLit"; items: Expr[]; line: number };
