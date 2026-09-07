import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";
import { assertIdent, quoteIdent } from "@/lib/sql";

interface Ctx {
  params: Promise<{ name: string }>;
}

// POST add column { name, type, notNull, default, unique }
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const table = assertIdent(raw, "table");
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      type?: string;
      notNull?: boolean;
      default?: string;
      unique?: boolean;
    };
    const col = assertIdent(String(body.name ?? "").trim(), "column");
    const type = String(body.type ?? "TEXT").toUpperCase().slice(0, 32) || "TEXT";
    let def = `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(col)} ${type}`;
    if (body.notNull) def += " NOT NULL";
    if (body.unique) def += " UNIQUE";
    if (body.default !== undefined && body.default !== "") {
      const d = String(body.default);
      if (/^-?\d+(\.\d+)?$/.test(d) || /^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|TRUE|FALSE)$/i.test(d)) {
        def += ` DEFAULT ${d}`;
      } else {
        def += ` DEFAULT '${d.replace(/'/g, "''")}'`;
      }
    }
    const db = getDb();
    await db.execute(def);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return err(e, 400);
  }
}

// DELETE ?column=name — drop column (SQLite >= 3.35)
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const table = assertIdent(raw, "table");
    const col = assertIdent(new URL(req.url).searchParams.get("column") ?? "", "column");
    const db = getDb();
    await db.execute(`ALTER TABLE ${quoteIdent(table)} DROP COLUMN ${quoteIdent(col)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return err(e, 400);
  }
}
