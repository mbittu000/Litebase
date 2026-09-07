/**
 * Seed the local SQLite file with demo tables.
 * Usage: npm run seed
 * Respects DATABASE_URL / DATABASE_AUTH_TOKEN from .env
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL || "file:./data/app.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

if (url.startsWith("file:")) {
  const part = url.replace(/^file:/, "").split("?")[0];
  fs.mkdirSync(path.dirname(path.join(process.cwd(), part)), { recursive: true });
}

const db = createClient({ url, authToken });

const stmts = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user',
    age INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT,
    status TEXT DEFAULT 'draft',
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    status TEXT DEFAULT 'new',
    pitch TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

for (const s of stmts) await db.execute(s);

const { rows } = await db.execute("SELECT COUNT(*) AS c FROM users");
if (Number(rows[0].c) === 0) {
  await db.batch([
    { sql: `INSERT INTO users (name, email, role, age) VALUES ('Aarav Sharma','aarav@example.com','admin',29)`, args: [] },
    { sql: `INSERT INTO users (name, email, role, age) VALUES ('Mira Patel','mira@example.com','editor',26)`, args: [] },
    { sql: `INSERT INTO users (name, email, role, age) VALUES ('Kabir Singh','kabir@example.com','user',31)`, args: [] },
    { sql: `INSERT INTO users (name, email, role, age) VALUES ('Anaya Rao','anaya@example.com','user',24)`, args: [] },
    { sql: `INSERT INTO posts (user_id, title, body, status, views) VALUES (1,'Hello Turso','First post from Litebase studio.','published',128)`, args: [] },
    { sql: `INSERT INTO posts (user_id, title, body, status, views) VALUES (2,'Filtering 101','Try the field filters or raw SQL.','published',86)`, args: [] },
    { sql: `INSERT INTO posts (user_id, title, body, status, views) VALUES (3,'Draft ideas','Work in progress…','draft',4)`, args: [] },
    { sql: `INSERT INTO products (sku, name, price, stock) VALUES ('SKU-001','Aurora Keyboard',79.99,42)`, args: [] },
    { sql: `INSERT INTO products (sku, name, price, stock) VALUES ('SKU-002','Nebula Mouse',39.5,120)`, args: [] },
    { sql: `INSERT INTO products (sku, name, price, stock) VALUES ('SKU-003','Quasar Monitor',299.0,15)`, args: [] },
  ]);
  console.log("Seeded demo data ✔");
} else {
  console.log("users table already has data — skipping seed.");
}

// leads table is ensured on every run (safe to re-run)
const leadCount = await db.execute("SELECT COUNT(*) AS c FROM leads");
if (Number(leadCount.rows[0].c) === 0) {
  const samplePitch = [
    "Hi Rohan — noticed Acme is hiring 5 SDRs this quarter.",
    "",
    "Most teams at your stage lose ~12 hrs/week to manual follow-ups.",
    "We helped two similar D2C brands automate that and lift replies by 34% in 30 days.",
    "",
    "Worth a 15-min call Thursday? If not, reply NO and I'll close the loop.",
    "",
    "— Aarav",
  ].join("\n");
  await db.execute(
    `INSERT INTO leads (name, email, phone, company, status, pitch) VALUES (?, ?, ?, ?, ?, ?)`,
    ["Rohan Mehta", "rohan@acme.co", "+91-98200-12345", "Acme Inc", "new", samplePitch]
  );
  console.log("Seeded sample lead with pitch ✔");
} else {
  console.log("leads table already has data — skipping.");
}
