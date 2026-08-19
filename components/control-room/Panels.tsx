"use client";

// THE CONTROL ROOM'S FURNITURE.
//
// Small, dull, shared. The whole point of putting these here is that every
// panel on the page has the same rules: one label, one readout, quiet
// borders, a door out to whoever owns the number. A dashboard drifts when
// each card invents its own weight.

import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  title,
  href,
  action,
  children,
  shoot,
  className = "",
}: {
  title: string;
  href?: string;
  action?: string;
  children: ReactNode;
  shoot?: string;
  className?: string;
}) {
  return (
    <section
      data-shoot={shoot}
      className={`flex min-h-0 flex-col rounded-lg ${className}`}
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3 px-3.5 pt-3 pb-2">
        <h2 className="i-label" style={{ color: "var(--i-text-soft)" }}>
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-[11px] transition-colors hover:underline" style={{ color: "var(--i-signal)" }}>
            {action ?? "Open"} →
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">{children}</div>
    </section>
  );
}

/** One of the five. A number you can read at a glance and a second one that
    stops the first from being misread on its own. */
export function SummaryCard({
  index,
  title,
  question,
  primary,
  primaryUnit,
  primaryTone = "text",
  secondary,
  footnote,
  href,
  shoot,
}: {
  index: number;
  title: string;
  question: string;
  primary: string;
  primaryUnit?: string;
  primaryTone?: "text" | "mint" | "amber" | "signal" | "violet" | "red";
  secondary: { value: string; label: string }[];
  footnote?: string | null;
  href: string;
  shoot: string;
}) {
  const tone =
    primaryTone === "text" ? "var(--i-text)" : `var(--i-${primaryTone})`;
  return (
    <Link
      href={href}
      data-shoot={shoot}
      className="group flex flex-col rounded-lg px-3.5 py-3 transition-colors"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold"
          style={{ background: "var(--i-panel-raised)", color: "var(--i-text-faint)" }}
        >
          {index}
        </span>
        <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
          {title}
        </span>
      </div>
      <p className="pt-0.5 text-[11px] leading-tight" style={{ color: "var(--i-text-faint)" }}>
        {question}
      </p>
      <div className="flex items-baseline gap-1.5 pt-2.5">
        <span data-shoot={`${shoot}-primary`} className="i-readout text-[26px] leading-none" style={{ color: tone }}>
          {primary}
        </span>
        {primaryUnit && (
          <span className="text-[12px]" style={{ color: "var(--i-text-faint)" }}>
            {primaryUnit}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-2">
        {secondary.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className="i-readout text-[13px]" style={{ color: "var(--i-text)" }}>
              {s.value}
            </span>
            <span className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {footnote && (
        <p className="pt-2 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
          {footnote}
        </p>
      )}
    </Link>
  );
}

/** A row in a list panel. Quantity right-aligned, because the eye scans a
    column of numbers and not a column of sentences. */
export function Row({
  title,
  detail,
  quantity,
  tone = "soft",
  href,
  shoot,
  dashed,
}: {
  title: string;
  detail?: string | null;
  quantity?: string | null;
  tone?: "soft" | "amber" | "mint" | "signal" | "faint";
  href?: string;
  shoot?: string;
  /** A claim nobody has accepted. Drawn as not-yet-real, never solid. */
  dashed?: boolean;
}) {
  const body = (
    <div
      data-shoot={shoot}
      data-candidate={dashed ? "true" : "false"}
      className="flex items-start justify-between gap-3 rounded px-2 py-1.5 transition-colors"
      style={
        dashed
          ? { border: "1px dashed var(--i-border-strong)", background: "transparent" }
          : { border: "1px solid transparent" }
      }
    >
      <div className="min-w-0">
        <div className="truncate text-[12px]" style={{ color: "var(--i-text)" }}>
          {title}
        </div>
        {detail ? (
          <div className="pt-0.5 text-[11px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
            {detail}
          </div>
        ) : null}
      </div>
      {quantity && (
        <span
          className="i-readout shrink-0 whitespace-nowrap text-[11px]"
          style={{ color: tone === "soft" ? "var(--i-text-soft)" : `var(--i-${tone})` }}
        >
          {quantity}
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-[var(--i-panel-raised)] rounded">
      {body}
    </Link>
  ) : (
    body
  );
}
