"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import Link from "@/components/instrument/SignalLink";
import type { ActivationManifestV1 } from "@/lib/bootstrap/activation";
import type {
  BootstrapEvidencePassage, BootstrapIntelligenceHead,
  BootstrapProposal, ProjectBootstrapPackageV1, ProviderCoverage,
} from "@/lib/bootstrap/contracts";

interface Candidate {
  id: string;
  candidateKey: string;
  kind: string;
  title: string;
  summary: string;
  whyProposed: string;
  matchBasis: string;
  currentness: string;
  relevance: string;
  sourceFingerprint: string;
  originalProposal: BootstrapProposal | Record<string, unknown>;
  reviewedProposal: Record<string, unknown> | null;
  status: string;
  dispositionReason: string | null;
  changedSincePrior: boolean;
  operatorAssertion: boolean;
  evidenceLinks: { id: string; evidenceId: string; linkState: string; attachedBy: string; reason: string | null }[];
}

interface Scan {
  id: string; sequence: number; status: string; stage: string; providerCoverage: ProviderCoverage[];
  metrics: Record<string, number>; warnings: string[]; error: string | null; startedAt: string | null; completedAt: string | null;
}

interface BootstrapRead {
  bootstrap: {
    id: string; canonicalName: string; aliases: string[]; ownerHint: string | null; sourceHints: unknown;
    searchExistingKnowledge: boolean; status: string; reviewRevision: number; createdAt: string; updatedAt: string;
    activation: { id: string; scopeId: string; contextSnapshotId: string; firstAuditRunId: string; firstAudit: { id: string; findingCount: number; findings: { id: string; title: string; severity: string; type: string }[] } | null } | null;
  };
  scans: Scan[];
  activePackage: { id: string; packageId: string; packageVersion: string; producer: string; compilerVersion: string; packageHash: string; generatedAt: string; package: ProjectBootstrapPackageV1 } | null;
  candidates: Candidate[];
  counts: Record<string, number>;
  boundary: { label: string; canonicalWrites: number; forecastEffect: number; detail: string };
}

const SECTIONS = [
  { id: "sources", label: "Sources", kinds: ["source"] },
  { id: "people", label: "People / owners", kinds: ["person"] },
  { id: "scope", label: "Proposed Scope", kinds: ["capability"] },
  { id: "decisions", label: "Decisions", kinds: ["decision"] },
  { id: "dependencies", label: "Dependencies", kinds: ["dependency"] },
  { id: "milestones", label: "Milestones", kinds: ["milestone"] },
  { id: "risks", label: "Risks / unknowns", kinds: ["risk", "unknown"] },
  { id: "gaps", label: "Missing information", kinds: ["missing_information"] },
] as const;

type Surface = "identity" | "scan" | "review" | "activate" | "audit";

interface ActivationResult {
  reused: boolean;
  scope: { id: string; name: string; executionState: string };
  snapshot: { id: string; packageId: string };
  audit: { id: string; findingCount: number; findings: { id: string; title: string; severity: string; type: string }[] };
  links: { auditWorld: string; scope: string; reports: string };
}

export default function BootstrapWorkspace({ bootstrapId }: { bootstrapId: string }) {
  const params = useSearchParams();
  const [data, setData] = useState<BootstrapRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [surface, setSurface] = useState<Surface>(() => {
    const requested = params.get("view");
    return requested === "identity" || requested === "scan" || requested === "review" || requested === "activate" || requested === "audit" ? requested : "scan";
  });
  const [sectionId, setSectionId] = useState(() => params.get("section") ?? "sources");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("candidate"));
  const [manifest, setManifest] = useState<ActivationManifestV1 | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/project-bootstraps/${bootstrapId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read bootstrap");
    setData(body);
  }, [bootstrapId]);

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not read bootstrap")); }, [load]);
  useEffect(() => {
    if (!data || !["scanning", "draft"].includes(data.bootstrap.status)) return;
    const timer = window.setInterval(() => load().catch(() => {}), 900);
    return () => window.clearInterval(timer);
  }, [data, load]);

  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  const visible = useMemo(() => data?.candidates.filter((c) => (section.kinds as readonly string[]).includes(c.kind)) ?? [], [data, section]);
  const selected = visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => {
    if (selected?.id && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("view", surface);
    next.set("section", section.id);
    if (selected?.id) next.set("candidate", selected.id); else next.delete("candidate");
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [section.id, selected?.id, surface]);

  async function rescan() {
    setBusy("scan"); setError(null); setSurface("scan");
    try {
      const response = await fetch(`/api/project-bootstraps/${bootstrapId}/scans`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not start scan");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start scan"); }
    finally { setBusy(null); }
  }

  async function updateCandidate(candidate: Candidate, payload: Record<string, unknown>) {
    setBusy(candidate.id); setError(null);
    try {
      const response = await fetch(`/api/project-bootstraps/${bootstrapId}/candidates/${candidate.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save review action");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save review action"); }
    finally { setBusy(null); }
  }

  async function edit(candidate: Candidate) {
    const current = candidate.reviewedProposal ?? ((candidate.originalProposal as BootstrapProposal).payload ?? {});
    const title = window.prompt("Reviewed title", String(current.title ?? current.name ?? current.question ?? candidate.title));
    if (title === null || !title.trim()) return;
    await updateCandidate(candidate, { reviewedProposal: { ...current, title: title.trim(), operatorEdited: true } });
  }

  async function reject(candidate: Candidate) {
    const reason = window.prompt("Reason for rejection", candidate.dispositionReason ?? "Wrong project");
    if (reason === null || !reason.trim()) return;
    await updateCandidate(candidate, { status: "rejected", reason });
  }

  async function addManual() {
    const defaultKind = section.kinds[0] === "missing_information" ? "unknown" : section.kinds[0];
    const title = window.prompt(`Add ${section.label.toLowerCase()} candidate`);
    if (!title?.trim()) return;
    setBusy("manual");
    try {
      const response = await fetch(`/api/project-bootstraps/${bootstrapId}/candidates`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: defaultKind, title, payload: { title, operatorAssertion: true } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add candidate");
      setSelectedId(body.candidate.id);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add candidate"); }
    finally { setBusy(null); }
  }

  const loadManifest = useCallback(async () => {
    if (!data) return;
    const response = await fetch(`/api/project-bootstraps/${bootstrapId}/activation-manifest?revision=${data.bootstrap.reviewRevision}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not prepare activation manifest");
    setManifest(body.manifest);
  }, [bootstrapId, data]);

  useEffect(() => {
    if (surface === "activate") loadManifest().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not prepare activation manifest"));
  }, [surface, loadManifest]);

  async function activate() {
    if (!data || !manifest) return;
    setBusy("activate"); setError(null);
    try {
      const response = await fetch(`/api/project-bootstraps/${bootstrapId}/activate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: data.bootstrap.reviewRevision,
          acknowledgeProviderGaps: acknowledged,
          acknowledgedBlockerIds: acknowledged ? manifest.blockers.map((blocker) => blocker.id).filter((id) => id !== "provider-gaps") : [],
          execution: { state: "not_configured" },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not activate project");
      setActivationResult(body);
      await load();
      setSurface("audit");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not activate project"); }
    finally { setBusy(null); }
  }

  const stateBar = data ? (
    <div className="flex h-[42px] shrink-0 items-center gap-3 border-b px-4" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}>
      <span className="text-[12px] font-semibold text-[var(--i-text)]">{data.bootstrap.canonicalName}</span>
      <span className="rounded px-2 py-1 text-[9px] font-semibold tracking-[0.12em]" style={{ color: data.bootstrap.activation ? "var(--i-mint)" : "var(--i-amber)", background: data.bootstrap.activation ? "var(--i-mint-soft)" : "var(--i-amber-soft)", border: "1px solid color-mix(in srgb, currentColor 45%, transparent)" }}>{data.bootstrap.activation ? "ACTIVATED" : "NOT REALITY"}</span>
      <span className="text-[10px] text-[var(--i-text-faint)]">Bootstrap {data.bootstrap.id.slice(-7)} · rev {data.bootstrap.reviewRevision}</span>
      <span className="flex-1" />
      <span className="text-[10px] text-[var(--i-text-faint)]">{data.bootstrap.activation ? "accepted manifest canonicalized · Forecast honest" : "0 canonical writes · 0 Forecast effect"}</span>
    </div>
  ) : undefined;

  if (!data) return <InstrumentShell stateBar={stateBar}><div className="flex flex-1 items-center justify-center text-[12px] text-[var(--i-text-faint)]">{error ?? "Loading bootstrap…"}</div></InstrumentShell>;
  const pkg = data.activePackage?.package ?? null;
  const latest = data.scans[0] ?? null;

  return (
    <InstrumentShell stateBar={stateBar} minViewportWidth={1060}>
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: "var(--i-bg)" }}>
        <Lifecycle surface={surface} setSurface={setSurface} reviewReady={Boolean(pkg)} activated={Boolean(data.bootstrap.activation)} />
        {error && <div className="shrink-0 border-b px-4 py-2 text-[11px] text-[var(--i-red)]" style={{ borderColor: "var(--i-border)", background: "var(--i-red-soft)" }}>{error}</div>}
        {surface === "identity" ? <IdentityPanel data={data} onScan={rescan} busy={busy === "scan"} />
          : surface === "scan" ? <ScanPanel data={data} scan={latest} pkg={pkg} onReview={() => setSurface("review")} onScan={rescan} busy={busy === "scan"} />
          : surface === "review" ? <ReviewPanel data={data} pkg={pkg} section={section} visible={visible} selected={selected} setSection={setSectionId} setSelected={setSelectedId} busy={busy} update={updateCandidate} edit={edit} reject={reject} addManual={addManual} onRescan={rescan} />
          : surface === "activate" ? <ManifestPanel manifest={manifest} acknowledged={acknowledged} setAcknowledged={setAcknowledged} activate={activate} busy={busy === "activate"} alreadyActivated={Boolean(data.bootstrap.activation)} />
          : <FirstAuditPanel result={activationResult} activation={data.bootstrap.activation} />}
      </div>
    </InstrumentShell>
  );
}

function Lifecycle({ surface, setSurface, reviewReady, activated }: { surface: Surface; setSurface: (s: Surface) => void; reviewReady: boolean; activated: boolean }) {
  const items = [
    { id: "identity", label: "Identity", enabled: true }, { id: "scan", label: "Scan", enabled: true },
    { id: "review", label: "Review", enabled: reviewReady }, { id: "activate", label: "Activate", enabled: reviewReady },
    { id: "audit", label: "Audit", enabled: activated },
  ] as const;
  return <div className="flex h-[48px] shrink-0 items-center border-b px-4" style={{ borderColor: "var(--i-border)", background: "var(--i-void)" }}>
    {items.map((item, index) => <div key={item.id} className="flex items-center">
      {index > 0 && <span className="mx-3 h-px w-8" style={{ background: "var(--i-border-strong)" }} />}
      <button disabled={!item.enabled} onClick={() => item.enabled && setSurface(item.id as Surface)} className="flex items-center gap-2 disabled:cursor-not-allowed">
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px]" style={{
          background: surface === item.id ? "var(--i-signal)" : item.enabled ? "var(--i-panel-raised)" : "var(--i-recess)",
          color: surface === item.id ? "var(--signal-reality-contrast)" : "var(--i-text-faint)", border: "1px solid var(--i-border-strong)",
        }}>{index + 1}</span>
        <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: surface === item.id ? "var(--i-text)" : "var(--i-text-faint)" }}>{item.label}</span>
      </button>
    </div>)}
    <span className="flex-1" />
    <span className="text-[9px] text-[var(--i-text-faint)]">Knowledge proposes · a human activates</span>
  </div>;
}

function ManifestPanel({ manifest, acknowledged, setAcknowledged, activate, busy, alreadyActivated }: {
  manifest: ActivationManifestV1 | null; acknowledged: boolean; setAcknowledged: (value: boolean) => void;
  activate: () => void; busy: boolean; alreadyActivated: boolean;
}) {
  if (!manifest) return <main className="flex flex-1 items-center justify-center text-[12px] text-[var(--i-text-faint)]">Preparing activation manifest…</main>;
  const canonical = [
    ...manifest.willBecomeCanonical.capabilities, ...manifest.willBecomeCanonical.decisions,
    ...manifest.willBecomeCanonical.dependencies, ...manifest.willBecomeCanonical.milestones,
    ...manifest.willBecomeCanonical.sourceRegistrations,
  ];
  const external = manifest.willRemainExternal.candidates;
  return <main className="min-h-0 flex-1 overflow-y-auto p-5" data-shoot="activation-manifest">
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div><div className="i-label" style={{ color: "var(--i-signal)" }}>Activation Manifest · revision {manifest.reviewRevision}</div><h1 className="mt-1 text-[20px] font-semibold text-[var(--i-text)]">{manifest.projectIdentity.canonicalName}</h1><p className="mt-2 text-[11px] text-[var(--i-amber)]">{manifest.warning}</p></div>
      <div className="grid grid-cols-2 gap-4">
        <ManifestColumn title="WILL BECOME CANONICAL" tone="var(--i-mint)" rows={canonical.map((item) => `${item.kind} · ${item.title}`)} empty="Only the active project identity will be created." />
        <ManifestColumn title="WILL REMAIN EXTERNAL / CANDIDATE" tone="var(--i-amber)" rows={[
          ...external.map((item) => `${item.status} · ${item.kind} · ${item.title}`),
          ...manifest.willRemainExternal.peopleNotStaffing.map((item) => `person mention, not staffing · ${item.title}`),
          ...manifest.willRemainExternal.semanticRelationsNotDependencies.map((item) => `${item.relation} relation, not dependency · ${item.sourceId} → ${item.targetId}`),
          ...manifest.willRemainExternal.providerGaps.map((item) => `${item.provider} · ${item.state}`),
        ]} empty="No external review items." />
      </div>
      <section className="rounded-lg border p-4" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}>
        <div className="grid grid-cols-3 gap-4 text-[10px]"><div><span className="i-label">Execution</span><p className="mt-1 text-[var(--i-text)]">{manifest.execution.state.replaceAll("_", " ")}</p></div><div><span className="i-label">Forecast</span><p className="mt-1 text-[var(--i-amber)]">{manifest.forecast.state} · {manifest.forecast.reason}</p></div><div><span className="i-label">First Audit</span><p className="mt-1 text-[var(--i-text)]">Runs atomically after the frozen snapshot is created.</p></div></div>
        {(manifest.blockers.length > 0 || manifest.willRemainExternal.providerGaps.length > 0) && <label className="mt-4 flex items-start gap-2 text-[10px] text-[var(--i-text-soft)]"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I acknowledge the provider gaps and unresolved ambiguities shown above. Activation does not resolve or certify them.</span></label>}
        <div className="mt-4 flex justify-end"><button data-shoot="activate-project" onClick={activate} disabled={busy || alreadyActivated || ((manifest.blockers.length > 0 || manifest.willRemainExternal.providerGaps.length > 0) && !acknowledged)} className="signal-control rounded px-5 py-2 text-[10px] font-semibold disabled:opacity-35">{alreadyActivated ? "PROJECT ACTIVATED" : busy ? "ACTIVATING…" : "ACTIVATE PROJECT"}</button></div>
      </section>
    </div>
  </main>;
}

function ManifestColumn({ title, tone, rows, empty }: { title: string; tone: string; rows: string[]; empty: string }) {
  return <section className="rounded-lg border p-4" style={{ background: "var(--i-panel)", borderColor: tone }}><h2 className="text-[10px] font-semibold tracking-[0.12em]" style={{ color: tone }}>{title}</h2><ul className="mt-3 space-y-1.5">{rows.length ? rows.map((row, index) => <li key={`${row}-${index}`} className="rounded px-2 py-1.5 text-[10px] text-[var(--i-text-soft)]" style={{ background: "var(--i-recess)" }}>{row}</li>) : <li className="text-[10px] text-[var(--i-text-faint)]">{empty}</li>}</ul></section>;
}

function FirstAuditPanel({ result, activation }: { result: ActivationResult | null; activation: BootstrapRead["bootstrap"]["activation"] }) {
  const scopeId = result?.scope.id ?? activation?.scopeId;
  const audit = result?.audit ?? activation?.firstAudit;
  return <main className="min-h-0 flex-1 overflow-y-auto p-6" data-shoot="first-audit-results"><div className="mx-auto max-w-[900px]">
    <div className="i-label" style={{ color: "var(--i-mint)" }}>Activation complete · ContextSnapshot 01 frozen</div>
    <h1 className="mt-2 text-[22px] font-semibold text-[var(--i-text)]">First Audit</h1>
    {audit ? <><p className="mt-2 text-[11px] text-[var(--i-text-soft)]">Snapshot {result?.snapshot.id ?? activation?.contextSnapshotId} · Audit {audit.id} · {audit.findingCount} finding{audit.findingCount === 1 ? "" : "s"}</p><ul className="mt-5 space-y-2">{audit.findings.map((finding) => <li key={finding.id} className="rounded-lg border p-3" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}><span className="text-[9px] uppercase tracking-[0.1em] text-[var(--i-amber)]">{finding.type} · {finding.severity}</span><p className="mt-1 text-[12px] text-[var(--i-text)]">{finding.title}</p></li>)}</ul></> : <p className="mt-3 text-[11px] text-[var(--i-text-soft)]">This project is activated. Open Audit World to inspect its current findings.</p>}
    {scopeId && <div className="mt-6 flex flex-wrap gap-2"><Link className="signal-control rounded px-4 py-2 text-[10px]" href={`/audit?project=${encodeURIComponent(scopeId)}`}>OPEN AUDIT WORLD</Link><Link className="signal-control rounded px-4 py-2 text-[10px]" href={`/scope?project=${encodeURIComponent(scopeId)}`}>SCOPE</Link><Link className="signal-control rounded px-4 py-2 text-[10px]" href={`/decisions?project=${encodeURIComponent(scopeId)}`}>DECISIONS</Link><Link className="signal-control rounded px-4 py-2 text-[10px]" href={`/reports?project=${encodeURIComponent(scopeId)}`}>REPORTS</Link></div>}
  </div></main>;
}

function IdentityPanel({ data, onScan, busy }: { data: BootstrapRead; onScan: () => void; busy: boolean }) {
  return <main className="flex flex-1 items-start justify-center overflow-y-auto p-8">
    <section className="signal-widget w-full max-w-[760px] rounded-xl border p-5" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}>
      <div className="i-label mb-4" style={{ color: "var(--i-signal)" }}>Bootstrap identity</div>
      <dl className="grid grid-cols-[150px_1fr] gap-x-5 gap-y-4 text-[12px]">
        <dt className="text-[var(--i-text-faint)]">Canonical name</dt><dd className="text-[var(--i-text)]">{data.bootstrap.canonicalName}</dd>
        <dt className="text-[var(--i-text-faint)]">Aliases</dt><dd className="text-[var(--i-text)]">{data.bootstrap.aliases.join(" · ") || "—"}</dd>
        <dt className="text-[var(--i-text-faint)]">Owner hint</dt><dd className="text-[var(--i-text)]">{data.bootstrap.ownerHint || "—"}</dd>
        <dt className="text-[var(--i-text-faint)]">Knowledge mode</dt><dd className="text-[var(--i-text)]">{data.bootstrap.searchExistingKnowledge ? "Search Signal-held knowledge" : "Start blank"}</dd>
        <dt className="text-[var(--i-text-faint)]">Reality state</dt><dd style={{ color: "var(--i-amber)" }}>Not created</dd>
      </dl>
      <div className="mt-6 flex justify-end"><button onClick={onScan} disabled={busy} className="signal-control rounded px-4 py-2 text-[11px]">{busy ? "STARTING…" : "RESCAN"}</button></div>
    </section>
  </main>;
}

function ScanPanel({ data, scan, pkg, onReview, onScan, busy }: { data: BootstrapRead; scan: Scan | null; pkg: ProjectBootstrapPackageV1 | null; onReview: () => void; onScan: () => void; busy: boolean }) {
  const metrics = scan?.metrics ?? {};
  const coverage = (scan?.providerCoverage?.length ? scan.providerCoverage : pkg?.coverage) ?? [];
  const pipeline = pkg?.discovery.strategies ?? [
    { id: "identity", state: scan?.stage === "queued" ? "partial" : "complete", detail: "Canonical identity and aliases" },
    { id: "lexical", state: ["queued", "identity"].includes(scan?.stage ?? "") ? "partial" : "complete", detail: "Exact + lexical retrieval" },
    { id: "lineage", state: "partial", detail: "Evidence lineage" }, { id: "semantic", state: "unavailable", detail: "Semantic Search V2 not enabled" },
    { id: "graph", state: "partial", detail: "Bounded graph expansion" }, { id: "compile", state: "partial", detail: "Typed proposal compilation" },
  ];
  return <main className="min-h-0 flex-1 overflow-y-auto p-4" data-shoot="bootstrap-scan">
    <div className="mx-auto max-w-[1220px] space-y-3">
      <div className="flex items-end justify-between">
        <div><div className="i-label" style={{ color: "var(--i-signal)" }}>Knowledge scan · run {scan?.sequence ?? 0}</div><h1 className="mt-1 text-[19px] font-semibold text-[var(--i-text)]">{data.bootstrap.canonicalName}</h1></div>
        <div className="flex gap-2"><button onClick={onScan} disabled={busy || scan?.status === "running" || scan?.status === "queued"} className="signal-control rounded px-3 py-2 text-[10px]">Rescan</button><button onClick={onReview} disabled={!pkg} data-shoot="enter-review" className="signal-control rounded px-4 py-2 text-[10px] font-semibold disabled:opacity-35">ENTER REVIEW</button></div>
      </div>
      <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg border" style={{ background: "var(--i-border)", borderColor: "var(--i-border)" }}>
        {[ ["Providers checked", metrics.providersChecked ?? coverage.length], ["Artifacts found", metrics.artifactsFound ?? pkg?.artifacts.length ?? 0], ["Intelligence heads", metrics.intelligenceHeads ?? pkg?.intelligenceHeads.length ?? 0], ["Evidence passages", metrics.evidencePassages ?? pkg?.evidence.length ?? 0], ["Proposals", metrics.proposals ?? pkg?.proposals.length ?? 0] ].map(([label, value]) => <div key={String(label)} className="bg-[var(--i-panel)] px-4 py-3"><div className="i-readout text-[22px] text-[var(--i-text)]">{value}</div><div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[var(--i-text-faint)]">{label}</div></div>)}
      </div>
      <div className="grid grid-cols-[1.15fr_.85fr] gap-3">
        <section className="rounded-lg border p-4" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--i-text)]">Pipeline</h2><span className="text-[10px] text-[var(--i-text-faint)]">{scan?.status ?? "queued"} · {scan?.stage ?? "queued"}</span></div>
          <div className="space-y-1">{pipeline.map((row, i) => <div key={row.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 rounded px-2 py-2" style={{ background: "var(--i-recess)" }}><span className="i-readout text-[10px] text-[var(--i-text-faint)]">{String(i + 1).padStart(2, "0")}</span><span><span className="block text-[11px] capitalize text-[var(--i-text)]">{row.id.replaceAll("_", " ")}</span><span className="block text-[9.5px] text-[var(--i-text-faint)]">{row.detail}</span></span><State state={row.state} /></div>)}</div>
        </section>
        <section className="rounded-lg border p-4" style={{ background: "var(--i-panel)", borderColor: "var(--i-border)" }}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--i-text)]">Coverage / gaps</h2>{pkg?.discovery.partial && <span className="text-[9px] font-semibold text-[var(--i-amber)]">PARTIAL PACKAGE</span>}</div>
          <div className="space-y-1">{coverage.map((row) => <div key={row.provider} className="rounded px-2 py-2" style={{ background: "var(--i-recess)" }}><div className="flex items-center justify-between"><span className="text-[10.5px] text-[var(--i-text)]">{row.label}</span><span className="flex items-center gap-2"><span className="i-readout text-[10px] text-[var(--i-text-soft)]">{row.artifacts}</span><State state={row.state} /></span></div><p className="mt-1 text-[9px] leading-[1.4] text-[var(--i-text-faint)]">{row.detail}</p></div>)}</div>
          {pkg?.ambiguities.map((a) => <div key={a.id} className="mt-2 rounded border px-2 py-2 text-[9.5px]" style={{ borderColor: a.severity === "blocking" ? "var(--i-red)" : "var(--i-amber)", color: "var(--i-text-soft)" }}>{a.severity.toUpperCase()} · {a.summary}</div>)}
          {scan?.error && <p className="mt-3 text-[10px] text-[var(--i-red)]">{scan.error}</p>}
        </section>
      </div>
    </div>
  </main>;
}

function State({ state }: { state: string }) {
  const color = state === "available" || state === "complete" ? "var(--i-mint)" : state === "unavailable" || state === "failed" ? "var(--i-red)" : "var(--i-amber)";
  return <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.09em]" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{state.replaceAll("_", " ")}</span>;
}

function ReviewPanel({ data, pkg, section, visible, selected, setSection, setSelected, busy, update, edit, reject, addManual, onRescan }: {
  data: BootstrapRead; pkg: ProjectBootstrapPackageV1 | null; section: typeof SECTIONS[number]; visible: Candidate[]; selected: Candidate | null;
  setSection: (id: string) => void; setSelected: (id: string) => void; busy: string | null;
  update: (candidate: Candidate, payload: Record<string, unknown>) => Promise<void>; edit: (candidate: Candidate) => Promise<void>; reject: (candidate: Candidate) => Promise<void>; addManual: () => Promise<void>; onRescan: () => void;
}) {
  return <main className="grid min-h-0 flex-1 grid-cols-[218px_minmax(430px,1fr)_340px] overflow-hidden" data-shoot="bootstrap-review">
    <aside className="overflow-y-auto border-r p-3" style={{ background: "var(--i-void)", borderColor: "var(--i-border)" }}>
      <div className="mb-3 flex items-center justify-between px-2"><span className="i-label" style={{ color: "var(--i-signal)" }}>Review sections</span><span className="i-readout text-[10px] text-[var(--i-text-faint)]">{data.candidates.length}</span></div>
      <div className="space-y-1">{SECTIONS.map((item) => {
        const rows = data.candidates.filter((c) => (item.kinds as readonly string[]).includes(c.kind));
        const pending = rows.filter((c) => c.status === "pending").length;
        return <button key={item.id} onClick={() => setSection(item.id)} className="w-full rounded-md px-3 py-2.5 text-left" style={{ background: section.id === item.id ? "var(--i-panel-raised)" : "transparent", border: section.id === item.id ? "1px solid var(--i-border-strong)" : "1px solid transparent" }}><span className="flex items-center justify-between text-[10.5px]"><span style={{ color: section.id === item.id ? "var(--i-text)" : "var(--i-text-soft)" }}>{item.label}</span><span className="i-readout text-[var(--i-text-faint)]">{rows.length}</span></span>{pending > 0 && <span className="mt-1 block text-[8.5px] uppercase tracking-[0.1em] text-[var(--i-amber)]">{pending} pending</span>}</button>;
      })}</div>
      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--i-border)" }}><button onClick={onRescan} className="signal-control w-full rounded px-3 py-2 text-[10px]">RESCAN KNOWLEDGE</button></div>
      <div className="mt-2 rounded border px-2 py-2 text-[9px] leading-[1.45]" style={{ borderColor: "var(--i-amber)", color: "var(--i-text-faint)" }}><strong style={{ color: "var(--i-amber)" }}>NOT REALITY</strong><br />Accept means include in a future activation manifest. It writes nothing canonical now.</div>
    </aside>

    <section className="min-h-0 overflow-y-auto p-4" style={{ background: "var(--i-bg)" }}>
      <header className="mb-3 flex items-end justify-between"><div><div className="i-label" style={{ color: "var(--i-text-faint)" }}>Bootstrap Review</div><h1 className="mt-1 text-[17px] font-semibold text-[var(--i-text)]">{section.label}</h1></div><button onClick={addManual} disabled={busy === "manual"} className="signal-control rounded px-3 py-2 text-[10px]">＋ ADD MANUALLY</button></header>
      {visible.length === 0 ? <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed text-[11px] text-[var(--i-text-faint)]" style={{ borderColor: "var(--i-border-strong)" }}>No supported candidates in the current partial package.</div>
        : <div className="space-y-2">{visible.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} selected={selected?.id === candidate.id} busy={busy === candidate.id} onSelect={() => setSelected(candidate.id)} update={update} edit={edit} reject={reject} />)}</div>}
    </section>

    <Inspector candidate={selected} pkg={pkg} update={update} busy={busy === selected?.id} />
  </main>;
}

function CandidateCard({ candidate, selected, busy, onSelect, update, edit, reject }: { candidate: Candidate; selected: boolean; busy: boolean; onSelect: () => void; update: (candidate: Candidate, payload: Record<string, unknown>) => Promise<void>; edit: (candidate: Candidate) => Promise<void>; reject: (candidate: Candidate) => Promise<void> }) {
  const proposal = candidate.originalProposal as BootstrapProposal;
  const grounding = proposal.grounding;
  return <article onClick={onSelect} className="cursor-pointer rounded-lg border p-3" style={{ background: selected ? "var(--i-panel-raised)" : "var(--i-panel)", borderColor: selected ? "var(--signal-border-selected)" : "var(--i-border)" }} data-candidate={candidate.kind}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-1.5 flex flex-wrap items-center gap-1.5"><Badge>{candidate.kind.replaceAll("_", " ")}</Badge><State state={candidate.status} />{candidate.changedSincePrior && <Badge tone="amber">CHANGED</Badge>}{candidate.operatorAssertion && <Badge tone="violet">OPERATOR ASSERTION</Badge>}</div><h2 className="text-[12.5px] font-medium leading-[1.35] text-[var(--i-text)]">{candidate.title}</h2><p className="mt-1 text-[10px] leading-[1.45] text-[var(--i-text-soft)]">{candidate.whyProposed}</p></div><span className="i-readout shrink-0 text-[9px] text-[var(--i-text-faint)]">{candidate.sourceFingerprint.slice(0, 8)}</span></div>
    <div className="mt-3 flex flex-wrap gap-1.5 text-[8.5px]"><Badge tone={grounding?.directEvidenceCount ? "mint" : "amber"}>{grounding?.directEvidenceCount ?? 0} direct evidence</Badge>{grounding?.derivativeOnly && <Badge tone="amber">DERIVATIVE ONLY</Badge>}<Badge tone={candidate.currentness === "stale" ? "amber" : undefined}>{candidate.currentness}</Badge>{candidate.kind === "capability" && <Badge tone="amber">execution link missing</Badge>}</div>
    <div className="mt-3 flex flex-wrap gap-1 border-t pt-2" style={{ borderColor: "var(--i-border)" }} onClick={(e) => e.stopPropagation()}>
      <Action label="ACCEPT" active={candidate.status === "accepted"} disabled={busy} onClick={() => update(candidate, { status: "accepted" })} />
      <Action label="EDIT" disabled={busy} onClick={() => edit(candidate)} />
      <button disabled title="Merge is deferred to Phase 2 activation reconciliation" className="rounded px-2 py-1 text-[8.5px] text-[var(--i-text-faint)] opacity-45">MERGE</button>
      <Action label="DEFER" active={candidate.status === "deferred"} disabled={busy} onClick={() => update(candidate, { status: "deferred" })} />
      <Action label="REJECT" active={candidate.status === "rejected"} disabled={busy} onClick={() => reject(candidate)} />
      <Action label="INFO ONLY" active={candidate.status === "information-only"} disabled={busy} onClick={() => update(candidate, { status: "information-only" })} />
    </div>
  </article>;
}

function Inspector({ candidate, pkg, update, busy }: { candidate: Candidate | null; pkg: ProjectBootstrapPackageV1 | null; update: (candidate: Candidate, payload: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  if (!candidate || !pkg) return <aside className="border-l p-4 text-[11px] text-[var(--i-text-faint)]" style={{ background: "var(--i-void)", borderColor: "var(--i-border)" }}>Select a candidate to inspect provenance.</aside>;
  const proposal = candidate.originalProposal as BootstrapProposal;
  const heads = proposal.intelligenceRefs.map((id) => pkg.intelligenceHeads.find((h) => h.intelligenceId === id)).filter((v): v is BootstrapIntelligenceHead => Boolean(v));
  const refs = [...new Set([...proposal.evidenceRefs, ...candidate.evidenceLinks.map((l) => l.evidenceId)])];
  const evidence = refs.map((id) => pkg.evidence.find((e) => e.evidenceId === id)).filter((v): v is BootstrapEvidencePassage => Boolean(v));
  const artifactFor = (item: BootstrapEvidencePassage) => pkg.artifacts.find((a) => a.artifactId === item.artifactId);
  return <aside className="min-h-0 overflow-y-auto border-l p-4" style={{ background: "var(--i-void)", borderColor: "var(--i-border)" }} data-shoot="provenance-inspector">
    <div className="i-label" style={{ color: "var(--i-signal)" }}>Provenance Inspector</div><h2 className="mt-2 text-[13px] font-medium leading-[1.35] text-[var(--i-text)]">{candidate.title}</h2><p className="mt-2 text-[10px] leading-[1.5] text-[var(--i-text-soft)]">{candidate.whyProposed}</p>
    <TraceStep index="1" label="Proposal" detail={`${candidate.matchBasis} · ${candidate.relevance} retrieval relevance`} />
    {heads.map((head) => <TraceStep key={head.intelligenceId} index="2" label={`External ${head.type}`} detail={`${head.statement}${head.isCurrent ? " · CURRENT HEAD" : " · HISTORICAL"}`} />)}
    {evidence.length === 0 && <div className="mt-3 rounded border px-3 py-2 text-[9.5px] text-[var(--i-amber)]" style={{ borderColor: "var(--i-amber)" }}>No exact evidence passage attached. This cannot be mistaken for grounded truth.</div>}
    {evidence.map((item) => {
      const artifact = artifactFor(item); const link = candidate.evidenceLinks.find((l) => l.evidenceId === item.evidenceId); const detached = link?.linkState === "detached";
      return <div key={item.evidenceId} className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--i-border)", background: "var(--i-panel)" }}>
        <div className="flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: item.independence === "derivative" ? "var(--i-amber)" : "var(--i-silver)" }}>{item.independence === "derivative" ? "DERIVED PASSAGE" : "EVIDENCE PASSAGE"}</span><button disabled={busy} onClick={() => update(candidate, { evidenceId: item.evidenceId, linkState: detached ? "attached" : "detached" })} className="text-[8.5px] text-[var(--i-text-soft)]">{detached ? "ATTACH" : "DETACH"}</button></div>
        <blockquote className={`mt-2 text-[10px] leading-[1.5] text-[var(--i-text)] ${detached ? "opacity-40 line-through" : ""}`}>“{item.exactQuote}”</blockquote>
        <pre className="mt-2 whitespace-pre-wrap break-words text-[8px] leading-[1.4] text-[var(--i-text-faint)]">{JSON.stringify(item.locator, null, 2)}</pre>
        {artifact && <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--i-border)" }}><div className="flex items-center justify-between gap-2"><span className="text-[9.5px] text-[var(--i-text-soft)]">{artifact.title}</span>{artifact.derivativeOfArtifactIds.length > 0 && <Badge tone="amber">SYNTHESIS · DERIVED</Badge>}</div><div className="mt-1 break-all text-[8.5px] text-[var(--i-text-faint)]">{artifact.canonicalRef}</div>{artifact.deepLink ? <a href={artifact.deepLink} className="mt-2 inline-block text-[9px] text-[var(--i-signal)]">OPEN SOURCE ↗</a> : <p className="mt-2 text-[8.5px] text-[var(--i-amber)]">Exact deep link unavailable · strongest stable locator shown above</p>}</div>}
      </div>;
    })}
    <div className="mt-4 border-t pt-3 text-[8.5px] leading-[1.45] text-[var(--i-text-faint)]" style={{ borderColor: "var(--i-border)" }}>Wiki synthesis never counts as independent corroboration. Unknown lineage never defaults to independent.</div>
  </aside>;
}

function TraceStep({ index, label, detail }: { index: string; label: string; detail: string }) { return <div className="mt-3 flex gap-3"><span className="i-readout flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] text-[var(--i-text-faint)]" style={{ border: "1px solid var(--i-border-strong)" }}>{index}</span><span><span className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--i-text-soft)]">{label}</span><span className="mt-0.5 block text-[9px] leading-[1.4] text-[var(--i-text-faint)]">{detail}</span></span></div>; }
function Badge({ children, tone }: { children: React.ReactNode; tone?: "amber" | "mint" | "violet" }) { const color = tone === "amber" ? "var(--i-amber)" : tone === "mint" ? "var(--i-mint)" : tone === "violet" ? "var(--i-violet)" : "var(--i-text-soft)"; return <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{children}</span>; }
function Action({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) { return <button disabled={disabled} onClick={onClick} className="rounded px-2 py-1 text-[8.5px] font-medium disabled:opacity-40" style={{ color: active ? "var(--signal-reality-contrast)" : "var(--i-text-soft)", background: active ? "var(--i-signal)" : "var(--i-panel-raised)", border: "1px solid var(--i-border)" }}>{label}</button>; }
