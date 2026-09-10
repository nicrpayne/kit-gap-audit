"use client";

import Link from "@/components/instrument/SignalLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignalControl } from "@/components/instrument/SignalPrimitives";

interface KnowledgeStatus {
  code: "current" | "new_available" | "ingesting" | "refreshing" | "offline" | "unavailable";
  label: string;
  detail: string;
  canRefresh: boolean;
  lastPackageAt: string | null;
}

function actionLabel(status: KnowledgeStatus | null, requesting: boolean): string {
  if (!status) return "Checking knowledge…";
  if (requesting || status.code === "refreshing") return "Refreshing Audit…";
  if (status.code === "new_available") return "Refresh Audit";
  if (status.code === "current") return "Check for updates";
  if (status.code === "ingesting") return "Ingestion in progress";
  if (status.code === "offline") return "Companion offline";
  return "Refresh unavailable";
}

export default function AuditRefreshControl({ scopeId, fixture }: { scopeId: string; fixture?: string }) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!scopeId || fixture) return null;
    const response = await fetch(`/api/audit/knowledge?scopeId=${encodeURIComponent(scopeId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { knowledge?: KnowledgeStatus; error?: string };
    if (!response.ok || !body.knowledge) throw new Error(body.error ?? "Knowledge status unavailable.");
    setStatus(body.knowledge);
    return body.knowledge;
  }, [fixture, scopeId]);

  useEffect(() => {
    setStatus(null); setNotice(null);
    void load().catch((reason) => setNotice(reason instanceof Error ? reason.message : "Knowledge status unavailable."));
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [load]);

  async function refresh() {
    if (!scopeId || fixture || requesting || ["offline", "unavailable", "ingesting", "refreshing"].includes(status?.code ?? "")) return;
    setRequesting(true); setNotice(null); setMenuOpen(false);
    try {
      const response = await fetch("/api/audit/knowledge", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopeId }),
      });
      const body = await response.json().catch(() => ({})) as { status?: string; reason?: string; error?: string };
      if (!response.ok && response.status !== 409) throw new Error(body.error ?? body.reason ?? "Refresh could not start.");
      if (body.status === "blocked") throw new Error(body.reason ?? "Refresh is waiting.");
      if (body.status === "current") {
        setNotice(body.reason ?? "Knowledge is current.");
        await load(); setRequesting(false); return;
      }
      setNotice(body.status === "already_running" ? "Refresh already in progress." : "Refresh requested. Waiting for a completed knowledge package.");
      const poll = async () => {
        try {
          const next = await load();
          if (next?.code === "refreshing") pollRef.current = window.setTimeout(() => void poll(), 2_000);
          else {
            pollRef.current = null; setRequesting(false);
            window.dispatchEvent(new CustomEvent("signal-audit-refresh-complete"));
          }
        } catch (reason) {
          pollRef.current = null; setRequesting(false);
          setNotice(reason instanceof Error ? reason.message : "Refresh status unavailable.");
        }
      };
      pollRef.current = window.setTimeout(() => void poll(), 1_500);
    } catch (reason) {
      setRequesting(false);
      setNotice(reason instanceof Error ? reason.message : "Refresh could not start.");
    }
  }

  const disabled = Boolean(fixture) || !status || ["offline", "unavailable", "ingesting", "refreshing"].includes(status.code) || requesting;
  const tone = status?.code === "new_available" ? "var(--i-amber)" : status?.code === "offline" ? "var(--i-red)" : "var(--i-signal)";

  return <div className="relative flex items-center gap-1.5">
    <SignalControl
      type="button"
      onClick={() => void refresh()}
      disabled={disabled}
      status="reality"
      data-shoot="audit-refresh-primary"
      className="shrink-0 px-3 py-1.5 text-[11.5px] font-medium text-[var(--signal-status-color)]"
      title={fixture ? "Refresh is disabled for deterministic fixtures" : status?.detail}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      {fixture ? "Refresh disabled" : actionLabel(status, requesting)}
    </SignalControl>
    <SignalControl type="button" aria-label="Audit actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="px-2 py-1.5 text-[11px]">•••</SignalControl>
    {menuOpen && <div className="absolute right-0 top-9 z-[70] w-64 rounded-md border border-[var(--i-border-strong)] bg-[var(--i-panel)] p-1 shadow-2xl" data-shoot="audit-secondary-menu">
      <button type="button" onClick={() => void refresh()} disabled={disabled} className="block w-full rounded px-3 py-2 text-left text-[10.5px] text-[var(--i-text-soft)] hover:bg-white/[0.04] disabled:opacity-35">{status?.code === "current" ? "Check for updates" : "Refresh Audit"}</button>
      <button type="button" onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("signal-audit-refresh-complete")); setNotice("Current snapshot reloaded. No package or Reality writes were made."); }} className="block w-full rounded px-3 py-2 text-left text-[10.5px] text-[var(--i-text-soft)] hover:bg-white/[0.04]">Re-check current snapshot <span className="text-[var(--i-text-faint)]">· diagnostic</span></button>
      <button type="button" onClick={() => { setMenuOpen(false); setEvidenceOpen(true); }} className="block w-full rounded px-3 py-2 text-left text-[10.5px] text-[var(--i-text-soft)] hover:bg-white/[0.04]">Add evidence to knowledge system</button>
      <Link href={`/audit/history${scopeId ? `?scope=${encodeURIComponent(scopeId)}` : ""}`} className="block rounded px-3 py-2 text-[10.5px] text-[var(--i-text-soft)] hover:bg-white/[0.04]">Audit history</Link>
      <button type="button" onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("signal-audit-open-source-health")); }} className="block w-full rounded px-3 py-2 text-left text-[10.5px] text-[var(--i-text-soft)] hover:bg-white/[0.04]">Source health</button>
    </div>}
    {notice && <span className="absolute right-0 top-10 z-[60] w-72 rounded border border-[var(--i-border)] bg-[var(--i-panel)] px-3 py-2 text-[9.5px] text-[var(--i-text-soft)]">{notice}</span>}
    {evidenceOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-6" role="presentation" onClick={() => setEvidenceOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Add evidence to knowledge system" data-shoot="evidence-upstream-info" onClick={(event) => event.stopPropagation()} className="signal-widget w-full max-w-[520px] p-5">
        <div className="i-label text-[var(--i-signal)]">ADD EVIDENCE</div>
        <h2 className="mt-1 text-[17px] font-medium text-[var(--i-text)]">File new evidence upstream</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-text-soft)]">Signal does not store a private copy of pasted evidence. Add the source through the approved KE intake and Wiki Update workflow; after compilation and Hermes ingestion complete, return here and refresh Audit.</p>
        <p className="mt-2 text-[10px] text-[var(--i-text-faint)]">A safe Signal-to-KE handoff is not available yet, so direct paste is intentionally disabled.</p>
        <div className="mt-4 flex justify-end"><SignalControl type="button" onClick={() => setEvidenceOpen(false)} className="px-3 py-1.5 text-[10.5px]">Done</SignalControl></div>
      </section>
    </div>}
  </div>;
}
