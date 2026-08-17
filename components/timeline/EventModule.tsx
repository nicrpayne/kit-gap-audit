"use client";

// THE EVENT MODULE — what a note looks like when it is struck.
//
// The score at rest is compact markers, because a timeline where every
// event carries a permanent label is a wall of text nobody reads. But a
// marker alone cannot tell a story: watching playback with 9px diamonds
// means studying symbols, which is exactly the thing this pass exists to
// remove.
//
// So an event ARTICULATES. As the playhead crosses it the marker gains a
// readable module — date, title, what kind of moment it was — held long
// enough to read, then settled back into the accumulated score. The note
// is struck, becomes readable, and joins the history behind the playhead.
//
// Transient by design. It is not a tooltip (no pointer involved), not a
// modal (nothing is blocked), and not a permanent label (the score stays
// legible). Selection uses the same object held open, so what you see
// during playback and what you see when you click are the same thing.

import type { TimelineEntry } from "@/lib/timeline/entries";
import { fmtDay } from "@/lib/timeline/geometry";
import { labelFor } from "@/lib/timeline/moment";
import { FAMILY_COLOR } from "./familyColor";

export default function EventModule({
  entry, x, y, phase, reducedMotion, compact, stemDx = 0,
}: {
  entry: TimelineEntry;
  x: number;
  y: number;
  /** `articulating` is the transient playback state; `held` is selection. */
  phase: "articulating" | "held" | "peek";
  reducedMotion: boolean;
  compact: boolean;
  /** How far the true date sits from the clamped card centre. The stem
      follows the date, so clamping the card never moves the event. */
  stemDx?: number;
}) {
  const color = FAMILY_COLOR[entry.family] ?? "var(--i-text-soft)";
  const planned = entry.temporalState === "planned";
  const overdue = planned && Boolean((entry.detail as { overdue?: boolean }).overdue);
  const w = compact ? 176 : 208;

  return (
    <div
      data-shoot={`event-module-${entry.id}`}
      data-phase={phase}
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: w,
        transform: "translate(-50%, -100%)",
        // Damped, not bouncy. A project history is not a game.
        animation: reducedMotion ? undefined : "tl-articulate 180ms cubic-bezier(0.22,0.61,0.36,1)",
        zIndex: phase === "held" ? 30 : phase === "peek" ? 24 : 25,
      }}
    >
      <div
        className="rounded-md overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #171d22 0%, #10151a 100%)",
          border: `1px solid ${phase === "held" ? color : "var(--i-border-strong)"}`,
          boxShadow:
            phase === "held"
              ? `0 0 0 1px ${color}22, 0 10px 26px rgba(0,0,0,0.72)`
              : "0 8px 22px rgba(0,0,0,0.66)",
        }}
      >
        {/* the family's material, as an edge rather than a swatch */}
        <div style={{ height: 2, background: color, opacity: planned ? 0.5 : 1 }} />
        <div className="px-2.5 py-[7px]">
          <div className="flex items-center gap-1.5">
            <span className="i-readout text-[10px] leading-none" style={{ color: "var(--i-text-soft)" }}>
              {fmtDay(new Date(entry.date).getTime())}
            </span>
            {planned && (
              <span
                className="text-[7px] uppercase tracking-[0.14em] rounded px-1 py-[1px]"
                style={{
                  color: overdue ? "var(--i-red)" : "var(--i-text-faint)",
                  border: `1px solid ${overdue ? "var(--i-red)" : "var(--i-border-strong)"}`,
                }}
              >
                {overdue ? "overdue" : "planned"}
              </span>
            )}
          </div>
          <div
            className="mt-[3px] text-[11px] leading-[1.25] text-[var(--i-text)]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {entry.title}
          </div>
          <div className="mt-[3px] text-[8px] uppercase tracking-[0.12em]" style={{ color }}>
            {labelFor(entry)}
          </div>
        </div>
      </div>
      {/* the stem that keeps it attached to its exact date and lane */}
      <div
        style={{
          width: 1, height: 9, background: color, opacity: 0.6,
          marginLeft: `calc(50% + ${stemDx}px)`,
        }}
      />
    </div>
  );
}

/**
 * SEVERAL NOTES STRUCK TOGETHER.
 *
 * Three things landing on one afternoon used to draw three modules at the
 * same x, stacked exactly on top of each other: the top one legible, the
 * two beneath it visible only as a smear of borders, and no indication
 * anywhere that more than one thing had happened. The playback plan already
 * treats a shared moment as one group for pacing; this makes the drawing
 * agree with the pacing.
 *
 * One object, one stem, one date, and the count stated — then the titles,
 * as many as fit. It is deliberately the SAME material as a single module,
 * because it is the same kind of thing: what the instrument just read.
 */
export function EventGroupModule({
  entries, x, y, reducedMotion, compact, stemDx = 0,
}: {
  entries: TimelineEntry[];
  x: number;
  y: number;
  reducedMotion: boolean;
  compact: boolean;
  stemDx?: number;
}) {
  const w = compact ? 176 : 208;
  const SPELLED = 3;
  const shown = entries.slice(0, SPELLED);
  const rest = entries.length - shown.length;

  return (
    <div
      data-shoot={`event-group-${entries[0].id}`}
      data-phase="articulating"
      data-count={entries.length}
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: w,
        transform: "translate(-50%, -100%)",
        animation: reducedMotion ? undefined : "tl-articulate 180ms cubic-bezier(0.22,0.61,0.36,1)",
        zIndex: 26,
      }}
    >
      <div
        className="rounded-md overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #171d22 0%, #10151a 100%)",
          border: "1px solid var(--i-border-strong)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.66)",
        }}
      >
        {/* Every family present, as a single edge divided between them —
            so the module still says WHAT KINDS of thing arrived without
            needing a swatch per row. */}
        <div className="flex" style={{ height: 2 }}>
          {entries.map((e) => (
            <div key={e.id} className="flex-1" style={{ background: FAMILY_COLOR[e.family] ?? "var(--i-text-soft)" }} />
          ))}
        </div>
        <div className="px-2.5 py-[7px]">
          <div className="flex items-center gap-1.5">
            <span className="i-readout text-[10px] leading-none" style={{ color: "var(--i-text-soft)" }}>
              {fmtDay(new Date(entries[0].date).getTime())}
            </span>
            <span
              className="text-[7px] uppercase tracking-[0.14em] rounded px-1 py-[1px]"
              style={{ color: "var(--i-violet)", border: "1px solid rgba(155,140,250,0.5)" }}
            >
              {entries.length} events
            </span>
          </div>
          {shown.map((e) => (
            <div key={e.id} className="mt-[3px] flex items-baseline gap-1.5 min-w-0">
              <span
                className="shrink-0 rounded-[1px]"
                style={{ width: 4, height: 4, background: FAMILY_COLOR[e.family] ?? "var(--i-text-soft)" }}
              />
              <span className="text-[10.5px] leading-[1.2] text-[var(--i-text)] truncate">{e.title}</span>
            </div>
          ))}
          {rest > 0 && (
            <div className="mt-[3px] text-[8px] uppercase tracking-[0.12em]" style={{ color: "var(--i-text-faint)" }}>
              +{rest} more
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          width: 1, height: 9, background: "var(--i-violet)", opacity: 0.6,
          marginLeft: `calc(50% + ${stemDx}px)`,
        }}
      />
    </div>
  );
}
