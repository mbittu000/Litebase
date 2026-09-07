import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";
import { assertIdent, quoteIdent, type ColumnInfo } from "@/lib/sql";

interface Ctx {
  params: Promise<{ name: string }>;
}

// GET schema: columns, indexes, foreign keys, create sql, row count
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const db = getDb();

    const colsRes = await db.execute(`PRAGMA table_info(${quoteIdent(name)})`);
    const columns: ColumnInfo[] = colsRes.rows.map((r) => {
      const o = r as unknown as Record<string, unknown>;
      return {
        cid: Number(o.cid ?? 0),
        name: String(o.name ?? ""),
        type: String(o.type ?? ""),
        notnull: Number(o.notnull ?? 0) === 1,
        dflt_value: o.dflt_value === null || o.dflt_value === undefined ? null : String(o.dflt_value),
        pk: Number(o.pk ?? 0),
      };
    });
    if (columns.length === 0) return err(`Table "${name}" not found.`, 404);

    const fkRes = await db.execute(`PRAGMA foreign_key_list(${quoteIdent(name)})`);
    const idxRes = await db.execute(`PRAGMA index_list(${quoteIdent(name)})`);
    const master = await db.execute(
      `SELECT sql, type FROM sqlite_master WHERE name = ?`,
      [name]
    );
    const createSql = (master.rows[0] as unknown as Record<string, unknown> | undefined)?.sql as string | null ?? null;
    const objType = ((master.rows[0] as unknown as Record<string, unknown> | undefined)?.type as string) ?? "table";

    let rowCount: number | null = null;
    try {
      const c = await db.execute(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`);
      rowCount = Number((c.rows[0] as Record<string, unknown>)?.c ?? 0);
    } catch {
      rowCount = null;
    }

    return NextResponse.json({
      name,
      type: objType,
      columns,
      foreignKeys: fkRes.rows,
      indexes: idxRes.rows,
      createSql,
      rowCount,
    });
  } catch (e) {
    return err(e, 400);
  }
}

// PATCH: rename or truncate { action: 'rename', newName } | { action: 'truncate' }
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      newName?: string;
    };
    const db = getDb();
    if (body.action === "rename") {
      const newName = assertIdent(String(body.newName ?? "").trim(), "new table name");
      await db.execute(`ALTER TABLE ${quoteIdent(name)} RENAME TO ${quoteIdent(newName)}`);
      return NextResponse.json({ ok: true, name: newName });
    }
    if (body.action === "truncate") {
      await db.execute(`DELETE FROM ${quoteIdent(name)}`);
      return NextResponse.json({ ok: true });
    }
    return err("Unknown action. Use rename or truncate.", 400);
  } catch (e) {
    return err(e, 400);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const db = getDb();
    await db.execute(`DROP TABLE IF EXISTS ${quoteIdent(name)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return err(e, 400);
  }
}
