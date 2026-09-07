import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function guard(): Promise<NextResponse | null> {
  const ok = await requireAuth();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export function err(message: unknown, status = 400) {
  const msg = message instanceof Error ? message.message : String(message);
  return NextResponse.json({ error: msg }, { status });
}
