"use client";

// THE FOOT OF THE ROOM.
//
// The approved layout ends on a thin status bar. Every cell on it is a
// stored timestamp or a count — the mockup's "All Systems Operational" is
// replaced by the OLDEST READING on the page, stated as a fact, because
// the product has no health model and grading a feed needs a threshold
// nobody set.

import Link from "@/components/instrument/SignalLink";

export default function StatusBar({
  cells,
}: {
  cells: { id: string; label: string; value: string; tone?: string; href?: string }[];
}) {
  return (
    <div
      data-shoot="cr-statusbar"
      className="flex shrink-0 items-center gap-6 px-3 py-1.5"
      style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
    >
      {cells.map((c) => {
        const body = (
          <span className="flex items-center gap-1.5" data-shoot={`cr-status-${c.id}`}>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: c.tone ?? "var(--i-text-faint)" }}
            />
            <span className="text-[9px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--i-text-faint)" }}>
              {c.label}
            </span>
            <span className="i-readout text-[10.5px]" style={{ color: "var(--i-text-soft)" }}>
              {c.value}
            </span>
          </span>
        );
        return c.href ? (
          <Link key={c.id} href={c.href} className="hover:opacity-80">
            {body}
          </Link>
        ) : (
          <span key={c.id}>{body}</span>
        );
      })}
      <div className="flex-1" />
      <Link href="/timeline" className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>
        Timeline
      </Link>
      <Link href="/forecast" className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>
        Forecast
      </Link>
      <span className="text-[10px]" style={{ color: "var(--i-text-faint)" }}>
        Control Room
      </span>
    </div>
  );
}
