"use client";

// The summoned specialist tool — the advanced panel of a premium plug-in,
// not a SaaS drawer. One chrome for every tool (Forecast detail, Gate,
// Target, Context) so summoning depth always feels like the same physical
// action: quick, mechanical, no theatre. Tools snap open in ~190ms;
// instrument STATE settles slowly. Two tempos, on purpose.
//
// Escape closes. The backdrop closes. The canvas stays visible behind a
// light dim, because the tool explains the object — hiding the object while
// explaining it would be absurd.

import { useEffect } from "react";

export default function ToolWindow({
  open,
  onClose,
  title,
  subtitle,
  width = 420,
  rail,
  footer,
  hero,
  docked,
  children,
  dataShoot,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  /** Bottom mode rail — the plug-in page switcher. */
  rail?: React.ReactNode;
  /** Pinned actions between the scroll body and the rail. */
  footer?: React.ReactNode;
  /** Docked only: a fixed block under the header that every mode shares —
      the module's identity and its display, which should not scroll away
      while you page through what the model knows about it. */
  hero?: React.ReactNode;
  /** Docked: a flush right panel integrated into the instrument, no backdrop
      dim — the Scope Composer's detail panel. Default stays the summoned
      floating window every other instrument uses. */
  docked?: boolean;
  children: React.ReactNode;
  dataShoot?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (docked)
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        data-shoot={dataShoot}
        className="i-toolin fixed right-0 z-40 flex flex-col overflow-hidden"
        style={{
          top: 45,
          bottom: 0,
          width,
          maxWidth: "92vw",
          background: "var(--i-panel)",
          borderLeft: "1px solid var(--i-border-strong)",
          boxShadow: "-28px 0 70px rgba(0,0,0,0.5)",
        }}
      >
        <div className="shrink-0 flex items-start justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="min-w-0">
            <div className="i-label">{title}</div>
            {subtitle && <div className="mt-0.5 text-[14px] font-medium text-[var(--i-text)] truncate">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            data-shoot="tool-close"
            className="ml-3 h-7 w-7 shrink-0 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
          >
            ✕
          </button>
        </div>
        {hero && <div className="shrink-0">{hero}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="shrink-0" style={{ borderTop: "1px solid var(--i-border)" }}>
            {footer}
          </div>
        )}
        {rail && (
          <div
            className="shrink-0 flex items-center justify-between px-1.5 py-2"
            style={{ borderTop: "1px solid var(--i-border)", background: "var(--i-panel)" }}
          >
            {rail}
          </div>
        )}
      </div>
    );

  return (
    <div
      className="i-backdropin fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: "rgba(6,8,10,0.45)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-shoot={dataShoot}
        onClick={(e) => e.stopPropagation()}
        className="i-toolin my-3 mr-3 flex flex-col rounded-lg overflow-hidden"
        style={{
          width,
          maxWidth: "95vw",
          background: "var(--i-panel)",
          border: "1px solid var(--i-border-strong)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className="shrink-0 flex items-start justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--i-border)" }}
        >
          <div className="min-w-0">
            <div className="i-label">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-[var(--i-text)] truncate">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            data-shoot="tool-close"
            className="ml-3 h-7 w-7 shrink-0 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
            style={{ border: "1px solid transparent" }}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="shrink-0" style={{ borderTop: "1px solid var(--i-border)" }}>
            {footer}
          </div>
        )}

        {rail && (
          <div
            className="shrink-0 flex items-center justify-center gap-1 px-3 py-2"
            style={{ borderTop: "1px solid var(--i-border)", background: "var(--i-panel)" }}
          >
            {rail}
          </div>
        )}
      </div>
    </div>
  );
}

/** One page button on the mode rail. */
export function RailButton({
  label,
  active,
  onClick,
  dataShoot,
  compact,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dataShoot?: string;
  /** Five modes have to fit a docked panel's width without clipping. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-shoot={dataShoot}
      aria-pressed={active}
      className={`rounded py-1.5 font-semibold uppercase transition-colors ${
        compact ? "px-1.5 text-[9px] tracking-[0.07em]" : "px-2.5 text-[10px] tracking-[0.12em]"
      }`}
      style={{
        color: active ? "var(--i-text)" : "var(--i-text-faint)",
        background: active ? "var(--i-panel-raised)" : "transparent",
        borderBottom: `2px solid ${active ? "var(--i-violet)" : "transparent"}`,
      }}
    >
      {label}
    </button>
  );
}

/** Shared key→value row. The note gets the full row width — long labels
    (a gate's whole sentence) must never squeeze it into a sliver. */
export function Row({ k, v, note, tone, changed }: { k: string; v: string; note?: string; tone?: string; changed?: boolean }) {
  return (
    <div className="py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="i-label min-w-0 flex items-baseline gap-1.5">
          <span>{k}</span>
          {changed && (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide normal-case"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              scenario
            </span>
          )}
        </span>
        <span className="i-readout shrink-0 text-right text-[12.5px]" style={{ color: tone ?? "var(--i-text)" }}>
          {v}
        </span>
      </div>
      {note && <div className="mt-0.5 text-right text-[10px] text-[var(--i-text-faint)]">{note}</div>}
    </div>
  );
}
