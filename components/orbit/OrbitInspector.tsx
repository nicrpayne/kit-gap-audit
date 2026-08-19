"use client";

// ORBIT — THE INSPECTOR.
//
// Quiet at rest, and never a metadata dump. It answers four questions in
// order, in the language a person would use:
//
//   what is this · what does it do to the date · what says so · what can I do
//
// IMPLEMENTATION VOCABULARY STAYS OUT. No node kinds, no edge kinds, no
// causal flags. "Moves the date" and "explains only" are the whole of what
// a reader needs from the edge model, and the sentence underneath does the
// rest. Provenance is shown as a plain source line, because a person
// auditing a claim needs to know where it came from — not as a debug dump.

import Link from "next/link";
import type { OrbitGraph, OrbitNode, OrbitLever } from "@/lib/orbit/graph";

const WHAT: Record<OrbitNode["kind"], string> = {
  forecast: "Delivery outcome",
  capability: "Capability",
  dependency: "Waiting on",
  gate: "Unanswered decision",
  capacity: "The people",
};

/** WHERE THIS CAME FROM, said to a person. The read model carries module
    paths and table names because a developer auditing a claim needs them;
    a reader needs to know which part of the system asserted it. Anything
    unrecognised falls through verbatim rather than being hidden — an
    unexplained source is a bug to see, not to paper over. */
const SOURCE_WORDS: [RegExp, string][] = [
  [/simulate/i, "From the simulation over this project's own estimates"],
  [/portfolio/i, "From the way this project's completion is chained to the ones it waits on"],
  [/features/i, "From how the release is composed in Scope"],
  [/DecisionGate/i, "From the decision record, where someone wrote down what delivery is waiting on"],
  [/workforce|resolve/i, "From the roster and who is allocated where"],
  [/dependsOnScopeIds/i, "From the dependency someone declared between these projects"],
];
const sourceWords = (source: string) => SOURCE_WORDS.find(([re]) => re.test(source))?.[1] ?? source;

const fmt = (start: Date, day: number) =>
  new Date(start.getTime() + day * 86400000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Action({
  onClick,
  active,
  children,
  shoot,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  shoot: string;
}) {
  return (
    <button
      data-shoot={shoot}
      onClick={onClick}
      className="rounded-md px-3 py-2 text-[12px] text-left transition-colors"
      style={{
        border: `1px solid ${active ? "var(--i-violet)" : "var(--i-border-strong)"}`,
        background: active ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
        color: active ? "var(--i-violet)" : "var(--i-text)",
      }}
    >
      {children}
    </button>
  );
}

function Line({ children, tone = "soft" }: { children: React.ReactNode; tone?: "soft" | "faint" | "readout" }) {
  return (
    <div
      className={tone === "readout" ? "i-readout text-[12px]" : "text-[12px] leading-relaxed"}
      style={{ color: tone === "faint" ? "var(--i-text-faint)" : tone === "readout" ? "var(--i-text)" : "var(--i-text-soft)" }}
    >
      {children}
    </div>
  );
}

export default function OrbitInspector({
  graph,
  node,
  startDate,
  onLever,
  isOn,
}: {
  graph: OrbitGraph;
  node: OrbitNode | null;
  startDate: Date;
  onLever: (lever: OrbitLever) => void;
  isOn: (lever: OrbitLever) => boolean;
}) {
  if (!node) {
    return (
      <div className="flex h-full flex-col justify-end p-5" data-shoot="orbit-inspector-rest">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Touch anything to see what it does to the date
        </div>
      </div>
    );
  }

  const touching = graph.edges.filter((e) => e.from === node.id || e.to === node.id);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto i-noscrollbar p-5" data-shoot="orbit-inspector">
      <div>
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          {WHAT[node.kind]}
        </div>
        <div className="pt-1 text-[17px] leading-tight" style={{ color: "var(--i-text)" }}>
          {node.label}
        </div>
      </div>

      {node.candidate && (
        <div
          data-shoot="orbit-candidate-note"
          className="rounded-md p-3 text-[12px] leading-relaxed"
          style={{ background: "var(--i-violet-soft)", color: "var(--i-text-soft)", border: "1px dashed var(--i-violet)" }}
        >
          Suggested from something someone said — nobody has accepted it yet, so the date does not count it. Seat it in
          Scope and it becomes real work.
        </div>
      )}

      {/* WHAT IT DOES. The quantity first, then the sentence. */}
      <div className="flex flex-col gap-2">
        {touching.map((e) => (
          <div
            key={e.id}
            data-shoot={`orbit-meaning-${e.id}`}
            className="rounded-md p-3"
            style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}
          >
            <div className="flex items-baseline justify-between gap-3 pb-1.5">
              <span className="i-label" style={{ color: e.causal ? "var(--i-signal)" : "var(--i-text-faint)" }}>
                {e.causal ? "Moves the date" : "Explains only"}
              </span>
              {e.quantity && (
                <span className="i-readout text-[13px]" style={{ color: "var(--i-text)" }}>
                  {e.quantity.unit === "fte"
                    ? `${e.quantity.value.toFixed(1)} FTE`
                    : `${e.quantity.value.toFixed(1)} days`}
                </span>
              )}
            </div>
            <Line>{e.meaning}</Line>
          </div>
        ))}
      </div>

      {/* THE PARTICULARS, kind by kind. Short, and only what changes a mind. */}
      {node.kind === "forecast" && (
        <div className="flex flex-col gap-1.5">
          <Line tone="readout">
            {fmt(startDate, node.p10)} → {fmt(startDate, node.p90)}
          </Line>
          <Line tone="faint">Eight in ten runs land inside that span. The middle one lands {fmt(startDate, node.p50)}.</Line>
          {node.targetDay !== null && (
            <Line tone="faint">
              {node.confidenceAtTarget}% of runs are done by {fmt(startDate, node.targetDay)}. Moving the target changes
              this number and nothing else — the runs are the runs.
            </Line>
          )}
        </div>
      )}

      {node.kind === "gate" && (
        <div className="flex flex-col gap-1.5">
          <Line>{node.dependency}</Line>
          <Line tone="faint">{node.evidenceForGate}</Line>
          <Line tone="readout">
            {node.low} / {node.likely} / {node.high} days to settle
          </Line>
          <Line tone="faint">
            {node.evidenceCount} {node.evidenceCount === 1 ? "piece" : "pieces"} of evidence on the record
          </Line>
        </div>
      )}

      {node.kind === "capacity" && (
        <div className="flex flex-col gap-1.5">
          <Line tone="readout">
            {node.simulatedTotal !== null
              ? `${node.simulatedTotal.toFixed(1)} FTE being simulated`
              : node.basis === "allocations"
                ? `${node.effective.toFixed(1)} of ${node.raw.toFixed(1)} FTE reaching this work`
                : `about ${node.effective.toFixed(1)} people`}
          </Line>
          {node.basis !== "allocations" && (
            <Line>
              {node.basis === "inferred"
                ? "Nobody is allocated to this project on the roster, so this figure was counted from who is assigned to the remaining work. It is what the forecast is using, and it is a guess about a team rather than a team."
                : "This figure was set by hand on the project rather than built from named people. It is what the forecast is using."}
            </Line>
          )}
          {node.simulatedTotal !== null && (
            <Line>
              This is a hypothetical total, not a roster change. The people who actually exist put{" "}
              {node.effective.toFixed(1)} FTE here, and nobody has been moved.
            </Line>
          )}
          {node.basis !== "allocations" ? null : node.switchLoss > 0.01 ? (
            <Line>
              {node.switchLoss.toFixed(1)} FTE goes to context switching — {node.splitPeople}{" "}
              {node.splitPeople === 1 ? "person is" : "people are"} split across other projects.
            </Line>
          ) : (
            <Line tone="faint">Nobody here is split across projects, so all of it arrives.</Line>
          )}
          {node.required > 0.01 && (
            <Line>
              <span style={{ color: "var(--i-amber)" }}>
                {node.required.toFixed(1)} FTE asked for that the roster does not contain.
              </span>{" "}
              Nobody is being invented to cover it.
            </Line>
          )}
        </div>
      )}

      {node.kind === "capability" && (
        <div className="flex flex-col gap-1.5">
          <Line tone="readout">{node.loadDays.toFixed(1)} days of schedule</Line>
          <Line tone="faint">
            {node.range.low}/{node.range.likely}/{node.range.high} effort days across {node.itemIds.length}{" "}
            {node.itemIds.length === 1 ? "item" : "items"}
            {node.placeholderCount > 0 ? ` · ${node.placeholderCount} still unestimated` : ""}
          </Line>
          {node.evidence?.quote && (
            <div className="rounded-md p-3 text-[12px] italic leading-relaxed" style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}>
              “{node.evidence.quote}”
              {node.evidence.rationale && (
                <div className="pt-1.5 not-italic" style={{ color: "var(--i-text-faint)" }}>
                  {node.evidence.rationale}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {node.kind === "dependency" && (
        <div className="flex flex-col gap-1.5">
          <Line tone="readout">Lands around {fmt(startDate, node.p50)}</Line>
          <Line tone="faint">
            Every run takes the later of the two projects, so this one raises the floor on when anything here can be
            finished.
          </Line>
        </div>
      )}

      {/* WHAT YOU CAN DO. Only levers that genuinely exist. */}
      <div className="flex flex-col gap-2">
        {node.scenarioLever?.kind === "resolve-gate" && (
          <Action
            shoot={`orbit-assume-${node.id}`}
            active={isOn(node.scenarioLever)}
            onClick={() => onLever(node.scenarioLever!)}
          >
            {isOn(node.scenarioLever) ? "Assuming this is answered" : "Assume it's answered"}
          </Action>
        )}
        {node.scenarioLever?.kind === "bypass-capability" && !node.candidate && (
          <Action shoot={`orbit-cut-${node.id}`} onClick={() => onLever(node.scenarioLever!)}>
            Cut it from the release
          </Action>
        )}
        {node.kind === "gate" && (
          <Link href="/decisions" className="text-[12px]" style={{ color: "var(--i-signal)" }}>
            Answer it for real in Decisions →
          </Link>
        )}
        {node.kind === "capability" && (
          <Link href="/scope" className="text-[12px]" style={{ color: "var(--i-signal)" }}>
            Compose the release in Scope →
          </Link>
        )}
        {node.kind === "capacity" && (
          <Link href="/portfolio" className="text-[12px]" style={{ color: "var(--i-signal)" }}>
            Move people in Portfolio →
          </Link>
        )}
        {node.kind === "forecast" && (
          <Link href="/forecast" className="text-[12px]" style={{ color: "var(--i-signal)" }}>
            Open the full forecast →
          </Link>
        )}
      </div>

      <div
        className="mt-auto pt-3 text-[11px] leading-relaxed"
        style={{ color: "var(--i-text-faint)", borderTop: "1px solid var(--i-border)" }}
        data-shoot="orbit-provenance"
      >
        {sourceWords(node.provenance.source)}
      </div>
    </div>
  );
}
