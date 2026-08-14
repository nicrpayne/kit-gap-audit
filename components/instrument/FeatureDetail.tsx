"use client";

// FEATURE DETAIL — the plugin's advanced page, and the only place tickets
// appear in Scope at all.
//
// Five modes, one per honest question, using the suite's existing ToolWindow
// chrome so summoning depth feels identical in every instrument:
//
//   OVERVIEW  what this capability is, and how much of the release it is
//   WORK      the Linear issues underneath it — the implementation evidence
//   EVIDENCE  why the machine believes it exists at all
//   ESTIMATE  what the numbers rest on, and the one Scenario lever Scope owns
//   HISTORY   what has actually happened to it, from stored records only
//
// The rule that shaped every mode: a mode shows what the model holds, or it
// says plainly that the model holds nothing. There is no mode here that is
// filled out with plausible-looking material.

import { useMemo, useState } from "react";
import Link from "next/link";
import ToolWindow, { RailButton, Row } from "@/components/instrument/ToolWindow";
import { Prototype } from "@/components/instrument/Panel";
import { expectedDays, uncertaintyLabel, type Feature, type ThreePoint, type DraftFeature } from "@/lib/scope/features";
import type { ScopeWorkItem } from "@/lib/instrument/useProject";

type Mode = "overview" | "work" | "evidence" | "estimate" | "history";

const ESTIMATE_SOURCE: Record<string, string> = {
  ai: "Estimated by the model from the ticket's own content",
  points: "The team's Linear points, read as days with a fixed spread",
  issue_placeholder: "No estimate on the ticket — a deliberately wide 1–7 day guess",
  hint: "Parsed from a range someone actually stated",
  finding_placeholder: "Nobody sized this — a deliberately wide 2–12 day guess",
};

export default function FeatureDetail({
  feature,
  onClose,
  scopeName,
  capacity,
  releaseLoadDays,
  onToggle,
  onAccept,
  onSetEstimate,
  onClearEstimate,
}: {
  feature: Feature | null;
  onClose: () => void;
  scopeName: string;
  capacity: number;
  releaseLoadDays: number;
  onToggle: (out: boolean) => void;
  onAccept: (id: string) => void;
  onSetEstimate: (id: string, range: ThreePoint) => void;
  onClearEstimate: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("overview");
  if (!feature) return null;
  const f = feature;

  return (
    <ToolWindow
      open
      onClose={onClose}
      title={`${scopeName} · feature detail`}
      subtitle={f.name}
      width={352}
      docked
      dataShoot="feature-detail"
      footer={
        <div className="px-5 py-3 space-y-1.5">
          <button
            onClick={() => onToggle(!f.bypassed)}
            data-shoot="detail-toggle"
            className="w-full rounded-md px-3 py-2 text-[11.5px] transition-colors"
            style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
          >
            {f.bypassed ? "Put back in this release" : "Take out of this release"}
          </button>
          <Link
            href="/forecast"
            data-shoot="detail-forecast"
            className="block w-full rounded-md px-3 py-2 text-center text-[11px] transition-colors"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            See consequence in Forecast →
          </Link>
        </div>
      }
      rail={
        <>
          {(["overview", "work", "evidence", "estimate", "history"] as Mode[]).map((mo) => (
            <RailButton
              key={mo}
              label={mo}
              active={mode === mo}
              onClick={() => setMode(mo)}
              dataShoot={`mode-${mo}`}
              compact
            />
          ))}
        </>
      }
    >
      {mode === "overview" && (
        <Overview feature={f} capacity={capacity} releaseLoadDays={releaseLoadDays} />
      )}
      {mode === "work" && <Work feature={f} capacity={capacity} />}
      {mode === "evidence" && <Evidence feature={f} onAccept={onAccept} />}
      {mode === "estimate" && (
        <Estimate feature={f} capacity={capacity} onSetEstimate={onSetEstimate} onClearEstimate={onClearEstimate} />
      )}
      {mode === "history" && <History feature={f} />}
    </ToolWindow>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────

function Overview({
  feature: f,
  capacity,
  releaseLoadDays,
}: {
  feature: Feature;
  capacity: number;
  releaseLoadDays: number;
}) {
  const mapped = f.items.length + f.done.length;
  return (
    <div className="px-5 py-4">
      <p className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
        {f.source === "linear" && (
          <>
            A capability in Linear. {mapped} issue{mapped === 1 ? "" : "s"} hang from it, and this is what the release
            is carrying on its behalf.
          </>
        )}
        {f.source === "hermes" && (
          <>
            Hermes found this in a source and nothing in Linear represents it.{" "}
            <strong className="text-[var(--i-violet)]">It is a candidate, not accepted Reality</strong> — though the
            work it implies is already counted in the forecast.
          </>
        )}
        {f.source === "manual" && (
          <>
            You declared this capability in this session.{" "}
            <strong className="text-[var(--i-violet)]">It is not saved</strong> — Scope has no Feature table yet, so it
            lives until the Scenario is discarded.
          </>
        )}
        {f.source === "unmapped" && (
          <>
            Not a capability at all. These are work items with no parent in Linear, so nothing says which product
            capability they serve. That is a real gap, and closing it is a Linear job or an{" "}
            <strong className="text-[var(--i-text)]">Add capability</strong> job.
          </>
        )}
      </p>

      <div className="mt-3">
        <Row
          k="In this release"
          v={f.bypassed ? "No — out in this Scenario" : "Yes"}
          tone={f.bypassed ? "var(--i-violet)" : "var(--i-mint)"}
          changed={f.bypassed}
        />
        <Row
          k="Load"
          v={`${f.loadDays.toFixed(1)}d`}
          note={`${expectedDays(f.range).toFixed(1)}d of expected effort ÷ ${capacity.toFixed(2)} FTE`}
        />
        <Row
          k="Share of the release"
          v={releaseLoadDays > 0 && !f.bypassed ? `${((f.loadDays / releaseLoadDays) * 100).toFixed(0)}%` : "—"}
          note={f.bypassed ? "not being carried in this Scenario" : `of ${releaseLoadDays.toFixed(1)}d`}
        />
        <Row
          k="Certainty"
          v={uncertaintyLabel(f.uncertainty)}
          note={
            f.items.length === 0
              ? "no work mapped, so nothing to be certain about"
              : `range ${f.range.low.toFixed(0)}–${f.range.high.toFixed(0)}d${
                  f.placeholderCount > 0 ? ` · ${f.placeholderCount} item${f.placeholderCount === 1 ? "" : "s"} unestimated` : ""
                }`
          }
        />
        <Row
          k="Coverage"
          v={mapped === 0 ? "no work mapped" : `${f.done.length}/${mapped} done`}
          note={f.epic ? `in ${f.epic}` : "no Linear project"}
        />
      </div>

      {/* Release assignment: designed, not modelled. Fenced off and inert. */}
      <div className="mt-4 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
        <div className="flex items-center gap-2">
          <Prototype note="The model has no release entity. Nothing here changes the forecast." />
          <span className="i-label">Which release</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {["Beta", "Production", "Later"].map((r, i) => (
            <span
              key={r}
              className="rounded px-2.5 py-1 text-[10.5px]"
              style={{
                border: `1px solid ${i === 0 ? "var(--i-border-strong)" : "var(--i-border)"}`,
                color: i === 0 ? "var(--i-text-soft)" : "var(--i-text-faint)",
                background: i === 0 ? "var(--i-panel-raised)" : "transparent",
              }}
            >
              {r}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[var(--i-text-faint)] leading-snug">
          &ldquo;Move this to Production&rdquo; is a Scope operation and it is coming — but a WorkItem cannot belong to
          a release in the model yet, so these are inert. Taking a capability out of the Scenario is the honest version
          of the question today.
        </p>
      </div>

      {/* The control itself lives in the panel's pinned footer, where it stays
          reachable from every mode. This is what it will do. */}
      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        {f.bypassed
          ? "Out in this Scenario only. Reality still ships it, and discarding the Scenario brings it back."
          : `Taking it out removes its ${f.items.length} open item${
              f.items.length === 1 ? "" : "s"
            } from the simulation in this hypothetical. Nothing is deleted.`}
      </p>
    </div>
  );
}

// ── WORK ─────────────────────────────────────────────────────────────────

function Work({ feature: f, capacity }: { feature: Feature; capacity: number }) {
  if (f.items.length === 0 && f.done.length === 0)
    return (
      <Empty
        title="No work mapped yet"
        body="This capability exists as a declaration. Nothing in Linear hangs from it, so it carries no load and the forecast is unaffected by it."
      />
    );

  return (
    <div className="px-5 py-4">
      <div className="i-label mb-2">
        Open · {f.items.length} item{f.items.length === 1 ? "" : "s"}
      </div>
      <ul>
        {f.items.map((i) => (
          <li key={i.id} className="py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 text-[11.5px] text-[var(--i-text)] leading-snug">{i.label}</span>
              <span className="shrink-0 i-readout text-[11px] text-[var(--i-text-soft)]">
                {(expectedDays({ low: i.low, likely: i.likely, high: i.high }) / (capacity > 0 ? capacity : 1)).toFixed(
                  1
                )}
                d
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[9.5px] text-[var(--i-text-faint)]">
              <span>{i.state ?? "inferred work"}</span>
              <span>{i.assignee ?? "nobody assigned"}</span>
              <span>
                {i.low}–{i.high}d
              </span>
              {i.points !== null && <span>{i.points} pts</span>}
              {i.parentIdentifier && i.parentIdentifier !== f.id && (
                <span title="This is a sub-issue; its feature was resolved by walking the parent chain.">
                  sub-issue of {i.parentIdentifier}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {f.done.length > 0 && (
        <>
          <div className="i-label mt-4 mb-2">Done · {f.done.length}</div>
          <ul>
            {f.done.map((d) => (
              <li
                key={d.id}
                className="py-1.5 flex items-baseline gap-2"
                style={{ borderTop: "1px solid var(--i-border)" }}
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-faint)] line-through">
                  {d.label}
                </span>
                <span className="shrink-0 text-[9.5px] text-[var(--i-text-faint)]">
                  {d.completedAt ? new Date(d.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Only open work is simulated. Finished issues are shown for coverage so a capability is not mistaken for its
        unfinished half.
      </p>
    </div>
  );
}

// ── EVIDENCE ─────────────────────────────────────────────────────────────

function Evidence({ feature: f, onAccept }: { feature: Feature; onAccept: (id: string) => void }) {
  if (f.source === "hermes" && f.evidence)
    return (
      <div className="px-5 py-4">
        <div className="i-label" style={{ color: "var(--i-violet)" }}>
          Why the machine believes this exists
        </div>
        <div className="mt-2 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
          <div className="text-[11.5px] italic text-[var(--i-text-soft)] leading-relaxed">
            &ldquo;{f.evidence.quote}&rdquo;
          </div>
          {f.evidence.rationale && (
            <div className="mt-2 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">{f.evidence.rationale}</div>
          )}
        </div>
        <div className="mt-3">
          <Row k="Represented in Linear" v="No" tone="var(--i-amber)" note="no ticket covers this" />
          <Row k="Counted in the forecast" v="Yes" note="the audit's estimate is already simulated" />
          <Row
            k="Accepted as a capability"
            v={f.accepted ? "Yes — in this Scenario" : "Not yet"}
            tone="var(--i-violet)"
            note={f.accepted ? "seated by hand; not written anywhere" : "this is a candidate"}
          />
        </div>

        <div className="mt-3 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
          <div className="flex items-center gap-2">
            <Prototype note="There is no Feature table yet, so acceptance is not written anywhere." />
            <span className="i-label">Seat it into the release</span>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-snug">
            Accepting sets the candidate down on the tray with everything else in Reality. It changes no forecast
            input — this work was already being counted — so the only thing that moves is what we call a capability.
          </p>
          <button
            onClick={() => onAccept(f.id)}
            data-shoot="accept-candidate"
            className="mt-2.5 w-full rounded-md px-3 py-2 text-[11.5px] transition-colors"
            style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
          >
            {f.accepted ? "Return it to candidate" : "Accept as a capability"}
          </button>
        </div>
        <p className="mt-3 text-[10.5px] text-[var(--i-text-soft)] leading-relaxed">
          Accepting a candidate means writing it down as a first-class capability, which needs the Feature table Scope
          does not have yet. Until then it stays a candidate here, and the work it implies keeps being counted — which
          is the safe way round.
        </p>
        <Link
          href="/audit"
          className="mt-3 inline-block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          Intelligence owns the investigation →
        </Link>
      </div>
    );

  if (f.source === "unmapped")
    return (
      <Empty
        title="Nothing to attribute"
        body="These items have no parent in Linear, so there is no capability to gather evidence about. The evidence you want here is a decision about where this work belongs."
      />
    );

  return (
    <div className="px-5 py-4">
      <p className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
        This capability comes from Linear&apos;s own structure — {f.items.length + f.done.length} issues share it as a
        parent. That is the evidence: somebody organised the work this way.
      </p>
      <div className="mt-3">
        <Row k="Source" v="Linear parent" note={f.id} />
        <Row k="Project" v={f.epic ?? "—"} note="the epic this sits in" />
      </div>
      <p className="mt-3 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
        No wiki or meeting evidence is attached to it. Scope does not go looking — Intelligence does, and anything it
        finds that Linear does not represent arrives here as its own candidate capability.
      </p>
      <Link
        href="/audit"
        className="mt-3 inline-block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
      >
        Intelligence owns the investigation →
      </Link>
    </div>
  );
}

// ── ESTIMATE ─────────────────────────────────────────────────────────────

function Estimate({
  feature: f,
  capacity,
  onSetEstimate,
  onClearEstimate,
}: {
  feature: Feature;
  capacity: number;
  onSetEstimate: (id: string, range: ThreePoint) => void;
  onClearEstimate: (id: string) => void;
}) {
  const [tuning, setTuning] = useState<string | null>(null);
  if (f.items.length === 0)
    return <Empty title="Nothing to estimate" body="No open work is mapped to this capability, so it carries no range." />;

  const tuned = f.items.find((i) => i.id === tuning) ?? null;
  return (
    <div className="px-5 py-4">
      <Row
        k="Aggregate range"
        v={`${f.range.low.toFixed(0)} – ${f.range.high.toFixed(0)}d`}
        note={`expected ${expectedDays(f.range).toFixed(1)}d of effort, summed across ${f.items.length} items`}
      />
      <Row k="Load" v={`${f.loadDays.toFixed(1)}d`} note={`÷ ${capacity.toFixed(2)} FTE`} />
      <Row
        k="Certainty"
        v={uncertaintyLabel(f.uncertainty)}
        note={
          f.placeholderCount > 0
            ? `${f.placeholderCount} of ${f.items.length} items rest on a placeholder guess`
            : "every item has a real estimate behind it"
        }
      />

      <div className="i-label mt-4 mb-2">Where each number comes from</div>
      <ul>
        {f.items.map((i) => (
          <li key={i.id} className="py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{i.label}</span>
              <span className="shrink-0 i-readout text-[11px] text-[var(--i-text)]">
                {i.low}–{i.likely}–{i.high}d
              </span>
              <button
                onClick={() => setTuning(tuning === i.id ? null : i.id)}
                data-shoot="tune-estimate"
                className="shrink-0 rounded px-2 py-1 text-[9.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                {tuning === i.id ? "done" : "re-estimate"}
              </button>
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">
              {ESTIMATE_SOURCE[i.estimateSource] ?? i.estimateSource}
            </div>
          </li>
        ))}
      </ul>

      {tuned && (
        <EstimatePad
          item={tuned}
          capacity={capacity}
          onChange={(r) => onSetEstimate(tuned.id, r)}
          onReset={() => onClearEstimate(tuned.id)}
        />
      )}

      <p className="mt-3 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Re-estimating simulates a different range in this Scenario only. The stored estimate is never written.
      </p>
    </div>
  );
}

// The one continuous control Scope owns. Two real dimensions, because a
// three-point estimate has exactly two things worth saying about it: how big,
// and how sure. Reality's own estimate stays on the pad as a ghost, so the
// size of the claim you are making is always visible.
function EstimatePad({
  item,
  capacity,
  onChange,
  onReset,
}: {
  item: ScopeWorkItem;
  capacity: number;
  onChange: (r: ThreePoint) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const stored = useMemo<ThreePoint>(() => ({ low: item.low, likely: item.likely, high: item.high }), [item]);
  const maxLikely = Math.max(1, stored.likely * 2.5);
  const storedSpread = Math.max(0.5, stored.high - stored.low);
  const maxSpread = storedSpread * 2.5;
  // Keep the stored estimate's own asymmetry: one that skewed pessimistic in
  // Reality keeps skewing pessimistic when you widen it.
  const leftShare = (stored.likely - stored.low) / storedSpread;

  const x = Math.min(1, stored.likely / maxLikely);
  const y = Math.min(1, storedSpread / maxSpread);

  const emit = (nx: number, ny: number) => {
    const likely = Math.max(0.5, Math.round(nx * maxLikely * 2) / 2);
    const spread = Math.max(0, Math.round(ny * maxSpread * 2) / 2);
    const low = Math.max(0.1, Math.round((likely - spread * leftShare) * 10) / 10);
    onChange({ low, likely, high: Math.max(Math.round((low + spread) * 10) / 10, likely) });
  };
  const fromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    emit(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    );
  };

  return (
    <div className="mt-3 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
      <div className="flex items-baseline justify-between">
        <span className="i-label">Re-estimate — hypothetical</span>
        <button onClick={onReset} className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
          back to Reality
        </button>
      </div>
      <div
        className="i-meter relative mt-2"
        style={{ height: 118, touchAction: "none" }}
        role="application"
        aria-label="Estimate pad: horizontal is how big, vertical is how unsure"
        data-shoot="estimate-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => dragging && fromEvent(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {[25, 50, 75].map((g) => (
          <span
            key={`v${g}`}
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: `${g}%`, width: 1, background: "var(--i-border)", opacity: 0.5 }}
          />
        ))}
        {[25, 50, 75].map((g) => (
          <span
            key={`h${g}`}
            className="absolute inset-x-0 pointer-events-none"
            style={{ top: `${g}%`, height: 1, background: "var(--i-border)", opacity: 0.5 }}
          />
        ))}
        <span
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            background: "var(--i-violet)",
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
        <span className="i-readout text-[12px] text-[var(--i-text)]">
          {stored.low} – {stored.likely} – {stored.high}d
        </span>
        <span className="text-[10px] text-[var(--i-text-faint)]">
          {(expectedDays(stored) / (capacity > 0 ? capacity : 1)).toFixed(1)}d of schedule
        </span>
      </div>
    </div>
  );
}

// ── HISTORY ──────────────────────────────────────────────────────────────

function History({ feature: f }: { feature: Feature }) {
  // Only stored records. There is no feature-level change log in the model,
  // so this shows the events that genuinely exist -- work completing -- and
  // says so rather than inventing a narrative.
  const events = [...f.done]
    .filter((d) => d.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="px-5 py-4">
      {events.length === 0 ? (
        <Empty
          title="Nothing recorded yet"
          body="No work under this capability has completed, and the model keeps no history of a capability's own shape — there is no Feature table to record changes against."
        />
      ) : (
        <>
          <div className="i-label mb-2">What has completed</div>
          <ul>
            {events.map((d) => (
              <li key={d.id} className="py-2 flex items-baseline gap-3" style={{ borderTop: "1px solid var(--i-border)" }}>
                <span className="shrink-0 i-readout text-[10px] text-[var(--i-text-faint)]" style={{ width: 46 }}>
                  {new Date(d.completedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span className="min-w-0 flex-1 text-[11px] text-[var(--i-text-soft)] leading-snug">{d.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Scope keeps no record of how a capability&apos;s own definition changed over time. When features become
        first-class, that record becomes possible — and worth having.
      </p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-8">
      <div className="text-[12.5px] text-[var(--i-text)]">{title}</div>
      <p className="mt-1.5 text-[11px] text-[var(--i-text-faint)] leading-relaxed">{body}</p>
    </div>
  );
}

// ── ADD CAPABILITY ───────────────────────────────────────────────────────

export function AddFeature({
  open,
  onClose,
  unmappedItems,
  capacity,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  unmappedItems: ScopeWorkItem[];
  capacity: number;
  onCreate: (draft: DraftFeature) => void;
}) {
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!open) return null;

  const pickedDays = unmappedItems
    .filter((i) => picked.has(i.id))
    .reduce((s, i) => s + expectedDays({ low: i.low, likely: i.likely, high: i.high }) / (capacity > 0 ? capacity : 1), 0);

  return (
    <ToolWindow open onClose={onClose} title="Scope" subtitle="Add a capability" width={470} dataShoot="add-feature-tool">
      <div className="px-5 py-4">
        <label className="i-label" htmlFor="feature-name">
          Name
        </label>
        <input
          id="feature-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Offline Capture"
          autoFocus
          className="mt-1.5 w-full rounded px-3 py-2 text-[13px]"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        />

        <label className="i-label mt-3.5 block" htmlFor="feature-intent">
          What it is for
        </label>
        <textarea
          id="feature-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={2}
          placeholder="Field teams must capture work without connectivity."
          className="mt-1.5 w-full rounded px-3 py-2 text-[12px] leading-relaxed resize-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        />

        {unmappedItems.length > 0 && (
          <>
            <div className="i-label mt-4">Claim work that is not mapped yet</div>
            <p className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
              Optional. This moves the work out of Unmapped and under this capability — the release load does not
              change, only where it is attributed.
            </p>
            <ul className="mt-2 max-h-[186px] overflow-y-auto">
              {unmappedItems.map((i) => {
                const on = picked.has(i.id);
                return (
                  <li key={i.id} style={{ borderTop: "1px solid var(--i-border)" }}>
                    <button
                      onClick={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(i.id);
                          else next.add(i.id);
                          return next;
                        })
                      }
                      data-shoot="claim-item"
                      className="w-full py-2 flex items-center gap-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className="shrink-0 rounded-sm"
                        style={{
                          width: 13,
                          height: 13,
                          border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                          background: on ? "var(--i-violet)" : "transparent",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{i.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-4 rounded px-3 py-2.5" style={{ background: "var(--i-recess)" }}>
          <div className="flex items-center gap-2">
            <Prototype note="There is no Feature table yet, so this is not written anywhere." />
            <span className="text-[10.5px] text-[var(--i-text-soft)]">Not saved — lives with this Scenario</span>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-snug">
            A capability you declare here is real to the instrument and disappears when the Scenario is discarded.
            Making it durable needs one small migration, described in docs/SCOPE-INSTRUMENT.md.
          </p>
        </div>

        <button
          disabled={name.trim().length === 0}
          onClick={() =>
            onCreate({
              id: `draft-${Date.now().toString(36)}`,
              name: name.trim(),
              intent: intent.trim(),
              itemIds: [...picked],
            })
          }
          data-shoot="create-feature"
          className="mt-4 w-full rounded-md px-3 py-2.5 text-[12px] transition-colors disabled:opacity-30"
          style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
        >
          Add {name.trim() || "capability"}
          {picked.size > 0 && ` with ${picked.size} item${picked.size === 1 ? "" : "s"} · ${pickedDays.toFixed(1)}d`}
        </button>
      </div>
    </ToolWindow>
  );
}
