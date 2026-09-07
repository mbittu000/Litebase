import { NextResponse } from "next/server";
import { getDb, getDbInfo } from "@/lib/db";
import { guard, err } from "@/lib/api-guard";
import { quoteIdent } from "@/lib/sql";

export async function GET() {
  const g = await guard();
  if (g) return g;
  try {
    const db = getDb();
    const tablesRes = await db.execute(
      `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );

    // Row counts run concurrently (1 batch of round-trips, not N sequential ones —
    // this is what made overview slow on remote DBs like Turso).
    const counts = await Promise.all(
      tablesRes.rows.map(async (r) => {
        if (r.type !== "table") return null;
        try {
          const c = await db.execute(
            `SELECT COUNT(*) AS c FROM ${quoteIdent(String(r.name))}`
          );
          return Number((c.rows[0] as Record<string, unknown>)?.c ?? 0);
        } catch {
          return null;
        }
      })
    );
    let totalRows = 0;
    const tables = tablesRes.rows.map((r, i) => {
      const rowCount = counts[i];
      if (typeof rowCount === "number") totalRows += rowCount;
      return {
        name: String(r.name),
        type: String(r.type),
        sql: (r.sql as string) ?? null,
        rowCount,
      };
    });

    // size + engine version concurrently
    const [sizeRes, verRes] = await Promise.allSettled([
      Promise.all([db.execute("PRAGMA page_count"), db.execute("PRAGMA page_size")]),
      db.execute("SELECT sqlite_version() AS v"),
    ]);
    let sizeBytes: number | null = null;
    if (sizeRes.status === "fulfilled") {
      const firstPc = Number(Object.values(sizeRes.value[0].rows[0] ?? {})[0] ?? 0);
      const firstPs = Number(Object.values(sizeRes.value[1].rows[0] ?? {})[0] ?? 0);
      if (firstPc && firstPs) sizeBytes = firstPc * firstPs;
    }
    const sqliteVersion =
      verRes.status === "fulfilled"
        ? String(Object.values(verRes.value.rows[0] ?? {})[0] ?? "")
        : "";

    return NextResponse.json({
      db: getDbInfo(),
      stats: {
        tableCount: tables.filter((t) => t.type === "table").length,
        viewCount: tables.filter((t) => t.type === "view").length,
        totalRows,
        sizeBytes,
        sqliteVersion,
      },
      tables,
    });
  } catch (e) {
    return err(e, 500);
  }
}
