"use client";

// THE INSPECTOR — where evidence and provenance live.
//
// The circuit is deliberately terse: a gate module says what it is, not
// what it is based on. Everything that requires reading -- the transcript
// excerpt, why the dependency is serial, which package it came from --
// belongs here, so the main surface stays legible at a glance (§19).
//
// It is also the only place a Decision's Reality can be changed, which is
// why deciding asks for a resolution rather than flipping a status silently.

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
  /** Open/decided decisions in the candidate's project — §32's "attach to
      an existing decision instead of creating a second one". */
  attachTargets: DecisionRow[];
  busy: boolean;
}) {
  if (candidate) {
    return (
      <Shell title="Inspecting" onClose={onClose}>
        <CandidateBody
          candidate={candidate}
          onAccept={onAcceptCandidate}
          onDismiss={onDismissCandidate}
          onAttach={onAttachToExisting}
          attachTargets={attachTargets}
          busy={busy}
        />
      </Shell>
    );
  }
  if (decision) {
    return (
      <Shell title="Inspecting" onClose={onClose}>
        <DecisionBody
          decision={decision}
          assumed={assumed}
          onAssume={onAssume}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onUpdate={onUpdate}
          busy={busy}
        />
      </Shell>
    );
  }
  return (
    <Shell title="Inspecting" onClose={onClose}>
      <div data-shoot="inspector-empty" className="px-4 py-6 text-[11px] text-[var(--i-text-faint)] leading-relaxed">
        Select a candidate, an open decision, a gate or a decided choice to
        see its evidence, provenance and what — if anything — waits on it.
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      data-shoot="decision-inspector"
      className="shrink-0 flex flex-col overflow-hidden"
      style={{ width: 330, background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
    >
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <span className="i-label">{title}</span>
        <button
          onClick={onClose}
          data-shoot="inspector-close"
          className="ml-auto text-[13px] leading-none text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--i-border)" }}>
      <div className="i-label">{label}</div>
      <div className="mt-1.5 text-[12px] text-[var(--i-text)] leading-relaxed">{children}</div>
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
    <div>
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="i-label">{shortId("C", candidate.id)}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
            style={{ background: "var(--i-violet-soft)", color: LANE_COLOR.candidate }}
          >
            Candidate
          </span>
        </div>
        <h2 className="mt-1.5 text-[15px] font-semibold text-[var(--i-text)] leading-snug">{candidate.title}</h2>
        {candidate.question && (
          <p className="mt-1 text-[12px] text-[var(--i-text-soft)]">{candidate.question}</p>
        )}
      </div>

      <Field label="Not yet reality">
        <span className="text-[var(--i-text-soft)]">
          This is a suggestion from {candidate.sourceLabel}. It is not a decision, has no gate, and has no
          effect on any forecast until you accept it.
        </span>
      </Field>

      <Field label="Project">{candidate.scope.name}</Field>

      <Field label={`Evidence · ${candidate.excerpts.length}`}>
        {candidate.excerpts.length === 0 ? (
          <span className="text-[var(--i-text-faint)]">No cited evidence yet.</span>
        ) : (
          <div className="space-y-2">
            {candidate.excerpts.map((x, i) => (
              <blockquote
                key={i}
                className="rounded px-2.5 py-2 text-[11.5px] text-[var(--i-text-soft)] leading-relaxed"
                style={{ background: "var(--i-recess)", borderLeft: `2px solid ${LANE_COLOR.candidate}` }}
              >
                {x}
                {candidate.evidenceRefs[i] && (
                  <span className="mt-1 block text-[10px] text-[var(--i-text-faint)]">
                    ref {candidate.evidenceRefs[i]}
                  </span>
                )}
              </blockquote>
            ))}
          </div>
        )}
      </Field>

      <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid var(--i-border)" }}>
        <button
          data-shoot="candidate-accept"
          onClick={onAccept}
          disabled={busy}
          className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] disabled:opacity-40"
          style={{ background: "var(--i-violet-soft)", color: LANE_COLOR.candidate, border: "1px solid var(--i-violet)" }}
        >
          Accept as open decision
        </button>
        <p className="text-[10px] text-[var(--i-text-faint)] leading-relaxed">
          Accepting creates a real open decision with this evidence attached. It still gates nothing.
        </p>

        {attachTargets.length > 0 && (
          <div className="pt-1">
            <div className="i-label mb-1">Possible existing decision</div>
            <select
              data-shoot="candidate-attach-select"
              value={attachTo}
              onChange={(e) => setAttachTo(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 text-[11px]"
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
              className="mt-1.5 w-full rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-30"
              style={{ border: "1px solid var(--i-border-strong)" }}
            >
              Attach evidence to that one instead
            </button>
          </div>
        )}

        <button
          data-shoot="candidate-dismiss"
          onClick={onDismiss}
          disabled={busy}
          className="w-full rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] disabled:opacity-40"
          style={{ border: "1px solid var(--i-border)" }}
        >
          Not a decision — dismiss
        </button>
      </div>
    </div>
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
  const [deciding, setDeciding] = useState(false);
  const [chosen, setChosen] = useState(decision.chosenOption ?? "");
  const [resolution, setResolution] = useState(decision.resolution ?? "");

  useEffect(() => {
    setDeciding(false);
    setChosen(decision.chosenOption ?? "");
    setResolution(decision.resolution ?? "");
  }, [decision.id, decision.chosenOption, decision.resolution]);

  return (
    <div>
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="i-label">{shortId("D", decision.id)}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
            style={{ background: `${LANE_COLOR[lane]}22`, color: LANE_COLOR[lane] }}
          >
            {gating ? "Gate" : lane}
          </span>
          {assumed && (
            <span
              data-shoot="inspector-assumed"
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              Assumed in scenario
            </span>
          )}
        </div>
        <h2 className="mt-1.5 text-[15px] font-semibold text-[var(--i-text)] leading-snug">{decision.title}</h2>
        {decision.rationale && <p className="mt-1 text-[12px] text-[var(--i-text-soft)]">{decision.rationale}</p>}
      </div>

      <Field label="Status">
        <div className="flex items-center gap-2">
          <span style={{ color: LANE_COLOR[lane] }} data-shoot="inspector-status">
            {decision.status}
          </span>
          {assumed && (
            <span className="text-[11px] text-[var(--i-text-faint)]">
              — open in Reality, assumed decided in this scenario
            </span>
          )}
        </div>
      </Field>

      <Field label="Project">
        <div className="flex items-center gap-2">
          {decision.scope.name}
          <Link
            href="/scope"
            data-shoot="door-scope"
            className="ml-auto text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-violet)]"
          >
            Open in Scope →
          </Link>
        </div>
      </Field>

      {decision.owner && <Field label="Owner">{decision.owner}</Field>}
      {decision.neededBy && <Field label="Needed by">{fmtFull(new Date(decision.neededBy))}</Field>}

      {/* ── THE GATE, OR ITS DELIBERATE ABSENCE ────────────────────────── */}
      {decision.gate ? (
        <>
          <Field label="What it gates">
            <div className="flex items-baseline justify-between gap-3">
              <span>{decision.scope.name}</span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">
                {decision.gate.serial ? "Serial dependency" : "Non-serial"}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[var(--i-text-soft)]">{decision.gate.dependency}</p>
          </Field>
          <Field label="Evidence for gate">
            <p className="text-[11.5px] text-[var(--i-text-soft)]">{decision.gate.evidenceForGate}</p>
            {decision.gate.provenance === "migrated" && (
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--i-amber)" }}>
                Migrated from a legacy blocking finding — this claim has not been re-stated by a human.
              </p>
            )}
          </Field>
          <Field label="Timing (days)">
            <div className="i-meter flex items-center gap-3 px-3 py-2">
              <Readout label="Low" value={decision.gate.low} />
              <Readout label="Likely" value={decision.gate.likely} strong />
              <Readout label="High" value={decision.gate.high} />
            </div>
          </Field>
        </>
      ) : (
        <Field label="Delivery">
          <div
            data-shoot="inspector-no-gate"
            className="rounded px-2.5 py-2 text-[11.5px] text-[var(--i-text-soft)]"
            style={{ background: "var(--i-recess)" }}
          >
            No direct forecast effect. Nothing has been established as waiting on this choice, so it does not
            appear in the delivery path and moves no date.
          </div>
        </Field>
      )}

      {decision.options.length > 0 && (
        <Field label="Options">
          <ul className="space-y-1">
            {decision.options.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-[11.5px]">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    border: `1px solid ${decision.chosenOption === o.label ? "var(--i-mint)" : "var(--i-border-strong)"}`,
                    background: decision.chosenOption === o.label ? "var(--i-mint)" : "transparent",
                  }}
                />
                <span className={decision.chosenOption === o.label ? "text-[var(--i-text)]" : "text-[var(--i-text-soft)]"}>
                  {o.label}
                </span>
                {o.note && <span className="ml-auto text-[10px] text-[var(--i-text-faint)]">{o.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">
            Options are product truth only. Nothing in the engine models one option landing sooner than another.
          </p>
        </Field>
      )}

      <Field label={`Evidence · ${decision.evidence.length}`}>
        {decision.evidence.length === 0 ? (
          <span className="text-[var(--i-text-faint)]">No cited evidence yet.</span>
        ) : (
          <div className="space-y-2">
            {decision.evidence.map((e) => (
              <blockquote
                key={e.id}
                data-shoot="evidence-item"
                className="rounded px-2.5 py-2 text-[11.5px] text-[var(--i-text-soft)] leading-relaxed"
                style={{ background: "var(--i-recess)", borderLeft: "2px solid var(--i-border-strong)" }}
              >
                <span className="mb-1 block text-[10px] text-[var(--i-text-faint)]">
                  {KIND_LABEL[e.kind] ?? e.kind}
                  {e.sourceLabel ? ` · ${e.sourceLabel}` : ""}
                  {e.externalRef ? ` · ${e.externalRef}` : ""}
                </span>
                {e.excerpt}
                {e.contextSnapshotId && (
                  <span className="mt-1 block text-[10px] text-[var(--i-text-faint)]">
                    snapshot {e.contextSnapshotId.slice(-8)}
                  </span>
                )}
              </blockquote>
            ))}
          </div>
        )}
      </Field>

      {decision.relatedIssues.length > 0 && (
        <Field label="Related work">
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
        </Field>
      )}

      {/* ── ACTIONS ────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-2" style={{ borderTop: "1px solid var(--i-border)" }}>
        {gating ? (
          <>
            <div className="i-label">Scenario</div>
            <button
              data-shoot="inspector-assume"
              onClick={() => onAssume(!assumed)}
              disabled={busy}
              className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] disabled:opacity-40"
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
              className="block w-full rounded-md px-3 py-1.5 text-center text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)]"
              style={{ border: "1px solid var(--i-border-strong)" }}
            >
              See consequence in Forecast →
            </Link>
          </>
        ) : (
          decision.status === "open" && (
            <p data-shoot="inspector-no-lever" className="text-[10px] text-[var(--i-text-faint)] leading-relaxed">
              No scenario lever: assuming an ungated decision resolved would change nothing the engine can see.
              Connect it to delivery first, if delivery really is waiting.
            </p>
          )
        )}

        {decision.status === "open" &&
          (decision.gate ? (
            <button
              data-shoot="disconnect-gate"
              onClick={onDisconnect}
              disabled={busy}
              className="w-full rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-40"
              style={{ border: "1px solid var(--i-border-strong)" }}
            >
              Disconnect from delivery
            </button>
          ) : (
            <button
              data-shoot="connect-gate"
              onClick={onConnect}
              disabled={busy}
              className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            >
              Connect to delivery…
            </button>
          ))}

        {decision.status === "open" && !deciding && (
          <button
            data-shoot="decide-open"
            onClick={() => setDeciding(true)}
            className="w-full rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em]"
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
            className="w-full rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-soft)] disabled:opacity-40"
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
            className="w-full rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] disabled:opacity-40"
            style={{ border: "1px solid var(--i-border)" }}
          >
            Not a decision — dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function Readout({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex-1">
      <div className="i-label">{label}</div>
      <div
        className="mt-0.5 i-readout"
        style={{ fontSize: strong ? 17 : 14, color: strong ? "var(--i-text)" : "var(--i-text-soft)" }}
      >
        {value}
        <span className="text-[10px] font-normal text-[var(--i-text-faint)]">d</span>
      </div>
    </div>
  );
}
