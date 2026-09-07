# Litebase — SQLite / Turso Studio

A beautiful, password-protected web studio to manage any **SQLite / Turso (libSQL)** database:
browse tables, CRUD rows with a modern UI, filter by any field, and run raw SQL for advanced
filtering + updates.

Built with **Next.js (App Router) + Tailwind v4 + @libsql/client + lucide-react**.

## Features

- 🔐 **Password protected** — `ADMIN_PASSWORD` in `.env`, signed httpOnly session cookie (7 days), proxy-guarded pages + APIs
- 🔌 **External DB via env** — `DATABASE_URL` supports `file:./data/app.db`, `libsql://…` (Turso), `https://…`, plus `DATABASE_AUTH_TOKEN`
- 📊 **Overview** — table/view counts, total rows, DB size, SQLite version, per-table cards
- 🗂 **Tables** — create (visual builder or raw `CREATE TABLE`), rename, truncate, drop
- 🧬 **Structure** — columns, PK/NN/defaults, indexes, foreign keys, `CREATE` SQL, add/drop column
- 📝 **Data grid** — pagination, sort, global text search, **field filters built from the table's columns** (`= ≠ > ≥ < ≤ contains starts/in/null…`), row select, add/edit modal, single + bulk delete, CSV export
- 🔁 **Update two ways** — edit via UI modals, bulk-update all filter matches, or run `UPDATE/DELETE` in SQL
- ⚡ **SQL console** — run any `SELECT / INSERT / UPDATE / DELETE` (multi-statement too), formatter, history, snippets, timing, copy JSON / export CSV, `Ctrl+Enter` to run, “view filter as SQL” bridge

## Quick start

```bash
npm install
cp .env.example .env   # then edit ADMIN_PASSWORD / DATABASE_URL
npm run seed            # optional demo data (users, posts, products)
npm run dev             # http://localhost:3000 → redirects to /login
```

Build / production:

```bash
npm run build
npm start
```

## Environment

| Var | Required | Example |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./data/app.db` or `libsql://mydb-org.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso/remote | `eyJhbGciOi…` |
| `ADMIN_PASSWORD` | ✅ | strong password for `/login` |
| `AUTH_SECRET` | ✅ | long random string signing the session cookie |

## API (all require the session cookie)

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` `{password}` | create session |
| `POST` | `/api/auth/logout` | clear session |
| `GET` | `/api/auth/me` | session + masked db info |
| `GET` | `/api/overview` | stats + tables + row counts |
| `GET/POST` | `/api/tables` | list / create (`{name, columns}` or `{sql}`) |
| `GET/PATCH/DELETE` | `/api/tables/[name]` | schema / rename+truncate / drop |
| `GET/POST/PATCH/DELETE` | `/api/tables/[name]/rows` | paged+filtered read / insert / update (rowid, pk, or filters) / delete |
| `POST/DELETE` | `/api/tables/[name]/columns` | add / drop column |
| `POST` | `/api/query` `{sql}` | raw SQL (select grid or rows-affected) |

Row listing supports `?page=&pageSize=&sortBy=&sortDir=&filters=[{column,op,value}]&search=`.

## Notes

- Identifier (table/column) names are validated (`[A-Za-z_][A-Za-z0-9_]*`) and quoted; values are always parameterized.
- Bulk update/delete require ≥1 filter as a safety rail — use raw SQL for unconditional writes.
- Local `file:` databases auto-create their folder; the file itself is git-ignored (`*.db*`, `*.sqlite*`).
- Turso: set `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN=…` and restart — no code changes needed.

## Deploy / publish checklist

1. `cp .env.example .env` and set real values — **never commit `.env`** (it's git-ignored; only `.env.example` is tracked).
2. Required env vars on the host: `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET` (+ `DATABASE_AUTH_TOKEN` for Turso/remote).
3. `npm ci && npm run build && npm start` (or `npm run dev` locally).
4. Optional demo data (local file DBs): `npm run seed`.
5. Vercel: import the repo, add the env vars above, deploy — no extra config needed. Note: `file:` databases are ephemeral on serverless; use Turso (`libsql://…`) for persistence.

## Project structure

```
src/
  proxy.ts                 auth gate (edge) — redirects to /login, 401s APIs
  lib/db.ts                libSQL client (file: / Turso / remote via env)
  lib/auth.ts              password check + signed session (node)
  lib/session-edge.ts      session verify for the edge proxy
  lib/sql.ts               identifier validation + filter → WHERE builder
  lib/api.ts               frontend fetch helpers + text/format utils
  app/login/               unlock screen
  app/api/                 auth / overview / tables / rows / columns / query
  components/Dashboard.tsx shell: drawer nav, mobile dock, overview, modals
  components/DataExplorer.tsx grid, filters, row view/edit, bulk ops, line-copy
  components/SqlConsole.tsx  raw SQL runner
  components/StructurePanel.tsx schema, columns, danger zone
scripts/seed.mjs           idempotent demo data (users, posts, products, leads)
data/                      local sqlite files (git-ignored)
```
