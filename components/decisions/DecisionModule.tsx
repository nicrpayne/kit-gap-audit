"use client";

// ONE DECISION OBJECT, FOUR SEATINGS.
//
// A candidate, an open decision, a gate and a decided choice are not four
// kinds of card. They are the same physical module at four points in its
// life, and the surface has to say so: same proportions, same internal
// rhythm (identity strip → question → readouts), same state edge down the
// left. Only the SEATING changes, and seating is what carries meaning:
//
//   unseated  dashed, lifted, spectral   — the machine found it; not Reality
//   banked    solid cartridge in a bay   — accepted, touching no conductor
//   inserted  cartridge in a socket      — plugged into the delivery path
//   latched   recessed, flush, quiet     — settled into memory
//
// Hide every word and those four still read differently, which is the
// whole point: a real decision is not a delivery gate.

import type { ReactNode } from "react";

export type Seating = "unseated" | "banked" | "inserted" | "latched";

export interface ModuleMeta {
  label: string;
  tone?: string;
}

const SEATING_STYLE: Record<Seating, (accent: string, selected: boolean) => React.CSSProperties> = {
  // Lifted off the chassis, dashed on every edge, shadow beneath it: this
  // module is being HELD ABOVE the surface, not resting on it.
  unseated: (accent, selected) => ({
    background: "linear-gradient(180deg, #1f2530 0%, #171c25 100%)",
    border: `1px dashed ${selected ? "var(--i-violet)" : "rgba(155,140,250,0.55)"}`,
    borderRadius: 7,
    boxShadow: "0 9px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
    transform: "translateY(-2px)",
  }),
  banked: (accent, selected) => ({
    borderColor: selected ? "var(--i-violet)" : undefined,
    boxShadow: selected
      ? `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px var(--i-violet), 0 4px 10px rgba(0,0,0,0.55)`
      : undefined,
  }),
  inserted: (accent, selected) => ({
    borderColor: selected ? "var(--i-violet)" : "#3a444c",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -10px 18px ${accent}14, 0 6px 14px rgba(0,0,0,0.6)`,
  }),
  // Flush with the chassis and cut into it. Nothing left to operate.
  latched: (accent, selected) => ({
    background: "var(--i-recess)",
    border: `1px solid ${selected ? "var(--i-violet)" : "#1b2126"}`,
    borderRadius: 6,
    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
  }),
};

export default function DecisionModule({
  flipId,
  shoot,
  seating,
  accent,
  chip,
  ident,
  title,
  sub,
  meta = [],
  width,
  selected = false,
  dimmed = false,
  assumed,
  onClick,
  children,
  footer,
}: {
  /** Stable identity across bays — see lib/decisions/useFlip.ts. */
  flipId: string;
  shoot: string;
  seating: Seating;
  accent: string;
  chip: string;
  ident: string;
  title: string;
  sub?: string | null;
  meta?: ModuleMeta[];
  width: number;
  selected?: boolean;
  /** Withdrawn into a scenario: still legible, no longer acting. */
  dimmed?: boolean;
  /** Surfaced as a data attribute so a proof can assert seating state
      without inferring it from colour. */
  assumed?: boolean;
  onClick?: () => void;
  /** The timing readout, for modules that carry an estimate. */
  children?: ReactNode;
  /** The release latch, for a module seated in a socket. */
  footer?: ReactNode;
}) {
  const base = seating === "banked" || seating === "inserted" ? "dc-cartridge" : "";
  return (
    <div
      data-flip-id={flipId}
      className="shrink-0"
      style={{ width, opacity: dimmed ? 0.62 : 1, transition: "opacity 420ms ease" }}
    >
      <button
        data-shoot={shoot}
        data-assumed={assumed === undefined ? undefined : assumed ? "true" : "false"}
        onClick={onClick}
        className={`${base} relative block w-full overflow-hidden text-left transition-shadow duration-300`}
        style={SEATING_STYLE[seating](accent, selected)}
      >
        {/* The state edge. One vertical bar, lit by state — not a coloured
            border round the whole object, which would read as a tag. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 transition-colors duration-500"
          style={{
            width: 3,
            background: accent,
            opacity: seating === "latched" ? 0.55 : 1,
            boxShadow: seating === "inserted" ? `0 0 10px ${accent}` : undefined,
          }}
        />

        <div className="pl-3 pr-2.5 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.14em]"
              style={{ background: `${accent}1f`, color: accent }}
            >
              {chip}
            </span>
            <span className="ml-auto i-label" style={{ fontSize: 8.5 }}>
              {ident}
            </span>
          </div>

          <div
            className="mt-2 text-[12.5px] font-semibold leading-[1.3] line-clamp-2"
            style={{ color: seating === "latched" ? "var(--i-text-soft)" : "var(--i-text)" }}
          >
            {title}
          </div>
          {sub && (
            <div className="mt-1 text-[10px] leading-snug text-[var(--i-text-faint)] line-clamp-2">{sub}</div>
          )}

          {children}

          {meta.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[9px] text-[var(--i-text-faint)]">
              {meta.map((m, i) => (
                <span
                  key={i}
                  className={i === meta.length - 1 && meta.length > 1 ? "ml-auto truncate" : "truncate"}
                  style={{ color: m.tone }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* THE CONTACT EDGE. The part of the module that meets the socket:
            a darker lip with visible fingers. Only an inserted module has
            one, because only an inserted module is plugged into anything. */}
        {seating === "inserted" && (
          <span
            aria-hidden
            className="block"
            style={{
              height: 9,
              background: "linear-gradient(180deg, #10161a 0%, #0a0e11 100%)",
              borderTop: "1px solid #262e34",
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0 2px, transparent 2px 9px)",
            }}
          />
        )}
      </button>
      {footer}
    </div>
  );
}
