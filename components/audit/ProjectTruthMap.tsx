"use client";

// THE PROJECT TRUTH MAP.
//
//   THE LINES ARE PROJECT SIGNALS.
//   THE CENTRE IS ACCEPTED REALITY.
//   AUDIT REVEALS WHERE THOSE SIGNALS DISAGREE.
//
// The one visual idea everything else serves: A SIGNAL THAT AGREES WITH
// REALITY REACHES IT. A lane in good standing runs unbroken from its label
// in the gutter, through its checkpoints, into a port on the Reality bus.
// A lane carrying a disagreement is INTERRUPTED at the band its state names,
// and continues to the core only as a faint, unverified ghost.
//
// That is what makes the map readable in five seconds without a legend:
// solid lines reaching the middle are truth flowing; broken ones are truth
// blocked. Severity does not need a colour key to be findable, because a
// worse disagreement breaks the lane further out.
//
// SVG rather than Canvas: every finding has to be a real focusable,
// keyboard-reachable target with an accessible name, and the whole field is
// well under a thousand nodes. Canvas would have bought nothing here and
// cost the accessibility the design north star treats as non-negotiable.

import { useMemo, type CSSProperties } from "react";
import type { TruthMapModel, TruthFinding } from "@/lib/audit/truth";
import {
  FIELD,
  BANDS,
  CARD,
  layoutLanes,
  layoutFindings,
  stemPath,
} from "@/lib/audit/layout";
import { STATE_COLOR, TIER, findingColor, findingSoft, CONFIRMED_COLOR } from "./tokens";

const RAD = Math.PI / 180;
import { IconHolder, findingIcon, ICON_PX } from "./icons";

export interface TruthMapProps {
  model: TruthMapModel;
  selectedId: string | null;
  hoveredId: string | null;
  /** Isolate the provenance of the selected finding through the network. */
  evidenceSolo: boolean;
  /** B · CANDIDATE is showing. Reality enters candidate treatment. */
  candidate: boolean;
  /** Degrees. Null when no audit sweep is running. */
  sweepAngle: number | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

export default function ProjectTruthMap({
  model,
  selectedId,
  hoveredId,
  evidenceSolo,
  candidate,
  sweepAngle,
  onSelect,
  onHover,
}: TruthMapProps) {
  const lanes = useMemo(() => layoutLanes(model.lanes), [model.lanes]);
  const findings = useMemo(() => layoutFindings(model, lanes), [model, lanes]);

  const selected = selectedId ? model.findings.find((f) => f.id === selectedId) ?? null : null;
  const active = selected ?? (hoveredId ? model.findings.find((f) => f.id === hoveredId) ?? null : null);

  /** Lanes lit by the current selection: the finding's own lane, plus the
      lanes its provenance actually runs through. Nothing else. */
  const litLanes = useMemo(() => {
    if (!active) return null;
    return new Set<string>([active.laneId, ...active.relatedLaneIds]);
  }, [active]);

  const laneOpacity = (laneId: string, state: string): number => {
    if (!litLanes) return state === "verified" ? TIER.signal : TIER.signalWarn;
    if (litLanes.has(laneId)) return TIER.attention;
    return evidenceSolo ? TIER.dimmed * 0.6 : TIER.dimmed;
  };

  return (
    <svg
      data-shoot="truth-map"
      viewBox={`0 0 ${FIELD.width} ${FIELD.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
      role="group"
      aria-label={`Project truth map for ${model.scopeName}: ${model.totals.all} open findings`}
      onClick={(e) => {
        // Clicking the field itself clears selection; clicking a finding
        // stops propagation. Selection is a place you can leave.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <defs>
        <radialGradient id="ta-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--i-signal)" stopOpacity="0.30" />
          <stop offset="62%" stopColor="var(--i-signal)" stopOpacity="0.09" />
          <stop offset="100%" stopColor="var(--i-signal)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ta-core-candidate" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--i-violet)" stopOpacity="0.34" />
          <stop offset="62%" stopColor="var(--i-violet)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--i-violet)" stopOpacity="0" />
        </radialGradient>
        {/* The exclusion zone: lanes are clipped out of the core so nothing
            crosses Reality's own text. Cable management, not a pile. */}
        <mask id="ta-core-exclusion">
          <rect x="0" y="0" width={FIELD.width} height={FIELD.height} fill="white" />
          <circle cx={FIELD.cx} cy={FIELD.cy} r={FIELD.busR - 3} fill="black" />
        </mask>
      </defs>

      {/* ── TIER 1 · STRUCTURE ─────────────────────────────────────────
          Rings, spokes and band names. Very quiet: this is the graticule a
          reading is taken against, not a thing to look at. */}
      <g opacity={TIER.structure} style={{ pointerEvents: "none" }}>
        {BANDS.map((b) => (
          <circle
            key={b.id}
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={b.r}
            fill="none"
            stroke="var(--i-text-soft)"
            strokeWidth={1}
            strokeDasharray={b.id === "aligned" ? undefined : "2 6"}
          />
        ))}
        {/* Band names sit on the clear right-facing arc, the one place no
            lane docks — so a label never collides with a signal. */}
        {BANDS.map((b) => {
          // Seated on the clear right-facing arc at a shallow angle, so a
          // band name never lands on the core or on a docking lane.
          const a = -26 * RAD;
          return (
            <text
              key={`${b.id}-label`}
              x={FIELD.cx + Math.cos(a) * (b.r - 6)}
              y={FIELD.cy + Math.sin(a) * (b.r - 6)}
              textAnchor="end"
              fontSize={9.5}
              letterSpacing="0.16em"
              fill="var(--i-text-soft)"
              style={{ textTransform: "uppercase" }}
            >
              {b.label}
            </text>
          );
        })}
        <circle cx={FIELD.cx} cy={FIELD.cy} r={FIELD.busR} fill="none" stroke="var(--i-text-soft)" strokeWidth={1} />
      </g>

      {/* ── THE AUDIT SWEEP ────────────────────────────────────────────
          The bright edge IS the scan. The trail is drawn at angles BEHIND
          it, so the glow follows the scan rather than preceding it — the
          one prototype defect called out by name in the brief. Correct by
          construction: the wedges are laid out at negative local angles and
          the whole group is rotated to the current heading. */}
      {sweepAngle != null && (
        <g
          transform={`rotate(${sweepAngle} ${FIELD.cx} ${FIELD.cy})`}
          style={{ pointerEvents: "none" }}
          data-shoot="audit-sweep"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const from = -(i + 1) * 9;
            const to = -i * 9;
            const a0 = (from * Math.PI) / 180;
            const a1 = (to * Math.PI) / 180;
            const r = FIELD.edgeR;
            const p0 = { x: FIELD.cx + Math.cos(a0) * r, y: FIELD.cy + Math.sin(a0) * r };
            const p1 = { x: FIELD.cx + Math.cos(a1) * r, y: FIELD.cy + Math.sin(a1) * r };
            return (
              <path
                key={i}
                d={`M ${FIELD.cx} ${FIELD.cy} L ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`}
                fill="var(--i-signal)"
                opacity={0.1 * (1 - i / 6)}
              />
            );
          })}
          <line
            x1={FIELD.cx}
            y1={FIELD.cy}
            x2={FIELD.cx + FIELD.edgeR}
            y2={FIELD.cy}
            stroke="var(--i-signal)"
            strokeWidth={1.5}
            opacity={0.75}
          />
        </g>
      )}

      {/* ── TIER 2 · PROJECT SIGNAL ────────────────────────────────────
          The lanes themselves, masked out of Reality's exclusion zone. */}
      <g mask="url(#ta-core-exclusion)">
        {model.lanes.map((lane) => {
          const place = lanes.get(lane.id);
          if (!place) return null;
          const color = STATE_COLOR[lane.state];
          const op = laneOpacity(lane.id, lane.state);
          const lit = litLanes?.has(lane.id) ?? false;

          return (
            <g key={lane.id} data-shoot={`lane-${lane.id}`} data-lane={lane.id} data-state={lane.state}>
              {/* THE INTACT RUN: from the gutter to wherever this signal
                  stops agreeing with Reality. */}
              <path
                d={place.dIntact}
                fill="none"
                stroke={color}
                strokeWidth={lit ? 1.9 : 1.2}
                opacity={op}
                strokeDasharray={lane.supplied ? undefined : "3 5"}
                style={{ transition: "opacity 220ms ease, stroke-width 220ms ease" }}
              />
              {/* THE GHOST: everything past the break. Drawn faint and
                  dashed because the signal does NOT reach Reality intact —
                  the one visual idea the whole map is built on. */}
              {place.dGhost && (
                <path
                  d={place.dGhost}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  opacity={op * 0.34}
                  strokeDasharray="2 7"
                  style={{ transition: "opacity 220ms ease" }}
                />
              )}
              {/* THE BREAK ITSELF. */}
              {place.breakAt && (
                <>
                  <circle
                    cx={place.breakAt.x}
                    cy={place.breakAt.y}
                    r={lit ? 5 : 3.6}
                    fill="var(--i-void)"
                    stroke={color}
                    strokeWidth={1.6}
                    opacity={Math.max(op, lit ? 1 : 0.75)}
                    style={{ transition: "opacity 220ms ease, r 220ms ease" }}
                  />
                  <circle
                    cx={place.breakAt.x}
                    cy={place.breakAt.y}
                    r={1.4}
                    fill={color}
                    opacity={Math.max(op, lit ? 1 : 0.75)}
                  />
                </>
              )}
              {/* Junctions: only where a real checkpoint could be seated. */}
              {place.checkpoints.map((cp, idx) => {
                const check = lane.checkpoints.find((c) => c.id === cp.id);
                if (!check) return null;
                return (
                  <circle
                    key={cp.id}
                    cx={cp.at.x}
                    cy={cp.at.y}
                    r={lit ? 3.4 : 2.4}
                    fill={check.state === "verified" ? "var(--i-void)" : STATE_COLOR[check.state]}
                    stroke={STATE_COLOR[check.state]}
                    strokeWidth={1.3}
                    opacity={op * (lit ? 1 : 0.9)}
                    data-shoot={`junction-${lane.id}-${idx}`}
                  >
                    <title>{`${check.label} — ${check.detail}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* ── EVIDENCE SOLO · THE PROVENANCE ROUTE ───────────────────────
          Drawn THROUGH the existing network, not as a detached branch off
          to one side. The route a reader traces is the same geometry the
          lane already occupies — which is what makes it an answer to "why
          does Signal believe this" rather than a second diagram. */}
      {evidenceSolo && active && (
        <g style={{ pointerEvents: "none" }} data-shoot="evidence-solo-route">
          {[active.laneId, ...active.relatedLaneIds].map((laneId) => {
            const place = lanes.get(laneId);
            if (!place) return null;
            return (
              <g key={laneId} data-solo-lane={laneId}>
                <path
                  d={place.dIntact}
                  fill="none"
                  stroke={findingColor(active)}
                  strokeWidth={2.4}
                  opacity={0.9}
                  strokeLinecap="round"
                  mask="url(#ta-core-exclusion)"
                  style={{ filter: "drop-shadow(0 0 5px currentColor)", color: findingColor(active) }}
                />
                {/* The route stays honest about the break: a lit provenance
                    path does not suddenly reach Reality intact. */}
                {place.dGhost && (
                  <path
                    d={place.dGhost}
                    fill="none"
                    stroke={findingColor(active)}
                    strokeWidth={1.4}
                    opacity={0.4}
                    strokeDasharray="2 7"
                    mask="url(#ta-core-exclusion)"
                  />
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* ── REALITY ────────────────────────────────────────────────────
          The hero. Stable, engineered, protected — and visibly a different
          KIND of object from everything orbiting it. */}
      <g data-shoot="reality-core" style={{ pointerEvents: "none" }}>
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.busR + 34}
          fill={`url(#${candidate ? "ta-core-candidate" : "ta-core"})`}
          style={{ transition: "opacity 260ms ease" }}
        />
        {[FIELD.coreR + 20, FIELD.coreR + 10].map((r, i) => (
          <circle
            key={r}
            cx={FIELD.cx}
            cy={FIELD.cy}
            r={r}
            fill="none"
            stroke={candidate ? "var(--i-violet)" : "var(--i-signal)"}
            strokeWidth={1}
            opacity={0.2 + i * 0.12}
          />
        ))}
        <circle
          cx={FIELD.cx}
          cy={FIELD.cy}
          r={FIELD.coreR}
          fill="var(--i-void)"
          stroke={candidate ? "var(--i-violet)" : "var(--i-signal)"}
          strokeWidth={1.6}
          opacity={0.92}
        />
        <text
          x={FIELD.cx}
          y={FIELD.cy - 4}
          textAnchor="middle"
          fontSize={9}
          letterSpacing="0.17em"
          fill={candidate ? "var(--i-violet)" : "var(--i-signal)"}
          style={{ textTransform: "uppercase" }}
        >
          {candidate ? "Candidate" : "Accepted"}
        </text>
        <text
          x={FIELD.cx}
          y={FIELD.cy + 11}
          textAnchor="middle"
          fontSize={14}
          fill="var(--i-text)"
          letterSpacing="0.03em"
        >
          Reality
        </text>
        {candidate && (
          <text
            x={FIELD.cx}
            y={FIELD.cy + FIELD.coreR + 16}
            textAnchor="middle"
            fontSize={8.5}
            letterSpacing="0.16em"
            fill="var(--i-violet)"
            style={{ textTransform: "uppercase" }}
          >
            Not saved
          </text>
        )}
      </g>

      {/* ── LANE GUTTER ────────────────────────────────────────────────
          Labels own protected space. A track starts at FIELD.trackX, never
          under the text — the collision the concept images have. */}
      <g data-shoot="lane-gutter">
        {model.lanes.map((lane) => {
          const place = lanes.get(lane.id);
          if (!place) return null;
          const lit = litLanes?.has(lane.id) ?? false;
          const dim = litLanes ? (lit ? 1 : 0.3) : 1;
          return (
            <g key={lane.id} opacity={dim} style={{ transition: "opacity 220ms ease" }}>
              <text
                x={place.label.x}
                y={place.label.y + 3}
                textAnchor="end"
                fontSize={9.5}
                letterSpacing="0.15em"
                fill={lit ? "var(--i-text)" : "var(--i-text-soft)"}
                style={{ textTransform: "uppercase" }}
              >
                {lane.label}
              </text>
              {/* The connector between label and track: short, and clearly a
                  tie rather than the start of the signal itself. */}
              <line
                x1={FIELD.gutterX + 8}
                y1={place.label.y}
                x2={FIELD.trackX}
                y2={place.label.y}
                stroke={STATE_COLOR[lane.state]}
                strokeWidth={1}
                opacity={lit ? 0.85 : 0.3}
              />
            </g>
          );
        })}
      </g>

      {/* ── TIER 3 · FINDINGS ──────────────────────────────────────────
          Anchored to the real point on the lane where the disagreement is,
          connected by a short stem to a card in a deliberate perimeter seat. */}
      {model.findings.map((f) => {
        const place = findings.get(f.id);
        if (!place) return null;
        // HANDLED: settled, collapsed toward Reality, and visibly a
        // different kind of mark from a live disagreement.
        if (f.handled) {
          return (
            <g key={f.id} data-shoot={`finding-${f.id}`} data-handled="true" opacity={0.75}>
              <circle
                cx={place.anchor.x}
                cy={place.anchor.y}
                r={5}
                fill="var(--i-void)"
                stroke={CONFIRMED_COLOR}
                strokeWidth={1.4}
              />
              <path
                d={`M ${place.anchor.x - 2.2} ${place.anchor.y} l 1.6 1.7 l 3 -3.4`}
                fill="none"
                stroke={CONFIRMED_COLOR}
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x={place.anchor.x + 10}
                y={place.anchor.y + 3.5}
                fontSize={9.5}
                fill="var(--i-text-soft)"
              >
                {f.kindLabel} · handled
              </text>
            </g>
          );
        }
        return (
          <FindingCallout
            key={f.id}
            finding={f}
            anchor={place.anchor}
            card={place.card}
            side={place.side}
            selected={selectedId === f.id}
            hovered={hoveredId === f.id}
            dimmed={Boolean(selectedId) && selectedId !== f.id}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </svg>
  );
}

// ── THE CALLOUT ────────────────────────────────────────────────────────
//
// Compact, thin-bordered, one severity word, one icon in a holder of the
// same size as every other holder in Audit. Deliberately NOT a big coloured
// bubble: the card is a label on a reading, and the reading is the anchor
// out on the lane.

function FindingCallout({
  finding,
  anchor,
  card,
  side,
  selected,
  hovered,
  dimmed,
  onSelect,
  onHover,
}: {
  finding: TruthFinding;
  anchor: { x: number; y: number };
  card: { x: number; y: number } | null;
  side: "left" | "right" | "top" | "bottom";
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const color = findingColor(finding);
  const soft = findingSoft(finding);
  const Icon = findingIcon(finding.type, finding.blocking);

  // At rest a critical finding carries slightly more weight than the rest —
  // enough to be found in five seconds, not enough to shout over Reality.
  const restStrength = finding.tier === "critical" ? 0.62 : 0.4;
  const opacity = dimmed ? 0.22 : selected || hovered ? 1 : 0.94;

  const cardStyle: CSSProperties = {
    width: CARD.w,
    height: CARD.h,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "0 10px",
    borderRadius: 8,
    background: selected ? `color-mix(in srgb, ${color} 13%, var(--i-panel))` : "var(--i-panel)",
    border: `1px solid ${selected || hovered ? color : `color-mix(in srgb, ${color} ${restStrength * 100}%, var(--i-border))`}`,
    boxShadow: selected
      ? `0 0 0 1px ${soft}, 0 0 18px -4px ${color}, 0 6px 18px -8px rgba(0,0,0,0.85)`
      : hovered
        ? `0 0 10px -3px ${color}, 0 4px 12px -8px rgba(0,0,0,0.8)`
        : "0 2px 8px -6px rgba(0,0,0,0.9)",
    cursor: "pointer",
    transition: "border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease",
    transform: hovered && !selected ? "scale(1.025)" : "scale(1)",
    transformOrigin: "center",
  };

  return (
    <g
      opacity={opacity}
      style={{ transition: "opacity 220ms ease" }}
      data-shoot={`finding-${finding.id}`}
      data-tier={finding.tier}
      data-selected={selected ? "true" : undefined}
    >
      {/* The stem: routed, and it connects the CARD to the ANCHOR — the
          place on the lane where the disagreement actually sits. */}
      {card && (
        <path
          d={stemPath(card, side, anchor)}
          fill="none"
          stroke={color}
          strokeWidth={selected ? 1.5 : 1}
          opacity={selected ? 0.85 : 0.34}
          strokeDasharray={selected ? undefined : "3 4"}
        />
      )}
      <circle
        cx={anchor.x}
        cy={anchor.y}
        r={selected ? 5.5 : 3.6}
        fill="var(--i-void)"
        stroke={color}
        strokeWidth={1.6}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected ? null : finding.id);
        }}
      >
        <title>{`${finding.kindLabel} — ${finding.title}`}</title>
      </circle>
      <circle cx={anchor.x} cy={anchor.y} r={selected ? 2.2 : 1.5} fill={color} pointerEvents="none" />

      {card && (
      <foreignObject
        x={card.x - CARD.w / 2}
        y={card.y - CARD.h / 2}
        width={CARD.w}
        height={CARD.h}
        style={{ overflow: "visible" }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={`${finding.kindLabel}, ${finding.tier} severity: ${finding.title}`}
          className="audit-callout"
          style={cardStyle}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(selected ? null : finding.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(selected ? null : finding.id);
            }
          }}
          onMouseEnter={() => onHover(finding.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(finding.id)}
          onBlur={() => onHover(null)}
        >
          <IconHolder tone={color}>
            <Icon size={ICON_PX} />
          </IconHolder>
          <span style={{ minWidth: 0, flex: 1 }}>
            {/* KIND AND SEVERITY AS THE EYEBROW, THE FINDING'S OWN WORDS AS
                the line that matters. Kind alone does not identify anything:
                a real project carries three unresolved decisions at once, and
                three identical cards reading "Unresolved decision · critical"
                tell a reader nothing about which to click.

                MEANING IS NEVER CARRIED BY COLOUR ALONE — "human" is written
                next to the severity, not only implied by the violet. */}
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 8.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {finding.kindLabel}
              </span>
              {/* The tier never truncates. Ellipsising the severity out of
                  "UNRESOLVED DECISION · CRITICAL" left cards reading
                  "· C…", which loses the one word that decides what to
                  click first. */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 8.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color,
                  opacity: 0.9,
                }}
              >
                {finding.tier}
              </span>
            </span>
            <span
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                marginTop: 3,
                fontSize: 10.5,
                lineHeight: 1.3,
                color: "var(--i-text)",
              }}
            >
              {finding.title}
            </span>
          </span>
        </div>
      </foreignObject>
      )}
    </g>
  );
}
