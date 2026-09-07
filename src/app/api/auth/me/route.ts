import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDbInfo } from "@/lib/db";

export async function GET() {
  const ok = await requireAuth();
  if (!ok) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, db: getDbInfo() });
}
