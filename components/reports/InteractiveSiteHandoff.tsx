"use client";

import { useEffect, useState } from "react";
import { CHATGPT_SITES_URL, type InteractiveBriefBundleV1, type PublicationStatus } from "@/lib/reports/publicationContract";

interface Readiness {
  ready: boolean;
  errors: string[];
  warnings: string[];
  exclusions: { category: string; label: string; reason: string }[];
  checkedClaims: number;
}

interface Publication {
  id: string;
  status: PublicationStatus;
  bundleHash: string;
  externalUrl: string | null;
  lastVerifiedState: string;
}

interface Prepared {
  publication: Publication;
  bundle: InteractiveBriefBundleV1;
  readiness: Readiness;
  handoffPrompt: string;
  revisionContext: {
    newerProjectTruthAvailable: boolean;
    latestReportId: string;
    latestReportGeneratedAt: string;
  };
}

const STATUS_LABELS: Record<PublicationStatus, string> = {
  bundle_ready: "Bundle ready",
  handoff_opened: "Opened in ChatGPT Work",
  draft_generated: "Draft generated",
  previewed: "Previewed",
  published_shared: "Published / shared",
  failed: "Failed",
};

function downloadHandoff(prepared: Prepared) {
  const payload = JSON.stringify({
    contract: prepared.bundle.handoffVersion,
    bundle: prepared.bundle,
    siteGenerationInstructions: prepared.handoffPrompt,
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `signal-site-handoff-${prepared.publication.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function InteractiveSiteHandoff({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");

  useEffect(() => {
    setOpen(false);
    setPrepared(null);
    setConfirmed(false);
    setError(null);
    setSiteUrl("");
  }, [reportId]);

  async function prepare() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/publications`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The publication bundle could not be prepared.");
      setPrepared(body as Prepared);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The publication bundle could not be prepared.");
    } finally {
      setLoading(false);
    }
  }

  async function transition(status: PublicationStatus, extra: Record<string, string> = {}) {
    if (!prepared) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/publications/${encodeURIComponent(prepared.publication.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The publication record could not be updated.");
      setPrepared({ ...prepared, publication: body.publication });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The publication record could not be updated.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndOpen() {
    if (!prepared || !confirmed) return;
    downloadHandoff(prepared);
    void navigator.clipboard.writeText(prepared.handoffPrompt).catch(() => undefined);
    window.open(CHATGPT_SITES_URL, "_blank", "noopener,noreferrer");
    await transition("handoff_opened");
  }

  return <>
    <button onClick={prepare} className="report-no-print rounded-md border border-[var(--i-mint)] bg-[rgba(66,215,170,.08)] px-3 py-1.5 text-xs text-[var(--i-mint)] hover:bg-[rgba(66,215,170,.14)]">
      Create interactive site
    </button>
    {open && <div className="report-no-print fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Create interactive site">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-[var(--i-border)] bg-[var(--i-panel)] p-5 text-[var(--i-text)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--i-border)] pb-4">
          <div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--i-mint)]">ChatGPT Sites handoff</div><h2 className="mt-1 text-xl font-semibold">Create an interactive site</h2><p className="mt-1 text-xs leading-relaxed text-[var(--i-text-soft)]">Signal freezes a reviewed publication bundle. ChatGPT Sites creates the private draft. Nothing is published or shared here.</p></div>
          <button onClick={() => setOpen(false)} className="rounded border border-[var(--i-border)] px-2 py-1 text-xs text-[var(--i-text-soft)]">Close</button>
        </div>

        {loading && !prepared && <p className="py-8 text-sm text-[var(--i-text-soft)]">Validating the frozen report…</p>}
        {error && <div className="my-4 rounded border border-[var(--i-red)] bg-[rgba(255,90,90,.08)] p-3 text-xs text-[var(--i-red)]">{error}</div>}
        {prepared && <div className="space-y-4 pt-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--i-border)] p-3"><div className="text-[9px] uppercase tracking-wider text-[var(--i-text-faint)]">State</div><div className="mt-1 text-sm font-semibold">{STATUS_LABELS[prepared.publication.status]}</div></div>
            <div className="rounded-lg border border-[var(--i-border)] p-3"><div className="text-[9px] uppercase tracking-wider text-[var(--i-text-faint)]">Frozen snapshot</div><div className="mt-1 font-mono text-[10px]">{prepared.bundle.integrity.snapshotFingerprint}</div></div>
            <div className="rounded-lg border border-[var(--i-border)] p-3"><div className="text-[9px] uppercase tracking-wider text-[var(--i-text-faint)]">Checked claims</div><div className="mt-1 text-sm font-semibold">{prepared.readiness.checkedClaims}</div></div>
          </div>

          <div className="rounded-lg border border-[var(--i-mint)] bg-[rgba(66,215,170,.06)] p-3 text-xs"><strong>Ready to hand off.</strong> The bundle is sealed as <span className="font-mono">{prepared.bundle.integrity.bundleHash.slice(0, 16)}…</span></div>
          {prepared.revisionContext.newerProjectTruthAvailable && <div className="rounded-lg border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3 text-xs"><strong>Newer project truth is available.</strong> This bundle remains frozen to the selected report. Create a new report and publication revision to share the newer state.</div>}
          {prepared.readiness.warnings.length > 0 && <div className="rounded-lg border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3"><div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--i-amber)]">Honest caveats that will travel</div><ul className="mt-2 space-y-1 text-xs">{prepared.readiness.warnings.map((item) => <li key={item}>• {item}</li>)}</ul></div>}

          <details className="rounded-lg border border-[var(--i-border)] p-3" open><summary className="cursor-pointer text-xs font-semibold">Exactly what will be shared</summary><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><span className="text-[var(--i-text-faint)]">Project</span><div>{prepared.bundle.identity.projectName}</div></div><div><span className="text-[var(--i-text-faint)]">Audience / purpose</span><div>{prepared.bundle.identity.audienceLabel} · {prepared.bundle.identity.purposeLabel}</div></div><div><span className="text-[var(--i-text-faint)]">Likely / target / committed</span><div>{prepared.bundle.content.delivery.likely ?? "Forecast unavailable"} · {prepared.bundle.content.delivery.target ?? "No target"} · {prepared.bundle.content.delivery.commitment.status === "missing" ? "No canonical commitment" : prepared.bundle.content.delivery.commitment.date}</div></div><div><span className="text-[var(--i-text-faint)]">Modules</span><div>{prepared.bundle.presentation.moduleOrder.map((item) => item.label).join(" · ")}</div></div></div><details className="mt-3"><summary className="cursor-pointer text-[10px] uppercase tracking-wider text-[var(--i-text-faint)]">Inspect frozen JSON</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/25 p-3 text-[9px] leading-relaxed">{JSON.stringify(prepared.bundle, null, 2)}</pre></details></details>

          <details className="rounded-lg border border-[var(--i-border)] p-3"><summary className="cursor-pointer text-xs font-semibold">Excluded / private material</summary><ul className="mt-2 space-y-2 text-xs text-[var(--i-text-soft)]">{prepared.readiness.exclusions.map((item) => <li key={`${item.category}:${item.label}`}><strong className="text-[var(--i-text)]">{item.label}</strong> — {item.reason}</li>)}</ul></details>

          {prepared.publication.status === "bundle_ready" && <div className="rounded-lg border border-[var(--i-border)] p-3">
            <label className="flex items-start gap-2 text-xs leading-relaxed"><input className="mt-0.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the frozen content and exclusions. Download the governed handoff, copy its instructions, and open ChatGPT Sites. This does not publish or share anything.</span></label>
            <button disabled={!confirmed || loading} onClick={confirmAndOpen} className="mt-3 rounded-md bg-[var(--i-mint)] px-4 py-2 text-xs font-semibold text-[#07110e] disabled:opacity-40">Confirm & open ChatGPT Sites</button>
          </div>}

          {prepared.publication.status === "handoff_opened" && <div className="rounded-lg border border-[var(--i-border)] p-3 text-xs"><p>Attach the downloaded handoff file in ChatGPT Sites and paste the copied instructions. Ask for a private saved version only.</p><button disabled={loading} onClick={() => transition("draft_generated")} className="mt-3 rounded border border-[var(--i-mint)] px-3 py-2 text-[var(--i-mint)]">I have a private draft</button></div>}
          {prepared.publication.status === "draft_generated" && <div className="rounded-lg border border-[var(--i-border)] p-3 text-xs"><p>Reconcile every displayed fact to the bundle before advancing.</p><button disabled={loading} onClick={() => transition("previewed")} className="mt-3 rounded border border-[var(--i-mint)] px-3 py-2 text-[var(--i-mint)]">I reviewed the preview</button></div>}
          {prepared.publication.status === "previewed" && <div className="rounded-lg border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3 text-xs"><strong>Signal has not published this Site.</strong><p className="mt-1 text-[var(--i-text-soft)]">Publish or change access in ChatGPT Sites only after choosing the recipient scope. Then paste the confirmed HTTPS URL to preserve the audit trail.</p><input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://…" className="mt-3 w-full rounded border border-[var(--i-border)] bg-black/20 px-3 py-2" /><button disabled={loading || !siteUrl} onClick={() => transition("published_shared", { externalUrl: siteUrl })} className="mt-2 rounded border border-[var(--i-amber)] px-3 py-2 text-[var(--i-amber)]">Record published / shared</button></div>}
          {prepared.publication.status === "published_shared" && <div className="rounded-lg border border-[var(--i-mint)] p-3 text-xs"><strong>Operator-confirmed publication recorded.</strong>{prepared.publication.externalUrl && <a className="ml-2 text-[var(--i-mint)] underline" href={prepared.publication.externalUrl} target="_blank" rel="noreferrer">Open Site</a>}</div>}
        </div>}
      </section>
    </div>}
  </>;
}
