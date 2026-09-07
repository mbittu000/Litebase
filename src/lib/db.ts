import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

let _client: Client | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env — e.g. file:./data/app.db or libsql://... for Turso."
    );
  }
  return url;
}

export function getDbInfo() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  const hasToken = Boolean(process.env.DATABASE_AUTH_TOKEN?.trim());
  let kind: "local" | "turso" | "remote" = "local";
  if (url.startsWith("libsql://") || url.includes("turso.io")) kind = "turso";
  else if (url.startsWith("http://") || url.startsWith("https://"))
    kind = "remote";
  // mask url for UI (hide credentials)
  const masked = url.length > 48 ? url.slice(0, 48) + "…" : url;
  return { url: masked, kind, hasToken };
}

export function getDb(): Client {
  if (_client) return _client;
  const url = getDatabaseUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;

  // ensure local directory exists for file: urls
  if (url.startsWith("file:")) {
    const filePart = url.replace(/^file:/, "").split("?")[0];
    const resolved = path.isAbsolute(filePart)
      ? filePart
      : path.join(/*turbopackIgnore: true*/ process.cwd(), filePart);
    const dir = path.dirname(resolved);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }

  _client = createClient({ url, authToken });
  return _client;
}
