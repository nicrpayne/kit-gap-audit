"use client";

// THE MODULE WINDOW -- the suite's structural unit, generalised from what
// already works in Portfolio's bay.
//
// Portfolio taught the rule the whole suite now follows: a surface's physics
// declare what it is. Raised = you can operate it. Recessed = it is telling
// you something. A Panel is the third thing: a WINDOW onto one job, with a
// title bar you can act from and a body that can be any of the above. It is
// deliberately not "a card" -- it has a hairline title rule, no rounded
// pillow, no drop shadow stack, and it can be promoted to fill the workspace.

import type { ReactNode } from "react";
import Link from "@/components/instrument/SignalLink";

export function Panel({
  title,
  subtitle,
  accent,
  actions,
  href,
  hrefLabel,
  children,
  bodyClass = "",
  dense,
  dataShoot,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  actions?: ReactNode;
  /** The instrument that OWNS this panel's subject. Panels never edit what
      they don't own -- they show, and hand you off. */
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  bodyClass?: string;
  dense?: boolean;
  dataShoot?: string;
}) {
  return (
    <section
      data-shoot={dataShoot}
      className="flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)", borderRadius: 8 }}
    >
      <header
        className="shrink-0 flex items-center gap-2 px-3"
        style={{ height: 34, borderBottom: "1px solid var(--i-border)" }}
      >
        {accent && <span aria-hidden className="h-2.5 w-[2px] rounded-full" style={{ background: accent }} />}
        <h2 className="i-label" style={{ color: "var(--i-text-soft)" }}>
          {title}
        </h2>
        {subtitle && <span className="text-[10px] text-[var(--i-text-faint)] truncate">{subtitle}</span>}
        <div className="flex-1" />
        {actions}
        {href && (
          <Link
            href={href}
            className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] whitespace-nowrap transition-colors"
          >
            {hrefLabel ?? "Open"} →
          </Link>
        )}
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${dense ? "p-2.5" : "p-3.5"} ${bodyClass}`}>{children}</div>
    </section>
  );
}

// Epistemic status. The intelligence surface exists because the machine is
// not equally sure of everything, so how it knows a thing is a first-class
// property, in human words rather than schema words.
export type Epistemic = "observed" | "cross-source" | "inferred" | "needs-clarification" | "accepted";

const EPISTEMIC: Record<Epistemic, { label: string; tone: string; help: string }> = {
  observed: { label: "Seen in a source", tone: "var(--i-text-soft)", help: "Stated directly in something we read." },
  "cross-source": {
    label: "Two sources agree",
    tone: "var(--i-mint)",
    help: "The same thing showed up in more than one place.",
  },
  inferred: {
    label: "Inferred",
    tone: "var(--i-violet)",
    help: "Nobody said this — we concluded it from what was said.",
  },
  "needs-clarification": {
    label: "Needs a human",
    tone: "var(--i-amber)",
    help: "We can't settle this from the sources we have.",
  },
  accepted: { label: "Accepted as real", tone: "var(--i-mint)", help: "Promoted into Reality; the model uses it." },
};

export function EpistemicBadge({ kind }: { kind: Epistemic }) {
  const e = EPISTEMIC[kind];
  return (
    <span
      title={e.help}
      className="shrink-0 rounded-sm px-1.5 py-[2px] text-[9px] uppercase tracking-[0.09em] font-semibold whitespace-nowrap"
      style={{ color: e.tone, background: "color-mix(in srgb, currentColor 12%, transparent)" }}
    >
      {e.label}
    </span>
  );
}

// Marks an interaction the engine cannot honour yet. Non-negotiable on any
// control whose semantics are designed but not backed -- the alternative is
// a demo that quietly lies about what the product does.
export function Prototype({ note, inline }: { note?: string; inline?: boolean }) {
  return (
    <span
      title={note ?? "Designed, not yet wired to the engine. Nothing here changes the model."}
      className={`${inline ? "" : "shrink-0 "}rounded-sm px-1.5 py-[2px] text-[9px] uppercase tracking-[0.09em] font-semibold whitespace-nowrap`}
      style={{
        color: "var(--i-text-faint)",
        border: "1px dashed var(--i-border-strong)",
      }}
    >
      Prototype
    </span>
  );
}

// A value that this instrument does NOT own, shown so you don't have to go
// and look, with the route that does own it. The suite's anti-duplication
// device: read here, change there.
export function InheritedValue({
  label,
  value,
  href,
  hrefLabel,
}: {
  label: string;
  value: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="i-label">{label}</span>
      <span className="i-readout text-[13px] text-[var(--i-text)]">{value}</span>
      <Link
        href={href}
        className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] whitespace-nowrap transition-colors"
      >
        {hrefLabel} →
      </Link>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  sub,
  size = 22,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
  size?: number;
}) {
  return (
    <div className="min-w-0">
      <div className="i-label">{label}</div>
      <div
        className="i-readout mt-1.5 leading-none truncate"
        style={{ fontSize: size, color: tone ?? "var(--i-text)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-tight">{sub}</div>}
    </div>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  const tone =
    severity === "high" ? "var(--i-red)" : severity === "medium" ? "var(--i-amber)" : "var(--i-text-faint)";
  return <span aria-hidden className="shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: tone }} />;
}
