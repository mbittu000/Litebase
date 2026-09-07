"use client";
/* eslint-disable react-hooks/set-state-in-effect -- intentional: history load + seeded query */

import { useEffect, useRef, useState } from "react";
import { Play, Wand2, Trash2, History, Copy, Download, Check } from "lucide-react";
import { format } from "sql-formatter";
import { api, cellText, download, isLongText, previewText, toCsv } from "@/lib/api";
import { Btn, Badge, Spinner, inputCls, cn } from "@/components/ui";

interface QResult {
  kind: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  rowsAffected?: number;
  lastInsertRowid?: string | null;
  ms: number;
  statements?: number;
}

const SNIPPETS = [
  { label: "List tables", sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;" },
  { label: "Table size", sql: "SELECT name AS \"table\", (SELECT COUNT(*) FROM sqlite_master m2 WHERE 1) AS note FROM sqlite_master WHERE type='table';" },
  { label: "Schema", sql: "SELECT sql FROM sqlite_master WHERE name = 'my_table';" },
  { label: "Top 100", sql: "SELECT * FROM \"my_table\" LIMIT 100;" },
  { label: "Update", sql: "UPDATE \"my_table\" SET \"status\" = 'active' WHERE \"id\" = 1;" },
];

function loadHist(): string[] {
  try {
    return JSON.parse(localStorage.getItem("litebase:sql-history") ?? "[]");
  } catch {
    return [];
  }
}

export default function SqlConsole({ initialSql }: { initialSql?: string }) {
  const [sql, setSql] = useState(
    initialSql ?? "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const [result, setResult] = useState<QResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHist(loadHist());
  }, []);

  useEffect(() => {
    if (initialSql) setSql(initialSql);
  }, [initialSql]);

  function pushHist(q: string) {
    setHist((h) => {
      const next = [q, ...h.filter((x) => x !== q)].slice(0, 30);
      try {
        localStorage.setItem("litebase:sql-history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function run(query?: string) {
    const q = (query ?? sql).trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.query(q);
      setResult(r);
      pushHist(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function prettify() {
    try {
      setSql(format(sql, { language: "sqlite" }));
    } catch {
      // ignore
    }
  }

  const cols = result?.columns ?? [];
  const rows = result?.rows ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* editor */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          <Badge tone="violet">SQL</Badge>
          <span className="text-[11px] text-white/40">Ctrl/⌘ + Enter to run</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Btn variant="soft" onClick={prettify} title="Format SQL">
              <Wand2 size={14} /> Format
            </Btn>
            <Btn variant="soft" onClick={() => { setSql(""); taRef.current?.focus(); }} title="Clear">
              <Trash2 size={14} /> Clear
            </Btn>
            <Btn variant="primary" onClick={() => run()} disabled={busy || !sql.trim()}>
              {busy ? <Spinner /> : <Play size={14} />}
              {busy ? "Running…" : "Run"}
            </Btn>
          </div>
        </div>
        <textarea
          ref={taRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const s = el.selectionStart ?? 0;
              const en = el.selectionEnd ?? 0;
              setSql(sql.slice(0, s) + "  " + sql.slice(en));
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
            }
          }}
          spellCheck={false}
          placeholder="SELECT * FROM my_table LIMIT 50;"
          className="sql-editor min-h-[150px] w-full resize-y bg-black/50 px-4 py-3 text-cyan-100 placeholder:text-white/25"
          style={{ border: "none", boxShadow: "none" }}
        />
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 py-2">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSql(s.sql)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/60 transition hover:border-fuchsia-400/40 hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* history */}
      {hist.length > 0 && (
        <details className="glass rounded-2xl px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 py-1 text-xs font-semibold text-white/60">
            <History size={13} /> Query history ({hist.length})
          </summary>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto pb-2 pt-1">
            {hist.map((h, i) => (
              <button
                key={i}
                onClick={() => { setSql(h); run(h); }}
                className="truncate rounded-lg bg-black/30 px-2.5 py-1.5 text-left font-mono text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white"
                title={h}
              >
                {h.slice(0, 140)}
              </button>
            ))}
          </div>
        </details>
      )}

      {error && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-red-300">Query failed</p>
          <p className="mt-1 font-mono text-[12px] leading-relaxed text-red-100/90">{error}</p>
        </div>
      )}

      {result && (
        <div className="glass rise overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
            {result.kind === "select" ? (
              <Badge tone="green">{result.rowCount ?? 0} rows</Badge>
            ) : (
              <Badge tone="amber">{result.rowsAffected ?? 0} affected</Badge>
            )}
            <Badge tone="gray">{result.ms} ms</Badge>
            {result.statements ? <Badge tone="cyan">{result.statements} statements</Badge> : null}
            {result.lastInsertRowid ? <Badge tone="pink">rowid {result.lastInsertRowid}</Badge> : null}
            {result.kind === "select" && rows.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <Btn
                  variant="soft"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(rows, null, 2)).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy JSON"}
                </Btn>
                <Btn variant="soft" onClick={() => download(`query-${Date.now()}.csv`, toCsv(rows, cols), "text/csv")}>
                  <Download size={13} /> CSV
                </Btn>
              </div>
            )}
          </div>
          {result.kind === "select" ? (
            rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-white/45">Query ran fine — 0 rows returned.</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="grid-table row-hover w-full border-collapse text-left text-[12.5px]">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c} className="whitespace-nowrap border-b border-white/10 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-fuchsia-200/80">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={cn("border-b border-white/[0.05]", i % 2 ? "bg-white/[0.015]" : "")}>
                        {cols.map((c) => {
                          const v = r[c];
                          const isNull = v === null || v === undefined;
                          const long = !isNull && isLongText(v);
                          return (
                            <td key={c} className={cn("px-3 py-1.5 align-top", long ? "max-w-[320px]" : "max-w-[320px] truncate")}>
                              {isNull ? (
                                <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] italic text-white/35">NULL</span>
                              ) : long ? (
                                <span className="line-clamp-3 break-words font-mono text-[12px] leading-relaxed text-white/85" title={cellText(v)}>
                                  {previewText(v, 220)}
                                </span>
                              ) : (
                                <span className="font-mono text-[12px] text-white/85" title={cellText(v)}>{cellText(v)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p className="px-4 py-5 text-[13px] text-white/70">
              Write query executed successfully —{" "}
              <span className="font-bold text-emerald-300">{result.rowsAffected ?? 0} row(s) affected</span>.
              Re-run a SELECT or refresh the Data tab to see the change.
            </p>
          )}
        </div>
      )}

      {!result && !error && (
        <p className={cn(inputCls, "border-dashed text-center text-white/35")}>
          Tip: SELECTs render as a grid · INSERT / UPDATE / DELETE report rows affected — you can update data with UI or raw SQL.
        </p>
      )}
    </div>
  );
}
