export const SESSION_COOKIE_NAME = "litebase_session";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncodeBytes(new Uint8Array(sig));
}

/**
 * Edge-safe session verification (no node: imports).
 * Token format: <b64url(payload)>.<b64url(hmac-sha256(data, secret))>
 */
export async function verifySessionEdge(
  token: string | undefined | null,
  secret: string
): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return false;
    const expected = await hmacHex(data, secret);
    if (sig.length !== expected.length) return false;
    // constant-time-ish compare
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return false;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(data))
    ) as { exp?: number };
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}
