export interface TableSummary {
  name: string;
  type: string;
  sql: string | null;
  rowCount: number | null;
}

export interface OverviewData {
  db: { url: string; kind: string; hasToken: boolean };
  stats: {
    tableCount: number;
    viewCount: number;
    totalRows: number;
    sizeBytes: number | null;
    sqliteVersion: string;
  };
  tables: TableSummary[];
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: number;
}

export interface SchemaData {
  name: string;
  type: string;
  columns: ColumnInfo[];
  foreignKeys: Record<string, unknown>[];
  indexes: Record<string, unknown>[];
  createSql: string | null;
  rowCount: number | null;
}

export interface RowsData {
  rows: Record<string, unknown>[];
  columns: string[];
  tableColumns: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type Filter = { column: string; op: string; value?: string };

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  overview(): Promise<OverviewData> {
    return fetch("/api/overview", { cache: "no-store" }).then(handle);
  },
  schema(name: string): Promise<SchemaData> {
    return fetch(`/api/tables/${encodeURIComponent(name)}`, { cache: "no-store" }).then(handle);
  },
  rows(
    name: string,
    opts: {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: string;
      filters?: Filter[];
      search?: string;
    } = {}
  ): Promise<RowsData> {
    const q = new URLSearchParams();
    q.set("page", String(opts.page ?? 1));
    q.set("pageSize", String(opts.pageSize ?? 25));
    if (opts.sortBy) q.set("sortBy", opts.sortBy);
    if (opts.sortDir) q.set("sortDir", opts.sortDir);
    if (opts.filters?.length) q.set("filters", JSON.stringify(opts.filters));
    if (opts.search) q.set("search", opts.search);
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows?${q}`, { cache: "no-store" }).then(handle);
  },
  async insert(name: string, data: Record<string, unknown>) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }).then(handle);
  },
  async updateByRowid(name: string, rowid: string | number, data: Record<string, unknown>) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowid, data }),
    }).then(handle);
  },
  async bulkUpdate(name: string, filters: Filter[], data: Record<string, unknown>) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, data }),
    }).then(handle);
  },
  async bulkUpdateByIds(name: string, rowids: (string | number)[], data: Record<string, unknown>) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowids, data }),
    }).then(handle);
  },
  async delRow(name: string, rowid: string | number) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowid }),
    }).then(handle);
  },
  async delRows(name: string, rowids: (string | number)[]) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowids }),
    }).then(handle);
  },
  async delByFilters(name: string, filters: Filter[]) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/rows`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
    }).then(handle);
  },
  async query(sql: string) {
    return fetch(`/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    }).then(handle) as Promise<{
      ok: boolean;
      kind: string;
      columns?: string[];
      rows?: Record<string, unknown>[];
      rowCount?: number;
      rowsAffected?: number;
      lastInsertRowid?: string | null;
      ms: number;
      statements?: number;
    }>;
  },
  async createTable(payload: { name: string; columns: unknown[] } | { sql: string }) {
    return fetch(`/api/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle);
  },
  async renameTable(name: string, newName: string) {
    return fetch(`/api/tables/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", newName }),
    }).then(handle);
  },
  async truncateTable(name: string) {
    return fetch(`/api/tables/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "truncate" }),
    }).then(handle);
  },
  async dropTable(name: string) {
    return fetch(`/api/tables/${encodeURIComponent(name)}`, { method: "DELETE" }).then(handle);
  },
  async addColumn(name: string, payload: Record<string, unknown>) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle);
  },
  async dropColumn(name: string, column: string) {
    return fetch(`/api/tables/${encodeURIComponent(name)}/columns?column=${encodeURIComponent(column)}`, {
      method: "DELETE",
    }).then(handle);
  },
  async logout() {
    return fetch("/api/auth/logout", { method: "POST" }).then(handle);
  },
};

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** True for big text blobs (pitches, notes, bodies…) that deserve the long-text treatment. */
export function isLongText(v: unknown, threshold = 160): boolean {
  if (typeof v !== "string") return false;
  return v.length > threshold || v.includes("\n");
}

/** Single-line preview of a (possibly huge) value for dense grids (clean cut, no ellipsis). */
export function previewText(v: unknown, max = 140): string {
  const s = cellText(v).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, max)).trimEnd();
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
