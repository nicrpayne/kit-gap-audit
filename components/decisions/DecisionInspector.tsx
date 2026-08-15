"use client";

// THE INSPECTOR — where evidence and provenance live.
//
// The circuit is deliberately terse: a gate module says what it is, not
// what it is based on. Everything that requires reading -- the transcript
// excerpt, why the dependency is serial, which package it came from --
// belongs here, so the main surface stays legible at a glance.
//
// Material rules, so this does not become a stack of bordered rectangles:
//
//   * facts sit in RECESSED wells (nothing here is operable)
//   * every group is introduced by one micro-label, never a box
//   * quoted evidence is backed by its source and inset like a meter
//   * the only RAISED things are the actions, grouped at the end and
//     ordered Scenario -> Delivery -> Reality
//
// It is also the only place a Decision's Reality can be changed, which is
// why deciding asks for a resolution rather than flipping a status.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LANE_COLOR,
  forecastActive,
  laneOf,
  shortId,
  type CandidateRow,
  type DecisionRow,
} from "@/lib/decisions/model";
import { fmtFull } from "@/lib/instrument/useProject";

export type Selection =
  | { kind: "decision"; id: string }
  | { kind: "candidate"; id: string }
  | null;

const KIND_LABEL: Record<string, string> = {
  context_package: "Context package",
  linear: "Linear",
  manual: "Manual",
  finding: "Audit finding",
};

// A migrated evidence row carries sourceLabel "Migrated from audit finding"
// AND kind "finding", which printed as "AUDIT FINDING · MIGRATED FROM AUDIT
// FINDING". One provenance line, said once.
function provenanceLine(kind: string, sourceLabel: string | null, externalRef: string | null): string {
  const label = KIND_LABEL[kind] ?? kind;
  const parts: string[] = [];
  if (sourceLabel && sourceLabel.toLowerCase().includes(label.toLowerCase())) parts.push(sourceLabel);
  else parts.push(label, ...(sourceLabel ? [sourceLabel] : []));
  if (externalRef) parts.push(externalRef);
  return parts.join(" · ");
}

export default function DecisionInspector({
  decision,
  candidate,
  assumed,
  onClose,
  onAssume,
  onConnect,
  onDisconnect,
  onUpdate,
  onAcceptCandidate,
  onDismissCandidate,
  onAttachToExisting,
  attachTargets,
  busy,
}: {
  decision: DecisionRow | null;
  candidate: CandidateRow | null;
  assumed: boolean;
  onClose: () => void;
  onAssume: (assume: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  onAcceptCandidate: () => void;
  onDismissCandidate: () => void;
  onAttachToExisting: (decisionId: string) => void;
  /** Open/decided decisions in the candidate's project — the "attach to an
      existing decision instead of creating a second one" path. */
  attachTargets: DecisionRow[];
  busy: boolean;
}) {
  return (
    <aside
      data-shoot="decision-inspector"
      className="shrink-0 flex flex-col overflow-hidden"
      style={{ width: 336, background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
    >
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--i-border)" }}
      >
        <span className="i-label">Inspecting</span>
        <button
          onClick={onClose}
          data-shoot="inspector-close"
          className="ml-auto text-[14px] leading-none text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {candidate ? (
          <CandidateBody
            candidate={candidate}
            onAccept={onAcceptCandidate}
            onDismiss={onDismissCandidate}
            onAttach={onAttachToExisting}
            attachTargets={attachTargets}
            busy={busy}
          />
        ) : decision ? (
          <DecisionBody
            decision={decision}
            assumed={assumed}
            onAssume={onAssume}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onUpdate={onUpdate}
            busy={busy}
          />
        ) : (
          <div
            data-shoot="inspector-empty"
            className="px-4 py-6 text-[11.5px] leading-relaxed text-[var(--i-text-faint)]"
          >
            Select a candidate, an open decision, a gate or a decided choice to see its evidence, provenance
            and what — if anything — waits on it.
          </div>
        )}
      </div>
    </aside>
  );
}

// ── SHARED MATERIAL ────────────────────────────────────────────────────
// Groups are divided by a SCORE -- one dark hair with a light one under
// it -- not by whitespace. Whitespace between sections is what made this
// read as a stacked web form; a cut edge is what a panel does, and it lets
// the sections sit much tighter without running together.
function Group({ label, children, tight }: { label: string; children: React.ReactNode; tight?: boolean }) {
  return (
    <section
      className={`px-4 ${tight ? "pt-2 pb-1" : "pb-2 pt-2"}`}
      style={tight ? undefined : { borderTop: "1px solid #0a0e11", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.028)" }}
    >
      <div className="i-label mb-1">{label}</div>
      {children}
    </section>
  );
}



/** A read-only fact. Cut into the panel, because nothing here is operable. */
function Well({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="rounded px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--i-text-soft)]"
      style={{
        background: "var(--i-recess)",
        boxShadow: "inset 0 1px 4px rgba(0,0,0,0.5)",
        borderLeft: accent ? `2px solid ${accent}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="i-label" style={{ fontSize: 8.5 }}>
        {label}
      </div>
      <div className="mt-1 truncate text-[12px] text-[var(--i-text)]">{value}</div>
    </div>
  );
}

// ── THE TIMING INSTRUMENT ──────────────────────────────────────────────
// One readout, not three cells. The track carries the range, the likely
// value is the only thing at display scale, and the two bounds sit under
// their own ends of the track so the distribution is the shape you read.
function TimingInstrument({ low, likely, high, accent }: { low: number; likely: number; high: number; accent: string }) {
  const pos = Math.max(8, Math.min(92, ((likely - low) / Math.max(0.01, high - low)) * 100));
  return (
    <div className="i-meter px-3 pb-2 pt-3">
      {/* The track carries the RANGE and marks where likely falls in it.
          The number itself is read once, large, below — printing it twice
          made the module look like two controls. */}
      <div className="relative h-[4px] rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="absolute inset-y-0 rounded-full"
          style={{ left: "3%", right: "3%", background: accent, opacity: 0.3 }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left: `${pos}%`,
            top: -3,
            width: 10,
            height: 10,
            transform: "translateX(-50%)",
            background: accent,
            boxShadow: "0 0 8px rgba(0,0,0,0.6)",
          }}
        />
      </div>
      <div className="mt-2.5 flex items-end">
        <span className="flex-1">
          <span className="block i-readout text-[13px] text-[var(--i-text-soft)]">{low}d</span>
          <span className="i-label" style={{ fontSize: 8.5 }}>
            low
          </span>
        </span>
        <span className="flex-1 text-center">
          <span className="block i-readout text-[24px] leading-none" style={{ color: accent }}>
            {likely}
            <span className="text-[12px] font-normal text-[var(--i-text-faint)]">d</span>
          </span>
          <span className="i-label" style={{ fontSize: 8.5 }}>
            likely
          </span>
        </span>
        <span className="flex-1 text-right">
          <span className="block i-readout text-[13px] text-[var(--i-text-soft)]">{high}d</span>
          <span className="i-label" style={{ fontSize: 8.5 }}>
            high
          </span>
        </span>
      </div>
    </div>
  );
}

// ── CANDIDATE ──────────────────────────────────────────────────────────
function CandidateBody({
  candidate,
  onAccept,
  onDismiss,
  onAttach,
  attachTargets,
  busy,
}: {
  candidate: CandidateRow;
  onAccept: () => void;
  onDismiss: () => void;
  onAttach: (decisionId: string) => void;
  attachTargets: DecisionRow[];
  busy: boolean;
}) {
  const [attachTo, setAttachTo] = useState("");
  return (
    <>
      <header
        className="shrink-0 px-4 pb-3 pt-3.5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 100%)",
          borderBottom: "1px solid var(--i-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="i-label">{shortId("C", candidate.id)}</span>
          <span
            className="rounded px-1.5 py-[3px] text-[8.5px] font-bold uppercase tracking-[0.14em]"
            style={{ background: "var(--i-violet-soft)", color: LANE_COLOR.candidate }}
          >
            Candidate
          </span>
        </div>
        <h2 className="mt-2 text-[16px] font-semibold leading-[1.25] text-[var(--i-text)]">{candidate.title}</h2>
        {candidate.question && (
          <p className="mt-1 text-[12px] leading-snug text-[var(--i-text-soft)]">{candidate.question}</p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <Group label="Not yet reality" tight>
        <Well accent={LANE_COLOR.candidate}>
          A suggestion from {candidate.sourceLabel}. It is not a decision, holds no gate, and moves no
          forecast until you accept it.
        </Well>
      </Group>

      <Group label="Project" tight>
        <div className="text-[12px] text-[var(--i-text)]">{candidate.scope.name}</div>
      </Group>


      <Group label={`Evidence · ${candidate.excerpts.length}`}>
        {candidate.excerpts.length === 0 ? (
          <span className="text-[11.5px] text-[var(--i-text-faint)]">No cited evidence yet.</span>
        ) : (
          <div className="space-y-1.5">
            {candidate.excerpts.map((x, i) => (
              <Well key={i} accent={LANE_COLOR.candidate}>
                <span className="mb-1 block text-[9.5px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">
                  {candidate.sourceLabel}
                  {candidate.evidenceRefs[i] ? ` · ${candidate.evidenceRefs[i]}` : ""}
                </span>
                {x}
              </Well>
            ))}
          </div>
        )}
      </Group>

      </div>

      <Actions>
        <div className="i-label">Intake</div>
        <button
          data-shoot="candidate-accept"
          onClick={onAccept}
          disabled={busy}
          className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] disabled:opacity-40"
          style={{
            background: "var(--i-violet-soft)",
            color: LANE_COLOR.candidate,
            border: "1px solid var(--i-violet)",
          }}
        >
          Accept as open decision
        </button>
        <p className="text-[10px] leading-relaxed text-[var(--i-text-faint)]">
          Creates a real open decision with this evidence attached. It still gates nothing.
        </p>

        {attachTargets.length > 0 && (
          <div className="pt-1">
            <div className="i-label mb-1">Possible existing decision</div>
            <select
              data-shoot="candidate-attach-select"
              value={attachTo}
              onChange={(e) => setAttachTo(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px]"
              style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            >
              <option value="">Attach evidence to…</option>
              {attachTargets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <button
              data-shoot="candidate-attach"
              onClick={() => attachTo && onAttach(attachTo)}
              disabled={!attachTo || busy}
              className="mt-1.5 w-full rounded px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-30"
              style={{ border: "1px solid var(--i-border-strong)" }}
            >
              Attach to that one instead
            </button>
          </div>
        )}

        <button
          data-shoot="candidate-dismiss"
          onClick={onDismiss}
          disabled={busy}
          className="w-full rounded px-3 py-1.5 text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] disabled:opacity-40"
          style={{ border: "1px solid var(--i-border)" }}
        >
          Not a decision — dismiss
        </button>
      </Actions>
    </>
  );
}

// ── DECISION ───────────────────────────────────────────────────────────
function DecisionBody({
  decision,
  assumed,
  onAssume,
  onConnect,
  onDisconnect,
  onUpdate,
  busy,
}: {
  decision: DecisionRow;
  assumed: boolean;
  onAssume: (assume: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const lane = laneOf(decision);
  const gating = forecastActive(decision);
  const tone = assumed ? "var(--i-violet)" : LANE_COLOR[lane];
  const [deciding, setDeciding] = useState(false);
  const [chosen, setChosen] = useState(decision.chosenOption ?? "");
  const [resolution, setResolution] = useState(decision.resolution ?? "");

  useEffect(() => {
    setDeciding(false);
    setChosen(decision.chosenOption ?? "");
    setResolution(decision.resolution ?? "");
  }, [decision.id, decision.chosenOption, decision.resolution]);

  return (
    <>
      <header
        className="shrink-0 px-4 pb-3.5 pt-3.5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 100%)",
          borderBottom: "1px solid var(--i-border)",
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="i-label">{shortId("D", decision.id)}</span>
          <span
            className="rounded px-1.5 py-[3px] text-[8.5px] font-bold uppercase tracking-[0.14em]"
            style={{ background: `${LANE_COLOR[lane]}22`, color: LANE_COLOR[lane] }}
          >
            {gating ? "Gate" : lane}
          </span>
          {assumed && (
            <span
              data-shoot="inspector-assumed"
              className="rounded px-1.5 py-[3px] text-[8.5px] font-bold uppercase tracking-[0.14em]"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              Assumed in scenario
            </span>
          )}
        </div>
        <h2 className="mt-2 text-[17px] font-semibold leading-[1.22] text-[var(--i-text)]">{decision.title}</h2>
        {decision.rationale && (
          <p className="mt-1.5 text-[12px] leading-snug text-[var(--i-text-soft)]">{decision.rationale}</p>
        )}
        <div
          className="mt-2.5 flex items-center gap-2 rounded px-2.5 py-1.5"
          style={{ background: "#05080a", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8)" }}
        >
          <span
            aria-hidden
            className="h-[6px] w-[6px] rounded-full"
            style={{ background: tone, boxShadow: `0 0 6px ${tone}` }}
          />
          <span className="text-[10.5px]" style={{ color: tone }}>
            {gating ? `Holding ${decision.scope.name}` : decision.status === "open" ? "Open · holding nothing" : decision.status}
          </span>
          <span className="ml-auto i-label" style={{ fontSize: 8.5 }}>
            {decision.scope.name}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="px-4 pb-2.5 pt-3">
        <div className="i-meter flex gap-3 px-3 py-2">
          <Pair
            label="Status"
            value={
              <span data-shoot="inspector-status" style={{ color: LANE_COLOR[lane] }}>
                {decision.status}
              </span>
            }
          />
          <Pair label="Owner" value={decision.owner ?? "—"} />
          <Pair label="Needed by" value={decision.neededBy ? fmtFull(new Date(decision.neededBy)) : "—"} />
        </div>
        {assumed && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed" style={{ color: "var(--i-violet)" }}>
            Open in Reality. This scenario assumes it decided and has withdrawn it from the delivery path.
          </p>
        )}
      </section>


      {/* ── THE GATE, OR ITS DELIBERATE ABSENCE ──────────────────────── */}
      {decision.gate ? (
        <>
          <Group label="What it gates">
            <div className="i-meter flex gap-3 px-3 py-2">
              <Pair label="Delivery" value={decision.scope.name} />
              <Pair
                label="Relationship"
                value={decision.gate.serial ? "Serial dependency" : "Non-serial"}
              />
            </div>
            <div className="mt-1.5">
              <Well accent={tone}>{decision.gate.dependency}</Well>
            </div>
          </Group>

          <Group label="Evidence for gate" tight>
            <Well>{decision.gate.evidenceForGate}</Well>
            {decision.gate.provenance === "migrated" && (
              <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "var(--i-amber)" }}>
                Migrated from a legacy blocking finding — no human has re-stated this claim.
              </p>
            )}
          </Group>

          <Group label="Timing · days to resolve">
            <TimingInstrument low={decision.gate.low} likely={decision.gate.likely} high={decision.gate.high} accent={tone} />
          </Group>
        </>
      ) : (
        <Group label="Delivery">
          <div data-shoot="inspector-no-gate">
            <Well>
              No direct forecast effect. Nothing has been established as waiting on this choice, so it does
              not appear in the delivery path and moves no date.
            </Well>
          </div>
        </Group>
      )}

      {decision.options.length > 0 && (
        <>
              <Group label="Options">
            <ul className="space-y-1.5">
              {decision.options.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-[11.5px]">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      border: `1px solid ${decision.chosenOption === o.label ? "var(--i-mint)" : "var(--i-border-strong)"}`,
                      background: decision.chosenOption === o.label ? "var(--i-mint)" : "transparent",
                    }}
                  />
                  <span className={decision.chosenOption === o.label ? "text-[var(--i-text)]" : "text-[var(--i-text-soft)]"}>
                    {o.label}
                  </span>
                  {o.note && <span className="ml-auto text-[9.5px] text-[var(--i-text-faint)]">{o.note}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--i-text-faint)]">
              Product truth only. Nothing in the engine models one option landing sooner than another.
            </p>
          </Group>
        </>
      )}


      <Group label={`Evidence · ${decision.evidence.length}`}>
        {decision.evidence.length === 0 ? (
          <span className="text-[11.5px] text-[var(--i-text-faint)]">No cited evidence yet.</span>
        ) : (
          <div className="space-y-1.5">
            {decision.evidence.map((e) => (
              <div key={e.id} data-shoot="evidence-item">
                <Well accent="var(--i-border-strong)">
                  <span className="mb-1 block text-[9.5px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">
                    {provenanceLine(e.kind, e.sourceLabel, e.externalRef)}
                  </span>
                  {e.excerpt}
                  {e.contextSnapshotId && (
                    <span className="mt-1 block text-[9.5px] text-[var(--i-text-faint)]">
                      snapshot {e.contextSnapshotId.slice(-8)}
                    </span>
                  )}
                </Well>
              </div>
            ))}
          </div>
        )}
      </Group>

      {decision.relatedIssues.length > 0 && (
        <Group label="Related work" tight>
          <div className="flex flex-wrap gap-1.5">
            {decision.relatedIssues.map((i) => (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--i-text-soft)]"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                {i}
              </span>
            ))}
          </div>
        </Group>
      )}

      </div>

      {/* ── ACTIONS: SCENARIO → DELIVERY → REALITY ─────────────────────── */}
      <Actions>
        {gating ? (
          <>
            <div className="i-label">Scenario</div>
            <button
              data-shoot="inspector-assume"
              onClick={() => onAssume(!assumed)}
              disabled={busy}
              className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] disabled:opacity-40"
              style={{
                background: assumed ? "transparent" : "var(--i-violet-soft)",
                color: assumed ? "var(--i-text-soft)" : "var(--i-violet)",
                border: `1px solid ${assumed ? "var(--i-border-strong)" : "var(--i-violet)"}`,
              }}
            >
              {assumed ? "Stop assuming decided" : "Assume decided"}
            </button>
            <Link
              href="/forecast"
              data-shoot="door-forecast"
              className="block w-full rounded px-3 py-1.5 text-center text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
              style={{ border: "1px solid var(--i-border-strong)" }}
            >
              See consequence in Forecast →
            </Link>
          </>
        ) : (
          decision.status === "open" && (
            <p data-shoot="inspector-no-lever" className="text-[10px] leading-relaxed text-[var(--i-text-faint)]">
              No scenario lever: assuming an ungated decision resolved would change nothing the engine can
              see. Connect it to delivery first, if delivery really is waiting.
            </p>
          )
        )}

        {decision.status === "open" && (
          <>
            <div className="i-label pt-1">Delivery</div>
            {decision.gate ? (
              <button
                data-shoot="disconnect-gate"
                onClick={onDisconnect}
                disabled={busy}
                className="w-full rounded px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-40"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                Disconnect from delivery
              </button>
            ) : (
              <button
                data-shoot="connect-gate"
                onClick={onConnect}
                disabled={busy}
                className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              >
                Connect to delivery…
              </button>
            )}
          </>
        )}

        <div className="i-label pt-1">Reality</div>
        {decision.status === "open" && !deciding && (
          <button
            data-shoot="decide-open"
            onClick={() => setDeciding(true)}
            className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ background: "var(--i-mint-soft)", color: "var(--i-mint)", border: "1px solid rgba(74,217,168,0.5)" }}
          >
            Mark decided…
          </button>
        )}

        {deciding && (
          <div className="space-y-2 rounded-md p-2.5" style={{ background: "var(--i-recess)" }}>
            {decision.options.length > 0 && (
              <select
                data-shoot="decide-option"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                className="w-full rounded px-2 py-1.5 text-[11px]"
                style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              >
                <option value="">Which option was chosen?</option>
                {decision.options.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <textarea
              data-shoot="decide-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              placeholder="What was decided, and why?"
              className="w-full rounded px-2 py-1.5 text-[11px]"
              style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            />
            <div className="flex gap-2">
              <button
                data-shoot="decide-confirm"
                disabled={busy}
                onClick={async () => {
                  await onUpdate({
                    status: "decided",
                    chosenOption: chosen || null,
                    resolution: resolution.trim() || null,
                  });
                  setDeciding(false);
                }}
                className="flex-1 rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                style={{ background: "var(--i-mint-soft)", color: "var(--i-mint)", border: "1px solid rgba(74,217,168,0.5)" }}
              >
                Record decision
              </button>
              <button
                onClick={() => setDeciding(false)}
                className="rounded px-3 py-1.5 text-[11px] text-[var(--i-text-faint)]"
                style={{ border: "1px solid var(--i-border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {decision.status === "decided" && (
          <button
            data-shoot="reopen"
            onClick={() => void onUpdate({ status: "open" })}
            disabled={busy}
            className="w-full rounded px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-40"
            style={{ border: "1px solid var(--i-border-strong)" }}
          >
            Reopen
          </button>
        )}

        {decision.status !== "dismissed" && (
          <button
            data-shoot="dismiss-decision"
            onClick={() => void onUpdate({ status: "dismissed" })}
            disabled={busy}
            className="w-full rounded px-3 py-1.5 text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] disabled:opacity-40"
            style={{ border: "1px solid var(--i-border)" }}
          >
            Not a decision — dismiss
          </button>
        )}

        <Link
          href="/scope"
          data-shoot="door-scope"
          className="block w-full rounded px-3 py-1.5 text-center text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)]"
          style={{ border: "1px solid var(--i-border)" }}
        >
          Open in Scope →
        </Link>
      </Actions>
    </>
  );
}

/** The only raised region in the inspector: everything above reads, this
    operates. Separated by a hard edge rather than by another border. */
function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="shrink-0 space-y-1.5 overflow-y-auto px-4 py-3"
      style={{
        maxHeight: "46%",
        borderTop: "1px solid var(--i-border-strong)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.008) 100%)",
      }}
    >
      {children}
    </div>
  );
}
