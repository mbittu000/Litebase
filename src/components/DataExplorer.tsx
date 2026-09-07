"use client";
/* eslint-disable react-hooks/set-state-in-effect -- intentional: reset + fetch on table/control change */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Check,
  Expand,
  ListOrdered,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  X,
  Wand2,
  CheckSquare,
  Square,
} from "lucide-react";
import { api, cellText, countWords, download, isLongText, previewText, toCsv, type Filter, type RowsData, type SchemaData } from "@/lib/api";
import { Btn, Badge, Spinner, Modal, Field, inputCls, Empty, Confirm, cn } from "@/components/ui";

const OPS = [
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

function newFilter(firstCol = ""): Filter {
  return { column: firstCol, op: "=", value: "" };
}

export default function DataExplorer({
  table,
  onChanged,
  onOpenSql,
}: {
  table: string;
  onChanged: () => void;
  onOpenSql: (sql: string) => void;
}) {
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [data, setData] = useState<RowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [search, setSearch] = useState("");
  const [searchDeb, setSearchDeb] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowModal, setRowModal] = useState<{ mode: "add" | "edit"; row?: Record<string, unknown> } | null>(null);
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const cols = useMemo(() => schema?.columns ?? [], [schema]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const loadSchema = useCallback(async () => {
    const s = await api.schema(table);
    setSchema(s);
    return s;
  }, [table]);

  const loadRows = useCallback(
    async (p = page, extra?: { filters?: Filter[]; search?: string }) => {
      setLoading(true);
      setErr("");
      try {
        const d = await api.rows(table, {
          page: p,
          pageSize,
          sortBy: sortBy || undefined,
          sortDir,
          filters: extra?.filters ?? filters,
          search: (extra?.search ?? searchDeb).trim() || undefined,
        });
        setData(d);
        setPage(d.page);
        setSelected(new Set());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [table, page, pageSize, sortBy, sortDir, filters, searchDeb]
  );

  // fresh load when table changes (schema + first page fetched concurrently)
  useEffect(() => {
    setPage(1);
    setSortBy("");
    setSortDir("asc");
    setFilters([]);
    setSearch("");
    setSearchDeb("");
    setSelected(new Set());
    setViewRow(null);
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [, d] = await Promise.all([
          loadSchema(),
          api.rows(table, { page: 1, pageSize }),
        ]);
        setData(d);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // reload on control change (not first mount double-load — acceptable)
  useEffect(() => {
    if (!schema) return;
    loadRows(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir, searchDeb]);

  function applyFilters(next: Filter[]) {
    setFilters(next);
    setPage(1);
    loadRows(1, { filters: next });
  }

  function toggleSort(col: string) {
    if (sortBy !== col) {
      setSortBy(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortBy("");
      setSortDir("asc");
    }
  }

  async function doDeleteSelected() {
    if (selected.size === 0) return;
    setConfirmDel({
      label: `Delete ${selected.size} selected row(s)? This cannot be undone.`,
      run: async () => {
        setBusy(true);
        try {
          await api.delRows(table, [...selected].map((s) => Number(s)));
          flash(`Deleted ${selected.size} row(s)`);
          setConfirmDel(null);
          await loadRows(page);
          onChanged();
        } catch (e) {
          flash(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  const allIds = (data?.rows ?? []).map((r) => String(r._rowid));
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function confirmDeleteRow(id: string) {
    setConfirmDel({
      label: `Delete this row (rowid ${id})?`,
      run: async () => {
        setBusy(true);
        try {
          await api.delRow(table, Number(id));
          flash("Row deleted");
          setConfirmDel(null);
          setViewRow(null);
          await loadRows(page);
          onChanged();
        } catch (e) {
          flash(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="glass rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search text columns in ${table}…`}
              className={cn(inputCls, "pl-8")}
            />
          </div>
          <Btn variant={showFilters ? "soft" : "ghost"} onClick={() => setShowFilters(!showFilters)}>
            <FilterIcon size={14} /> Filters{filters.length > 0 && <Badge tone="violet">{filters.length}</Badge>}
          </Btn>
          <Btn variant="soft" onClick={() => loadRows(page)} title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Btn>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-[13px] text-white">
            {[10, 25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {selected.size > 0 && (
              <Btn variant="danger" onClick={doDeleteSelected}>
                <Trash2 size={14} /> Delete ({selected.size})
              </Btn>
            )}
            {filters.length > 0 && (
              <Btn variant="soft" onClick={() => setBulkModal(true)}>
                <Wand2 size={14} /> Bulk update
              </Btn>
            )}
            <Btn variant="soft" onClick={() => data && download(`${table}-p${page}.csv`, toCsv(data.rows, data.columns.filter((c) => c !== "_rowid")), "text/csv")} disabled={!data?.rows.length}>
              <Download size={14} /> CSV
            </Btn>
            <Btn variant="primary" onClick={() => setRowModal({ mode: "add" })}>
              <Plus size={14} /> Add row
            </Btn>
          </div>
        </div>

        {/* filter builder */}
        {showFilters && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                Field filters
              </span>
              <span className="text-[11px] text-white/30">— built from this table&apos;s columns</span>
              <button
                onClick={() => setFilters([...filters, newFilter(cols[0]?.name ?? "")])}
                className="ml-auto rounded-lg border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] font-bold text-violet-200 hover:bg-violet-500/25"
              >
                + Add filter
              </button>
            </div>
            {filters.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[12px] text-white/40">
                No filters — showing all rows. Add one to slice by any field, or use the SQL tab for advanced queries.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filters.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <select value={f.column} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], column: e.target.value }; applyFilters(n); }} className="min-w-[130px] rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 font-mono text-[12px] text-cyan-200">
                      {cols.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <select value={f.op} onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], op: e.target.value }; applyFilters(n); }} className="rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[12px] text-white">
                      {OPS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {f.op !== "isNull" && f.op !== "isNotNull" && (
                      <input
                        value={f.value ?? ""}
                        onChange={(e) => { const n = [...filters]; n[i] = { ...n[i], value: e.target.value }; setFilters(n); }}
                        onKeyDown={(e) => { if (e.key === "Enter") loadRows(1, { filters }); }}
                        onBlur={() => loadRows(1, { filters })}
                        placeholder={f.op === "in" ? "a, b, c" : "value…"}
                        className="min-w-[140px] flex-1 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[12px] text-white placeholder:text-white/25"
                      />
                    )}
                    <button onClick={() => { const n = filters.filter((_, j) => j !== i); applyFilters(n); }} className="rounded-lg border border-white/10 p-1.5 text-white/50 hover:bg-red-500/20 hover:text-red-200" title="Remove filter">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Btn variant="soft" onClick={() => loadRows(1)}>
                    Apply
                  </Btn>
                  <Btn onClick={() => { setFilters([]); setPage(1); loadRows(1, { filters: [] }); }}>
                    Clear all
                  </Btn>
                  <Btn
                    variant="ghost"
                    title="Open current filter as SQL"
                    onClick={() => {
                      const where = filters
                        .map((f) => {
                          if (f.op === "isNull") return `"${f.column}" IS NULL`;
                          if (f.op === "isNotNull") return `"${f.column}" IS NOT NULL`;
                          if (f.op === "contains") return `"${f.column}" LIKE '%${(f.value ?? "").replace(/'/g, "''")}%'`;
                          if (f.op === "in") return `"${f.column}" IN (${String(f.value ?? "").split(",").map((s) => `'${s.trim().replace(/'/g, "''")}'`).join(", ")})`;
                          return `"${f.column}" ${f.op} '${String(f.value ?? "").replace(/'/g, "''")}'`;
                        })
                        .join(" AND ");
                      onOpenSql(`SELECT * FROM "${table}"${where ? ` WHERE ${where}` : ""} LIMIT 100;`);
                    }}
                  >
                    View as SQL →
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* grid */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          {data && <Badge tone="cyan">{data.total} rows</Badge>}
          {filters.length > 0 && <Badge tone="violet">{filters.length} filter(s)</Badge>}
          {sortBy && <Badge tone="pink">sorted: {sortBy} {sortDir}</Badge>}
          {selected.size > 0 && <Badge tone="amber">{selected.size} selected</Badge>}
          {toast && <span className="rise ml-auto rounded-lg border border-emerald-400/25 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200">{toast}</span>}
        </div>

        {err ? (
          <p className="px-4 py-10 text-center text-[13px] text-red-300">{err}</p>
        ) : !data || (loading && !data.rows) ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-white/50">
            <Spinner /> Loading rows…
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-4">
            <Empty
              title={filters.length || search ? "No rows match" : "Table is empty"}
              hint={filters.length || search ? "Loosen the filters or search, or jump to SQL for an advanced query." : "Insert the first row to get going."}
              action={<Btn variant="primary" onClick={() => setRowModal({ mode: "add" })}><Plus size={14} /> Add row</Btn>}
            />
          </div>
        ) : (
          <div className="max-h-[540px] overflow-auto">
            <table className="grid-table row-hover w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr>
                  <th className="w-10 border-b border-white/10 px-2 py-2 text-center">
                    <button onClick={() => setSelected(allChecked ? new Set() : new Set(allIds))} className="text-white/60 hover:text-white" title="Select all">
                      {allChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </th>
                  {data.columns.filter((c) => c !== "_rowid").map((c) => (
                    <th key={c} className="whitespace-nowrap border-b border-white/10 px-3 py-2">
                      <button onClick={() => toggleSort(c)} className="group inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-wider text-fuchsia-200/75 hover:text-white" title={`Sort by ${c}`}>
                        {c}
                        <ArrowUpDown size={11} className={sortBy === c ? "text-cyan-300" : "opacity-30 group-hover:opacity-80"} />
                      </button>
                      <span className="ml-1.5 text-[10px] font-medium normal-case text-white/30">
                        {cols.find((x) => x.name === c)?.type}
                      </span>
                    </th>
                  ))}
                  <th className="border-b border-white/10 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-white/40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const id = String(r._rowid);
                  return (
                    <tr key={id} className={cn("border-b border-white/[0.05]", selected.has(id) ? "bg-violet-500/[0.12]" : "")}>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} className="text-white/55 hover:text-white">
                          {selected.has(id) ? <CheckSquare size={15} className="text-violet-300" /> : <Square size={15} />}
                        </button>
                      </td>
                      {data.columns.filter((c) => c !== "_rowid").map((c) => {
                        const v = r[c];
                        const isNull = v === null || v === undefined;
                        const long = !isNull && isLongText(v);
                        return (
                          <td
                            key={c}
                            onClick={() => setViewRow(r)}
                            title="Click to view row"
                            className={cn(
                              "cursor-pointer px-3 py-1.5 align-top",
                              long ? "max-w-[320px]" : "max-w-[280px] truncate"
                            )}
                          >
                            {isNull ? (
                              <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] italic text-white/35">NULL</span>
                            ) : long ? (
                              <span className="block">
                                <span className="line-clamp-2 break-words font-mono text-[12px] leading-[1.7] text-white/85" title={cellText(v)}>
                                  {previewText(v)}
                                </span>
                                <span
                                  title={`${String(v).length.toLocaleString()} characters — click to read the full text`}
                                  className="mt-1 inline-flex items-center rounded-md bg-violet-500/15 p-1 text-violet-200"
                                >
                                  <Expand size={10} />
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono text-[12px] text-white/85" title={cellText(v)}>{cellText(v)}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        <button onClick={() => setViewRow(r)} className="mr-1 rounded-lg border border-white/10 p-1.5 text-white/60 hover:border-violet-400/40 hover:text-violet-200" title="View row">
                          <Eye size={13} />
                        </button>
                        <button onClick={() => setRowModal({ mode: "edit", row: r })} className="mr-1 rounded-lg border border-white/10 p-1.5 text-white/60 hover:border-cyan-400/40 hover:text-cyan-200" title="Edit row">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => confirmDeleteRow(id)}
                          className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:border-red-400/40 hover:text-red-200"
                          title="Delete row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {data && data.totalPages > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
            <span className="text-[12px] text-white/50">
              Page <span className="font-bold text-white">{data.page}</span> of {data.totalPages} · {data.total} rows
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Btn variant="soft" onClick={() => setPage(1)} disabled={page <= 1}>First</Btn>
              <Btn variant="soft" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
                <ChevronLeft size={14} /> Prev
              </Btn>
              <Btn variant="soft" onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages}>
                Next <ChevronRight size={14} />
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* add/edit modal */}
      <RowFormModal
        open={!!rowModal}
        mode={rowModal?.mode ?? "add"}
        columns={cols}
        initial={rowModal?.row}
        table={table}
        onClose={() => setRowModal(null)}
        onSaved={async () => {
          setRowModal(null);
          flash(rowModal?.mode === "add" ? "Row inserted" : "Row updated");
          await loadRows(page);
          onChanged();
        }}
      />

      {/* view-row modal (with edit / delete from inside) */}
      <RowViewModal
        row={viewRow}
        columns={cols}
        table={table}
        onClose={() => setViewRow(null)}
        onEdit={(r) => {
          setViewRow(null);
          setRowModal({ mode: "edit", row: r });
        }}
        onDelete={(id) => confirmDeleteRow(id)}
      />

      {/* bulk update modal */}
      <BulkUpdateModal
        open={bulkModal}
        columns={cols}
        filterCount={filters.length}
        onClose={() => setBulkModal(false)}
        onApply={async (patch) => {
          setBusy(true);
          try {
            const r = await api.bulkUpdate(table, filters, patch) as { rowsAffected?: number };
            flash(`Updated ${r.rowsAffected ?? 0} row(s)`);
            setBulkModal(false);
            await loadRows(page);
            onChanged();
          } catch (e) {
            flash(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
      />

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel?.run()}
        title="Confirm delete"
        message={confirmDel?.label ?? ""}
        busy={busy}
      />
    </div>
  );
}

function RowViewModal({
  row,
  columns,
  table,
  onClose,
  onEdit,
  onDelete,
}: {
  row: Record<string, unknown> | null;
  columns: SchemaData["columns"];
  table: string;
  onClose: () => void;
  onEdit: (row: Record<string, unknown>) => void;
  onDelete: (rowid: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedLine, setCopiedLine] = useState<string | null>(null);
  // line-copy mode: per-field on/off, selected 0-based line indices, range input text
  const [lineMode, setLineMode] = useState<Record<string, boolean>>({});
  const [lineSel, setLineSel] = useState<Record<string, number[]>>({});
  const [lineRange, setLineRange] = useState<Record<string, string>>({});
  const rowid = row ? String(row._rowid ?? "") : "";
  const fields =
    columns.length > 0
      ? columns.map((c) => ({ name: c.name, type: c.type || "ANY", pk: c.pk > 0 }))
      : Object.keys(row ?? {})
          .filter((k) => k !== "_rowid")
          .map((k) => ({ name: k, type: "", pk: false }));

  function copyJson() {
    if (!row) return;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      clean[k] = typeof v === "bigint" ? Number(v) : v;
    }
    navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function copyField(name: string, value: unknown) {
    navigator.clipboard.writeText(cellText(value)).catch(() => {});
    setCopiedField(name);
    setTimeout(() => setCopiedField(null), 1200);
  }

  function toggleLineMode(name: string, total: number) {
    const on = !lineMode[name];
    setLineMode((m) => ({ ...m, [name]: on }));
    // enabling pre-selects everything so "Copy N lines" works immediately
    if (on) {
      setLineSel((s) =>
        s[name] ? s : { ...s, [name]: Array.from({ length: total }, (_, i) => i) }
      );
    }
  }

  function toggleLine(name: string, idx: number) {
    setLineSel((s) => {
      const cur = s[name] ?? [];
      return {
        ...s,
        [name]: cur.includes(idx)
          ? cur.filter((i) => i !== idx)
          : [...cur, idx].sort((a, b) => a - b),
      };
    });
  }

  function parseLineRange(input: string, total: number): number[] | null {
    const parts = input
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;
    const out = new Set<number>();
    for (const p of parts) {
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Math.max(1, Math.min(total, parseInt(m[1], 10)));
        let b = Math.max(1, Math.min(total, parseInt(m[2], 10)));
        if (a > b) [a, b] = [b, a];
        for (let n = a; n <= b; n++) out.add(n - 1);
      } else if (/^\d+$/.test(p)) {
        const n = parseInt(p, 10);
        if (n < 1 || n > total) return null;
        out.add(n - 1);
      } else {
        return null;
      }
    }
    return [...out].sort((a, b) => a - b);
  }

  function applyLineRange(name: string, total: number) {
    const parsed = parseLineRange(lineRange[name] ?? "", total);
    if (parsed) setLineSel((s) => ({ ...s, [name]: parsed }));
  }

  function copyLines(name: string, lines: string[]) {
    const sel = (lineSel[name] ?? [])
      .filter((i) => i < lines.length)
      .sort((a, b) => a - b);
    if (sel.length === 0) return;
    navigator.clipboard
      .writeText(sel.map((i) => lines[i]).join("\n"))
      .catch(() => {});
    setCopiedField(`${name}#lines`);
    setTimeout(() => setCopiedField(null), 1200);
  }

  // Tap a line = copy just that line instantly (+ keep it selected so bulk copy stays in sync)
  function copySingleLine(name: string, lines: string[], idx: number) {
    if (idx < 0 || idx >= lines.length) return;
    navigator.clipboard.writeText(lines[idx]).catch(() => {});
    setLineSel((s) => {
      const cur = s[name] ?? [];
      return cur.includes(idx) ? s : { ...s, [name]: [...cur, idx].sort((a, b) => a - b) };
    });
    const key = `${name}:${idx}`;
    setCopiedLine(key);
    setTimeout(() => setCopiedLine((c) => (c === key ? null : c)), 1100);
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      wide
      title={`Row ${rowid} → ${table}`}
      subtitle="Full record · edit, delete, copy whole field or line-by-line"
    >
      <div className="flex max-h-[55vh] flex-col gap-2 overflow-auto pr-1">
        {fields.map((f) => {
          const v = row?.[f.name];
          const isNull = v === null || v === undefined;
          const long = !isNull && isLongText(v);
          const len = typeof v === "string" ? v.length : 0;
          const lines = long ? String(v).split("\n") : [];
          const picking = long && lineMode[f.name];
          const sel = picking
            ? (lineSel[f.name] ?? []).filter((i) => i < lines.length)
            : [];
          return (
            <div key={f.name} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[12px] font-bold text-cyan-200">{f.name}</span>
                {f.type ? <Badge tone="gray">{f.type}</Badge> : null}
                {f.pk ? <Badge tone="amber">PK</Badge> : null}
                {long ? <Badge tone="violet">{len.toLocaleString()} chars · {countWords(String(v)).toLocaleString()} words · {lines.length} lines</Badge> : null}
                {!isNull && (
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    {long && (
                      <button
                        onClick={() => toggleLineMode(f.name, lines.length)}
                        title={picking ? "Disable line picker" : "Enable line picker: select which lines to copy"}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10.5px] font-bold transition-all",
                          picking
                            ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                            : "border-white/10 text-white/50 hover:border-violet-400/40 hover:text-violet-200"
                        )}
                      >
                        <ListOrdered size={11} />
                        {picking ? "Lines on" : "Lines"}
                      </button>
                    )}
                    <button
                      onClick={() => copyField(f.name, v)}
                      title={`Copy ${f.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1 text-[10.5px] font-bold text-white/50 hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      {copiedField === f.name ? <Check size={11} /> : <Copy size={11} />}
                      {copiedField === f.name ? "Copied" : "Copy"}
                    </button>
                  </span>
                )}
              </div>
              {picking ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-violet-400/25 bg-black/50">
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet-200">
                      {sel.length}/{lines.length} lines
                    </span>
                    <span className="hidden text-[10.5px] text-white/35 sm:inline">
                      tap text to copy · ☑ to select
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() =>
                          setLineSel((s) => ({
                            ...s,
                            [f.name]: Array.from({ length: lines.length }, (_, i) => i),
                          }))
                        }
                        className="rounded-md border border-white/10 px-1.5 py-1 text-[10.5px] font-bold text-white/55 hover:bg-white/10 hover:text-white"
                      >
                        All
                      </button>
                      <button
                        onClick={() => setLineSel((s) => ({ ...s, [f.name]: [] }))}
                        className="rounded-md border border-white/10 px-1.5 py-1 text-[10.5px] font-bold text-white/55 hover:bg-white/10 hover:text-white"
                      >
                        None
                      </button>
                      <input
                        value={lineRange[f.name] ?? ""}
                        onChange={(e) =>
                          setLineRange((r) => ({ ...r, [f.name]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyLineRange(f.name, lines.length);
                        }}
                        placeholder="1-3,5"
                        title='Pick lines: e.g. "1-3,5" selects lines 1 to 3 plus line 5. Press Enter to apply.'
                        className="w-20 rounded-md border border-white/10 bg-black/60 px-1.5 py-1 font-mono text-[10.5px] text-white placeholder:text-white/25"
                      />
                      <button
                        onClick={() => applyLineRange(f.name, lines.length)}
                        title='Apply range like "1-3,5"'
                        className="rounded-md border border-white/10 px-1.5 py-1 text-[10.5px] font-bold text-white/55 hover:bg-white/10 hover:text-white"
                      >
                        Set
                      </button>
                      <button
                        onClick={() => copyLines(f.name, lines)}
                        disabled={sel.length === 0}
                        className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[10.5px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 grad-btn"
                      >
                        {copiedField === `${f.name}#lines` ? <Check size={11} /> : <Copy size={11} />}
                        {copiedField === `${f.name}#lines` ? "Copied" : `Copy ${sel.length}`}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[260px] space-y-1.5 overflow-auto p-1.5">
                    {lines.map((ln, i) => {
                      const on = sel.includes(i);
                      const flashed = copiedLine === `${f.name}:${i}`;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex w-full items-start gap-1 rounded-lg px-1.5 py-1 transition-colors",
                            flashed
                              ? "bg-emerald-500/[0.16]"
                              : on
                                ? "bg-violet-500/[0.18]"
                                : "hover:bg-white/[0.05]"
                          )}
                        >
                          <button
                            onClick={() => copySingleLine(f.name, lines, i)}
                            title={flashed ? "Copied!" : `Copy line ${i + 1}`}
                            className="flex min-h-[30px] min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-1 text-left"
                          >
                            <span
                              className={cn(
                                "w-7 shrink-0 pt-px text-right font-mono text-[10.5px] font-bold tabular-nums",
                                flashed ? "text-emerald-300" : on ? "text-violet-200" : "text-white/30"
                              )}
                            >
                              {flashed ? "✓" : i + 1}
                            </span>
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-white/85">
                              {ln === "" ? (
                                <span className="text-white/25">↵ blank</span>
                              ) : (
                                ln
                              )}
                            </span>
                            {flashed && (
                              <span className="rise shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-px text-[10px] font-bold text-emerald-200">
                                Copied
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => toggleLine(f.name, i)}
                            title={on ? `Deselect line ${i + 1}` : `Select line ${i + 1} for bulk copy`}
                            aria-pressed={on}
                            className={cn(
                              "shrink-0 rounded-lg p-2 transition-colors",
                              on ? "text-violet-300 hover:bg-violet-500/20" : "text-white/25 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            {on ? <CheckSquare size={14} /> : <Square size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    long
                      ? "mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/50 p-3 font-mono text-[13px] leading-[1.75] text-white/90"
                      : "mt-1 break-words font-mono text-[12.5px] leading-relaxed text-white/85"
                  }
                >
                  {isNull ? (
                    <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] italic text-white/35">NULL</span>
                  ) : (
                    cellText(v)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn variant="soft" onClick={copyJson}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy JSON"}
        </Btn>
        <div className="ml-auto flex gap-2">
          <Btn variant="danger" onClick={() => row && onDelete(rowid)}>
            <Trash2 size={14} /> Delete
          </Btn>
          <Btn variant="primary" onClick={() => row && onEdit(row)}>
            <Pencil size={14} /> Edit
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function RowFormModal({
  open,
  mode,
  columns,
  initial,
  table,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "add" | "edit";
  columns: SchemaData["columns"];
  initial?: Record<string, unknown>;
  table: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const c of columns) {
      const cur = initial?.[c.name];
      v[c.name] = cur === null || cur === undefined ? "" : String(cur);
    }
    setValues(v);
    setErr("");
  }, [open, columns, initial]);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {};
      for (const c of columns) {
        const raw = (values[c.name] ?? "").trim();
        if (mode === "add" && raw === "" && !c.notnull && c.pk !== 1) {
          // skip empty optional fields so defaults/NULL apply
          continue;
        }
        payload[c.name] = raw === "" ? null : raw;
      }
      if (mode === "add") {
        await api.insert(table, payload);
      } else {
        const rowid = initial?.["_rowid"];
        if (rowid === undefined) throw new Error("Missing rowid");
        await api.updateByRowid(table, Number(rowid), payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={mode === "add" ? `Add row → ${table}` : `Edit row → ${table}`}
      subtitle={mode === "edit" ? `rowid ${String(initial?.["_rowid"] ?? "")} · empty input saves as NULL` : "Empty inputs are skipped so column defaults apply"}
    >
      <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-auto pr-1 sm:grid-cols-2">
        {columns.map((c) => {
          const val = values[c.name] ?? "";
          const long = val.length > 300 || val.includes("\n");
          const rows = val.length > 2000 ? 14 : val.length > 800 ? 10 : val.length > 300 ? 6 : val.length > 80 ? 3 : 1;
          return (
            <div key={c.name} className={long ? "sm:col-span-2" : ""}>
              <Field label={`${c.name} · ${c.type || "ANY"}${c.pk ? " · PK" : ""}${long ? " · LONG TEXT" : ""}`}>
                <textarea
                  rows={rows}
                  value={val}
                  onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
                  placeholder={c.dflt_value ? `default: ${c.dflt_value}` : c.notnull ? "required" : "NULL"}
                  className={cn(inputCls, "resize-y font-mono", long && "whitespace-pre-wrap leading-relaxed")}
                />
              </Field>
              {val && (
                <p className="mt-1 text-right font-mono text-[10.5px] text-white/35">
                  {val.length.toLocaleString()} chars · {countWords(val).toLocaleString()} words
                </p>
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy}>
          {busy && <Spinner />}
          {mode === "add" ? "Insert row" : "Save changes"}
        </Btn>
      </div>
    </Modal>
  );
}

function BulkUpdateModal({
  open,
  columns,
  filterCount,
  onClose,
  onApply,
  busy,
}: {
  open: boolean;
  columns: SchemaData["columns"];
  filterCount: number;
  onClose: () => void;
  onApply: (patch: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setValues({});
  }, [open ]);

  const chosen = Object.entries(values).filter(([, v]) => v.trim() !== "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk update via filters"
      subtitle={`Will UPDATE every row matching your ${filterCount} active filter(s). Only filled fields change.`}
    >
      <div className="flex max-h-[50vh] flex-col gap-2.5 overflow-auto pr-1">
        {columns.map((c) => (
          <div key={c.name} className="flex items-center gap-2">
            <span className="w-36 truncate font-mono text-[12px] text-cyan-200">{c.name}</span>
            <input
              value={values[c.name] ?? ""}
              onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
              placeholder="leave empty = no change · empty→NULL via SQL"
              className={cn(inputCls, "font-mono")}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[12px] text-white/45">{chosen.length} field(s) set</span>
        <div className="flex gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy || chosen.length === 0} onClick={() => onApply(Object.fromEntries(chosen.map(([k, v]) => [k, v.trim() === "" ? null : v])) as Record<string, unknown>)}>
            {busy && <Spinner />} Apply to matches
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
