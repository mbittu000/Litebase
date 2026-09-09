"use client";

import { useState } from "react";
import { Plus, Trash2, Copy, Check, Pencil, AlertTriangle, Eraser } from "lucide-react";
import { api, type SchemaData } from "@/lib/api";
import { Btn, Badge, Modal, Field, inputCls, Spinner, Confirm, cn } from "@/components/ui";

export default function StructurePanel({
  table,
  schema,
  onChanged,
}: {
  table: string;
  schema: SchemaData | null;
  onChanged: (renamedOrDropped?: string | boolean) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameCol, setRenameCol] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  if (!schema) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-14 text-white/50">
        <Spinner /> Loading schema…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <h3 className="text-sm font-bold">Columns</h3>
          <Badge tone="cyan">{schema.columns.length}</Badge>
          {toast && <span className="rise rounded-lg border border-emerald-400/25 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200">{toast}</span>}
          <div className="ml-auto flex gap-1.5">
            <Btn variant="soft" onClick={() => setRenameOpen(true)}>
              <Pencil size={13} /> Rename table
            </Btn>
            <Btn variant="primary" onClick={() => setAddOpen(true)}>
              <Plus size={13} /> Add column
            </Btn>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">PK</th>
                <th className="px-3 py-2">Not null</th>
                <th className="px-3 py-2">Default</th>
                <th className="px-3 py-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {schema.columns.map((c) => (
                <tr key={c.name} className="border-b border-white/[0.05] hover:bg-violet-500/[0.06]">
                  <td className="px-4 py-2 font-mono text-[12.5px] font-bold text-cyan-200">{c.name}</td>
                  <td className="px-3 py-2"><Badge tone="gray">{c.type || "ANY"}</Badge></td>
                  <td className="px-3 py-2">{c.pk ? <Badge tone="amber">PK{c.pk > 1 ? ` ${c.pk}` : ""}</Badge> : <span className="text-white/25">—</span>}</td>
                  <td className="px-3 py-2 text-white/70">{c.notnull ? "YES" : "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[12px] text-white/60">{c.dflt_value ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      onClick={() => setRenameCol(c.name)}
                      className="mr-1 rounded-lg border border-white/10 p-1.5 text-white/50 hover:border-cyan-400/40 hover:text-cyan-200"
                      title={`Rename ${c.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() =>
                        setConfirm({
                          title: `Drop column "${c.name}"?`,
                          message: `ALTER TABLE "${table}" DROP COLUMN "${c.name}". Data in this column is lost forever.`,
                          label: "Drop column",
                          run: async () => {
                            setBusy(true);
                            try {
                              await api.dropColumn(table, c.name);
                              flash(`Dropped ${c.name}`);
                              setConfirm(null);
                              onChanged();
                            } catch (e) {
                              flash(e instanceof Error ? e.message : String(e));
                            } finally {
                              setBusy(false);
                            }
                          },
                        })
                      }
                      className="rounded-lg border border-white/10 p-1.5 text-white/50 hover:border-red-400/40 hover:text-red-200"
                      title={`Drop ${c.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold">Indexes</h3>
            <Badge tone="gray">{schema.indexes.length}</Badge>
          </div>
          {schema.indexes.length === 0 ? (
            <p className="text-[12.5px] text-white/40">No indexes.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {schema.indexes.map((ix, i) => {
                const o = ix as Record<string, unknown>;
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11.5px] text-white/70">
                    {String(o.name ?? `index_${i}`)} {o.unique ? <span className="text-amber-300">· unique</span> : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mb-2 mt-4 flex items-center gap-2">
            <h3 className="text-sm font-bold">Foreign keys</h3>
            <Badge tone="gray">{schema.foreignKeys.length}</Badge>
          </div>
          {schema.foreignKeys.length === 0 ? (
            <p className="text-[12.5px] text-white/40">No foreign keys.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {schema.foreignKeys.map((fk, i) => {
                const o = fk as Record<string, unknown>;
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11.5px] text-white/70">
                    {String(o.from)} → {String(o.table)}({String(o.to)})
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <h3 className="text-sm font-bold">CREATE statement</h3>
            <button
              onClick={() => {
                if (schema.createSql) navigator.clipboard.writeText(schema.createSql).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="sql-editor max-h-[260px] overflow-auto bg-black/40 px-4 py-3 text-[12px] text-emerald-100/90">
            {schema.createSql ?? "-- no DDL found"}
          </pre>
        </div>
      </div>

      {/* danger zone */}
      <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.05] p-4">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-red-300">
          <AlertTriangle size={13} /> Danger zone
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="danger"
            onClick={() =>
              setConfirm({
                title: `Truncate "${table}"?`,
                message: "Deletes EVERY row but keeps the table structure.",
                label: "Delete all rows",
                run: async () => {
                  setBusy(true);
                  try {
                    await api.truncateTable(table);
                    flash("Table truncated");
                    setConfirm(null);
                    onChanged();
                  } catch (e) {
                    flash(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                },
              })
            }
          >
            <Eraser size={13} /> Truncate (empty rows)
          </Btn>
          <Btn
            variant="danger"
            onClick={() =>
              setConfirm({
                title: `Drop table "${table}"?`,
                message: "The table and ALL its data will be permanently deleted.",
                label: "Drop table",
                run: async () => {
                  setBusy(true);
                  try {
                    await api.dropTable(table);
                    setConfirm(null);
                    onChanged(true as never);
                  } catch (e) {
                    flash(e instanceof Error ? e.message : String(e));
                    setBusy(false);
                  }
                },
              })
            }
          >
            <Trash2 size={13} /> Drop table
          </Btn>
        </div>
      </div>

      <AddColumnModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          flash("Column added");
          onChanged();
        }}
        table={table}
      />
      <RenameModal
        open={renameOpen}
        table={table}
        onClose={() => setRenameOpen(false)}
        onRenamed={(n) => {
          setRenameOpen(false);
          onChanged(n as never);
        }}
      />
      <RenameColumnModal
        key={renameCol ?? "closed"}
        column={renameCol}
        table={table}
        onClose={() => setRenameCol(null)}
        onRenamed={() => {
          setRenameCol(null);
          flash("Column renamed");
          onChanged();
        }}
      />
      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.run()}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.label ?? "Confirm"}
        busy={busy}
      />
    </div>
  );
}

function AddColumnModal({
  open,
  onClose,
  onAdded,
  table,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  table: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("TEXT");
  const [dflt, setDflt] = useState("");
  const [notNull, setNotNull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api.addColumn(table, { name: name.trim(), type, default: dflt, notNull });
      setName("");
      setDflt("");
      setNotNull(false);
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add column → ${table}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Column name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. status" className={cn(inputCls, "font-mono")} />
          </Field>
        </div>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {["TEXT", "INTEGER", "REAL", "NUMERIC", "BLOB", "BOOLEAN", "DATE", "DATETIME", "VARCHAR"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Default">
          <input value={dflt} onChange={(e) => setDflt(e.target.value)} placeholder="NULL / 0 / now…" className={cn(inputCls, "font-mono")} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-[13px] text-white/70">
          <input type="checkbox" checked={notNull} onChange={(e) => setNotNull(e.target.checked)} className="h-4 w-4 accent-fuchsia-500" />
          NOT NULL
        </label>
      </div>
      {err && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy || !name.trim()}>
          {busy && <Spinner />} Add column
        </Btn>
      </div>
    </Modal>
  );
}

function RenameModal({
  open,
  table,
  onClose,
  onRenamed,
}: {
  open: boolean;
  table: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}) {
  const [name, setName] = useState(table);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={`Rename "${table}"`}>
      <Field label="New table name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "font-mono")} />
      </Field>
      {err && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={busy || !name.trim() || name.trim() === table}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await api.renameTable(table, name.trim());
              onRenamed(name.trim());
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />} Rename
        </Btn>
      </div>
    </Modal>
  );
}

function RenameColumnModal({
  column,
  table,
  onClose,
  onRenamed,
}: {
  column: string | null;
  table: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}) {
  const [name, setName] = useState(column ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal open={column !== null} onClose={onClose} title={column ? `Rename column "${column}"` : "Rename column"} subtitle="Native SQLite RENAME COLUMN — data is kept as-is">
      <Field label="New column name (letters, digits, underscore)">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. full_name" className={cn(inputCls, "font-mono")} />
      </Field>
      {err && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={busy || !column || !name.trim() || name.trim() === column}
          onClick={async () => {
            if (!column) return;
            setBusy(true);
            setErr("");
            try {
              await api.renameColumn(table, column, name.trim());
              onRenamed(name.trim());
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />} Rename column
        </Btn>
      </div>
    </Modal>
  );
}
