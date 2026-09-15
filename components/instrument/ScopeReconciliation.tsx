"use client";

import { useMemo, useState } from "react";
import type { ScopeWorkItem, SuiteScenario } from "@/lib/instrument/useProject";

export interface ScopeProposalView {
  id: string;
  scopeId: string;
  status: string;
  generatedAt: string;
  stale?: boolean;
  sourceWatermark: {
    linearAsOf: string | null;
    linearIssueCount: number;
    contextSnapshotId: string | null;
    contextGeneratedAt: string | null;
    contextAcceptedAt: string | null;
    contextProducer: string | null;
    completeness?: unknown;
  };
  summary: {
    likelyIn: number;
    likelyOut: number;
    boundaryReview: number;
    confidentlyMatched: number;
    suggested: number;
    unresolved: number;
  };
  items: ScopeProposalItemView[];
}

export interface ScopeProposalItemView {
  id: string;
  title: string;
  description: string | null;
  releaseSignal: "likely_in" | "likely_out" | "boundary";
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  matchState: "confidently_matched" | "suggested" | "unresolved" | "corroborated";
  action: "link_existing" | "create_capability" | "none";
  targetCapabilityId: string | null;
  targetRevision: number | null;
  workItemIds: string[];
  alreadyLinkedItemIds: string[];
  rationale: { headline: string; signals: string[]; cautions: string[] };
  provenance: {
    linearParent: { identifier: string; title: string } | null;
    linearItems: { identifier: string; state: string; projectName: string | null; updatedAt: string | null }[];
    contextSnapshotId: string | null;
    contextRefs: { kind: string; id: string; statement: string; evidenceRefs: string[] }[];
    method: string;
  };
  status: string;
}

type Selection = SuiteScenario["scopeProposalSelections"][number];

export default function ScopeReconciliation({
  proposal,
  loading,
  warning,
  error,
  realityRevision,
  capabilities,
  unmapped,
  selections,
  committing,
  commitError,
  committed,
  onRefresh,
  onStage,
  onUnstage,
  onStageConfident,
  onCommit,
}: {
  proposal: ScopeProposalView | null;
  loading: boolean;
  warning: string | null;
  error: string | null;
  realityRevision: number;
  capabilities: { id: string; name: string; revision: number }[];
  unmapped: ScopeWorkItem[];
  selections: Selection[];
  committing: boolean;
  commitError: string | null;
  committed: boolean;
  onRefresh: () => void;
  onStage: (item: ScopeProposalItemView, targetCapabilityId: string | null, releaseStatus: "accepted" | "outside") => void;
  onUnstage: (itemId: string) => void;
  onStageConfident: () => void;
  onCommit: () => void;
}) {
  const [filter, setFilter] = useState<"proposals" | "exceptions" | "work">("proposals");
  const [query, setQuery] = useState("");
  const selectionByItem = useMemo(() => new Map(selections.map((selection) => [selection.itemId, selection])), [selections]);
  const shown = (proposal?.items ?? []).filter((item) => {
    if (filter === "exceptions" && item.matchState !== "unresolved" && item.releaseSignal !== "boundary") return false;
    const haystack = `${item.title} ${item.workItemIds.join(" ")} ${item.rationale.headline}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });
  const completeness = proposal?.sourceWatermark.completeness && typeof proposal.sourceWatermark.completeness === "object"
    ? proposal.sourceWatermark.completeness as Record<string, unknown>
    : null;
  const partial = completeness?.status === "partial" || completeness?.complete === false;
  const fresh = !proposal?.stale && !warning;
  const knowledgeDate = proposal?.sourceWatermark.contextAcceptedAt ?? proposal?.sourceWatermark.contextGeneratedAt;

  return (
    <aside
      className="flex min-h-0 w-[310px] shrink-0 flex-col overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--i-border)", background: "linear-gradient(180deg, #10151a, #0b1013)" }}
      data-shoot={committed ? "reconciliation-commit-success" : warning ? "reconciliation-stale" : partial ? "reconciliation-partial" : "reconciliation-workspace"}
    >
      <div className="shrink-0 px-3.5 pb-3 pt-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="flex items-center gap-2">
          <div className="i-label" style={{ color: fresh ? "var(--i-signal)" : "var(--i-amber)" }}>Intelligence reconciliation</div>
          <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: fresh ? "var(--i-mint)" : "var(--i-amber)" }} />
          <span className="text-[8px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">{loading ? "reading" : warning ? "stale" : partial ? "partial" : fresh ? "fresh" : "stale"}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-[8px] text-[var(--i-text-faint)]">
          <Freshness label="Knowledge" value={knowledgeDate ? shortDate(knowledgeDate) : "none"} />
          <Freshness label="Linear" value={proposal?.sourceWatermark.linearAsOf ? shortDate(proposal.sourceWatermark.linearAsOf) : "no rows"} />
          <Freshness label="Reality" value={`r${realityRevision}`} />
        </div>
        {proposal && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            <Count label="likely in" value={proposal.summary.likelyIn} />
            <Count label="boundary" value={proposal.summary.boundaryReview} caution />
            <Count label="unresolved" value={proposal.summary.unresolved} caution />
          </div>
        )}
        {(warning || error) && <p className="mt-2 text-[8.5px] leading-snug text-[var(--i-amber)]">{warning ?? error}</p>}
        {partial && !warning && <p className="mt-2 text-[8.5px] leading-snug text-[var(--i-amber)]">Structured intelligence is partial. Proposals remain reviewable, but missing-source boundaries are preserved.</p>}
        <div className="mt-2 flex gap-1">
          {(["proposals", "exceptions", "work"] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className="rounded px-2 py-1 text-[8px] uppercase tracking-[0.1em]" style={{ border: "1px solid var(--i-border)", color: filter === value ? "var(--i-signal)" : "var(--i-text-faint)", background: filter === value ? "var(--i-recess)" : "transparent" }}>
              {value === "work" ? `work ${unmapped.length}` : value}
            </button>
          ))}
          <button onClick={onRefresh} disabled={loading} className="ml-auto rounded px-2 py-1 text-[8px] text-[var(--i-text-faint)]" style={{ border: "1px solid var(--i-border)" }}>{loading ? "…" : "refresh"}</button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find proposal or Linear item" className="mt-2 w-full rounded px-2.5 py-1.5 text-[9px] outline-none" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)", color: "var(--i-text)" }} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {loading && !proposal ? <State title="Composing from current truth…" body="Reading the accepted context snapshot and current Linear hierarchy." shoot="reconciliation-loading" /> : null}
        {!loading && !proposal ? <State title="No proposal available" body="Reality is unchanged. Refresh when Linear and structured context are available." shoot="reconciliation-empty" /> : null}
        {filter === "work" ? (
          <div className="space-y-1.5" data-shoot="execution-work-finder">
            {unmapped.filter((item) => !query || item.label.toLowerCase().includes(query.toLowerCase())).map((item) => (
              <div key={item.id} className="rounded-md px-2.5 py-2" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }}>
                <div className="text-[9.5px] font-medium leading-snug text-[var(--i-text)]">{item.label}</div>
                <div className="mt-1 text-[8px] uppercase tracking-[0.08em] text-[var(--i-text-faint)]">{item.state ?? "unknown"} · {item.estimateSource === "issue_placeholder" ? "estimate missing" : `${item.low}–${item.likely}–${item.high}d`}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((item) => (
              <ProposalCard key={item.id} item={item} selection={selectionByItem.get(item.id)} capabilities={capabilities} onStage={onStage} onUnstage={onUnstage} />
            ))}
            {proposal && shown.length === 0 && <State title={proposal.items.length === 0 ? "No proposals" : filter === "exceptions" ? "No open exceptions" : "No matching proposals"} body={proposal.items.length === 0 ? "Current Linear work and accepted context do not support a product-shape change." : "Try another search or view."} shoot={proposal.items.length === 0 ? "reconciliation-no-proposals" : "reconciliation-no-matches"} />}
          </div>
        )}
      </div>

      <div className="shrink-0 p-3" style={{ borderTop: "1px solid var(--i-border)" }}>
        <button onClick={onStageConfident} disabled={!proposal || committing} className="w-full rounded-md px-3 py-2 text-[9px] text-[var(--i-text-soft)] disabled:opacity-30" style={{ border: "1px solid var(--i-border-strong)" }}>Stage all high-confidence changes</button>
        <button onClick={onCommit} disabled={selections.length === 0 || committing || Boolean(proposal?.stale)} className="mt-1.5 w-full rounded-md px-3 py-2 text-[10px] disabled:opacity-30" style={{ border: "1px solid var(--i-signal)", color: "var(--i-signal)", background: "color-mix(in srgb, var(--i-signal) 5%, transparent)" }} data-shoot="commit-reconciled-scope">
          {committing ? "Committing through Reality…" : `Commit ${selections.length || "reviewed"} change${selections.length === 1 ? "" : "s"}`}
        </button>
        {commitError && <p className="mt-2 text-[8.5px] leading-snug text-[var(--i-red)]" data-shoot="reconciliation-conflict">{commitError}</p>}
        {committed && <p className="mt-2 text-[8.5px] text-[var(--i-mint)]">Reality committed; forecast inputs and revision were refreshed.</p>}
        <p className="mt-2 text-[8px] leading-snug text-[var(--i-text-faint)]">Proposals are persisted and inspectable. Staging is local. Only Commit changes shared Reality.</p>
      </div>
    </aside>
  );
}

function ProposalCard({ item, selection, capabilities, onStage, onUnstage }: { item: ScopeProposalItemView; selection?: Selection; capabilities: { id: string; name: string; revision: number }[]; onStage: (item: ScopeProposalItemView, targetCapabilityId: string | null, releaseStatus: "accepted" | "outside") => void; onUnstage: (itemId: string) => void }) {
  const initialTarget = selection?.targetCapabilityId ?? item.targetCapabilityId;
  const [target, setTarget] = useState(initialTarget ?? "new");
  const [release, setRelease] = useState<"accepted" | "outside">(selection?.releaseStatus ?? (item.releaseSignal === "likely_out" ? "outside" : "accepted"));
  const actionable = item.action !== "none" && item.status !== "committed";
  const evidence = item.provenance.contextRefs.length;
  return (
    <article className="rounded-lg px-3 py-2.5" style={{ border: `1px solid ${selection ? "color-mix(in srgb, var(--i-violet) 62%, var(--i-border))" : "var(--i-border)"}`, background: selection ? "color-mix(in srgb, var(--i-violet) 6%, var(--i-recess))" : "var(--i-recess)" }} data-shoot={item.matchState === "unresolved" ? "proposal-ambiguous" : "proposal-card"} data-proposal-item={item.id}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold leading-snug text-[var(--i-text)]">{item.title}</div>
          <div className="mt-1 text-[7.5px] uppercase tracking-[0.1em]" style={{ color: item.confidence === "high" ? "var(--i-signal)" : item.confidence === "medium" ? "var(--i-text-soft)" : "var(--i-amber)" }}>{item.confidence} {item.confidenceScore}% · {item.matchState.replaceAll("_", " ")}</div>
        </div>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[7.5px] uppercase tracking-[0.08em]" style={{ border: "1px solid var(--i-border-strong)", color: item.releaseSignal === "boundary" ? "var(--i-amber)" : "var(--i-text-soft)" }}>{item.releaseSignal.replace("likely_", "")}</span>
      </div>
      <p className="mt-2 text-[8.5px] leading-snug text-[var(--i-text-soft)]">{item.rationale.headline}</p>
      <div className="mt-1.5 text-[8px] text-[var(--i-text-faint)]">{item.workItemIds.length} executable item{item.workItemIds.length === 1 ? "" : "s"} · {evidence} context reference{evidence === 1 ? "" : "s"}</div>
      {item.rationale.cautions.length > 0 && <p className="mt-1.5 text-[8px] leading-snug text-[var(--i-amber)]">{item.rationale.cautions[0]}</p>}
      {actionable && (
        <div className="mt-2 grid grid-cols-[1fr_72px] gap-1">
          <select value={target} onChange={(event) => { const next = event.target.value; setTarget(next); if (selection) onStage(item, next === "new" ? null : next, release); }} className="min-w-0 rounded px-1.5 py-1 text-[8px]" style={{ border: "1px solid var(--i-border)", background: "#0b0f12", color: "var(--i-text-soft)" }} aria-label={`Capability for ${item.title}`}>
            <option value="new">New capability</option>
            {capabilities.map((capability) => <option key={capability.id} value={capability.id}>{capability.name}</option>)}
          </select>
          <select value={release} onChange={(event) => { const next = event.target.value as "accepted" | "outside"; setRelease(next); if (selection) onStage(item, target === "new" ? null : target, next); }} className="rounded px-1.5 py-1 text-[8px]" style={{ border: "1px solid var(--i-border)", background: "#0b0f12", color: "var(--i-text-soft)" }} aria-label={`Release state for ${item.title}`}>
            <option value="accepted">in</option><option value="outside">out</option>
          </select>
        </div>
      )}
      <button disabled={!actionable} onClick={() => selection ? onUnstage(item.id) : onStage(item, target === "new" ? null : target, release)} className="mt-2 w-full rounded px-2 py-1.5 text-[8.5px] disabled:opacity-30" style={{ border: `1px solid ${selection ? "var(--i-violet)" : "var(--i-border-strong)"}`, color: selection ? "var(--i-violet)" : "var(--i-text-soft)" }}>
        {item.status === "committed" ? "Committed" : item.action === "none" ? "Review boundary" : selection ? "Unstage" : "Stage proposal"}
      </button>
    </article>
  );
}

function Freshness({ label, value }: { label: string; value: string }) { return <div className="rounded px-1.5 py-1.5" style={{ background: "var(--i-recess)" }}><div className="uppercase tracking-[0.08em]">{label}</div><div className="mt-0.5 truncate text-[8.5px] text-[var(--i-text-soft)]">{value}</div></div>; }
function Count({ label, value, caution }: { label: string; value: number; caution?: boolean }) { return <div className="rounded px-1.5 py-1.5" style={{ border: "1px solid var(--i-border)" }}><div className="i-readout text-[12px]" style={{ color: caution && value ? "var(--i-amber)" : "var(--i-text-soft)" }}>{value}</div><div className="text-[7.5px] uppercase tracking-[0.07em] text-[var(--i-text-faint)]">{label}</div></div>; }
function State({ title, body, shoot }: { title: string; body: string; shoot: string }) { return <div className="rounded-lg px-3 py-4 text-center" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }} data-shoot={shoot}><div className="text-[10px] font-medium text-[var(--i-text-soft)]">{title}</div><p className="mt-1.5 text-[8.5px] leading-snug text-[var(--i-text-faint)]">{body}</p></div>; }
function shortDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "unknown"; }
