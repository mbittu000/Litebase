import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";

function splitStatements(sql: string): string[] {
  // naive split on semicolons not inside quotes
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (q) {
      cur += ch;
      if (ch === q) {
        if (sql[i + 1] === q) {
          cur += sql[i + 1];
          i++;
        } else q = null;
      }
    } else if (ch === "'" || ch === '"' || ch === "`") {
      q = ch;
      cur += ch;
    } else if (ch === ";" ) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.slice(0, 20);
}

function isSelect(sql: string): boolean {
  return /^\s*(select|with|pragma|explain)\b/i.test(sql);
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  const started = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sql?: string;
      params?: unknown[];
    };
    const sql = String(body.sql ?? "").trim();
    if (!sql) return err("SQL is empty.", 400);
    if (sql.length > 50000) return err("SQL too long.", 400);
    // block dangerous pragmas? allow everything — this is an admin tool behind password.
    const db = getDb();
    const statements = splitStatements(sql);

    // single statement fast path
    if (statements.length <= 1) {
      const single = statements[0] ?? sql;
      const params = Array.isArray(body.params) ? body.params.slice(0, 100) : [];
      const res = await db.execute(single, params as never[]);
      const ms = Date.now() - started;
      if (isSelect(single)) {
        const rows = res.rows.map((r) => {
          const o: Record<string, unknown> = {};
          for (const k of Object.keys(r as object)) {
            let v = (r as Record<string, unknown>)[k];
            if (typeof v === "bigint") v = Number(v);
            o[k] = v;
          }
          return o;
        });
        return NextResponse.json({
          ok: true,
          kind: "select",
          columns: res.columns,
          rows: rows.slice(0, 1000),
          rowCount: rows.length,
          ms,
        });
      }
      return NextResponse.json({
        ok: true,
        kind: "write",
        rowsAffected: res.rowsAffected,
        lastInsertRowid: res.lastInsertRowid != null ? String(res.lastInsertRowid) : null,
        ms,
      });
    }

    // multiple statements: run sequentially, return last SELECT result if any
    let lastSelect: { columns: string[]; rows: Record<string, unknown>[] } | null = null;
    let totalAffected = 0;
    for (const st of statements) {
      const res = await db.execute(st);
      if (isSelect(st)) {
        lastSelect = {
          columns: res.columns,
          rows: res.rows.slice(0, 1000).map((r) => {
            const o: Record<string, unknown> = {};
            for (const k of Object.keys(r as object)) {
              let v = (r as Record<string, unknown>)[k];
              if (typeof v === "bigint") v = Number(v);
              o[k] = v;
            }
            return o;
          }),
        };
      } else {
        totalAffected += res.rowsAffected ?? 0;
      }
    }
    return NextResponse.json({
      ok: true,
      kind: lastSelect ? "select" : "write",
      columns: lastSelect?.columns ?? [],
      rows: lastSelect?.rows ?? [],
      rowCount: lastSelect?.rows.length ?? 0,
      rowsAffected: totalAffected,
      statements: statements.length,
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), ms: Date.now() - started },
      { status: 400 }
    );
  }
}
