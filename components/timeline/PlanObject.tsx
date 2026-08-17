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
  obj, x0, x1, y, h, selected, hovered, dragging, compact, reducedMotion, detailed,
  onSelect, onHover, onGrip, dates,
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
  /** The lane this object sits in is OPENED — the same object, drawn at the
      higher of the surface's two resolutions. It states its dates at rest
      instead of waiting to be pointed at. */
  detailed?: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onGrip: (grip: PlanGrip, e: React.PointerEvent) => void;
  /** "SEP 6 → SEP 27 · 21d", shown only while the object is lit. */
  dates?: string;
}) {
  const { entry, role, planned, overdue, draggable } = obj;
  const lit = selected || hovered || dragging;
  // THREE STATES, THREE MATERIALS.
  //   rest     seated, quiet, obviously a thing
  //   hover    lifts a little; the light catches its top edge
  //   held     off the surface entirely — selected or under the hand
  const held = selected || dragging;
  const lift = dragging ? 3 : held ? 2 : hovered ? 1 : 0;

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
  // A PART, NOT A LABEL CHIP.
  //
  // These are SVG paint servers, defined once in the field's <defs>. They
  // replace a CSS `linear-gradient()` string that was being handed to an
  // SVG `fill`, which is not a value SVG accepts — so the raised body this
  // object has always claimed to have was silently painting flat black.
  // A black rectangle with a coloured left edge reads as a text field, and
  // that is precisely why these never felt like parts you could pick up.
  const body = lit ? "url(#planBodyLit)" : "url(#planBody)";

  const label = entry.title;
  const fontSize = compact ? 8.6 : 10;
  const w = Math.max(role === "span" ? 14 : 0, x1 - x0);
  const r = Math.min(3.5, h / 3);
  /** HOW LONG, AS A MARKING ON THE PART.
      Width already states the duration and is the primary cue — but a
      machined part carries its measurement, and at a glance "34d" resolves
      the length without anyone having to compare two edges against a grid.
      Only where the block is genuinely long enough to hold it without
      crowding the name. */
  const days = obj.endT !== null ? Math.max(1, Math.round((obj.endT - obj.startT) / 86400000)) : null;
  const measure = days !== null && w >= 112 && !compact ? `${days}d` : null;
  const measureW = measure ? measure.length * fontSize * 0.62 + 12 : 0;
  /** WHOLE WORDS OR NOTHING.
      A label goes inside the block only if the block can hold the whole
      title, or at least enough of it that the truncation still reads as
      language. "Tax engin…" is not a name — it is the interface admitting
      it ran out of room — so a short activity puts its full name beside
      itself instead, where there is space for it. */
  const maxChars = Math.floor((w - 14 - measureW) / (fontSize * 0.56));
  const roomForLabel = maxChars >= label.length || maxChars >= 14;

  // POSITION AND LIFT IN ONE TRANSFORM.
  //
  // A CSS `transform` in `style` REPLACES the SVG `transform` attribute
  // rather than composing with it, so expressing the hover lift separately
  // threw every lifted object to the origin. Both live here together, which
  // is also the only form CSS can transition.
  const common = {
    cursor: draggable ? (dragging ? "grabbing" : "grab") : "pointer",
    // Quick and low-amplitude. A plan object is a part being placed, not a
    // toy: it lifts, it settles, it does not bounce.
    transition: reducedMotion || dragging ? undefined : "transform 150ms cubic-bezier(0.32,0.72,0,1), filter 150ms ease",
    transform: `translate(${x0}px, ${y - lift}px)`,
    filter: dragging ? "brightness(1.2)" : hovered && !held ? "brightness(1.08)" : undefined,
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
            fill={lit ? "#ffffff" : "var(--i-text)"}
            style={{ letterSpacing: "0.01em" }}
          >
            {label}
          </text>
          {/* A moment states its date at rest only in an opened lane — the
              same two-resolution rule the blocks follow. */}
          {(lit || detailed) && dates && (
            <text
              x={9} y={h / 2 + fontSize * 0.36 + 11}
              fontSize={8.4}
              fill="var(--i-text-faint)"
              opacity={lit ? 1 : 0.7}
              style={{ letterSpacing: "0.05em" }}
            >
              {dates}
            </text>
          )}
        </g>
      </g>
    );
  }

  // A BLOCK. Start to end, at real calendar width, with a grip at each edge.
  return (
    <g
      {...claims}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={common}
    >
      {/* IT SITS ON THE SCORE. A cast shadow under the body is what makes
          the difference between a part resting on a surface and a bordered
          rectangle drawn onto one. */}
      <rect
        x={0.8} y={2 + lift * 1.4} width={w} height={h} rx={r}
        fill="#04070a" opacity={0.4 + lift * 0.09}
        style={{
          pointerEvents: "none",
          transition: reducedMotion || dragging ? undefined : "y 150ms cubic-bezier(0.32,0.72,0,1), opacity 150ms ease",
        }}
      />
      {/* the body: opaque, raised, and what MOVE grabs */}
      <rect
        x={0} y={0} width={w} height={h} rx={r}
        fill={body}
        stroke={overdue ? "var(--i-red)" : lit ? accent : "#3d4952"}
        strokeWidth={overdue ? 1.4 : lit ? 1.2 : 0.9}
        strokeOpacity={overdue || lit ? 0.95 : 0.7}
        onPointerDown={(e) => draggable && onGrip("move", e)}
      />
      <g style={{ pointerEvents: "none" }}>
        {/* the machined lip: light catches the top, the bottom stays in
            shadow. Two hairlines, and the block reads as extruded. */}
        <line x1={r} y1={0.9} x2={w - r} y2={0.9} stroke="#ffffff" strokeWidth={1} opacity={lit ? 0.26 : 0.18} />
        <line x1={r} y1={h - 0.9} x2={w - r} y2={h - 0.9} stroke="#000000" strokeWidth={1} opacity={0.45} />
        {/* TWO ENDS, SO IT HAS EXTENT.
            A block with a cap at one end reads as a label with a coloured
            edge; the eye finds where it starts and has no reason to travel.
            Capping BOTH ends makes the object a measured length — it begins
            here and it ends there — which is the whole claim a duration is
            making. State stays on the caps, so the body remains one
            material and the score never becomes a chart of categorical
            colours. */}
        <rect x={0} y={0} width={3} height={h} rx={1.4} fill={accent} opacity={planned && !overdue ? 0.62 : 1} />
        <rect
          x={w - 3} y={0} width={3} height={h} rx={1.4}
          fill={accent} opacity={(planned && !overdue ? 0.62 : 1) * 0.85}
        />
        {/* HOW LONG, MARKED ON THE PART ITSELF. */}
        {measure && (
          <text
            data-shoot="plan-measure"
            x={w - 9} y={h / 2 + fontSize * 0.34}
            fontSize={fontSize * 0.92} textAnchor="end"
            fill={lit ? accent : "var(--i-text-faint)"}
            opacity={lit ? 0.95 : 0.62}
            style={{ letterSpacing: "0.04em" }}
          >
            {measure}
          </text>
        )}
      </g>

      {overdue && (
        <g data-shoot="overdue-mark" style={{ pointerEvents: "none" }}>
          <rect x={-1.6} y={-1.6} width={w + 3.2} height={h + 3.2} rx={r + 1.4}
            fill="none" stroke="var(--i-red)" strokeWidth={1} opacity={0.42} />
        </g>
      )}

      {/* SELECTED. A seated underline the exact width of the object — it
          says "this one" without a halo big enough to obscure its
          neighbours, and it costs no layout. */}
      {selected && (
        <rect
          x={0} y={h + 3} width={w} height={1.6} rx={0.8}
          fill={accent} opacity={0.95} style={{ pointerEvents: "none" }}
        />
      )}

      {/* NAMED. A block you cannot read is a coloured rectangle — so a
          short activity puts its name BESIDE itself rather than crushing it
          into three letters and an ellipsis. */}
      {roomForLabel ? (
        <text
          x={9} y={h / 2 + fontSize * 0.36}
          fontSize={fontSize}
          fill={lit ? "#ffffff" : "var(--i-text)"}
          style={{ pointerEvents: "none", letterSpacing: "0.01em" }}
        >
          {label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label}
        </text>
      ) : (
        <text
          x={w + 6} y={h / 2 + fontSize * 0.36}
          fontSize={fontSize}
          fill={lit ? "#ffffff" : "var(--i-text-soft)"}
          style={{ pointerEvents: "none", letterSpacing: "0.01em" }}
        >
          {label}
        </text>
      )}

      {/* WHEN — AT WHICHEVER RESOLUTION THE LANE IS SET TO.
          In a compact lane, position and width already say when and how
          long, so the dates wait until the object is pointed at. In an
          OPENED lane they are stated at rest: same object, same place,
          finer grain — which is what opening a lane buys. */}
      {(lit || detailed) && dates && (
        <text
          x={0} y={h + 12}
          fontSize={8.4}
          fill="var(--i-text-faint)"
          opacity={lit ? 1 : 0.7}
          style={{ pointerEvents: "none", letterSpacing: "0.05em" }}
        >
          {/* SAID ONCE. When the block is wide enough to carry its own
              duration marking, the line underneath does not repeat it —
              "AUG 25 → SEP 12 · 18d" beside a block already stamped 18d is
              the interface saying the same thing twice in one breath. */}
          {measure ? dates.replace(/\s·\s\d+d$/, "") : dates}
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
