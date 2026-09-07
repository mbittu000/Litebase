import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";
import { assertIdent, quoteIdent } from "@/lib/sql";

export async function GET() {
  const g = await guard();
  if (g) return g;
  try {
    const db = getDb();
    const res = await db.execute(
      `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tables = [];
    for (const r of res.rows) {
      const name = String(r.name);
      let rowCount: number | null = null;
      if (r.type === "table") {
        try {
          const c = await db.execute(
            `SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`
          );
          rowCount = Number((c.rows[0] as Record<string, unknown>)?.c ?? 0);
        } catch {
          rowCount = null;
        }
      }
      tables.push({ name, type: String(r.type), sql: (r.sql as string) ?? null, rowCount });
    }
    return NextResponse.json({ tables });
  } catch (e) {
    return err(e, 500);
  }
}

interface NewColumn {
  name: string;
  type?: string;
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  default?: string;
}

const ALLOWED_TYPES = new Set([
  "TEXT",
  "INTEGER",
  "REAL",
  "BLOB",
  "NUMERIC",
  "VARCHAR",
  "CHAR",
  "BOOLEAN",
  "DATE",
  "DATETIME",
]);

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      columns?: NewColumn[];
      sql?: string;
    };
    const db = getDb();

    // Raw SQL path (advanced: CREATE TABLE ... / CREATE VIEW ...)
    if (body.sql?.trim()) {
      const sql = body.sql.trim().replace(/;+$/, "");
      if (!/^\s*create\s+(table|view)/i.test(sql)) {
        return err("Raw SQL must be a CREATE TABLE or CREATE VIEW statement.", 400);
      }
      await db.execute(sql);
      return NextResponse.json({ ok: true });
    }

    const name = assertIdent(String(body.name ?? "").trim(), "table name");
    const cols = Array.isArray(body.columns) ? body.columns : [];
    if (cols.length === 0) return err("Add at least one column.", 400);
    if (cols.length > 64) return err("Too many columns (max 64).", 400);

    const seen = new Set<string>();
    const defs = cols.map((c) => {
      const cn = assertIdent(String(c.name ?? "").trim(), "column name");
      if (seen.has(cn.toLowerCase())) throw new Error(`Duplicate column "${cn}".`);
      seen.add(cn.toLowerCase());
      let t = String(c.type ?? "TEXT").toUpperCase().slice(0, 32);
      if (!ALLOWED_TYPES.has(t)) t = "TEXT";
      let def = `${quoteIdent(cn)} ${t}`;
      if (c.primaryKey) def += " PRIMARY KEY";
      if (c.notNull && !c.primaryKey) def += " NOT NULL";
      if (c.unique && !c.primaryKey) def += " UNIQUE";
      if (c.default !== undefined && c.default !== "") {
        const d = String(c.default);
        if (/^-?\d+(\.\d+)?$/.test(d) || /^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|TRUE|FALSE)$/i.test(d)) {
          def += ` DEFAULT ${d}`;
        } else {
          def += ` DEFAULT '${d.replace(/'/g, "''")}'`;
        }
      }
      return def;
    });

    await db.execute(`CREATE TABLE ${quoteIdent(name)} (${defs.join(", ")})`);
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    return err(e, 400);
  }
}
