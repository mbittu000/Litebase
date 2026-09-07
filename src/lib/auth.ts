import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "litebase_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "dev-secret-change-me-please"
  );
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || "";
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf as string)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signSession(): string {
  const secret = getAuthSecret();
  const payload = JSON.stringify({
    v: 1,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  const data = b64urlEncode(payload);
  const sig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${data}.${sig}`;
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token || !token.includes(".")) return false;
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return false;
    const secret = getAuthSecret();
    const expected = crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(b64urlDecode(data).toString("utf8")) as {
      exp?: number;
    };
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function passwordsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // still do a dummy compare to keep timing similar
    const dummy = crypto.timingSafeEqual(
      crypto.createHash("sha256").update(a).digest(),
      crypto.createHash("sha256").update(b).digest()
    );
    void dummy;
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export async function requireAuth(): Promise<boolean> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
