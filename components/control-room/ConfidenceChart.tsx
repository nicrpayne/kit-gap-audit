"use client";

// WHAT EVERY REPORT BELIEVED, AT THE TIME IT RAN.
//
// This is a MEMORY, not a projection. Each point is the integer a report
// stored in `Report.confidenceAtTarget` when it was generated, plotted at
// its own `generatedAt`. Nothing here is recomputed against today's model,
// nothing is interpolated between reports, and no project that has never
// been reported on appears — a flat line at zero would assert a measured
// 0% that nobody ever measured.
//
// COLOUR: the project that lands last is drawn in cyan and everything else
// recedes, because "which line is the one that decides the date" is the
// question this chart is for. It stays cyan under a Scenario: a hypothetical
// changes what we expect NEXT, it does not change what a past report said.
// Violet is reserved for the hypothetical itself, and there isn't one here.
//
// Where the last-landing project has never been reported on, NOTHING is
// promoted. Picking some other line to emphasise would be inventing a
// protagonist.

import type { Series } from "@/lib/control-room/read";

/** Room on the right for the end labels, in px. The plot stops here so a
    label can never sit on top of the data it names. */
const LABEL_GUTTER = 72;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

export default function ConfidenceChart({
  series,
  gatingId,
  shoot,
}: {
  series: Series[];
  gatingId: string | null;
  shoot?: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const t0 = Math.min(...all.map((p) => +p.at));
  const t1 = Math.max(...all.map((p) => +p.at));
  const tSpan = t1 - t0 || 1;

  // Y is the full 0–100% of confidence, always. Auto-scaling a percentage to
  // its own range makes a 4-point wobble look like a collapse.
  const x = (at: Date) => ((+at - t0) / tSpan) * 100;
  const y = (v: number) => PAD_TOP + (1 - Math.max(0, Math.min(100, v)) / 100) * (100 - PAD_TOP - PAD_BOTTOM);

  // The promoted line is drawn LAST so it sits over the others.
  const ordered = [...series].sort((a, b) => (a.id === gatingId ? 1 : 0) - (b.id === gatingId ? 1 : 0));

  // Where the last-landing project has never been reported on there is no
  // protagonist, and receding EVERY line would leave a chart nobody can
  // read. So nothing is promoted, and nothing is demoted either.
  const anyLead = series.some((s) => s.id === gatingId);
  const restColour = anyLead ? "var(--i-text-faint)" : "var(--i-text-soft)";
  const restOpacity = anyLead ? 0.6 : 0.9;

  // END LABELS, PUSHED APART.
  //
  // Two projects that finished the week within a few points of each other
  // would print their names on top of one another. The LABEL moves; the
  // line it names does not — so the chart still says exactly what was
  // recorded, and only the type is nudged into a readable column.
  const GAP = 11; // percent of the plot's height — roughly one line of type
  const labels = series
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { id: s.id, label: s.label, value: last.value, at: last.at, top: y(last.value) };
    })
    .sort((a, b) => a.top - b.top);
  for (let k = 1; k < labels.length; k++) {
    if (labels[k].top - labels[k - 1].top < GAP) labels[k].top = labels[k - 1].top + GAP;
  }
  const overflow = labels.length ? labels[labels.length - 1].top - (100 - PAD_BOTTOM / 2) : 0;
  if (overflow > 0) for (const l of labels) l.top -= overflow;

  return (
    <div className="relative h-full w-full" data-shoot={shoot} data-series={series.length}>
      <div className="absolute inset-y-0 left-0" style={{ right: LABEL_GUTTER }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* 50% is the only gridline worth drawing: "more likely than not"
              is the reading people actually take off this chart. */}
          <line
            x1={0}
            x2={100}
            y1={y(50)}
            y2={y(50)}
            stroke="var(--i-border-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2 3"
          />
          {ordered.map((s) => {
            const lead = s.id === gatingId;
            const colour = lead ? "var(--i-signal)" : restColour;
            if (s.points.length === 1) {
              // ONE REPORT IS A DOT. Two dots joined would be a direction
              // nobody measured.
              return (
                <circle
                  key={s.id}
                  data-shoot={`cr-conf-dot-${s.id}`}
                  cx={x(s.points[0].at)}
                  cy={y(s.points[0].value)}
                  r={2.5}
                  fill={colour}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            return (
              <polyline
                key={s.id}
                data-shoot={`cr-conf-line-${s.id}`}
                data-points={s.points.length}
                points={s.points.map((p) => `${x(p.at)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={colour}
                strokeWidth={lead ? 2 : 1.25}
                opacity={lead ? 1 : restOpacity}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Labels live in HTML rather than in the stretched SVG, so the
            geometry can fill the panel without the type being scaled with
            it. They sit in the gutter, past the end of the plot. */}
        <div className="pointer-events-none absolute inset-0">
          {/* Sat on a chip of the panel's own colour so a line can never run
              through the type. */}
          <span
            className="i-readout absolute rounded-sm px-[3px] text-[9px] leading-none"
            style={{
              left: 0,
              top: `${y(50)}%`,
              marginTop: -12,
              color: "var(--i-text-faint)",
              background: "var(--i-panel)",
            }}
          >
            50%
          </span>
          {labels.map((l) => {
            const lead = l.id === gatingId;
            return (
              <span
                key={l.id}
                data-shoot={`cr-conf-label-${l.id}`}
                className="absolute -translate-y-1/2 whitespace-nowrap pl-1.5 text-[9.5px] leading-none"
                style={{
                  left: `${x(l.at)}%`,
                  top: `${l.top}%`,
                  color: lead ? "var(--i-signal)" : restColour,
                }}
              >
                <span className="i-readout">{l.value}%</span> {l.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
