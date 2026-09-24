"use client";

import { useEffect, useMemo, useState } from "react";
import ToolWindow from "@/components/instrument/ToolWindow";
import type { ScopeWorkItem, SuiteScenario } from "@/lib/instrument/useProject";
import { bulkStageEligibleItems, isBulkStageEligible } from "@/lib/scope/proposalEligibility";

export interface ScopeProposalView {
  id: string;
  scopeId: string;
  status: string;
  generatedAt: string;
  stale?: boolean;
  sourceWatermark: {
    linearAsOf: string | null;
    linearIssueCount: number;
    linearClusterCount: number;
    contextSnapshotId: string | null;
    contextGeneratedAt: string | null;
    contextAcceptedAt: string | null;
    contextProducer: string | null;
    contextRefCount: number;
    realityCapabilityCount: number;
    activeRelease?: {
      name: string | null;
      normalizedName: string | null;
      aliases: string[];
      source: "governed_scope_project" | "linear_execution_owner" | "ambiguous" | "unresolved";
      candidates: string[];
    };
    completeness?: unknown;
  };
  summary: {
    likelyIn: number;
    likelyOut: number;
    boundaryReview: number;
    confidentlyMatched: number;
    suggested: number;
    unresolved: number;
    aligned: number;
    noExecution: number;
    executionExceptions: number;
    conflicts: number;
  };
  items: ScopeProposalItemView[];
}

export interface ScopeProposalItemView {
  id: string;
  title: string;
  description: string | null;
  origins: ("knowledge" | "reality" | "linear")[];
  reconciliationState: "aligned" | "knowledge_no_execution" | "reality_no_execution" | "execution_exception" | "deferred" | "boundary" | "conflict";
  conflicts: string[];
  releaseSignal: "likely_in" | "likely_out" | "boundary";
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  matchState: "confidently_matched" | "suggested" | "unresolved" | "corroborated" | "conflict";
  action: "link_existing" | "create_capability" | "none";
  targetCapabilityId: string | null;
  targetRevision: number | null;
  workItemIds: string[];
  alreadyLinkedItemIds: string[];
  rationale: { headline: string; signals: string[]; cautions: string[] };
  provenance: {
    linearParent: { identifier: string; title: string } | null;
    linearParents: { identifier: string; title: string }[];
    linearItems: { identifier: string; title?: string; state: string; projectName: string | null; updatedAt: string | null }[];
    claimedElsewhere?: { identifier: string; capabilityId: string; capabilityName: string; capabilityStatus: string }[];
    contextSnapshotId: string | null;
    contextRefs: { kind: string; id: string; statement: string; evidenceRefs: string[]; topicTags: string[]; candidateTitle: string | null; observedAt?: string | null; releaseClaims?: ReleaseClaimView[] }[];
    realityCapability: { id: string; name: string; status: string; revision: number } | null;
    releaseInterpretation?: {
      activeRelease: string | null;
      activeReleaseSource: "governed_scope_project" | "linear_execution_owner" | "ambiguous" | "unresolved";
      policy: "latest_explicit_same_boundary";
      effectiveClaims: ReleaseClaimView[];
      supersededClaims: ReleaseClaimView[];
      otherBoundaryClaims: ReleaseClaimView[];
      genericClaims: ReleaseClaimView[];
    };
    method: string;
  };
  status: string;
}

interface ReleaseClaimView {
  direction: "in" | "out";
  boundary: string | null;
  normalizedBoundary: string | null;
  specificity: "named" | "generic";
  observedAt: string | null;
  evidenceId: string;
}

type Selection = SuiteScenario["scopeProposalSelections"][number];
type Bank = "review" | "later" | "work";

export default function ScopeReconciliation(props: {
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
  onStage: (item: ScopeProposalItemView, targetCapabilityId: string | null, releaseStatus: "accepted" | "outside", itemIds?: string[]) => void;
  onUnstage: (itemId: string) => void;
  onStageConfident: () => void;
  onCommit: () => void;
}) {
  const { proposal, loading, warning, error, realityRevision, capabilities, unmapped, selections, committing, commitError, committed, onRefresh, onStage, onUnstage, onStageConfident, onCommit } = props;
  const [bank, setBank] = useState<Bank>("review");
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const selectionByItem = useMemo(() => new Map(selections.map((selection) => [selection.itemId, selection])), [selections]);
  const focused = proposal?.items.find((item) => item.id === focusedId) ?? null;
  const completeness = proposal?.sourceWatermark.completeness && typeof proposal.sourceWatermark.completeness === "object" ? proposal.sourceWatermark.completeness as Record<string, unknown> : null;
  const partial = completeness?.status === "partial" || completeness?.complete === false;
  const fresh = !proposal?.stale && !warning;
  const knowledgeDate = proposal?.sourceWatermark.contextAcceptedAt ?? proposal?.sourceWatermark.contextGeneratedAt;
  const reviewItems = (proposal?.items ?? []).filter((item) => item.reconciliationState !== "deferred");
  const laterItems = (proposal?.items ?? []).filter((item) => item.reconciliationState === "deferred");
  const visibleItems = (bank === "later" ? laterItems : reviewItems).filter((item) => !query || [
    item.title,
    item.workItemIds.join(" "),
    item.rationale.headline,
    ...item.provenance.linearItems.flatMap((work) => [work.identifier, work.title ?? ""]),
  ].join(" ").toLowerCase().includes(query.toLowerCase()));
  const nextReviewItem = focused ? (() => {
    const currentIndex = reviewItems.findIndex((item) => item.id === focused.id);
    const ordered = [...reviewItems.slice(currentIndex + 1), ...reviewItems.slice(0, currentIndex)];
    return ordered.find((item) => item.id !== focused.id && item.status !== "committed" && item.action !== "none" && !selectionByItem.has(item.id)) ?? null;
  })() : null;
  const stagedItemIds = new Set(selections.map((selection) => selection.itemId));
  const bulkEligible = bulkStageEligibleItems(proposal?.items ?? [], stagedItemIds);
  const bulkEligibleTotal = (proposal?.items ?? []).filter(isBulkStageEligible).length;
  const bulkExplanation = !proposal
    ? "A current proposal is required before aligned candidates can be staged."
    : bulkEligible.length > 0
      ? `${bulkEligible.length} aligned, high-confidence ${bulkEligible.length === 1 ? "candidate is" : "candidates are"} ready to stage in Scenario.`
      : bulkEligibleTotal > 0
        ? `All ${bulkEligibleTotal} eligible aligned ${bulkEligibleTotal === 1 ? "candidate is" : "candidates are"} already staged in this Scenario.`
        : "No candidates qualify. Bulk staging requires aligned, high-confidence, actionable, uncommitted candidates.";

  return (
    <>
      <aside className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden rounded-xl" style={{ border: "1px solid var(--i-border)", background: "linear-gradient(180deg, #11171b, #0b1013)" }} data-shoot={committed ? "reconciliation-commit-success" : warning ? "reconciliation-stale" : partial ? "reconciliation-partial" : "reconciliation-workspace"}>
        <div className="shrink-0 px-4 pb-3 pt-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: fresh ? "var(--i-signal)" : "var(--i-amber)" }}>Reconcile shape</div>
              <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">Knowledge + Reality + Linear</div>
            </div>
            <button onClick={onRefresh} disabled={loading} className="ml-auto rounded-md px-2.5 py-1.5 text-[9.5px] text-[var(--i-text-soft)]" style={{ border: "1px solid var(--i-border-strong)" }}>{loading ? "Reading…" : "Refresh"}</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <Freshness label="Knowledge" value={knowledgeDate ? shortDate(knowledgeDate) : "missing"} />
            <Freshness label="Linear" value={proposal?.sourceWatermark.linearAsOf ? shortDate(proposal.sourceWatermark.linearAsOf) : "no rows"} />
            <Freshness label="Reality" value={`r${realityRevision}`} />
          </div>
          {proposal && <div className="mt-2 rounded-md px-2.5 py-2 text-[9px] leading-snug text-[var(--i-text-soft)]" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }} data-shoot="active-release-boundary">
            Interpreted for <span className="font-medium text-[var(--i-text)]">{proposal.sourceWatermark.activeRelease?.name ?? "unresolved release"}</span> · {releaseSourceLabel(proposal.sourceWatermark.activeRelease?.source ?? "unresolved")}
          </div>}
          {proposal && <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Count label="aligned" value={proposal.summary.aligned} />
            <Count label="no work" value={proposal.summary.noExecution} caution />
            <Count label="exceptions" value={proposal.summary.executionExceptions} caution />
            <Count label="conflicts" value={proposal.summary.conflicts} danger />
          </div>}
          {(warning || error) && <p className="mt-2 text-[10px] leading-snug text-[var(--i-amber)]">{warning ?? error}</p>}
          {partial && !warning && <p className="mt-2 text-[10px] leading-snug text-[var(--i-amber)]">Knowledge is partial. Missing-source boundaries remain visible.</p>}
          <div className="mt-3 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Scope reconciliation banks">
            <BankButton active={bank === "review"} onClick={() => setBank("review")} label={`Review ${reviewItems.length}`} />
            <BankButton active={bank === "later"} onClick={() => setBank("later")} label={`Out / later ${laterItems.length}`} />
            <BankButton active={bank === "work"} onClick={() => setBank("work")} label={`Work ${unmapped.length}`} />
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find capability or work" aria-label="Find reconciliation candidate" className="mt-2.5 w-full rounded-md px-3 py-2 text-[10.5px] outline-none" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)", color: "var(--i-text)" }} />
          <p id="candidate-path-help" className="mt-2 text-[9px] leading-snug text-[var(--i-text-faint)]">Browse the candidates below. Open one to inspect evidence and stage a reviewed change.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--i-violet)]" tabIndex={0} role="region" aria-label="Reconciliation candidates" aria-describedby="candidate-path-help" data-shoot="candidate-scroll-region">
          {loading && !proposal && <State title="Composing current truth" body="Reading the latest accepted snapshot, accepted Scope Reality, and current Linear execution." shoot="reconciliation-loading" />}
          {!loading && !proposal && <State title="No proposal available" body="Reality is unchanged. Refresh when Knowledge and Linear are available." shoot="reconciliation-empty" />}
          {bank === "work" ? <WorkBank items={unmapped} query={query} /> : <div className="space-y-2">
            {visibleItems.map((item) => <CandidateRow key={item.id} item={item} selected={selectionByItem.has(item.id)} onOpen={() => setFocusedId(item.id)} />)}
            {proposal && visibleItems.length === 0 && <State title={bank === "later" ? "No deferred candidates" : "No matching reconciliation"} body="The current source ledgers do not contain an item in this bank." shoot="reconciliation-no-matches" />}
          </div>}
        </div>

        <div className="shrink-0 p-3.5" style={{ borderTop: "1px solid var(--i-border)" }}>
          <div className="flex gap-2">
            <button onClick={onStageConfident} disabled={bulkEligible.length === 0 || committing} aria-describedby="bulk-stage-explanation" className="flex-1 rounded-md px-3 py-2.5 text-[10px] text-[var(--i-text-soft)] disabled:cursor-not-allowed disabled:opacity-30" style={{ border: "1px solid var(--i-border-strong)" }} data-shoot="stage-aligned">{`Stage ${bulkEligible.length} aligned`}</button>
            <button onClick={onCommit} disabled={selections.length === 0 || committing || Boolean(proposal?.stale)} className="flex-1 rounded-md px-3 py-2.5 text-[10px] font-medium disabled:opacity-30" style={{ border: "1px solid var(--i-signal)", color: "var(--i-signal)", background: "color-mix(in srgb, var(--i-signal) 6%, transparent)" }} data-shoot="commit-reconciled-scope">{committing ? "Committing…" : selections.length > 0 ? `Commit ${selections.length} to Reality` : "Commit staged to Reality"}</button>
          </div>
          <p id="bulk-stage-explanation" className="mt-2 text-[9px] leading-snug text-[var(--i-text-faint)]" data-shoot="bulk-stage-explanation">{bulkExplanation}</p>
          {selections.length > 0 && <div className="mt-2 rounded-md px-2.5 py-2 text-[10px] font-medium text-[var(--i-violet)]" style={{ border: "1px solid color-mix(in srgb, var(--i-violet) 45%, var(--i-border))", background: "color-mix(in srgb, var(--i-violet) 8%, var(--i-recess))" }} role="status" aria-live="polite" data-shoot="reconciliation-scenario-feedback">Scenario · {selections.length} reviewed {selections.length === 1 ? "change" : "changes"} staged. Reality is unchanged.</div>}
          {commitError && <p className="mt-2 text-[10px] leading-snug text-[var(--i-red)]" data-shoot="reconciliation-conflict">{commitError}</p>}
          {committed && <p className="mt-2 text-[10px] text-[var(--i-mint)]">Reality committed and derived truth refreshed.</p>}
          <p className="mt-2 text-[9px] leading-snug text-[var(--i-text-faint)]">Open any candidate to inspect evidence, execution, corrections, and modeled consequence together.</p>
        </div>
      </aside>

      <ReconciliationFocus item={focused} nextItem={nextReviewItem} selection={focused ? selectionByItem.get(focused.id) : undefined} capabilities={capabilities} committing={committing} onClose={() => setFocusedId(null)} onReviewNext={(itemId) => setFocusedId(itemId)} onStage={onStage} onUnstage={onUnstage} />
    </>
  );
}

function CandidateRow({ item, selected, onOpen }: { item: ScopeProposalItemView; selected: boolean; onOpen: () => void }) {
  const tone = item.reconciliationState === "conflict" ? "var(--i-red)" : item.reconciliationState === "aligned" ? "var(--i-mint)" : item.reconciliationState === "execution_exception" ? "var(--i-amber)" : "var(--i-violet)";
  return <button onClick={onOpen} className="group w-full rounded-lg px-3.5 py-3 text-left transition-colors" style={{ border: `1px solid ${selected ? "var(--i-violet)" : "var(--i-border)"}`, background: selected ? "color-mix(in srgb, var(--i-violet) 7%, var(--i-recess))" : "var(--i-recess)" }} data-shoot={item.reconciliationState === "conflict" ? "proposal-conflict" : "proposal-card"} data-proposal-item={item.id}>
    <div className="flex items-start gap-3">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 12px color-mix(in srgb, ${tone} 40%, transparent)` }} />
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold leading-snug text-[var(--i-text)]">{item.title}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">{item.origins.map((origin) => <Origin key={origin} value={origin} />)}</div>
      </div>
      <span className="text-[10px] text-[var(--i-text-faint)] group-hover:text-[var(--i-text)]">Review →</span>
    </div>
    <p className="mt-2.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--i-text-soft)]">{item.rationale.headline}</p>
    <div className="mt-2 flex items-center gap-2 text-[9px] text-[var(--i-text-faint)]"><span>{item.workItemIds.length} work</span><span>·</span><span>{item.provenance.contextRefs.length} evidence</span><span>·</span><span>{item.confidenceScore}%</span>{selected && <><span>·</span><span className="text-[var(--i-violet)]">staged</span></>}</div>
  </button>;
}

function ReconciliationFocus({ item, nextItem, selection, capabilities, committing, onClose, onReviewNext, onStage, onUnstage }: { item: ScopeProposalItemView | null; nextItem: ScopeProposalItemView | null; selection?: Selection; capabilities: { id: string; name: string; revision: number }[]; committing: boolean; onClose: () => void; onReviewNext: (itemId: string) => void; onStage: (item: ScopeProposalItemView, targetCapabilityId: string | null, releaseStatus: "accepted" | "outside", itemIds?: string[]) => void; onUnstage: (itemId: string) => void }) {
  const [target, setTarget] = useState("new");
  const [release, setRelease] = useState<"accepted" | "outside">("accepted");
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);
  const identity = item ? `${item.id}:${selection?.targetCapabilityId ?? item.targetCapabilityId ?? "new"}:${selection?.releaseStatus ?? item.releaseSignal}:${selection?.itemIds.join(",") ?? "default"}` : "none";
  useEffect(() => {
    if (!item) return;
    setTarget(selection?.targetCapabilityId ?? item.targetCapabilityId ?? "new");
    setRelease(selection?.releaseStatus ?? (item.releaseSignal === "likely_out" ? "outside" : "accepted"));
    setSelectedWorkIds(selection?.itemIds ?? item.workItemIds);
  }, [identity, item, selection]);
  if (!item) return null;
  const claimedElsewhere = item.provenance.claimedElsewhere ?? [];
  const claimedElsewhereById = new Map(claimedElsewhere.map((claim) => [claim.identifier, claim]));
  const releaseInterpretation = item.provenance.releaseInterpretation ?? { activeRelease: null, activeReleaseSource: "unresolved" as const, policy: "latest_explicit_same_boundary" as const, effectiveClaims: [], supersededClaims: [], otherBoundaryClaims: [], genericClaims: [] };
  const actionable = item.action !== "none" && item.status !== "committed" && item.reconciliationState !== "conflict";
  const chosenTarget = target === "new" ? null : target;
  const canRemoveAllExisting = Boolean(item.targetCapabilityId && chosenTarget === item.targetCapabilityId && item.alreadyLinkedItemIds.length);
  const hasReviewedEffect = selectedWorkIds.length > 0 || canRemoveAllExisting;
  const applyCorrection = (nextTarget = chosenTarget, nextRelease = release, nextWorkIds = selectedWorkIds) => { if (selection) onStage(item, nextTarget, nextRelease, nextWorkIds); };
  const toggleWork = (workId: string) => {
    const next = selectedWorkIds.includes(workId)
      ? selectedWorkIds.filter((id) => id !== workId)
      : [...selectedWorkIds, workId];
    setSelectedWorkIds(next);
    applyCorrection(chosenTarget, release, next);
  };
  const chooseWork = (next: string[]) => {
    setSelectedWorkIds(next);
    applyCorrection(chosenTarget, release, next);
  };
  const stageAndAdvance = () => {
    onStage(item, chosenTarget, release, selectedWorkIds);
    if (nextItem) onReviewNext(nextItem.id);
  };
  return <ToolWindow open onClose={onClose} title="Scope reconciliation" subtitle={item.title} width={980} dataShoot="reconciliation-focus" footer={<div className="flex items-center gap-3 px-6 py-4">
    <div className="min-w-0 flex-1 text-[10px] leading-relaxed text-[var(--i-text-faint)]">{selectedWorkIds.length} of {item.workItemIds.length} Linear items selected. Staging is local and reversible; Commit is the only crossing into shared Reality.</div>
    {nextItem && <button type="button" disabled={committing} onClick={() => onReviewNext(nextItem.id)} className="min-w-[120px] rounded-md px-3 py-2.5 text-[10px] text-[var(--i-text-soft)] disabled:opacity-30" style={{ border: "1px solid var(--i-border-strong)" }}>Review next →</button>}
    <button disabled={!actionable || committing || !hasReviewedEffect} onClick={() => selection ? onUnstage(item.id) : stageAndAdvance()} className="min-w-[180px] rounded-md px-4 py-2.5 text-[11px] font-medium disabled:opacity-30" style={{ border: `1px solid ${selection ? "var(--i-violet)" : "var(--i-signal)"}`, color: selection ? "var(--i-violet)" : "var(--i-signal)" }} data-shoot="stage-focused-proposal">{item.status === "committed" ? "Committed" : item.reconciliationState === "conflict" ? "Resolve conflict first" : item.action === "none" ? "Judgment required" : selection ? "Unstage change" : nextItem ? "Stage & review next" : "Stage selected work"}</button>
  </div>}>
    <div className="grid min-h-full grid-cols-[1.05fr_1fr_0.9fr]">
      <section className="p-6" style={{ borderRight: "1px solid var(--i-border)" }}>
        <FocusHeading eyebrow="Product intent" title={item.title} />
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--i-text-soft)]">{item.description ?? item.rationale.headline}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">{item.origins.map((origin) => <Origin key={origin} value={origin} />)}</div>
        <div className="mt-5 rounded-lg p-4" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Current Reality</div>
          <div className="mt-2 text-[13px] font-medium text-[var(--i-text)]">{item.provenance.realityCapability?.name ?? "No accepted capability"}</div>
          <div className="mt-1 text-[10px] text-[var(--i-text-faint)]">{item.provenance.realityCapability ? `${item.provenance.realityCapability.status} · revision ${item.provenance.realityCapability.revision}` : "Knowledge is proposing a new boundary; Reality remains unchanged."}</div>
        </div>
        <div className="mt-3 rounded-lg p-4" style={{ background: "color-mix(in srgb, var(--i-violet) 5%, var(--i-recess))", border: "1px solid color-mix(in srgb, var(--i-violet) 35%, var(--i-border))" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--i-violet)]">Proposed change</div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-text-soft)]">{item.rationale.headline}</p>
        </div>
        {item.conflicts.length > 0 && <div className="mt-3 rounded-lg border border-[var(--i-red)]/40 bg-[var(--i-red)]/5 p-4" data-shoot="focused-conflict"><div className="text-[10px] uppercase tracking-[0.14em] text-[var(--i-red)]">Conflict</div>{item.conflicts.map((conflict) => <p key={conflict} className="mt-2 text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{conflict}</p>)}</div>}
        {actionable && <div className="mt-5 grid grid-cols-[1fr_110px] gap-2"><label className="text-[9px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">Capability<select value={target} onChange={(event) => { const value = event.target.value; setTarget(value); applyCorrection(value === "new" ? null : value, release); }} className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[10.5px] normal-case tracking-normal" style={{ border: "1px solid var(--i-border-strong)", background: "#0b0f12", color: "var(--i-text)" }}><option value="new">New capability</option>{capabilities.map((capability) => <option key={capability.id} value={capability.id}>{capability.name}</option>)}</select></label><label className="text-[9px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">Release<select value={release} onChange={(event) => { const value = event.target.value as "accepted" | "outside"; setRelease(value); applyCorrection(chosenTarget, value); }} className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[10.5px] normal-case tracking-normal" style={{ border: "1px solid var(--i-border-strong)", background: "#0b0f12", color: "var(--i-text)" }}><option value="accepted">In</option><option value="outside">Out / later</option></select></label></div>}
      </section>

      <section className="p-6" style={{ borderRight: "1px solid var(--i-border)" }} data-shoot="proposal-evidence-inspection">
        <FocusHeading eyebrow="Structured evidence" title={`${item.provenance.contextRefs.length} current references`} />
        <div className="mt-4 rounded-lg p-3.5" style={{ border: "1px solid color-mix(in srgb, var(--i-signal) 35%, var(--i-border))", background: "color-mix(in srgb, var(--i-signal) 5%, var(--i-recess))" }} data-shoot="focus-release-boundary">
          <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--i-signal)]">Release interpretation</div>
          <div className="mt-1.5 text-[12px] font-medium text-[var(--i-text)]">{releaseInterpretation.activeRelease ? `Interpreted for ${releaseInterpretation.activeRelease}` : "Active release unresolved"}</div>
          <div className="mt-1 text-[9.5px] leading-relaxed text-[var(--i-text-faint)]">{releaseSourceLabel(releaseInterpretation.activeReleaseSource)} · latest explicit same-boundary evidence wins; other release claims remain visible but do not move this boundary.</div>
        </div>
        <div className="mt-3 space-y-2.5">{item.provenance.contextRefs.length ? item.provenance.contextRefs.slice(0, 8).map((ref) => <div key={ref.id} className="rounded-lg p-3.5" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }}>
          <div className="flex items-center gap-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[var(--i-signal)]">{ref.kind.replaceAll("_", " ")}</span><span className="ml-auto text-[9px] text-[var(--i-text-faint)]">{ref.observedAt ? shortDate(ref.observedAt) : `${ref.evidenceRefs.length} citations`}</span></div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{ref.statement}</p>
          {(ref.releaseClaims?.length ?? 0) > 0 && <div className="mt-2 flex flex-wrap gap-1">{ref.releaseClaims!.map((claim, index) => <ReleaseClaimChip key={`${claim.direction}:${claim.normalizedBoundary}:${index}`} claim={claim} activeRelease={releaseInterpretation.activeRelease} effective={releaseInterpretation.effectiveClaims.some((effectiveClaim) => effectiveClaim.evidenceId === ref.id && effectiveClaim.direction === claim.direction && effectiveClaim.normalizedBoundary === claim.normalizedBoundary)} superseded={releaseInterpretation.supersededClaims.some((supersededClaim) => supersededClaim.evidenceId === ref.id && supersededClaim.direction === claim.direction && supersededClaim.normalizedBoundary === claim.normalizedBoundary)} />)}</div>}
          {ref.topicTags.length > 0 && <div className="mt-2 text-[9px] text-[var(--i-text-faint)]">topics · {ref.topicTags.join(" · ")}</div>}
        </div>) : <EmptyBlock>Knowledge contains no safe candidate match. This absence is preserved.</EmptyBlock>}</div>
      </section>

      <section className="p-6">
        <FocusHeading eyebrow="Execution cluster" title={claimedElsewhere.length ? `${item.workItemIds.length} available · ${claimedElsewhere.length} governed elsewhere` : `${item.workItemIds.length} current items`} />
        <div className="mt-4 rounded-lg p-4" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">Linear boundary</div>
          <div className="mt-2 text-[12px] font-medium text-[var(--i-text)]">{item.provenance.linearParent ? `${item.provenance.linearParent.identifier} · ${item.provenance.linearParent.title}` : "No safe parent boundary"}</div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--i-text-faint)]"><span>{item.alreadyLinkedItemIds.length}/{item.workItemIds.length} already linked · {item.workItemIds.length - item.alreadyLinkedItemIds.length} proposed</span><span className="ml-auto flex gap-1"><button type="button" disabled={!actionable || committing} onClick={() => chooseWork(item.workItemIds)} className="rounded px-2 py-1 disabled:opacity-30" style={{ border: "1px solid var(--i-border-strong)" }}>All</button><button type="button" disabled={!actionable || committing} onClick={() => chooseWork([])} className="rounded px-2 py-1 disabled:opacity-30" style={{ border: "1px solid var(--i-border-strong)" }}>None</button></span></div>
        </div>
        <div className="mt-3 max-h-[290px] space-y-1.5 overflow-y-auto">{item.provenance.linearItems.length ? item.provenance.linearItems.map((work) => {
          const checked = selectedWorkIds.includes(work.identifier);
          const linked = item.alreadyLinkedItemIds.includes(work.identifier);
          const otherOwner = claimedElsewhereById.get(work.identifier);
          return <label key={work.identifier} className={`flex items-start gap-2 rounded-md px-3 py-2.5 ${otherOwner ? "cursor-not-allowed opacity-65" : "cursor-pointer"}`} style={{ border: `1px solid ${checked ? "color-mix(in srgb, var(--i-violet) 55%, var(--i-border))" : "var(--i-border)"}`, background: checked ? "color-mix(in srgb, var(--i-violet) 6%, transparent)" : "transparent" }} data-shoot="proposal-work-choice">
            <input type="checkbox" checked={checked} disabled={!actionable || committing || Boolean(otherOwner)} onChange={() => toggleWork(work.identifier)} className="mt-0.5 accent-[var(--i-violet)]" />
            <span className="min-w-0 flex-1"><span className="block text-[10.5px] font-medium text-[var(--i-text)]">{work.identifier}{work.title ? ` · ${work.title}` : ""}</span><span className="mt-1 block text-[9px] text-[var(--i-text-faint)]">{work.state}{otherOwner ? ` · governed by ${otherOwner.capabilityName} · excluded` : linked ? " · linked in Reality" : " · proposed"}</span></span>
          </label>;
        }) : <EmptyBlock>No current executable Linear work matched this capability.</EmptyBlock>}</div>
        <div className="mt-5 rounded-lg p-4" style={{ border: "1px solid var(--i-border-strong)", background: "#0c1215" }}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">Modeled consequence</div>
          <div className="mt-2 text-[12px] font-medium text-[var(--i-text)]">{selection ? `${selectedWorkIds.length} selected items included in the active Scope Scenario` : item.action === "none" ? "No safe simulation input yet" : "Select the work that belongs, then stage it"}</div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--i-text-faint)]">Unchecking an item already linked to this capability previews removing that association. Moving selected work to another capability previews the reassignment. Missing estimates remain visible; no effort is fabricated here.</p>
        </div>
        {item.rationale.cautions.length > 0 && <div className="mt-4"><div className="text-[10px] uppercase tracking-[0.12em] text-[var(--i-amber)]">Cautions</div>{item.rationale.cautions.map((caution) => <p key={caution} className="mt-2 text-[10px] leading-relaxed text-[var(--i-text-soft)]">{caution}</p>)}</div>}
      </section>
    </div>
  </ToolWindow>;
}

function WorkBank({ items, query }: { items: ScopeWorkItem[]; query: string }) { const visible = items.filter((item) => !query || `${item.id} ${item.label}`.toLowerCase().includes(query.toLowerCase())); return <div className="space-y-2" data-shoot="execution-work-finder">{visible.slice(0, 80).map((item) => <div key={item.id} className="rounded-lg px-3.5 py-3" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }}><div className="text-[10.5px] font-medium leading-snug text-[var(--i-text)]">{item.label}</div><div className="mt-1.5 text-[9px] text-[var(--i-text-faint)]">{item.state ?? "unknown"} · {item.estimateSource === "issue_placeholder" ? "estimate missing" : `${item.low}–${item.likely}–${item.high}d`}</div></div>)}{visible.length === 0 && <State title="No matching work" body="Try another identifier or title." shoot="work-no-matches" />}</div>; }
function BankButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button role="tab" aria-selected={active} onClick={onClick} className="rounded-md px-2 py-2 text-[9.5px] font-medium" style={{ border: `1px solid ${active ? "var(--i-violet)" : "var(--i-border)"}`, color: active ? "var(--i-text)" : "var(--i-text-faint)", background: active ? "color-mix(in srgb, var(--i-violet) 7%, transparent)" : "transparent" }}>{label}</button>; }
function Origin({ value }: { value: string }) { const tone = value === "knowledge" ? "var(--i-signal)" : value === "reality" ? "var(--i-mint)" : "var(--i-amber)"; return <span className="rounded-full px-2 py-0.5 text-[8.5px] uppercase tracking-[0.09em]" style={{ border: `1px solid color-mix(in srgb, ${tone} 38%, var(--i-border))`, color: tone }}>{value}</span>; }
function ReleaseClaimChip({ claim, activeRelease, effective, superseded }: { claim: ReleaseClaimView; activeRelease: string | null; effective: boolean; superseded: boolean }) { const sameNamedBoundary = Boolean(activeRelease && claim.boundary?.toLowerCase() === activeRelease.toLowerCase()); const relation = effective ? "applied" : superseded ? "superseded" : claim.specificity === "generic" ? "unqualified" : sameNamedBoundary ? "context only" : "other boundary"; const tone = effective ? "var(--i-mint)" : superseded ? "var(--i-text-faint)" : "var(--i-amber)"; return <span className="rounded-full px-2 py-0.5 text-[8px] uppercase tracking-[0.08em]" title={activeRelease ? `Interpreted for ${activeRelease}` : "Active release unresolved"} style={{ border: `1px solid color-mix(in srgb, ${tone} 38%, var(--i-border))`, color: tone }}>{claim.direction} · {claim.boundary ?? "unspecified"} · {relation}</span>; }
function FocusHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div><div className="text-[10px] uppercase tracking-[0.16em] text-[var(--i-text-faint)]">{eyebrow}</div><div className="mt-1.5 text-[16px] font-semibold leading-tight text-[var(--i-text)]">{title}</div></div>; }
function EmptyBlock({ children }: { children: React.ReactNode }) { return <div className="rounded-lg border border-[var(--i-border)] bg-[var(--i-recess)] p-4 text-[10.5px] leading-relaxed text-[var(--i-text-faint)]">{children}</div>; }
function Freshness({ label, value }: { label: string; value: string }) { return <div className="rounded-md px-2 py-2" style={{ background: "var(--i-recess)" }}><div className="text-[8px] uppercase tracking-[0.08em] text-[var(--i-text-faint)]">{label}</div><div className="mt-1 truncate text-[10px] text-[var(--i-text-soft)]">{value}</div></div>; }
function Count({ label, value, caution, danger }: { label: string; value: number; caution?: boolean; danger?: boolean }) { return <div className="rounded-md px-2 py-2" style={{ border: "1px solid var(--i-border)" }}><div className="i-readout text-[15px]" style={{ color: danger && value ? "var(--i-red)" : caution && value ? "var(--i-amber)" : "var(--i-text)" }}>{value}</div><div className="mt-0.5 text-[7.5px] uppercase tracking-[0.06em] text-[var(--i-text-faint)]">{label}</div></div>; }
function State({ title, body, shoot }: { title: string; body: string; shoot: string }) { return <div className="rounded-lg px-4 py-5 text-center" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }} data-shoot={shoot}><div className="text-[11px] font-medium text-[var(--i-text-soft)]">{title}</div><p className="mt-2 text-[10px] leading-relaxed text-[var(--i-text-faint)]">{body}</p></div>; }
function shortDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "unknown"; }
function releaseSourceLabel(source: "governed_scope_project" | "linear_execution_owner" | "ambiguous" | "unresolved") { return source === "governed_scope_project" ? "governed Scope project" : source === "linear_execution_owner" ? "current Linear execution owner" : source === "ambiguous" ? "multiple release candidates" : "no safe release identity"; }
