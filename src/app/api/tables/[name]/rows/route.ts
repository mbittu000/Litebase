import { NextResponse } from "next/server";
import type { InArgs, InValue } from "@libsql/client";
import { getDb } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";
import {
  assertIdent,
  buildWhere,
  parseFiltersParam,
  quoteIdent,
} from "@/lib/sql";

interface Ctx {
  params: Promise<{ name: string }>;
}

const toArgs = (a: unknown[]): InArgs => a as InArgs;
const toVal = (v: unknown): InValue => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v as InValue;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v) as InValue;
};

// GET rows with pagination / sort / filters
// ?page=1&pageSize=25&sortBy=col&sortDir=asc|desc&filters=[...]&search=...
export async function GET(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(
      200,
      Math.max(5, Number(url.searchParams.get("pageSize") ?? 25) || 25)
    );
    const sortByRaw = url.searchParams.get("sortBy");
    const sortDir = (url.searchParams.get("sortDir") ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const filters = parseFiltersParam(url.searchParams.get("filters"));
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 200);

    const db = getDb();
    const pragma = await db.execute(`PRAGMA table_info(${quoteIdent(name)})`);
    const cols = pragma.rows.map((r) => String((r as Record<string, unknown>).name));
    if (cols.length === 0) return err(`Table "${name}" not found.`, 404);

    let sortBy: string | null = null;
    if (sortByRaw && cols.includes(sortByRaw)) sortBy = quoteIdent(sortByRaw);

    const { clause, args } = buildWhere(filters);

    // optional global search across TEXT-ish columns
    let searchClause = "";
    const searchArgs: unknown[] = [];
    if (search) {
      const textCols = pragma.rows
        .filter((r) => {
          const t = String((r as Record<string, unknown>).type ?? "").toUpperCase();
          return t.includes("CHAR") || t.includes("TEXT") || t.includes("CLOB") || t === "";
        })
        .map((r) => String((r as Record<string, unknown>).name));
      const targets = (textCols.length ? textCols : cols).slice(0, 12);
      searchClause = `(${targets.map((c) => `${quoteIdent(c)} LIKE ? ESCAPE '\\'`).join(" OR ")})`;
      const v = `%${search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      targets.forEach(() => searchArgs.push(v));
    }

    const whereParts: string[] = [];
    if (clause) whereParts.push(clause.replace(/^WHERE\s+/, ""));
    if (searchClause) whereParts.push(searchClause);
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const allArgs = [...args, ...searchArgs];

    const countRes = await db.execute(
      `SELECT COUNT(*) AS c FROM ${quoteIdent(name)} ${whereSql}`,
      toArgs(allArgs)
    );
    const total = Number((countRes.rows[0] as Record<string, unknown>)?.c ?? 0);

    const offset = (page - 1) * pageSize;
    const orderSql = sortBy ? `ORDER BY ${sortBy} ${sortDir}` : "";
    const dataRes = await db.execute(
      `SELECT rowid AS _rowid, * FROM ${quoteIdent(name)} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
      toArgs([...allArgs, pageSize, offset])
    );

    const rows = dataRes.rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(r as object)) o[k] = (r as Record<string, unknown>)[k];
      // normalize blobs / bigint for JSON
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "bigint") o[k] = Number(v);
        else if (v instanceof ArrayBuffer) o[k] = `[blob ${v.byteLength} bytes]`;
        else if (v instanceof Uint8Array) o[k] = `[blob ${v.length} bytes]`;
      }
      return o;
    });

    return NextResponse.json({
      rows,
      columns: dataRes.columns,
      tableColumns: cols,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    return err(e, 400);
  }
}

// POST insert one row { data: {...} }
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const body = (await req.json().catch(() => ({}))) as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    const keys = Object.keys(data);
    if (keys.length === 0) return err("No data provided.", 400);
    keys.forEach((k) => assertIdent(k, "column"));
    const db = getDb();
    const cols = keys.map(quoteIdent).join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    const values: InArgs = keys.map((k) => {
      const v = data[k];
      if (v === "") return null;
      return toVal(v);
    });
    const res = await db.execute(
      `INSERT INTO ${quoteIdent(name)} (${cols}) VALUES (${placeholders})`,
      values
    );
    return NextResponse.json({
      ok: true,
      lastInsertRowid: res.lastInsertRowid != null ? String(res.lastInsertRowid) : null,
      rowsAffected: res.rowsAffected,
    });
  } catch (e) {
    return err(e, 400);
  }
}

// PATCH update rows
// A) single: { rowid, data }  B) by pk: { pkColumn, pkValue, data }
// C) mass edit ticked rows: { rowids: [], data }  D) bulk: { filters, data }
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const body = (await req.json().catch(() => ({}))) as {
      rowid?: number | string;
      rowids?: (number | string)[];
      pkColumn?: string;
      pkValue?: unknown;
      filters?: { column: string; op: string; value?: string }[];
      data?: Record<string, unknown>;
    };
    const data = body.data ?? {};
    const keys = Object.keys(data);
    if (keys.length === 0) return err("No fields to update.", 400);
    keys.forEach((k) => assertIdent(k, "column"));
    const setSql = keys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
    const setArgs: unknown[] = keys.map((k) => {
      const v = data[k];
      return v === "" ? null : v;
    });

    const db = getDb();
    if (body.rowid !== undefined && body.rowid !== null && String(body.rowid) !== "") {
      const res = await db.execute(
        `UPDATE ${quoteIdent(name)} SET ${setSql} WHERE rowid = ?`,
        toArgs([...setArgs, Number(body.rowid)])
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (body.pkColumn) {
      assertIdent(body.pkColumn, "pk column");
      const res = await db.execute(
        `UPDATE ${quoteIdent(name)} SET ${setSql} WHERE ${quoteIdent(body.pkColumn)} = ?`,
        toArgs([...setArgs, toVal(body.pkValue)])
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (Array.isArray(body.filters)) {
      const { clause, args } = buildWhere(body.filters as never);
      if (!clause) return err("Bulk update needs at least one filter (safety).", 400);
      const res = await db.execute(
        `UPDATE ${quoteIdent(name)} SET ${setSql} ${clause}`,
        toArgs([...setArgs, ...args])
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (Array.isArray(body.rowids) && body.rowids.length > 0) {
      const ids = body.rowids
        .slice(0, 500)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (ids.length === 0) return err("No valid row ids.", 400);
      const res = await db.execute(
        `UPDATE ${quoteIdent(name)} SET ${setSql} WHERE rowid IN (${ids.map(() => "?").join(",")})`,
        toArgs([...setArgs, ...ids])
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    return err("Provide rowid, rowids, pkColumn+pkValue, or filters.", 400);
  } catch (e) {
    return err(e, 400);
  }
}

// DELETE rows: { rowid } | { rowids: [] } | { pkColumn, pkValue } | { filters, allowBulk }
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard();
  if (g) return g;
  try {
    const { name: raw } = await ctx.params;
    const name = assertIdent(raw, "table");
    const body = (await req.json().catch(() => ({}))) as {
      rowid?: number | string;
      rowids?: (number | string)[];
      pkColumn?: string;
      pkValue?: unknown;
      filters?: { column: string; op: string; value?: string }[];
    };
    const db = getDb();
    if (body.rowid !== undefined && String(body.rowid) !== "") {
      const res = await db.execute(`DELETE FROM ${quoteIdent(name)} WHERE rowid = ?`, toArgs([
        Number(body.rowid),
      ]));
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (Array.isArray(body.rowids) && body.rowids.length > 0) {
      const ids = body.rowids.slice(0, 500).map(Number);
      const res = await db.execute(
        `DELETE FROM ${quoteIdent(name)} WHERE rowid IN (${ids.map(() => "?").join(",")})`,
        toArgs(ids)
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (body.pkColumn) {
      assertIdent(body.pkColumn, "pk column");
      const res = await db.execute(
        `DELETE FROM ${quoteIdent(name)} WHERE ${quoteIdent(body.pkColumn)} = ?`,
        toArgs([toVal(body.pkValue)])
      );
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    if (Array.isArray(body.filters)) {
      const { clause, args } = buildWhere(body.filters as never);
      if (!clause) return err("Bulk delete needs at least one filter (safety).", 400);
      const res = await db.execute(`DELETE FROM ${quoteIdent(name)} ${clause}`, toArgs(args));
      return NextResponse.json({ ok: true, rowsAffected: res.rowsAffected });
    }
    return err("Nothing to delete.", 400);
  } catch (e) {
    return err(e, 400);
  }
}
