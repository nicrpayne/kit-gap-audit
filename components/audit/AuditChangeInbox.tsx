"use client";

import Link from "@/components/instrument/SignalLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignalControl } from "@/components/instrument/SignalPrimitives";
import styles from "./AuditWorld.module.css";

type Json = Record<string, unknown>;

interface Proposal {
  id: string;
  category: string;
  owner: string;
  changeType: string;
  title: string;
  summary: string;
  whyProposed: string;
  currentState: Json;
  proposedState: Json;
  evidence: { id: string; excerpt: string; sourceRef?: string | null; observedAt?: string | null; kind: string }[];
  currentness: string;
  retrievalBasis: string;
  retrievalConfidence: string;
  forecastEffect: Json | null;
  relevanceClass: string;
  relevanceReason: string;
  sourceKind: string;
  recommendedAction: string;
  targetHref: string | null;
  completionRequirements: string[];
  status: string;
  dispositionReason: string | null;
  canonicalObjectType: string | null;
  canonicalObjectId: string | null;
  acceptedAt: string | null;
}

interface InboxPayload {
  knowledge: {
    code: string; label: string; detail: string; checkedAt: string; canRefresh: boolean;
    companion: { state: string; version: string; online: boolean; lastSeenAt: string } | null;
    lastPackageAt: string | null; lastAuditAt: string | null;
    activeJob: { id: string; status: string; stage: string; progress: unknown } | null;
  };
  counts: Record<string, number>;
  total: number;
  proposals: Proposal[];
  sourceHealth: {
    hermes: string; linear: string; linearDetail: string; notion: string; figma: string;
    companion: string; lastPackageAt: string | null; lastAuditAt: string | null;
  };
  readiness: { ready: boolean; label: string; blockers: { code: string; label: string; targetHref: string }[] };
  baseline: { seeded: number; available: boolean };
}

function ago(value: string | null): string {
  if (!value) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function words(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StateView({ value }: { value: Json }) {
  const entries = Object.entries(value).filter(([key]) => key !== "action" && key !== "options");
  return <dl className="space-y-1.5">{entries.map(([key, item]) => (
    <div key={key} className="grid grid-cols-[110px_1fr] gap-2 text-[10.5px]">
      <dt className="text-[var(--i-text-faint)]">{words(key)}</dt>
      <dd className="text-[var(--i-text-soft)]">{typeof item === "string" ? item : JSON.stringify(item)}</dd>
    </div>
  ))}</dl>;
}

function completionPayload(proposal: Proposal, confirmed: boolean, fields: Json): Json {
  return { confirmed, ...fields };
}

export default function AuditChangeInbox({
  scopeId,
  fixture,
  onTrace,
}: {
  scopeId: string;
  fixture?: string;
  onTrace?: (canonicalId: string) => void;
}) {
  const [payload, setPayload] = useState<InboxPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"changes" | "sources" | "readiness">("changes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState<Json | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [completionFields, setCompletionFields] = useState<Json>({});
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!scopeId || fixture) return;
    const response = await fetch(`/api/audit/changes?scopeId=${encodeURIComponent(scopeId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as InboxPayload & { error?: string };
    if (!response.ok || body.error) throw new Error(body.error ?? "Change Inbox could not be read.");
    setPayload(body); setError(null);
    return body;
  }, [fixture, scopeId]);

  useEffect(() => {
    setPayload(null); setSelectedId(null); setNotice(null);
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Change Inbox could not be read."));
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Change Inbox could not be read."));
    const sources = () => { setTab("sources"); setOpen(true); };
    window.addEventListener("signal-audit-refresh-complete", refresh);
    window.addEventListener("signal-audit-open-source-health", sources);
    return () => {
      window.removeEventListener("signal-audit-refresh-complete", refresh);
      window.removeEventListener("signal-audit-open-source-health", sources);
    };
  }, [load]);

  const selected = payload?.proposals.find((proposal) => proposal.id === selectedId) ?? null;
  const pending = useMemo(() => payload?.proposals.filter((item) => ["pending", "needs_completion", "deferred"].includes(item.status)) ?? [], [payload]);
  const processed = useMemo(() => payload?.proposals.filter((item) => ["accepted", "rejected", "information_only"].includes(item.status)).slice(0, 12) ?? [], [payload]);

  async function requestRefresh() {
    if (!scopeId || busy) return;
    setBusy("refresh"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/audit/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopeId }) });
      const body = await response.json().catch(() => ({})) as { status?: string; reason?: string; error?: string };
      if (!response.ok && response.status !== 409) throw new Error(body.error ?? body.reason ?? "Refresh could not start.");
      if (body.status === "blocked") throw new Error(body.reason ?? "Refresh is waiting.");
      if (body.status === "current") { setNotice(body.reason ?? "Knowledge is current."); await load(); return; }
      setNotice(body.status === "already_running" ? "Refresh already in progress." : "Refresh requested. Signal will wait for a complete package.");
      const poll = async () => {
        const next = await load();
        if (next?.knowledge.code === "refreshing") pollRef.current = window.setTimeout(() => void poll(), 2_000);
        else setBusy(null);
      };
      pollRef.current = window.setTimeout(() => void poll(), 1_500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Refresh could not start.");
    } finally {
      if (!pollRef.current) setBusy(null);
    }
  }

  async function disposition(action: "defer" | "reject" | "information_only" | "reopen") {
    if (!selected || busy) return;
    setBusy(action); setError(null);
    try {
      const response = await fetch(`/api/audit/changes/${selected.id}/disposition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: notice, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Disposition failed.");
      await load(); setNotice(action === "defer" ? "Deferred. It will stay visible for later." : action === "reject" ? "Rejected with its provenance retained." : "Recorded.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Disposition failed."); }
    finally { setBusy(null); }
  }

  async function saveEdit() {
    if (!selected || !edit || busy) return;
    setBusy("edit"); setError(null);
    try {
      const response = await fetch(`/api/audit/changes/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedState: edit, idempotencyKey: crypto.randomUUID(), note: "Edited in Audit Change Inbox" }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Edit failed.");
      setEdit(null); await load(); setNotice("Proposal edited. Reality is still unchanged.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Edit failed."); }
    finally { setBusy(null); }
  }

  async function accept(useCompletion = false) {
    if (!selected || busy) return;
    setBusy("accept"); setError(null);
    try {
      const response = await fetch(`/api/audit/changes/${selected.id}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), ...(useCompletion ? { completion: completionPayload(selected, confirmed, completionFields) } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; needsCompletion?: boolean; fields?: string[]; created?: boolean };
      if (response.status === 422 && body.needsCompletion) { setCompletionOpen(true); setError(null); return; }
      if (!response.ok) throw new Error(body.error ?? "Acceptance failed.");
      setCompletionOpen(false); setConfirmed(false); setCompletionFields({});
      await load(); setNotice(body.created === false ? "Already accepted; no duplicate was created." : "Accepted by the owning instrument. Derived reads were refreshed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Acceptance failed."); }
    finally { setBusy(null); }
  }

  if (fixture) return null;
  const knowledgeTone = payload?.knowledge.code === "current" ? "var(--i-signal)"
    : payload?.knowledge.code === "new_available" ? "var(--i-amber)"
      : payload?.knowledge.code === "offline" ? "var(--i-red)" : "var(--i-text-soft)";

  return <>
    <div className={`${styles.worldWidget} ${styles.changeSummaryWidget}`} data-shoot="audit-change-summary">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => payload?.knowledge.canRefresh ? void requestRefresh() : setOpen(true)}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: knowledgeTone }} />
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-[var(--i-text)]">{payload?.knowledge.label ?? "Checking knowledge…"}</span>
        <span className="text-[9.5px] text-[var(--i-text-faint)]">{ago(payload?.knowledge.lastPackageAt ?? null)}</span>
      </button>
      <div className="grid grid-cols-2 border-t border-[var(--i-border)]">
        <button type="button" className="px-3 py-2 text-left hover:bg-white/[0.03]" onClick={() => { setTab("changes"); setOpen(true); }}>
          <span className="block text-[16px] font-semibold text-[var(--i-text)]">{payload?.total ?? "—"}</span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">Changes since last Audit</span>
        </button>
        <button type="button" className="border-l border-[var(--i-border)] px-3 py-2 text-left hover:bg-white/[0.03]" onClick={() => { setTab("readiness"); setOpen(true); }}>
          <span className="block truncate text-[9.5px] font-semibold" style={{ color: payload?.readiness.ready ? "var(--i-signal)" : "var(--i-amber)" }}>{payload?.readiness.ready ? "REPORT READY" : "REPORT NOT READY"}</span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">{payload?.readiness.blockers.length ?? "—"} blockers</span>
        </button>
      </div>
    </div>

    {open && <aside className={`${styles.worldWidget} ${styles.changeInboxSheet}`} aria-label="Audit Change Inbox" data-shoot="audit-change-inbox">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--i-border)] px-4 py-3">
        <div><div className="i-label text-[9px] text-[var(--i-signal)]">CHANGES SINCE LAST AUDIT</div><h2 className="mt-1 text-[16px] font-medium text-[var(--i-text)]">Govern meaningful deltas</h2><p className="mt-1 text-[10.5px] text-[var(--i-text-faint)]">Audit proposes. Owner instruments accept Reality.</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close Change Inbox" className="text-[20px] text-[var(--i-text-faint)]">×</button>
      </header>
      <div className="flex border-b border-[var(--i-border)] px-3 py-2">
        {(["changes", "sources", "readiness"] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded px-3 py-1.5 text-[10.5px] ${tab === item ? "bg-[var(--i-panel-raised)] text-[var(--i-text)]" : "text-[var(--i-text-faint)]"}`}>{item === "sources" ? "Source health" : words(item)}</button>)}
      </div>
      {error && <div className="mx-3 mt-3 rounded border border-[var(--i-red)]/40 bg-[var(--i-red)]/10 px-3 py-2 text-[10.5px] text-[var(--i-red)]">{error}</div>}
      {notice && <div className="mx-3 mt-3 rounded border border-[var(--i-signal)]/30 bg-[var(--i-signal)]/5 px-3 py-2 text-[10.5px] text-[var(--i-text-soft)]">{notice}</div>}

      {tab === "changes" && <div className="grid min-h-0 flex-1 grid-cols-[250px_1fr]">
        <div className="overflow-y-auto border-r border-[var(--i-border)] p-2">
          <div className="mb-2 flex flex-wrap gap-1 px-1">{Object.entries(payload?.counts ?? {}).map(([key, count]) => <span key={key} className="rounded bg-white/[0.04] px-1.5 py-1 text-[9px] text-[var(--i-text-faint)]">{count} {words(key)}</span>)}</div>
          {pending.map((proposal) => <button type="button" key={proposal.id} onClick={() => { setSelectedId(proposal.id); setEdit(null); setCompletionOpen(false); }} className={`mb-1.5 w-full rounded-md border px-2.5 py-2 text-left ${selected?.id === proposal.id ? "border-[var(--i-signal)]/50 bg-[var(--i-signal)]/5" : "border-[var(--i-border)] bg-white/[0.015]"}`}>
            <div className="flex items-center gap-2"><span className="text-[8.5px] font-semibold uppercase tracking-wide text-[var(--i-text-faint)]">{words(proposal.category)}</span><span className="ml-auto text-[8.5px] text-[var(--i-amber)]">{proposal.recommendedAction === "accept" ? "Recommended accept" : words(proposal.recommendedAction)}</span></div>
            <div className="mt-1 text-[10.5px] leading-snug text-[var(--i-text)]">{proposal.title}</div>
          </button>)}
          {processed.length > 0 && <div className="i-label mb-2 mt-4 px-1 text-[8.5px] text-[var(--i-text-faint)]">PROCESSED · AUDIT TRAIL</div>}
          {processed.map((proposal) => <button type="button" key={proposal.id} onClick={() => { setSelectedId(proposal.id); setEdit(null); setCompletionOpen(false); }} className={`mb-1.5 w-full rounded-md border px-2.5 py-2 text-left ${selected?.id === proposal.id ? "border-[var(--i-signal)]/50 bg-[var(--i-signal)]/5" : "border-[var(--i-border)] bg-white/[0.01]"}`}>
            <div className="flex items-center gap-2"><span className="text-[8.5px] font-semibold uppercase tracking-wide text-[var(--i-text-faint)]">{words(proposal.category)}</span><span className="ml-auto text-[8.5px] text-[var(--i-signal)]">{words(proposal.status)}</span></div>
            <div className="mt-1 text-[10.5px] leading-snug text-[var(--i-text-soft)]">{proposal.title}</div>
          </button>)}
        </div>
        <div className="min-h-0 overflow-y-auto p-4">
          {!selected && <div className="flex h-full items-center justify-center text-center text-[11px] text-[var(--i-text-faint)]">Select a change to compare current and proposed Reality.</div>}
          {selected && <div data-shoot={selected.title.includes("investigation capability") ? "cam-colton-decision" : undefined}>
            <div className="flex items-center gap-2"><span className="rounded bg-white/[0.05] px-2 py-1 text-[9px] uppercase tracking-wide text-[var(--i-text-faint)]">{words(selected.category)}</span><span className="text-[9px] text-[var(--i-text-faint)]">Owner · {words(selected.owner)}</span>{selected.relevanceClass !== "project_local" && <span className="rounded bg-[var(--i-amber)]/10 px-2 py-1 text-[8.5px] text-[var(--i-amber)]">{words(selected.relevanceClass)}</span>}<span className="ml-auto text-[9px] text-[var(--i-signal)]">{words(selected.currentness)}</span></div>
            <h3 className="mt-3 text-[17px] font-medium leading-tight text-[var(--i-text)]">{selected.title}</h3>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-text-soft)]">{selected.summary}</p>
            {selected.status === "accepted" && <div className="mt-3 rounded border border-[var(--i-signal)]/30 bg-[var(--i-signal)]/[0.05] px-3 py-2 text-[10px] text-[var(--i-text-soft)]" data-shoot="accepted-change">Accepted by {words(selected.owner)}{selected.canonicalObjectType ? ` · ${words(selected.canonicalObjectType)}` : ""}{selected.acceptedAt ? ` · ${ago(selected.acceptedAt)}` : ""}</div>}
            <section className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--i-border)] bg-black/10 p-3"><div className="i-label mb-2 text-[8.5px] text-[var(--i-text-faint)]">CURRENT ACCEPTED</div><StateView value={selected.currentState} /></div>
              <div className="rounded-md border border-[var(--i-signal)]/25 bg-[var(--i-signal)]/[0.035] p-3"><div className="i-label mb-2 text-[8.5px] text-[var(--i-signal)]">PROPOSED</div><StateView value={edit ?? selected.proposedState} />{Array.isArray((edit ?? selected.proposedState).options) && <div className="mt-2 space-y-1">{((edit ?? selected.proposedState).options as { label?: string }[]).map((option, index) => <div key={index} className="rounded bg-black/15 px-2 py-1.5 text-[10px] text-[var(--i-text-soft)]">Direction {index === 0 ? "A" : "B"} · {option.label}</div>)}</div>}</div>
            </section>
            <section className="mt-4"><div className="i-label text-[8.5px] text-[var(--i-text-faint)]">WHY PROPOSED</div><p className="mt-1 text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{selected.whyProposed}</p><p className="mt-1.5 text-[9.5px] text-[var(--i-text-faint)]">Retrieval · {selected.retrievalConfidence} · {selected.retrievalBasis}</p></section>
            {selected.relevanceClass !== "project_local" && <section className="mt-3 rounded border border-[var(--i-amber)]/20 bg-[var(--i-amber)]/[0.025] px-3 py-2 text-[9.5px] text-[var(--i-text-soft)]">Project relevance · {words(selected.relevanceClass)} · {selected.relevanceReason}</section>}
            <section className="mt-4"><div className="i-label text-[8.5px] text-[var(--i-text-faint)]">EVIDENCE & PROVENANCE</div>{selected.evidence.length ? <div className="mt-2 space-y-2">{selected.evidence.map((item) => <blockquote key={item.id} className="rounded border-l-2 border-[var(--i-source)] bg-white/[0.025] px-3 py-2 text-[10px] leading-relaxed text-[var(--i-text-soft)]">“{item.excerpt}”<footer className="mt-1 text-[8.5px] text-[var(--i-text-faint)]">{item.sourceRef ?? item.id}{item.observedAt ? ` · ${ago(item.observedAt)}` : ""}</footer></blockquote>)}</div> : <p className="mt-1 text-[10px] text-[var(--i-amber)]">No exact passage is attached; acceptance will require completion.</p>}</section>
            {selected.forecastEffect && <section className="mt-4 rounded border border-[var(--i-amber)]/25 bg-[var(--i-amber)]/[0.035] px-3 py-2 text-[10px] text-[var(--i-text-soft)]">Expected Forecast effect · {String(selected.forecastEffect.effect ?? "Recompute after acceptance")}</section>}
            {edit && <div className="mt-4 rounded-md border border-[var(--i-border)] p-3"><div className="i-label mb-2 text-[8.5px] text-[var(--i-text-faint)]">EDIT PROPOSAL</div>{typeof edit.title === "string" && <input className="signal-meter mb-2 w-full rounded px-2 py-1.5 text-[10.5px]" value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} />}{typeof edit.description === "string" && <textarea className="signal-meter w-full rounded px-2 py-1.5 text-[10.5px]" value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} />}{typeof edit.rationale === "string" && <textarea className="signal-meter w-full rounded px-2 py-1.5 text-[10.5px]" value={edit.rationale} onChange={(event) => setEdit({ ...edit, rationale: event.target.value })} />}{typeof edit.date === "string" && <input aria-label="Milestone date" type="date" className="signal-meter w-full rounded px-2 py-1.5 text-[10.5px]" value={edit.date} onChange={(event) => setEdit({ ...edit, date: event.target.value })} />}<div className="mt-2 flex justify-end gap-2"><SignalControl type="button" onClick={() => setEdit(null)} className="px-2 py-1 text-[10px]">Cancel</SignalControl><SignalControl type="button" onClick={() => void saveEdit()} status="reality" className="px-2 py-1 text-[10px]">Save proposal</SignalControl></div></div>}
            {completionOpen && <div className="mt-4 rounded-md border border-[var(--i-amber)]/35 bg-[var(--i-amber)]/[0.035] p-3" data-shoot="completion-sheet"><div className="i-label text-[8.5px] text-[var(--i-amber)]">COMPLETE BEFORE ACCEPTING</div><ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-[var(--i-text-soft)]">{selected.completionRequirements.map((item) => <li key={item}>{item}</li>)}</ul>{selected.proposedState.action === "create_dependency" && <div className="mt-2 grid grid-cols-2 gap-2"><input placeholder="Upstream project ID" className="signal-meter rounded px-2 py-1.5 text-[10px]" onChange={(event) => setCompletionFields({ ...completionFields, upstreamScopeId: event.target.value })} /><input placeholder="Downstream project ID" className="signal-meter rounded px-2 py-1.5 text-[10px]" onChange={(event) => setCompletionFields({ ...completionFields, downstreamScopeId: event.target.value })} /></div>}<label className="mt-3 flex items-start gap-2 text-[10px] text-[var(--i-text-soft)]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this owner-specific completion.</label><SignalControl disabled={!confirmed || busy === "accept"} type="button" onClick={() => void accept(true)} status="reality" className="mt-3 px-3 py-1.5 text-[10.5px]">Confirm and accept</SignalControl></div>}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--i-border)] pt-3">
              {!['source_health','capacity','information'].includes(selected.category) && selected.status !== "accepted" && <SignalControl type="button" disabled={Boolean(busy)} onClick={() => void accept()} status="reality" className="px-3 py-1.5 text-[10.5px]">Accept</SignalControl>}
              {selected.status !== "accepted" && <SignalControl type="button" disabled={Boolean(busy)} onClick={() => setEdit({ ...selected.proposedState })} className="px-3 py-1.5 text-[10.5px]">Edit</SignalControl>}
              {selected.status === "deferred" ? <SignalControl type="button" onClick={() => void disposition("reopen")} className="px-3 py-1.5 text-[10.5px]">Reopen</SignalControl> : ["pending", "needs_completion"].includes(selected.status) && <SignalControl type="button" onClick={() => void disposition("defer")} className="px-3 py-1.5 text-[10.5px]">Defer</SignalControl>}
              {["pending", "needs_completion", "deferred"].includes(selected.status) && <SignalControl type="button" onClick={() => void disposition("reject")} className="px-3 py-1.5 text-[10.5px]">Reject</SignalControl>}
              {["pending", "needs_completion", "deferred"].includes(selected.status) && <SignalControl type="button" onClick={() => void disposition("information_only")} className="px-3 py-1.5 text-[10.5px]">Information only</SignalControl>}
              {typeof selected.proposedState.findingId === "string" && <SignalControl type="button" onClick={() => onTrace?.(selected.proposedState.findingId as string)} className="px-3 py-1.5 text-[10.5px]">Trace in world</SignalControl>}
              {selected.targetHref && <Link href={selected.targetHref} className="ml-auto text-[10px] text-[var(--i-signal)]">Open in {words(selected.owner)} ↗</Link>}
            </div>
          </div>}
        </div>
      </div>}

      {tab === "sources" && <div className="min-h-0 flex-1 overflow-y-auto p-4" data-shoot="source-health"><div className="grid grid-cols-2 gap-2">{payload?.sourceHealth && Object.entries(payload.sourceHealth).filter(([key]) => !key.endsWith("At") && key !== "linearDetail").map(([key, value]) => <div key={key} className="rounded-md border border-[var(--i-border)] bg-white/[0.02] p-3"><div className="i-label text-[8.5px] text-[var(--i-text-faint)]">{words(key)}</div><div className="mt-1 text-[12px] text-[var(--i-text)]">{words(String(value))}</div>{key === "linear" && <p className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">{payload.sourceHealth.linearDetail}</p>}{["linear", "notion", "figma"].includes(key) && <Link href={`/scope?project=${encodeURIComponent(scopeId)}`} className="mt-2 inline-block text-[9.5px] text-[var(--i-signal)]">Open project setup ↗</Link>}</div>)}</div><div className="mt-3 rounded-md border border-[var(--i-border)] p-3 text-[10px] text-[var(--i-text-soft)]">Last package · {ago(payload?.sourceHealth.lastPackageAt ?? null)}<br />Last Audit · {ago(payload?.sourceHealth.lastAuditAt ?? null)}<br />{payload?.knowledge.detail}</div></div>}

      {tab === "readiness" && <div className="min-h-0 flex-1 overflow-y-auto p-4" data-shoot="report-readiness"><div className="rounded-md border p-4" style={{ borderColor: payload?.readiness.ready ? "var(--i-signal)" : "var(--i-amber)" }}><div className="i-label text-[9px]" style={{ color: payload?.readiness.ready ? "var(--i-signal)" : "var(--i-amber)" }}>{payload?.readiness.label}</div>{payload?.readiness.blockers.length ? <div className="mt-3 space-y-2">{payload.readiness.blockers.map((blocker) => <Link key={blocker.code} href={blocker.targetHref} className="flex items-center justify-between rounded bg-white/[0.025] px-3 py-2 text-[10.5px] text-[var(--i-text-soft)]"><span>{blocker.label}</span><span className="text-[var(--i-signal)]">Open ↗</span></Link>)}</div> : <p className="mt-2 text-[11px] text-[var(--i-text-soft)]">Current execution, Scope, capacity, source health, and Forecast checks are safe for reporting.</p>}{payload?.readiness.ready && <Link href={`/reports?project=${encodeURIComponent(scopeId)}`} className="mt-4 inline-flex rounded border border-[var(--i-signal)]/40 px-3 py-1.5 text-[10.5px] text-[var(--i-signal)]">Open Reports</Link>}</div></div>}
    </aside>}
  </>;
}
