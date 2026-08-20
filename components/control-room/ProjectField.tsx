"use client";

// THE PROJECT FIELD.
//
// One object, drawn once. Not a chart of a metric — a picture of the thing
// itself, with the four forces that decide its date all in the same frame
// and at the same scale:
//
//   TIME        one horizontal axis, real days, shared by everything.
//   STRUCTURE   lanes ordered by declared dependency depth, so a lane can
//               never sit above something it waits on. A release spine
//               drops from an upstream's landing through everything that
//               waits on it — the fan-out is the drawing, not a sentence.
//   OBSTRUCTION gates are CLAMPS on the lane they block. They are not peer
//               nodes and they are not rows in a list: an unanswered
//               question is a thing sitting across the track.
//   ABILITY     capacity is MATERIAL, not topology. It is the fill in each
//               lane's flow bar. Changing capacity changes how a lane
//               looks, never how many lanes there are or where they sit.
//
// WHAT IS NOT HERE, because the model does not have it: pressure, risk,
// criticality, health, a critical path, or any dependency nobody declared.
// Every line on this surface is a stored edge, a stored gate, a simulated
// percentile, or a roster sum.
//
// SELECTION IS A GRAPH WALK. Clicking anything highlights exactly the lanes
// its movement reaches, computed by `reachOf` over declared edges. Nothing
// is emphasised by guess.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProjectField as Field, Selection } from "@/lib/control-room/field";
import { reachOf } from "@/lib/control-room/field";

const HEAD = 168; // the fixed label column, in px
const AXIS = 26; // room for the date rule at the foot
const LANE_MIN = 58;
// A lane is a fixed object, not a thing that grows to fill a container.
// Letting four lanes stretch across 700px of height made a dense instrument
// look like an empty spreadsheet; past this the block is CENTRED and the
// extra height stays as margin.
const LANE_MAX = 130;
const PAD_R = 18;

/** How tall this field wants to be, for a given number of lanes. The page
    sizes the panel from this instead of stretching the drawing to fill a
    container — a lane is a fixed object, and four of them rattling around
    inside 700px of height is what made V2's surfaces feel empty. */
export function fieldHeight(laneCount: number): number {
  return Math.max(1, laneCount) * LANE_MAX + AXIS;
}

const dShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function ProjectField({
  field,
  scenarioActive,
  selection,
  onSelect,
  shoot = "cr-field",
}: {
  field: Field;
  scenarioActive: boolean;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  shoot?: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Drawn in real pixels rather than a stretched viewBox: the field carries
  // type and hit targets, and both go wrong the moment the geometry is
  // scaled non-uniformly.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ESC clears the selection — a focus state you cannot leave is a trap.
  const clear = useCallback(() => onSelect(null), [onSelect]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [clear]);

  const lanes = field.lanes;
  const plotW = Math.max(120, box.w - HEAD - PAD_R);
  const avail = Math.max(60, box.h - AXIS);
  const laneH =
    lanes.length > 0 ? Math.min(LANE_MAX, Math.max(LANE_MIN, avail / lanes.length)) : LANE_MIN;
  const plotH = Math.max(60, Math.min(avail, laneH * Math.max(1, lanes.length)));
  const top = Math.max(0, (avail - plotH) / 2);

  const span = Math.max(1, field.endDay - field.startDay);
  const x = (d: number) => HEAD + ((d - field.startDay) / span) * plotW;
  const rowY = (idx: number) => top + idx * laneH;
  const midY = (idx: number) => rowY(idx) + laneH / 2;

  const reach = reachOf(field, selection);
  const focused = reach.size > 0;
  const lit = (scopeId: string) => !focused || reach.has(scopeId);
  const indexOf = new Map(lanes.map((l, idx) => [l.scopeId, idx]));

  // THE FORECAST'S COLOUR IS THE SUITE'S LAW: cyan is what we believe now,
  // violet is a hypothetical. Nothing else on this surface is ever violet.
  const forecast = scenarioActive ? "var(--i-violet)" : "var(--i-signal)";

  // Month ticks across whatever the axis actually spans.
  const ticks: { at: number; label: string }[] = [];
  {
    const first = new Date(field.startDate.getTime() + field.startDay * 86400000);
    const d = new Date(first.getFullYear(), first.getMonth(), 1);
    for (let k = 0; k < 36; k++) {
      const day = (d.getTime() - field.startDate.getTime()) / 86400000;
      if (day > field.endDay) break;
      if (day >= field.startDay)
        ticks.push({ at: day, label: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() });
      d.setMonth(d.getMonth() + 1);
    }
  }

  return (
    <div ref={wrap} data-shoot={shoot} data-focused={focused ? "true" : "false"} className="relative h-full w-full">
      {box.w > 0 && (
        <svg width={box.w} height={box.h} className="absolute inset-0 block">
          {/* Clicking the ground releases focus. */}
          <rect x={0} y={0} width={box.w} height={box.h} fill="transparent" onClick={clear} />

          {/* ── the field's floor ─────────────────────────────────── */}
          <rect x={HEAD} y={top} width={plotW} height={plotH} fill="var(--i-recess)" rx={4} />
          {ticks.map((t) => (
            <g key={t.at} pointerEvents="none">
              <line x1={x(t.at)} x2={x(t.at)} y1={top} y2={top + plotH} stroke="var(--i-border)" strokeWidth={1} />
              <text
                x={Math.min(x(t.at) + 4, HEAD + plotW - 24)}
                y={top + plotH + 15}
                fontSize={9}
                fill="var(--i-text-faint)"
                letterSpacing="0.08em"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* ── NOW ───────────────────────────────────────────────── */}
          <g pointerEvents="none">
            <line
              x1={x(field.nowDay)}
              x2={x(field.nowDay)}
              y1={top}
              y2={top + plotH + 4}
              stroke="var(--i-signal)"
              strokeWidth={1.5}
              opacity={0.9}
            />
            <rect x={x(field.nowDay) - 17} y={top + plotH + 4} width={34} height={13} rx={2} fill="var(--i-signal)" />
            <text
              x={x(field.nowDay)}
              y={top + plotH + 13}
              fontSize={8}
              fontWeight={700}
              fill="var(--i-void)"
              textAnchor="middle"
              letterSpacing="0.1em"
            >
              NOW
            </text>
          </g>

          {/* ── RELEASE SPINES ────────────────────────────────────── */}
          {/*
              A dependency drawn as physics rather than prose. The spine
              drops from the moment an upstream lands, straight through
              every lane that waits on it, and a branch runs along each of
              those lanes to where IT lands. The distance between the spine
              and the branch's end is the real gap between two real P50s.

              A shared upstream — one carrying more than one launch — is
              drawn amber, because it is the single point whose slip moves
              several dates at once. That is not a score; it is a count of
              declared edges.
          */}
          {field.sharedUpstreamIds
            .concat(lanes.filter((l) => l.downstreamScopeIds.length > 0).map((l) => l.scopeId))
            .filter((id, k, arr) => arr.indexOf(id) === k)
            .map((upId) => {
              const up = lanes.find((l) => l.scopeId === upId);
              if (!up || up.p50 === null) return null;
              const kids = lanes.filter((l) => l.dependsOnScopeIds.includes(upId));
              if (kids.length === 0) return null;
              const shared = kids.length > 1;
              const upIdx = indexOf.get(upId) ?? 0;
              const lastIdx = Math.max(...kids.map((k2) => indexOf.get(k2.scopeId) ?? 0));
              const on = lit(upId);
              const tone = shared ? "var(--i-amber)" : "var(--i-text-faint)";
              return (
                <g key={`spine-${upId}`} opacity={on ? 1 : 0.16}>
                  <line
                    x1={x(up.p50)}
                    x2={x(up.p50)}
                    y1={midY(upIdx)}
                    y2={midY(lastIdx)}
                    stroke={tone}
                    strokeWidth={shared ? 1.75 : 1.25}
                    strokeDasharray={shared ? undefined : "3 3"}
                    opacity={0.85}
                  />
                  {kids.map((k2) => {
                    const kIdx = indexOf.get(k2.scopeId) ?? 0;
                    const to = k2.p50 ?? up.p50!;
                    return (
                      <g key={k2.scopeId}>
                        <line
                          x1={x(up.p50!)}
                          x2={x(to)}
                          y1={midY(kIdx)}
                          y2={midY(kIdx)}
                          stroke={tone}
                          strokeWidth={shared ? 1.5 : 1}
                          strokeDasharray={shared ? undefined : "3 3"}
                          opacity={0.55}
                        />
                        <circle cx={x(up.p50!)} cy={midY(kIdx)} r={2.5} fill={tone} opacity={0.9} />
                      </g>
                    );
                  })}
                  {/* The hit target for the relationship itself. */}
                  <rect
                    data-field-edge={upId}
                    x={x(up.p50) - 7}
                    y={midY(upIdx)}
                    width={14}
                    height={Math.max(8, midY(lastIdx) - midY(upIdx))}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ kind: "edge", id: `${upId}->${kids[0].scopeId}` });
                    }}
                  />
                  {shared && (
                    <g pointerEvents="none">
                      <rect
                        x={x(up.p50) - 116}
                        y={midY(lastIdx) - 7}
                        width={110}
                        height={14}
                        rx={2}
                        fill="var(--i-amber-soft)"
                      />
                      <text
                        x={x(up.p50) - 11}
                        y={midY(lastIdx) + 3}
                        fontSize={9}
                        fill="var(--i-amber)"
                        textAnchor="end"
                      >
                        {kids.length} launches wait on {up.name}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* ── LANES ─────────────────────────────────────────────── */}
          {lanes.map((l, idx) => {
            const on = lit(l.scopeId);
            const y = midY(idx);
            const selected = selection?.kind === "lane" && selection.id === l.scopeId;
            const isGating = field.gatingScopeId === l.scopeId;

            return (
              <g key={l.scopeId} data-field-lane={l.scopeId} opacity={on ? 1 : 0.2}>
                {/* the lane's own hit target and hover ground */}
                <rect
                  x={0}
                  y={rowY(idx)}
                  width={box.w}
                  height={laneH}
                  fill={selected ? "var(--i-panel-raised)" : "transparent"}
                  opacity={selected ? 0.5 : 1}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected ? null : { kind: "lane", id: l.scopeId });
                  }}
                />

                {/* ── header column ─────────────────────────────── */}
                <text
                  x={10}
                  y={y - 8}
                  fontSize={11.5}
                  fill={isGating ? "var(--i-text)" : "var(--i-text-soft)"}
                  fontWeight={isGating ? 600 : 400}
                  pointerEvents="none"
                >
                  {l.name}
                </text>
                <text x={10} y={y + 5} fontSize={9} fill="var(--i-text-faint)" pointerEvents="none">
                  {l.dependsOnScopeIds.length > 0
                    ? `waits on ${l.dependsOnScopeIds
                        .map((u) => lanes.find((z) => z.scopeId === u)?.name ?? u)
                        .join(", ")}`
                    : l.downstreamScopeIds.length > 0
                      ? `${l.downstreamScopeIds.length} downstream`
                      : "independent"}
                </text>

                {/* CAPACITY AS MATERIAL. Committed is the track, arriving is
                    the fill; the gap between them is context-switch loss,
                    drawn to scale. A lane's POSITION never moves for it. */}
                <g pointerEvents="none">
                  <rect x={10} y={y + 11} width={96} height={4} rx={2} fill="var(--i-recess)" />
                  <rect
                    x={10}
                    y={y + 11}
                    width={96 * capFrac(l.capacityRaw, lanes)}
                    height={4}
                    rx={2}
                    fill="var(--i-mint)"
                    opacity={0.22}
                  />
                  <rect
                    x={10}
                    y={y + 11}
                    width={96 * capFrac(l.capacityEffective, lanes)}
                    height={4}
                    rx={2}
                    fill="var(--i-mint)"
                    opacity={l.capacityBasis === "allocations" ? 0.85 : 0.38}
                  />
                  <text x={112} y={y + 15} fontSize={8.5} fill="var(--i-text-faint)">
                    {l.capacityBasis === "allocations" ? "" : "≈"}
                    {l.capacityEffective.toFixed(1)}
                  </text>
                </g>
                <rect
                  data-field-capacity={l.scopeId}
                  x={8}
                  y={y + 8}
                  width={140}
                  height={12}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: "capacity", id: l.scopeId });
                  }}
                />

                {/* ── the landing ───────────────────────────────── */}
                {l.p50 !== null && (
                  <g pointerEvents="none">
                    {/* HEADROOM: from the floor — where this lane would land
                        with EVERY work item cut — to where it actually
                        lands. What is left of the bar after the floor is
                        the only part cutting scope can buy back. */}
                    {l.floorDays !== null && l.floorDays > field.startDay && x(l.p50) - x(l.floorDays) > 3 && (
                      <g opacity={l.dominated ? 0.3 : 0.7}>
                        <line
                          x1={x(l.floorDays)}
                          x2={x(l.p50)}
                          y1={y + 13}
                          y2={y + 13}
                          stroke="var(--i-text-faint)"
                          strokeWidth={1}
                        />
                        <line
                          x1={x(l.floorDays)}
                          x2={x(l.floorDays)}
                          y1={y + 10}
                          y2={y + 16}
                          stroke="var(--i-text-faint)"
                          strokeWidth={1}
                        />
                        <line
                          x1={x(l.p50)}
                          x2={x(l.p50)}
                          y1={y + 10}
                          y2={y + 16}
                          stroke="var(--i-text-faint)"
                          strokeWidth={1}
                        />
                      </g>
                    )}
                    {/* P10 → P90, the real spread of trials. */}
                    <rect
                      x={x(l.p10 ?? l.p50)}
                      y={y - 6}
                      width={Math.max(3, x(l.p90 ?? l.p50) - x(l.p10 ?? l.p50))}
                      height={12}
                      rx={6}
                      fill={forecast}
                      opacity={0.2}
                    />
                    {/* P50, the date the project is reported at. */}
                    <rect x={x(l.p50) - 1.25} y={y - 9} width={2.5} height={18} rx={1} fill={forecast} />
                    <text
                      x={x(l.p90 ?? l.p50) + 7}
                      y={y + 3.5}
                      fontSize={10}
                      fill={forecast}
                      className="i-readout"
                    >
                      {dShort(new Date(field.startDate.getTime() + l.p50 * 86400000))}
                    </text>

                    {/* Reality's own landing while a Scenario runs, so the
                        move is visible rather than just the destination. */}
                    {l.realityP50 !== null && Math.abs(l.realityP50 - l.p50) > 0.5 && (
                      <>
                        <line
                          x1={x(l.realityP50)}
                          x2={x(l.realityP50)}
                          y1={y - 9}
                          y2={y + 9}
                          stroke="var(--i-reality)"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                        />
                        <line
                          x1={x(Math.min(l.realityP50, l.p50))}
                          x2={x(Math.max(l.realityP50, l.p50))}
                          y1={y + 12}
                          y2={y + 12}
                          stroke="var(--i-violet)"
                          strokeWidth={1}
                          opacity={0.7}
                        />
                      </>
                    )}
                  </g>
                )}

                {/* ── the target ────────────────────────────────── */}
                {l.targetDays !== null && (
                  <g pointerEvents="none">
                    {/* The distance between landing and target, drawn. A
                        flag on its own says where we aimed; this says how
                        far the aim is from the answer, in the same units as
                        everything else on the axis. */}
                    {l.p50 !== null && (
                      <line
                        x1={x(Math.min(l.p50, l.targetDays))}
                        x2={x(Math.max(l.p50, l.targetDays))}
                        y1={y}
                        y2={y}
                        stroke="var(--i-amber)"
                        strokeWidth={1}
                        strokeDasharray="1 5"
                        opacity={0.32}
                      />
                    )}
                    <line
                      x1={x(l.targetDays)}
                      x2={x(l.targetDays)}
                      y1={y - 13}
                      y2={y + 13}
                      stroke="var(--i-amber)"
                      strokeWidth={1.25}
                      opacity={0.85}
                    />
                    <path
                      d={`M ${x(l.targetDays)} ${y - 13} l 9 3.5 l -9 3.5 z`}
                      fill="var(--i-amber)"
                      opacity={0.9}
                    />
                  </g>
                )}

                {/* ── obstructions ──────────────────────────────── */}
                {/*
                    A gate is a CLAMP across the lane it blocks, sitting just
                    before that lane's landing — because the delay it models
                    is already inside that landing. It is not a node in a
                    graph and not a row in a list: it is a thing in the way.
                */}
                {l.gates.map((g, gi) => {
                  const gx = x(l.p50 ?? field.nowDay) - 26 - gi * 15;
                  const gsel = selection?.kind === "gate" && selection.id === g.id;
                  return (
                    <g key={g.id} opacity={g.released ? 0.32 : 1}>
                      <rect
                        x={gx - 5}
                        y={y - 13}
                        width={10}
                        height={26}
                        rx={2}
                        fill={g.released ? "transparent" : "var(--i-amber-soft)"}
                        stroke="var(--i-amber)"
                        strokeWidth={gsel ? 1.6 : 1}
                        strokeDasharray={g.released ? "2 2" : undefined}
                      />
                      {!g.released && (
                        <>
                          <line x1={gx - 5} x2={gx + 5} y1={y - 4} y2={y - 4} stroke="var(--i-amber)" strokeWidth={1} />
                          <line x1={gx - 5} x2={gx + 5} y1={y + 4} y2={y + 4} stroke="var(--i-amber)" strokeWidth={1} />
                        </>
                      )}
                      <rect
                        data-field-gate={g.id}
                        x={gx - 8}
                        y={y - 15}
                        width={16}
                        height={30}
                        fill="transparent"
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(gsel ? null : { kind: "gate", id: g.id });
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* the header column's right edge, drawn last so lanes sit under it */}
          <line x1={HEAD - 1} x2={HEAD - 1} y1={top} y2={top + plotH} stroke="var(--i-border)" strokeWidth={1} pointerEvents="none" />
        </svg>
      )}
    </div>
  );
}

/** Scaled against the LARGEST channel, never the roster's sum: a project
    whose capacity is a counted stand-in can exceed the sum, and clamping it
    would quietly flatten every real channel beside it. */
function capFrac(v: number, lanes: { capacityRaw: number; capacityEffective: number }[]): number {
  const max = Math.max(0.001, ...lanes.map((l) => Math.max(l.capacityRaw, l.capacityEffective)));
  return Math.max(0, Math.min(1, v / max));
}
