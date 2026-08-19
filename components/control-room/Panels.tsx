"use client";

// THE CONTROL ROOM'S FURNITURE.
//
// Small, dull, shared. The whole point of putting these here is that every
// panel on the page has the same rules: one label, one readout, quiet
// borders, a door out to whoever owns the number. A dashboard drifts when
// each card invents its own weight.

import Link from "next/link";
import type { ReactNode } from "react";
import type { Point } from "@/lib/control-room/read";

// ── THE COLOUR LAW, EXTENDED TO DOMAINS ────────────────────────────────
//
// The suite already has a law and V2 does not get to bend it:
//
//   violet = a Scenario, always. Nothing that is true gets to be violet.
//   cyan   = Reality, now, the thing we actually believe.
//   amber  = a target, or something obstructing one.
//   mint   = capability we have accepted.
//   red    = a signal raised against the project.
//
// A DOMAIN accent is therefore not a free choice of hue — it is the one
// colour that law already assigns to what the domain is about. Reality is
// about signals, so it is red. Choices are about gates, so they are amber.
// Capacity is about people we have, so it is mint. Outcome is the forecast,
// so it is cyan under Reality and violet the moment a Scenario is running —
// the ONLY card that changes colour, because it is the only one whose
// number a Scenario changes.
//
// Time is deliberately NOT given a hue. It is the frame the other four are
// read inside, not a fifth domain, and a colour would make it argue for
// attention it should never ask for.
export type Domain = "reality" | "choices" | "capacity" | "outcome" | "time";

export const DOMAIN_ACCENT: Record<Domain, string> = {
  reality: "var(--i-red)",
  choices: "var(--i-amber)",
  capacity: "var(--i-mint)",
  outcome: "var(--i-signal)",
  time: "var(--i-text-faint)",
};

export function Panel({
  title,
  href,
  action,
  children,
  shoot,
  className = "",
  accent,
  note,
}: {
  title: string;
  href?: string;
  action?: string;
  children: ReactNode;
  shoot?: string;
  className?: string;
  /** A domain hairline down the left edge, when the panel belongs to one. */
  accent?: string;
  /** A fact the panel's header states about itself — never a grade. */
  note?: string | null;
}) {
  return (
    <section
      data-shoot={shoot}
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-lg ${className}`}
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[2px]"
          style={{ background: accent, opacity: 0.55 }}
        />
      )}
      <header className="flex shrink-0 items-baseline justify-between gap-3 px-3.5 pt-3 pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="i-label shrink-0" style={{ color: "var(--i-text-soft)" }}>
            {title}
          </h2>
          {note && (
            <span className="truncate text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
              {note}
            </span>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-[11px] transition-colors hover:underline"
            style={{ color: "var(--i-signal)" }}
          >
            {action ?? "Open"} →
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-3.5 pb-3.5">{children}</div>
    </section>
  );
}

/** One of the five.
 *
 *  ANATOMY, and why it is this way round:
 *
 *    LEAD      one sentence with the dominant number inside it. A person
 *              reads "2 decisions are holding the date" in one glance;
 *              nobody reads "gating: 2" in one glance.
 *    READOUT   the exact model truth, in the model's own units, so the
 *              sentence above can be checked rather than trusted.
 *    FOOTNOTE  provenance, or the caveat that stops a misreading.
 *    SPARK     drawn only where real recorded history exists.
 *
 *  The sentence is a rendering of the readout, never a softening of it: if
 *  the two could ever disagree, the sentence is wrong.
 */
export function SummaryCard({
  index,
  domain,
  title,
  leadValue,
  leadRest,
  leadTone,
  readout,
  footnote,
  spark,
  href,
  shoot,
}: {
  index: number;
  domain: Domain;
  title: string;
  leadValue: string;
  leadRest: string;
  /** Overrides the domain accent for the number itself — used where the
      honest reading is "nothing is wrong" and red would lie. */
  leadTone?: string;
  readout: string;
  footnote?: string | null;
  spark?: { points: Point[]; label: string } | null;
  href: string;
  shoot: string;
}) {
  const accent = DOMAIN_ACCENT[domain];
  return (
    <Link
      href={href}
      data-shoot={shoot}
      data-domain={domain}
      className="group relative flex flex-col overflow-hidden rounded-lg px-3.5 py-3 transition-colors hover:bg-[var(--i-panel-raised)]"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ background: accent, opacity: 0.55 }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="i-readout shrink-0 text-[9px]" style={{ color: "var(--i-text-faint)" }}>
            {index}
          </span>
          <span className="i-label truncate" style={{ color: "var(--i-text-soft)" }}>
            {title}
          </span>
        </div>
        {spark && spark.points.length > 0 && (
          <Spark points={spark.points} colour={accent} title={spark.label} shoot={`${shoot}-spark`} />
        )}
      </div>

      <p className="pt-2 text-[13px] leading-[1.25]" style={{ color: "var(--i-text-soft)" }}>
        <span
          data-shoot={`${shoot}-primary`}
          className="i-readout pr-1.5 text-[24px] leading-none"
          style={{ color: leadTone ?? accent }}
        >
          {leadValue}
        </span>
        {leadRest}
      </p>

      <p
        data-shoot={`${shoot}-readout`}
        className="i-readout pt-2 text-[10.5px] leading-snug"
        style={{ color: "var(--i-text)" }}
      >
        {readout}
      </p>

      {footnote && (
        <p className="pt-1 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
          {footnote}
        </p>
      )}
    </Link>
  );
}

/** A tiny line of REAL recorded points. Never a trend drawn from one value:
    a single point is a dot, and it stays a dot, because two dots would be a
    claim about a direction nobody measured. */
export function Spark({
  points,
  colour,
  title,
  shoot,
  w = 52,
  h = 14,
}: {
  points: Point[];
  colour: string;
  title: string;
  shoot?: string;
  w?: number;
  h?: number;
}) {
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  // Inset by the dot radius on every side, so the line is CLIPPED BY ITS OWN
  // BOX rather than escaping the card. A stroke that leaves its frame reads
  // as a graphic accident, not as data.
  const PAD = 2;
  const x = (idx: number) => (points.length === 1 ? w / 2 : (idx / (points.length - 1)) * (w - PAD * 2) + PAD);
  const y = (v: number) => h - PAD - ((v - lo) / span) * (h - PAD * 2);

  return (
    <svg
      data-shoot={shoot}
      data-points={points.length}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-hidden"
      aria-hidden
    >
      <title>{title}</title>
      {/* A baseline, so a short series reads as a PLOT rather than as a
          stray hairline across the card. It is a frame, not a zero: the
          scale is the series' own min-to-max and never claims otherwise. */}
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--i-border)" strokeWidth={1} />
      {points.length === 1 ? (
        <circle cx={w / 2} cy={h / 2} r={1.8} fill={colour} opacity={0.7} />
      ) : (
        <>
          <polyline
            points={points.map((p, idx) => `${x(idx)},${y(p.value)}`).join(" ")}
            fill="none"
            stroke={colour}
            strokeWidth={1}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.5}
          />
          <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={1.5} fill={colour} opacity={0.9} />
        </>
      )}
    </svg>
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
    <Link href={href} className="block rounded hover:bg-[var(--i-panel-raised)]">
      {body}
    </Link>
  ) : (
    body
  );
}
