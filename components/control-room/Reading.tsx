"use client";

// THE READING.
//
// V2 answered the five questions with five cards of equal weight. That was
// the enterprise-dashboard failure mode: everything the same size means
// nothing is more important than anything else, and the eye has nowhere to
// start.
//
// V3 demotes them to a READING STRIP — a single instrument bar above the
// field, the way a mixer's meters sit above the desk. Each reading is one
// sentence with its dominant number inside it, plus the exact model truth
// underneath. Same content, same provenance, a tenth of the visual claim,
// because the FIELD is now the thing you are supposed to look at.
//
// COLOUR IS THE SUITE'S LAW, unchanged:
//   cyan   Reality, now, what we currently believe
//   violet a hypothetical, and ONLY a hypothetical
//   amber  a target, or something obstructing one
//   mint   capability we have accepted
//   red    a signal raised against the project
//
// A domain's accent is therefore not a free choice of hue — it is the
// colour the law already assigns to what the domain is about. Reality is
// cyan because it is "what is true now"; its number turns red only when
// something is actually blocking, so red keeps meaning "wrong" instead of
// becoming the permanent identity of a panel.

import Link from "next/link";
import type { Point } from "@/lib/control-room/read";
import { Spark } from "@/components/control-room/Panels";

export type Domain = "reality" | "choices" | "capacity" | "outcome" | "time";

export const DOMAIN_ACCENT: Record<Domain, string> = {
  reality: "var(--i-signal)",
  choices: "var(--i-amber)",
  capacity: "var(--i-mint)",
  outcome: "var(--i-signal)",
  time: "var(--i-text-faint)",
};

export function ReadingStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-shoot="cr-reading"
      className="flex shrink-0 items-stretch overflow-hidden rounded-lg"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      {children}
    </div>
  );
}

export function Reading({
  domain,
  label,
  leadValue,
  leadRest,
  leadTone,
  readout,
  spark,
  href,
  shoot,
}: {
  domain: Domain;
  label: string;
  leadValue: string;
  leadRest: string;
  /** Overrides the domain accent for the number itself — used where the
      honest reading is "nothing is wrong" and the alarm colour would lie. */
  leadTone?: string;
  readout: string;
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
      className="group relative min-w-0 flex-1 px-3.5 py-2.5 transition-colors hover:bg-[var(--i-panel-raised)]"
      style={{ borderLeft: "1px solid var(--i-border)" }}
    >
      <span aria-hidden className="absolute left-0 top-0 h-full w-[2px]" style={{ background: accent, opacity: 0.5 }} />
      <div className="flex items-center justify-between gap-2">
        <span className="i-label truncate" style={{ color: "var(--i-text-faint)", fontSize: 9 }}>
          {label}
        </span>
        {spark && spark.points.length > 0 && (
          <Spark points={spark.points} colour={accent} title={spark.label} shoot={`${shoot}-spark`} w={40} h={11} />
        )}
      </div>
      <p className="truncate pt-1 text-[11.5px] leading-tight" style={{ color: "var(--i-text-soft)" }}>
        <span
          data-shoot={`${shoot}-primary`}
          className="i-readout pr-1 text-[17px] leading-none"
          style={{ color: leadTone ?? accent }}
        >
          {leadValue}
        </span>
        {leadRest}
      </p>
      <p
        data-shoot={`${shoot}-readout`}
        className="i-readout truncate pt-1 text-[10px]"
        style={{ color: "var(--i-text-faint)" }}
      >
        {readout}
      </p>
    </Link>
  );
}
