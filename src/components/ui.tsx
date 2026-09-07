"use client";

import React from "react";
import { Loader2, X } from "lucide-react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("glass rounded-2xl", className)}>{children}</div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled,
  className,
  title,
  type,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? "grad-btn text-white border-transparent"
      : variant === "danger"
        ? "bg-red-500/15 text-red-200 border-red-400/25 hover:bg-red-500/25"
        : variant === "soft"
          ? "bg-white/[0.07] text-white border-white/10 hover:bg-white/[0.12]"
          : "text-white/70 border-white/10 hover:text-white hover:bg-white/[0.07]";
  return (
    <button
      type={type ?? "button"}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-white placeholder:text-white/30 transition-all";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin", className)} size={16} />;
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "violet" | "cyan" | "green" | "amber" | "red" | "pink";
}) {
  const map: Record<string, string> = {
    gray: "bg-white/[0.07] text-white/70 border-white/10",
    violet: "bg-violet-500/15 text-violet-200 border-violet-400/25",
    cyan: "bg-cyan-500/15 text-cyan-200 border-cyan-400/25",
    green: "bg-emerald-500/15 text-emerald-200 border-emerald-400/25",
    amber: "bg-amber-500/15 text-amber-200 border-amber-400/25",
    red: "bg-red-500/15 text-red-200 border-red-400/25",
    pink: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "glass-deep rise w-full rounded-2xl p-5 shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-white/50">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
      <p className="text-sm font-semibold text-white/80">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-white/45">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={message}>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={onConfirm} disabled={busy}>
          {busy && <Spinner />}
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}
