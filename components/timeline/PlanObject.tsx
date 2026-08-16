"use client";

// A PIECE OF THE PLAN.
//
// The one object on the score you can reach out and arrange. It is
// deliberately the most solid thing on the canvas: raised, edged, named in
// plain type, with grips at its ends. Forecast is a soft probabilistic
// capsule and the target is a flag; neither can be mistaken for this, and
// that is the point -- material tells you what you are allowed to change
// before you try.
//
// ONE OBJECT, TWO STATES. A plan that has happened is the SAME object with
// its face filled in, not a different shape somewhere else. Identity has to
// survive `planned -> occurred` or the canvas is lying about continuity.

import type { PlanObject as Obj, PlanGrip } from "@/lib/timeline/plan";

const GRIP_W = 7;

export default function PlanObject({
  obj, x0, x1, y, h, selected, hovered, dragging, compact, reducedMotion,
  onSelect, onHover, onGrip,
}: {
  obj: Obj;
  x0: number;
  /** For a point this is x0 -- the label reaches right, the object does not. */
  x1: number;
  y: number;
  h: number;
  selected: boolean;
  hovered: boolean;
  dragging: boolean;
  compact: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onGrip: (grip: PlanGrip, e: React.PointerEvent) => void;
}) {
  const { entry, role, planned, overdue, draggable } = obj;
  const lit = selected || hovered || dragging;

  // SOLID, BECAUSE IT IS A PART.
  //
  // The forecast capsule is soft, translucent and recessed: a distribution,
  // computed, not yours to move. A plan object is the opposite material —
  // an opaque raised block with a lit top edge and a coloured end cap, the
  // same language the Portfolio modules and Decision cartridges are made
  // from. Solidity, not hue, is what separates "you may arrange this" from
  // "the model produced this", which is why a plan block must never be the
  // thinner-looking of the two.
  //
  // State rides on the CAP and the border, so the body stays one material:
  //   planned  -> violet cap. Intent, seated but not yet true.
  //   occurred -> mint cap. It happened; the object did not become a
  //               different object when it did.
  //   overdue  -> red cap and red border. A plan, visibly behind.
  const accent = overdue ? "var(--i-red)" : planned ? "var(--i-violet)" : "var(--i-mint)";
  const body = lit
    ? "linear-gradient(180deg, #2c3740 0%, #1a2127 100%)"
    : "linear-gradient(180deg, #232c33 0%, #151b20 100%)";

  const label = entry.title;
  const fontSize = compact ? 8.6 : 10;
  const w = Math.max(role === "span" ? 14 : 0, x1 - x0);

  const common = {
    cursor: draggable ? (dragging ? "grabbing" : "grab") : "pointer",
    transition: reducedMotion || dragging ? undefined : "filter 160ms ease",
    filter: lit ? "brightness(1.16)" : undefined,
  } as const;

  // WHAT THIS OBJECT CLAIMS ABOUT ITSELF. Declared once and spread into
  // both shapes: a point and a span are the same object wearing different
  // geometry, and two hand-maintained copies of this list would eventually
  // disagree about which one is draggable. `data-date` / `data-end` are the
  // dates it is DRAWN at, so a proof can check pixels against the record.
  const claims = {
    "data-shoot": `plan-${entry.id}`,
    "data-plan-role": role,
    "data-planned": planned || undefined,
    "data-draggable": draggable || undefined,
    "data-dragging": dragging || undefined,
    "data-overdue": overdue || undefined,
    "data-date": entry.date,
    "data-end": entry.endDate ?? undefined,
  } as const;

  if (role === "point") {
    // A PIN. The date is the stem's foot; the head and the name sit above
    // it, so a milestone reads as a thing planted at a moment.
    return (
      <g
        {...claims}
        transform={`translate(${x0},${y})`}
        onPointerDown={(e) => draggable && onGrip("move", e)}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        style={common}
      >
        <rect x={-7} y={-2} width={Math.max(22, 14 + w)} height={h + 4} fill="transparent" />
        <g style={{ pointerEvents: "none" }}>
          {/* A PIN. Solid head when it happened, hollow when it is still
              intent — the same "cap tells you the state, body stays one
              material" rule the span block uses. No dashes: a dashed
              diamond at this size reads as a sparkle, not as a plan. */}
          <line x1={0} y1={0} x2={0} y2={h} stroke={accent} strokeWidth={1.4} opacity={planned ? 0.8 : 0.95} />
          <rect
            x={-4.6} y={h / 2 - 4.6} width={9.2} height={9.2} transform={`rotate(45 0 ${h / 2})`}
            fill={planned ? "#1a2127" : accent}
            stroke={accent}
            strokeWidth={1.5}
          />
          {overdue && (
            <g data-shoot="overdue-mark">
              <circle cx={0} cy={h / 2} r={9.5} fill="none" stroke="var(--i-red)" strokeWidth={1.1} opacity={0.8} />
            </g>
          )}
          <text
            x={9} y={h / 2 + fontSize * 0.36}
            fontSize={fontSize}
            fill={lit ? "var(--i-text)" : "var(--i-text-soft)"}
            style={{ letterSpacing: "0.01em" }}
          >
            {label}
          </text>
        </g>
      </g>
    );
  }

  // A BLOCK. Start to end, at real calendar width, with a grip at each edge.
  return (
    <g
      {...claims}
      transform={`translate(${x0},${y})`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={common}
    >
      {/* the body: opaque, raised, and what MOVE grabs */}
      <rect
        x={0} y={0} width={w} height={h} rx={Math.min(3.5, h / 3)}
        fill={body}
        stroke={overdue ? "var(--i-red)" : lit ? accent : "#39444d"}
        strokeWidth={overdue ? 1.5 : lit ? 1.3 : 1}
        onPointerDown={(e) => draggable && onGrip("move", e)}
      />
      <g style={{ pointerEvents: "none" }}>
        {/* the machined lip that makes it a part and not a fill */}
        <line x1={1.5} y1={1} x2={w - 1.5} y2={1} stroke="#ffffff" strokeWidth={0.9} opacity={0.16} />
        <line x1={1.5} y1={h - 1} x2={w - 1.5} y2={h - 1} stroke="#000000" strokeWidth={0.9} opacity={0.4} />
        {/* THE CAP. State lives here, so the body can stay one material. */}
        <rect x={0} y={0} width={3} height={h} rx={1.4} fill={accent} opacity={planned && !overdue ? 0.9 : 1} />
        {planned && !overdue && (
          <rect x={0} y={0} width={3} height={h} rx={1.4} fill="var(--i-void)" opacity={0.34} />
        )}
      </g>

      {overdue && (
        <g data-shoot="overdue-mark" style={{ pointerEvents: "none" }}>
          <rect x={-1.5} y={-1.5} width={w + 3} height={h + 3} rx={Math.min(5, h / 3)}
            fill="none" stroke="var(--i-red)" strokeWidth={1} opacity={0.4} />
        </g>
      )}

      {/* NAMED. A block you cannot read is a coloured rectangle. */}
      {w > 40 && (
        <text
          x={9} y={h / 2 + fontSize * 0.36}
          fontSize={fontSize}
          fill={lit ? "var(--i-text)" : "var(--i-text-soft)"}
          style={{ pointerEvents: "none", letterSpacing: "0.01em" }}
        >
          {label.length > Math.floor(w / (fontSize * 0.56)) ? `${label.slice(0, Math.max(1, Math.floor(w / (fontSize * 0.56)) - 1))}…` : label}
        </text>
      )}

      {/* EDGE GRIPS. Only where the object may actually be resized, so an
          affordance is never offered for something that will not happen. */}
      {draggable && (lit || dragging) && (
        <>
          {(["start", "end"] as const).map((grip) => (
            <g key={grip} onPointerDown={(e) => onGrip(grip, e)} style={{ cursor: "ew-resize" }}>
              <rect x={grip === "start" ? -GRIP_W / 2 : w - GRIP_W / 2} y={-2} width={GRIP_W} height={h + 4} fill="transparent" />
              <rect
                x={grip === "start" ? 0.5 : w - 2.5} y={2} width={2} height={h - 4} rx={1}
                fill={accent} opacity={0.95} style={{ pointerEvents: "none" }}
              />
            </g>
          ))}
        </>
      )}
    </g>
  );
}
