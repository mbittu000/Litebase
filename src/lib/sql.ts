export type FilterOp =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "startsWith"
  | "endsWith"
  | "isNull"
  | "isNotNull"
  | "in";

export interface Filter {
  column: string;
  op: FilterOp;
  value?: string;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: number;
}

export interface TableSummary {
  name: string;
  type: "table" | "view";
  sql: string | null;
  rowCount: number | null;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertIdent(name: string, label = "identifier"): string {
  if (!name || typeof name !== "string" || !IDENT_RE.test(name)) {
    throw new Error(
      `Invalid ${label} "${name}". Use letters, digits and underscore, starting with a letter/underscore.`
    );
  }
  return name;
}

export function quoteIdent(name: string): string {
  assertIdent(name);
  return `"${name.replace(/"/g, '""')}"`;
}

export const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "in", label: "in (a,b,c)" },
  { value: "isNull", label: "is null" },
  { value: "isNotNull", label: "is not null" },
];

/** Build a parameterized WHERE clause from UI filters. */
export function buildWhere(filters: Filter[]): {
  clause: string;
  args: unknown[];
} {
  const parts: string[] = [];
  const args: unknown[] = [];
  for (const f of filters ?? []) {
    if (!f?.column) continue;
    assertIdent(f.column, "column");
    const col = quoteIdent(f.column);
    switch (f.op) {
      case "=":
      case "!=":
      case ">":
      case ">=":
      case "<":
      case "<=":
        parts.push(`${col} ${f.op} ?`);
        args.push(parseScalar(f.value));
        break;
      case "contains":
        parts.push(`${col} LIKE ? ESCAPE '\\'`);
        args.push(`%${escapeLike(String(f.value ?? ""))}%`);
        break;
      case "startsWith":
        parts.push(`${col} LIKE ? ESCAPE '\\'`);
        args.push(`${escapeLike(String(f.value ?? ""))}%`);
        break;
      case "endsWith":
        parts.push(`${col} LIKE ? ESCAPE '\\'`);
        args.push(`%${escapeLike(String(f.value ?? ""))}`);
        break;
      case "isNull":
        parts.push(`${col} IS NULL`);
        break;
      case "isNotNull":
        parts.push(`${col} IS NOT NULL`);
        break;
      case "in": {
        const items = String(f.value ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map(parseScalar);
        if (items.length === 0) {
          parts.push("1 = 0");
        } else {
          parts.push(`${col} IN (${items.map(() => "?").join(", ")})`);
          args.push(...items);
        }
        break;
      }
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseScalar(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const s = String(v);
  if (s === "") return "";
  // keep numeric-looking values as numbers so numeric columns compare correctly
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d*\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  if (s.toLowerCase() === "null") return null;
  if (s.toLowerCase() === "true") return 1;
  if (s.toLowerCase() === "false") return 0;
  return s;
}

export function parseFiltersParam(raw: string | null): Filter[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Filter[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f.column === "string" && typeof f.op === "string")
      .slice(0, 24)
      .map((f) => ({
        column: String(f.column).slice(0, 64),
        op: (f.op as FilterOp) || "=",
        value: f.value === undefined ? "" : String(f.value).slice(0, 2000),
      }));
  } catch {
    return [];
  }
}
