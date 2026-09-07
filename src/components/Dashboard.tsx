"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Table2,
  Plus,
  Search,
  LogOut,
  RefreshCw,
  LayoutGrid,
  TerminalSquare,
  Rows3,
  Braces,
  Eye,
  Menu,
  X,
} from "lucide-react";
import { api, formatBytes, type OverviewData, type SchemaData } from "@/lib/api";
import { Btn, Badge, Spinner, Modal, Field, inputCls, Empty, cn } from "@/components/ui";
import DataExplorer from "@/components/DataExplorer";
import StructurePanel from "@/components/StructurePanel";
import SqlConsole from "@/components/SqlConsole";

type Tab = "data" | "structure" | "sql";
type View = { kind: "overview" } | { kind: "table"; name: string };

export default function Dashboard() {
  const router = useRouter();
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [tab, setTab] = useState<Tab>("data");
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sqlSeed, setSqlSeed] = useState<string | undefined>(undefined);
  const [navOpen, setNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await api.overview();
      setOv(d);
      setErr("");
      return d;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unauthorized")) {
        router.push("/login");
        return null;
      }
      setErr(msg);
      return null;
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const openTable = useCallback(async (name: string, t: Tab = "data") => {
    setNavOpen(false);
    setView({ kind: "table", name });
    setTab(t);
    setSchema(null);
    try {
      setSchema(await api.schema(name));
    } catch {
      // schema loads lazily in panels too
    }
  }, []);

  const refreshTable = useCallback(
    async (renamedOrDropped?: string | boolean) => {
      const d = await refresh();
      if (typeof renamedOrDropped === "string") {
        await openTable(renamedOrDropped, tab);
      } else if (renamedOrDropped === true) {
        setView({ kind: "overview" });
      } else if (view.kind === "table") {
        try {
          setSchema(await api.schema(view.name));
        } catch {
          setView({ kind: "overview" });
        }
      }
      void d;
    },
    [refresh, openTable, tab, view]
  );

  function openSql(sql: string) {
    setSqlSeed(sql);
    setTab("sql");
  }

  const filteredTables = useMemo(() => {
    const all = ov?.tables ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((t) => t.name.toLowerCase().includes(needle));
  }, [ov, q]);

  const tabs = [
    { id: "data", label: "Data", icon: <Rows3 size={15} /> },
    { id: "structure", label: "Structure", icon: <Braces size={15} /> },
    { id: "sql", label: "SQL", icon: <TerminalSquare size={15} /> },
  ] as { id: Tab; label: string; icon: React.ReactNode }[];

  // Lock body scroll + close on Escape while the mobile drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", fn);
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen w-full flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:gap-4 lg:p-5">
      {/* ── mobile top bar ────────────────────────── */}
      <header className="glass sticky top-2 z-40 flex items-center gap-1.5 rounded-2xl p-1.5 lg:hidden">
        <button
          onClick={() => setNavOpen((o) => !o)}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          className={cn(
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-300",
            navOpen
              ? "border-fuchsia-400/50 bg-gradient-to-br from-violet-500/40 to-fuchsia-500/20 shadow-[0_0_24px_-6px_rgba(217,70,239,0.7)]"
              : "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]"
          )}
        >
          <Menu
            size={16}
            className={cn(
              "absolute text-white transition-all duration-300",
              navOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            )}
          />
          <X
            size={16}
            className={cn(
              "absolute text-white transition-all duration-300",
              navOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            )}
          />
        </button>
        <div className="grad-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
          <Database size={14} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px] font-black leading-tight">
            {view.kind === "overview" ? (
              <span>
                Lite<span className="grad-text">base</span>
              </span>
            ) : (
              view.name
            )}
          </p>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {view.kind === "overview"
              ? `${ov?.stats.tableCount ?? "…"} tables`
              : `${tab} · ${schema?.rowCount ?? "…"} rows`}
          </p>
        </div>
        <Btn variant="primary" onClick={() => setCreateOpen(true)} title="Create table" className="!px-2 !py-1.5">
          <Plus size={14} />
        </Btn>
      </header>

      {/* backdrop for the mobile drawer */}
      {navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          className="rise fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      {/* ── sidebar / mobile drawer ───────────────── */}
      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[320px] shrink-0 flex-col overflow-hidden rounded-r-3xl p-4 transition-transform duration-300 ease-out lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:w-[300px] lg:translate-x-0 lg:rounded-3xl",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* aurora edge glow — the drawer's "spine" */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-fuchsia-400/60 to-transparent"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setView({ kind: "overview" });
              setNavOpen(false);
            }}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-1 text-left"
          >
            <div className="grad-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
              <Database size={19} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-black leading-none tracking-tight">
                Lite<span className="grad-text">base</span>
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                SQLite · Turso Studio
              </p>
            </div>
          </button>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="shrink-0 rounded-xl border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tables…"
              className={cn(inputCls, "py-1.5 pl-8 text-[12.5px]")}
            />
          </div>
          <Btn variant="primary" onClick={() => setCreateOpen(true)} title="Create table" className="!px-2.5">
            <Plus size={15} />
          </Btn>
        </div>

        <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
          <SideItem
            active={view.kind === "overview"}
            onClick={() => {
              setView({ kind: "overview" });
              setNavOpen(false);
            }}
            icon={<LayoutGrid size={15} />}
            label="Overview"
            right={ov ? <Badge tone="gray">{ov.stats.tableCount}</Badge> : null}
          />
          <p className="mb-1 mt-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
            Tables · {filteredTables.length}
          </p>
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-4 text-[13px] text-white/45">
              <Spinner /> Loading…
            </div>
          ) : filteredTables.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-white/40">
              {q ? "No tables match." : "No tables yet — create one."}
            </p>
          ) : (
            filteredTables.map((t) => {
              const active = view.kind === "table" && view.name === t.name;
              return (
                <SideItem
                  key={t.name}
                  active={active}
                  onClick={() => openTable(t.name, tab === "sql" ? "data" : tab)}
                  icon={t.type === "view" ? <Eye size={15} /> : <Table2 size={15} />}
                  label={t.name}
                  right={
                    t.type === "view" ? (
                      <Badge tone="cyan">view</Badge>
                    ) : (
                      <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-white/55">
                        {t.rowCount ?? "—"}
                      </span>
                    )
                  }
                />
              );
            })
          )}
        </nav>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center gap-1.5">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
              {ov?.db.kind === "turso" ? "Turso" : ov?.db.kind === "remote" ? "Remote" : "Local file"}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-white/40" title={ov?.db.url}>
            {ov?.db.url ?? "…"}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Btn variant="soft" className="flex-1 justify-center !text-[12px]" onClick={() => refresh()}>
              <RefreshCw size={13} /> Refresh
            </Btn>
            <Btn
              className="flex-1 justify-center !text-[12px]"
              onClick={async () => {
                await api.logout().catch(() => {});
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut size={13} /> Logout
            </Btn>
          </div>
        </div>
      </aside>

      {/* ── main ────────────────────────────────── */}
      <main className={cn("flex min-w-0 flex-1 flex-col gap-3", view.kind === "table" && "pb-20 lg:pb-0")}>
        {err && (
          <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {err} — check <code className="font-mono">DATABASE_URL</code> in your <code className="font-mono">.env</code>, then refresh.
          </div>
        )}

        {view.kind === "overview" ? (
          <Overview
            ov={ov}
            loading={loading}
            onOpen={(n) => openTable(n)}
            onCreate={() => setCreateOpen(true)}
            onSql={() => {
              setView({ kind: "overview" });
              setSqlSeed(undefined);
              document.getElementById("studio-sql")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        ) : (
          <>
            {/* table header */}
            <div className="glass rise rounded-3xl p-3 sm:p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-violet-500/25 to-cyan-500/15 sm:h-11 sm:w-11">
                  <Table2 size={19} className="text-fuchsia-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-mono text-[15px] font-black tracking-tight sm:text-[17px]">{view.name}</h1>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={schema?.type === "view" ? "cyan" : "violet"}>{schema?.type ?? "table"}</Badge>
                    {schema && <Badge tone="gray">{schema.columns.length} cols</Badge>}
                    {schema?.rowCount !== null && schema?.rowCount !== undefined && (
                      <Badge tone="green">{schema.rowCount} rows</Badge>
                    )}
                  </div>
                </div>
                {/* desktop tab pills — on phones the bottom dock takes over */}
                <div className="ml-auto hidden rounded-xl border border-white/10 bg-black/30 p-1 lg:flex">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-all",
                        tab === t.id ? "grad-btn text-white" : "text-white/55 hover:text-white"
                      )}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {tab === "data" && (
              <DataExplorer key={view.name} table={view.name} onChanged={() => refreshTable()} onOpenSql={openSql} />
            )}
            {tab === "structure" && (
              <StructurePanel table={view.name} schema={schema} onChanged={refreshTable} />
            )}
            {tab === "sql" && <SqlConsole key={sqlSeed ?? "plain"} initialSql={sqlSeed} />}
          </>
        )}

        {/* console section */}
        {view.kind === "overview" && !loading && (
          <div id="studio-sql" className="glass rounded-3xl p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <TerminalSquare size={15} className="text-cyan-300" /> SQL console
              <span className="text-[11px] font-medium text-white/40">— run anything, including UPDATE / DELETE</span>
            </h2>
            <SqlConsole />
          </div>
        )}
      </main>

      {/* ── mobile bottom dock: thumb-friendly Data / Structure / SQL ── */}
      {view.kind === "table" && (
        <nav
          aria-label="Table sections"
          className="glass-deep fixed inset-x-2 bottom-2 z-30 grid grid-cols-3 gap-1 rounded-2xl p-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] lg:hidden"
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-all [&_svg]:h-4 [&_svg]:w-4",
                  active ? "grad-btn text-white" : "text-white/55 active:bg-white/10"
                )}
              >
                {t.icon}
                {t.label}
                <span
                  className={cn(
                    "h-0.5 w-3 rounded-full transition-opacity",
                    active ? "bg-white opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })}
        </nav>
      )}

      <CreateTableModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (name) => {
          setCreateOpen(false);
          await refresh();
          await openTable(name);
        }}
      />
    </div>
  );
}

function SideItem({
  active,
  onClick,
  icon,
  label,
  right,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[13px] transition-all",
        active
          ? "border-fuchsia-400/30 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 font-bold text-white"
          : "border-transparent text-white/65 hover:bg-white/[0.05] hover:text-white"
      )}
    >
      <span className={cn(active ? "text-fuchsia-300" : "text-white/40 group-hover:text-white/70")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{label}</span>
      {right}
    </button>
  );
}

function Overview({
  ov,
  loading,
  onOpen,
  onCreate,
  onSql,
}: {
  ov: OverviewData | null;
  loading: boolean;
  onOpen: (name: string) => void;
  onCreate: () => void;
  onSql: () => void;
}) {
  if (loading) {
    return (
      <div className="glass flex items-center justify-center gap-2 rounded-3xl px-4 py-24 text-white/50">
        <Spinner /> Connecting to database…
      </div>
    );
  }
  if (!ov) {
    return (
      <div className="p-1">
        <Empty title="Could not connect" hint="Check DATABASE_URL / DATABASE_AUTH_TOKEN in .env and refresh." />
      </div>
    );
  }
  const cards = [
    { label: "Tables", value: String(ov.stats.tableCount), sub: `${ov.stats.viewCount} views`, grad: "from-violet-500/30 to-fuchsia-500/10" },
    { label: "Total rows", value: ov.stats.totalRows.toLocaleString(), sub: "across all tables", grad: "from-cyan-500/25 to-blue-500/10" },
    { label: "DB size", value: formatBytes(ov.stats.sizeBytes), sub: ov.db.kind, grad: "from-emerald-500/25 to-teal-500/10" },
    { label: "SQLite", value: ov.stats.sqliteVersion || "—", sub: "engine version", grad: "from-amber-500/25 to-orange-500/10" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="rise relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/25 via-fuchsia-600/10 to-cyan-500/15 p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-fuchsia-200/70">
          {ov.db.kind === "turso" ? "Connected · Turso Cloud" : ov.db.kind === "remote" ? "Connected · Remote libSQL" : "Connected · Local SQLite"}
        </p>
        <h1 className="mt-2 max-w-xl text-2xl font-black leading-tight tracking-tight sm:text-[32px]">
          Your database, <span className="grad-text">beautifully</span> manageable.
        </h1>
        <p className="mt-2 max-w-xl truncate font-mono text-[12px] text-white/50" title={ov.db.url}>
          {ov.db.url}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={onCreate}><Plus size={14} /> New table</Btn>
          <Btn variant="soft" onClick={onSql}><TerminalSquare size={14} /> Open SQL console</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c, i) => (
          <div key={c.label} className={cn("glass rise rounded-2xl bg-gradient-to-br p-4", c.grad, `rise-${i}`)}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{c.label}</p>
            <p className="mt-1 truncate font-mono text-[22px] font-black">{c.value}</p>
            <p className="text-[11.5px] text-white/40">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-3xl p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold">Tables</h2>
          <Badge tone="gray">{ov.tables.length}</Badge>
        </div>
        {ov.tables.length === 0 ? (
          <Empty
            title="No tables yet"
            hint="Create your first table with the visual builder, or paste a CREATE TABLE statement."
            action={<Btn variant="primary" onClick={onCreate}><Plus size={14} /> Create table</Btn>}
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {ov.tables.map((t) => (
              <button
                key={t.name}
                onClick={() => onOpen(t.name)}
                className="group rounded-2xl border border-white/10 bg-black/25 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-fuchsia-400/35 hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-2">
                  <Table2 size={15} className="text-fuchsia-300" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold">{t.name}</span>
                  {t.type === "view" ? <Badge tone="cyan">view</Badge> : <Badge tone="green">{t.rowCount ?? 0} rows</Badge>}
                </div>
                <p className="mt-2 line-clamp-2 font-mono text-[10.5px] leading-relaxed text-white/35">
                  {t.sql ?? "—"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DraftCol {
  name: string;
  type: string;
  pk: boolean;
  nn: boolean;
  uq: boolean;
  def: string;
}

function CreateTableModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [mode, setMode] = useState<"visual" | "sql">("visual");
  const [name, setName] = useState("");
  const [cols, setCols] = useState<DraftCol[]>([
    { name: "id", type: "INTEGER", pk: true, nn: false, uq: false, def: "" },
    { name: "created_at", type: "DATETIME", pk: false, nn: false, uq: false, def: "CURRENT_TIMESTAMP" },
  ]);
  const [rawSql, setRawSql] = useState('CREATE TABLE "notes" (\n  "id" INTEGER PRIMARY KEY,\n  "title" TEXT NOT NULL,\n  "body" TEXT,\n  "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP\n);');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true);
    setErr("");
    try {
      if (mode === "sql") {
        await api.createTable({ sql: rawSql });
        const m = rawSql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?(\w+)/i);
        onCreated(m?.[1] ?? "");
      } else {
        const payload = {
          name: name.trim(),
          columns: cols
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name.trim(),
              type: c.type,
              primaryKey: c.pk,
              notNull: c.nn,
              unique: c.uq,
              default: c.def,
            })),
        };
        await api.createTable(payload);
        onCreated(payload.name);
        setName("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Create table" subtitle="Visual builder or raw CREATE TABLE SQL">
      <div className="mb-3 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
        {(["visual", "sql"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-bold",
              mode === m ? "grad-btn text-white" : "text-white/55 hover:text-white"
            )}
          >
            {m === "visual" ? "Visual builder" : "Raw SQL"}
          </button>
        ))}
      </div>

      {mode === "visual" ? (
        <>
          <Field label="Table name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. users" className={cn(inputCls, "font-mono")} />
          </Field>
          <div className="mt-3 flex max-h-[40vh] flex-col gap-1.5 overflow-auto pr-1">
            {cols.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-2">
                <input value={c.name} onChange={(e) => { const n = [...cols]; n[i] = { ...n[i], name: e.target.value }; setCols(n); }} placeholder="column" className="w-28 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 font-mono text-[12px] text-white" />
                <select value={c.type} onChange={(e) => { const n = [...cols]; n[i] = { ...n[i], type: e.target.value }; setCols(n); }} className="rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[12px] text-white">
                  {["TEXT", "INTEGER", "REAL", "NUMERIC", "BLOB", "BOOLEAN", "DATE", "DATETIME", "VARCHAR"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input value={c.def} onChange={(e) => { const n = [...cols]; n[i] = { ...n[i], def: e.target.value }; setCols(n); }} placeholder="default" className="w-24 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 font-mono text-[12px] text-white" />
                {([["pk", "PK"], ["nn", "NN"], ["uq", "UQ"]] as const).map(([k, label]) => (
                  <label key={k} className={cn("cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-bold", c[k] ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-200" : "border-white/10 text-white/40")}>
                    <input type="checkbox" className="hidden" checked={c[k]} onChange={() => { const n = [...cols]; n[i] = { ...n[i], [k]: !n[i][k] }; setCols(n); }} />
                    {label}
                  </label>
                ))}
                <button onClick={() => setCols(cols.filter((_, j) => j !== i))} className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/40 hover:text-red-300">✕</button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setCols([...cols, { name: "", type: "TEXT", pk: false, nn: false, uq: false, def: "" }])}
            className="mt-2 w-full rounded-xl border border-dashed border-white/15 py-2 text-[12.5px] font-bold text-white/55 hover:border-fuchsia-400/40 hover:text-white"
          >
            + Add column
          </button>
        </>
      ) : (
        <textarea
          value={rawSql}
          onChange={(e) => setRawSql(e.target.value)}
          rows={10}
          spellCheck={false}
          className="sql-editor w-full rounded-xl border border-white/10 bg-black/50 p-3 text-emerald-100/90"
        />
      )}

      {err && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={create} disabled={busy || (mode === "visual" ? !name.trim() : !rawSql.trim())}>
          {busy && <Spinner />} Create table
        </Btn>
      </div>
    </Modal>
  );
}
