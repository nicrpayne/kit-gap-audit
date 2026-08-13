"use client";

// Scope's summoned tools. Same chrome as Forecast's (ToolWindow), because
// reaching for depth should feel identical everywhere in the suite — what
// differs is what the tool is about, never how it arrives.
//
// Three tools, one job each:
//   WORK DETAIL      one piece of work: where it came from, how well we know
//                    it, what it is costing, and the two things Scope may do
//                    to it (take it out, or re-estimate it hypothetically).
//   SCOPE COMPARISON Reality against the Scenario, including the honest case
//                    where the cut bought nothing.
//   RELEASE BOUNDARY the Beta/Production question, drawn but NOT wired — the
//                    engine has no release entity, so this changes nothing.

import { useState } from "react";
import Link from "next/link";
import ToolWindow, { Row } from "@/components/instrument/ToolWindow";
import { Prototype } from "@/components/instrument/Panel";
import { fmtFull, deltaLabel, deltaTone } from "@/lib/instrument/useProject";
import type { LoadComposition, Stratum, Dominance, ThreePointRange } from "@/lib/scope/load";
import type { SimulationResult } from "@/lib/forecast/simulate";

const ESTIMATE_SOURCE: Record<string, { label: string; help: string }> = {
  ai: { label: "Estimated by the model", help: "An AI estimate from the ticket's own content." },
  points: { label: "The team's points", help: "Linear estimate points, read as days with a fixed spread." },
  issue_placeholder: {
    label: "No estimate — placeholder",
    help: "This ticket carries no estimate, so the forecast uses a deliberately wide 1–7 day guess.",
  },
  hint: { label: "From a stated range", help: "Parsed out of what the source actually said." },
  finding_placeholder: {
    label: "No estimate — placeholder",
    help: "Nobody sized this, so the forecast uses a deliberately wide 2–12 day guess.",
  },
};

// ── WORK DETAIL ─────────────────────────────────────────────────────────

export function WorkDetail({
  open,
  onClose,
  stratum,
  scopeName,
  capacity,
  loadDays,
  onExclude,
  onRestore,
  onSetEstimate,
  onClearEstimate,
}: {
  open: boolean;
  onClose: () => void;
  stratum: Stratum | null;
  scopeName: string;
  capacity: number;
  loadDays: number;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
  onSetEstimate: (id: string, range: ThreePointRange) => void;
  onClearEstimate: (id: string) => void;
}) {
  if (!open || !stratum) return null;
  const it = stratum.item;
  const src = ESTIMATE_SOURCE[it.estimateSource] ?? { label: it.estimateSource, help: "" };
  const stored: ThreePointRange = { low: it.low, likely: it.likely, high: it.high };

  return (
    <ToolWindow
      open={open}
      onClose={onClose}
      title={it.kind === "ticket" ? `${it.id} · ${scopeName}` : `Inferred work · ${scopeName}`}
      subtitle={it.label}
      width={440}
      dataShoot="work-detail"
    >
      <div className="px-5 py-3">
        <div className="pb-2 text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          {it.kind === "ticket"
            ? "A ticket in Linear. It is in the release because it is not finished, and this Scope's filters match it."
            : "Not a ticket. The audit found this in a source and nothing covers it, so the model counts it as real work."}
        </div>

        {it.kind === "inferred" && it.quote && (
          <div
            className="my-2 rounded px-3 py-2 text-[11px] leading-relaxed"
            style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}
          >
            <span className="i-label">What was said</span>
            <div className="mt-1 italic">“{it.quote}”</div>
            {it.rationale && <div className="mt-1.5 text-[10.5px] text-[var(--i-text-faint)]">{it.rationale}</div>}
          </div>
        )}

        <Row
          k="Costs"
          v={`${stratum.days.toFixed(1)}d of schedule`}
          note={`its ${stratum.range.low}–${stratum.range.likely}–${stratum.range.high}d range averages ${(
            (stratum.range.low + stratum.range.likely + stratum.range.high) /
            3
          ).toFixed(1)}d of effort, ÷ ${capacity.toFixed(2)} FTE`}
        />
        <Row
          k="Share of the load"
          v={`${((stratum.days / Math.max(0.001, loadDays)) * 100).toFixed(0)}%`}
          note={`of ${loadDays.toFixed(1)}d currently carried`}
        />
        <Row
          k="Range"
          v={`${stratum.range.low}–${stratum.range.high}d`}
          note={src.help}
          tone={stratum.overridden ? "var(--i-violet)" : undefined}
          changed={stratum.overridden}
        />
        <Row k="Estimate came from" v={src.label} />
        {it.kind === "ticket" && <Row k="Status" v={it.state ?? "—"} note={it.assignee ? `held by ${it.assignee}` : "nobody assigned"} />}
        {it.points !== null && <Row k="Team pointed it" v={`${it.points}`} />}
      </div>

      <EstimatePad
        stored={stored}
        current={stratum.range}
        overridden={stratum.overridden}
        capacity={capacity}
        onChange={(r) => onSetEstimate(it.id, r)}
        onReset={() => onClearEstimate(it.id)}
      />

      <div className="px-5 py-4" style={{ borderTop: "1px solid var(--i-border)" }}>
        {stratum.excluded ? (
          <>
            <button
              onClick={() => onRestore(it.id)}
              data-shoot="detail-restore"
              className="w-full rounded-md px-3 py-2.5 text-[12px] transition-colors"
              style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
            >
              Put back in Scenario
            </button>
            <p className="mt-2 text-[10px] text-[var(--i-text-faint)] leading-snug">
              This work is out in the Scenario only. Reality still has it, and discarding the Scenario brings it back.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => onExclude(it.id)}
              data-shoot="detail-exclude"
              className="w-full rounded-md px-3 py-2.5 text-[12px] transition-colors"
              style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
            >
              Take out of Scenario
            </button>
            <p className="mt-2 text-[10px] text-[var(--i-text-faint)] leading-snug">
              Removes it from the simulation in this hypothetical. Nothing is deleted, and Reality is unchanged.
            </p>
          </>
        )}
      </div>
    </ToolWindow>
  );
}

// ── THE ESTIMATE PAD ────────────────────────────────────────────────────
//
// One control, two real dimensions, because a three-point estimate has
// exactly two things worth saying about it: how big, and how sure. Dragging
// right makes the work bigger; dragging down makes it less certain. Reality's
// own estimate stays on the pad as a ghost so the size of the claim you are
// making is always visible.
//
// Low and high are derived from the likely value and the spread, keeping the
// stored estimate's own asymmetry — an estimate that skewed pessimistic in
// Reality keeps skewing pessimistic when you widen it, rather than being
// quietly recentred.
function EstimatePad({
  stored,
  current,
  overridden,
  capacity,
  onChange,
  onReset,
}: {
  stored: ThreePointRange;
  current: ThreePointRange;
  overridden: boolean;
  capacity: number;
  onChange: (r: ThreePointRange) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const maxLikely = Math.max(1, stored.likely * 2.5);
  const storedSpread = Math.max(0.5, stored.high - stored.low);
  const maxSpread = storedSpread * 2.5;
  const leftShare = storedSpread > 0 ? (stored.likely - stored.low) / storedSpread : 0.4;

  const curSpread = Math.max(0, current.high - current.low);
  const x = Math.min(1, current.likely / maxLikely);
  const y = Math.min(1, curSpread / maxSpread);
  const gx = Math.min(1, stored.likely / maxLikely);
  const gy = Math.min(1, storedSpread / maxSpread);

  const emit = (nx: number, ny: number) => {
    const likely = Math.max(0.5, Math.round(nx * maxLikely * 2) / 2);
    const spread = Math.max(0, Math.round(ny * maxSpread * 2) / 2);
    const low = Math.max(0.1, Math.round((likely - spread * leftShare) * 10) / 10);
    const high = Math.round((low + spread) * 10) / 10;
    onChange({ low, likely, high: Math.max(high, likely) });
  };

  const fromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    emit(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    );
  };

  return (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--i-border)" }}>
      <div className="flex items-baseline justify-between">
        <span className="i-label">Re-estimate — hypothetical</span>
        {overridden && (
          <button onClick={onReset} className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
            Back to Reality&apos;s estimate
          </button>
        )}
      </div>

      <div
        className="i-meter relative mt-2.5"
        style={{ height: 132, touchAction: "none" }}
        role="application"
        aria-label="Estimate pad: horizontal is how big, vertical is how unsure"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => dragging && fromEvent(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        data-shoot="estimate-pad"
      >
        {/* Quarter guides. Enough structure to aim at, not a chart. */}
        {[25, 50, 75].map((g) => (
          <span key={`v${g}`} className="absolute inset-y-0 pointer-events-none" style={{ left: `${g}%`, width: 1, background: "var(--i-border)", opacity: 0.5 }} />
        ))}
        {[25, 50, 75].map((g) => (
          <span key={`h${g}`} className="absolute inset-x-0 pointer-events-none" style={{ top: `${g}%`, height: 1, background: "var(--i-border)", opacity: 0.5 }} />
        ))}
        {/* Reality's estimate, always visible as the thing you are departing from. */}
        <span
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${gx * 100}%`,
            top: `${gy * 100}%`,
            width: 9,
            height: 9,
            marginLeft: -4.5,
            marginTop: -4.5,
            border: "1px dashed var(--i-reality)",
          }}
        />
        <span
          className="absolute inset-y-0 pointer-events-none"
          style={{ left: `${x * 100}%`, width: 1, background: overridden ? "var(--i-violet)" : "var(--i-text-faint)", opacity: 0.35 }}
        />
        <span
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: `${y * 100}%`, height: 1, background: overridden ? "var(--i-violet)" : "var(--i-text-faint)", opacity: 0.35 }}
        />
        <span
          className="absolute pointer-events-none"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: 999,
            background: overridden ? "var(--i-violet)" : "var(--i-text)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
            transition: dragging ? "none" : "left 160ms ease, top 160ms ease",
          }}
        />
        <span className="absolute left-2 bottom-1.5 text-[9px] text-[var(--i-text-faint)] pointer-events-none">
          less certain ↓
        </span>
        <span className="absolute right-2 top-1.5 text-[9px] text-[var(--i-text-faint)] pointer-events-none">
          bigger →
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="i-readout text-[13px]" style={{ color: overridden ? "var(--i-violet)" : "var(--i-text)" }}>
          {current.low} – {current.likely} – {current.high}d
        </span>
        <span className="text-[10px] text-[var(--i-text-faint)]">
          {(current.likely / Math.max(0.001, capacity)).toFixed(1)}d of schedule
          {overridden && ` · Reality ${stored.low}–${stored.likely}–${stored.high}d`}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Simulated instead of the stored estimate, in this Scenario only. The stored estimate is never written.
      </p>
    </div>
  );
}

// ── SCOPE COMPARISON ────────────────────────────────────────────────────

export function ScopeComparison({
  open,
  onClose,
  scopeName,
  reality,
  scenario,
  realityResult,
  scenarioResult,
  startDate,
  dominance,
  active,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  scopeName: string;
  reality: LoadComposition;
  scenario: LoadComposition;
  realityResult: SimulationResult;
  scenarioResult: SimulationResult;
  startDate: Date;
  dominance: Dominance | null;
  active: boolean;
  onRestore: (id: string) => void;
}) {
  const moved = Math.round(
    (scenarioResult.likelyDate.getTime() - realityResult.likelyDate.getTime()) / 86400000
  );
  const loadDelta = scenario.loadDays - reality.loadDays;

  return (
    <ToolWindow
      open={open}
      onClose={onClose}
      title={`${scopeName} · Reality vs Scenario`}
      subtitle={active ? "What this hypothetical actually changes" : "Nothing is being hypothesised yet"}
      width={460}
      dataShoot="compare"
    >
      <div className="px-5 py-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="rounded p-3" style={{ background: "var(--i-recess)" }}>
            <div className="i-label" style={{ color: "var(--i-reality)" }}>
              Reality
            </div>
            <div className="i-readout mt-1.5 text-[15px] text-[var(--i-text)]">{fmtFull(realityResult.likelyDate)}</div>
            <div className="mt-1.5 text-[10.5px] text-[var(--i-text-faint)]">
              {reality.strata.length} items in · {reality.loadDays.toFixed(1)}d load
            </div>
          </div>
          <div
            className="rounded p-3"
            style={{ background: active ? "var(--i-violet-soft)" : "var(--i-recess)" }}
          >
            <div className="i-label" style={{ color: active ? "var(--i-violet)" : "var(--i-text-faint)" }}>
              Scenario
            </div>
            <div
              className="i-readout mt-1.5 text-[15px]"
              style={{ color: active ? "var(--i-violet)" : "var(--i-text-soft)" }}
            >
              {fmtFull(scenarioResult.likelyDate)}
            </div>
            <div className="mt-1.5 text-[10.5px] text-[var(--i-text-faint)]">
              {scenario.strata.length} items in · {scenario.out.length} out · {scenario.loadDays.toFixed(1)}d load
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Row
            k="Load given back"
            v={`${loadDelta <= 0 ? "" : "+"}${(-loadDelta).toFixed(1)}d`}
            note="work removed, plus any re-estimate, divided by capacity"
          />
          <Row
            k="Date moved"
            v={deltaLabel(moved)}
            tone={deltaTone(moved)}
            note={moved === 0 ? "the backlog is not what is setting this date" : "read from the same 5000 trials"}
          />
          {dominance && (
            <Row
              k="Can't land before"
              v={fmtFull(new Date(startDate.getTime() + dominance.floorDays * 86400000))}
              tone={dominance.dominated ? "var(--i-amber)" : undefined}
              note={
                dominance.phrase
                  ? `even with an empty backlog — ${dominance.phrase}`
                  : "nothing outside the backlog is holding this"
              }
            />
          )}
        </div>

        {/* The honest paragraph. This is the one thing a backlog tool never
            says, and the reason the instrument separates load from date. */}
        {active && (
          <div
            className="mt-3 rounded px-3 py-2.5 text-[11px] leading-relaxed"
            style={{
              background: "var(--i-recess)",
              color: "var(--i-text-soft)",
              borderLeft: `2px solid ${moved === 0 ? "var(--i-amber)" : "var(--i-mint)"}`,
            }}
          >
            {moved === 0 ? (
              <>
                Taking {scenario.out.length === 1 ? "this work" : "these items"} out removed{" "}
                {(-loadDelta).toFixed(1)}d of load and did not move the date at all.{" "}
                {dominance && dominance.phrase ? (
                  <>
                    {scopeName} cannot finish before{" "}
                    {fmtFull(new Date(startDate.getTime() + dominance.floorDays * 86400000))} because {dominance.phrase}
                    . Cutting more work here will not change that.
                  </>
                ) : (
                  <>The remaining work is still the binding constraint.</>
                )}
              </>
            ) : (
              <>
                {(-loadDelta).toFixed(1)}d of load came off and {scopeName} lands {deltaLabel(moved)}.
                {dominance && dominance.headroomDays > 0.5 && (
                  <> There is {dominance.headroomDays.toFixed(0)}d of further cutting available before other
                  constraints take over.</>
                )}
              </>
            )}
          </div>
        )}

        {scenario.out.length > 0 && (
          <div className="mt-3">
            <div className="i-label mb-2">Out in this Scenario</div>
            <ul className="space-y-1">
              {scenario.out.map((s) => (
                <li key={s.item.id} className="flex items-center gap-2 py-1" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{s.item.label}</span>
                  <span className="shrink-0 i-readout text-[11px]" style={{ color: "var(--i-violet)" }}>
                    {s.days.toFixed(1)}d
                  </span>
                  <button
                    onClick={() => onRestore(s.item.id)}
                    className="shrink-0 rounded px-2 py-1 text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                    style={{ border: "1px solid var(--i-border-strong)" }}
                  >
                    Put back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 pt-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--i-border)" }}>
          <Link
            href="/forecast"
            className="rounded-md px-3 py-2 text-[11px] transition-colors"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            See the whole consequence in Forecast →
          </Link>
        </div>
      </div>
    </ToolWindow>
  );
}

// ── RELEASE BOUNDARY (PROTOTYPE) ────────────────────────────────────────
//
// The question Scope will eventually have to answer — "what if Offline isn't
// required for Beta?" — drawn so the interaction can be judged, and wired to
// nothing. The engine has no release entity: a WorkItem cannot truthfully be
// "moved to Production", so nothing in here reaches the simulation, and the
// window says so before it shows anything.
export function ReleaseBoundary({
  open,
  onClose,
  scopeName,
  strata,
  axisDepth,
}: {
  open: boolean;
  onClose: () => void;
  scopeName: string;
  strata: Stratum[];
  axisDepth: number;
}) {
  const [cutAfter, setCutAfter] = useState(3);
  const inBeta = strata.slice(0, cutAfter);
  const afterBeta = strata.slice(cutAfter);
  const betaDays = inBeta.reduce((s, x) => s + x.days, 0);
  const laterDays = afterBeta.reduce((s, x) => s + x.days, 0);

  return (
    <ToolWindow
      open={open}
      onClose={onClose}
      title={`${scopeName} · Release boundary`}
      subtitle="Designed, not modelled"
      width={440}
      dataShoot="boundary"
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-2.5">
          <Prototype note="The engine has no release entity. Nothing in this window changes the simulation." />
          <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
            Scope has no way to say &ldquo;this ships after Beta&rdquo; yet — the model has one release per Scope and no
            milestone of its own. This is what the interaction would be, so it can be judged before it is built.{" "}
            <strong className="text-[var(--i-amber)]">Nothing here affects the forecast.</strong>
          </p>
        </div>

        <div className="mt-4">
          <label className="i-label" htmlFor="boundary-range">
            Beta takes the heaviest {cutAfter} of {strata.length}
          </label>
          <input
            id="boundary-range"
            type="range"
            min={0}
            max={strata.length}
            value={cutAfter}
            onChange={(e) => setCutAfter(parseInt(e.target.value, 10))}
            className="mt-2 w-full accent-[var(--i-text-faint)]"
          />
        </div>

        <div className="mt-3 space-y-px">
          {strata.map((s, i) => {
            const beta = i < cutAfter;
            return (
              <div key={s.item.id}>
                {i === cutAfter && (
                  <div className="flex items-center gap-2 py-2">
                    <span className="h-px flex-1" style={{ background: "var(--i-text-faint)" }} />
                    <span className="i-label">after Beta</span>
                    <span className="h-px flex-1" style={{ background: "var(--i-text-faint)" }} />
                  </div>
                )}
                <div
                  className="flex items-center gap-2 rounded px-2 py-1.5"
                  style={{ background: beta ? "rgba(243,240,230,0.05)" : "transparent", opacity: beta ? 1 : 0.5 }}
                >
                  <span
                    className="shrink-0"
                    style={{
                      width: 3,
                      height: Math.max(6, (s.days / axisDepth) * 190),
                      background: beta ? "var(--i-text-soft)" : "var(--i-text-faint)",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{s.item.label}</span>
                  <span className="shrink-0 text-[10px] text-[var(--i-text-faint)]">{s.days.toFixed(1)}d</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-3 text-[11px] text-[var(--i-text-faint)]" style={{ borderTop: "1px solid var(--i-border)" }}>
          Beta would carry {betaDays.toFixed(1)}d of load; {afterBeta.length} items and {laterDays.toFixed(1)}d would
          wait. To make this real the model needs a release entity a WorkItem can belong to — until then, taking work
          out of the Scenario is the honest version of this question.
        </div>
      </div>
    </ToolWindow>
  );
}
