"use client";

import { useState } from "react";
import { Database, Lock, Sparkles } from "lucide-react";
import { Btn, Spinner } from "@/components/ui";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read from the form itself so browser autofill works even if
    // it never fired a React onChange event.
    const form = e.currentTarget;
    const raw =
      new FormData(form).get("password") ?? password;
    const pw = String(raw ?? "");
    if (!pw) {
      setError("Enter your password first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Login failed");
      // Hard navigation so the freshly-set httpOnly cookie is
      // guaranteed to be sent on the next page load.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="rise w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grad-btn flex h-11 w-11 items-center justify-center rounded-2xl">
            <Database size={20} className="text-white" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight">
              Lite<span className="grad-text">base</span>
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
              SQLite · Turso Studio
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="glass rounded-3xl p-7 shadow-[0_30px_80px_-20px_rgba(139,92,246,0.35)]"
        >
          <div className="mb-5 flex items-center gap-2">
            <Sparkles size={15} className="text-fuchsia-300" />
            <h1 className="text-[15px] font-bold">Unlock your database studio</h1>
          </div>
          <p className="mb-5 text-[13px] leading-relaxed text-white/55">
            This studio is password protected. Enter the{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-fuchsia-200">
              ADMIN_PASSWORD
            </code>{" "}
            from your environment to continue.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Password
            </span>
            <div className="relative">
              <Lock
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                type="password"
                name="password"
                autoFocus
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="••••••••••"
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/25"
              />
            </div>
          </label>

          {error && (
            <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
              {error}
            </p>
          )}

          <Btn variant="primary" type="submit" disabled={busy} className="mt-5 w-full justify-center py-2.5">
            {busy && <Spinner />}
            {busy ? "Unlocking…" : "Unlock studio"}
          </Btn>

          <p className="mt-4 text-center text-[11px] text-white/35">
            Sessions last 7 days · stored in a signed httpOnly cookie
          </p>
        </form>
      </div>
    </div>
  );
}
