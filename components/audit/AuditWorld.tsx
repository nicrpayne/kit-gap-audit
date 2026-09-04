"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuditFindingOverlay from "./AuditFindingOverlay";

interface ScopeOption {
  id: string;
  name: string;
}

interface AuditOption {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  findingCount: number;
  openFindingCount: number;
  position: "current" | "prior" | "earlier";
}

interface AuditContextPayload {
  scopes: ScopeOption[];
  scope: ScopeOption;
  audits: AuditOption[];
}

const AUDIT_KINDS = [
  { value: "transcript", label: "Meeting transcript" },
  { value: "notes", label: "Notes" },
  { value: "estimates", label: "Developer estimates" },
  { value: "spreadsheet", label: "Spreadsheet / task list" },
];

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function AuditWorld({
  initialScopeId,
  fixture,
}: {
  initialScopeId?: string;
  fixture?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [scopeId, setScopeId] = useState(initialScopeId ?? "");
  const [auditId, setAuditId] = useState("");
  const scopeRef = useRef(scopeId);
  const auditRef = useRef(auditId);
  const [context, setContext] = useState<AuditContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [worldMounted, setWorldMounted] = useState(false);
  const [worldState, setWorldState] = useState<"loading" | "ready" | "updating">("loading");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [runTitle, setRunTitle] = useState("");
  const [runKind, setRunKind] = useState("transcript");
  const [runContent, setRunContent] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [findingReviewId, setFindingReviewId] = useState<string | null>(null);

  useEffect(() => { scopeRef.current = scopeId; }, [scopeId]);
  useEffect(() => { auditRef.current = auditId; }, [auditId]);
  useEffect(() => {
    // Let the flex shell establish a non-zero viewport before Rubric boots.
    // Rubric remains untouched and receives its real final canvas dimensions
    // on its first resize instead of observing the shell's hydration frame.
    const frame = requestAnimationFrame(() => setWorldMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The iframe URL never changes after mount. Scope/history/run changes cross
  // the Audit-local bridge and call Rubric's native refreshData, preserving
  // the live camera and letting the existing world morph to its new data.
  const frameSrc = useMemo(() => {
    const params = new URLSearchParams({ embedded: "1" });
    if (initialScopeId) params.set("scope", initialScopeId);
    if (fixture) params.set("fixture", fixture);
    return `/audit/rubric-phase3?${params}`;
  }, [fixture, initialScopeId]);

  const sendContext = useCallback((nextScope: string, nextAudit: string) => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    setWorldState("updating");
    target.postMessage(
      { type: "signal-audit-set-context", scope: nextScope, audit: nextAudit },
      window.location.origin
    );
  }, []);

  const loadContext = useCallback(async (requestedScope?: string) => {
    const params = new URLSearchParams({ mode: "context" });
    if (requestedScope) params.set("scope", requestedScope);
    if (fixture) params.set("fixture", fixture);
    const response = await fetch(`/api/audit/rubric?${params}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as AuditContextPayload & { error?: string };
    if (!response.ok || body.error) throw new Error(body.error ?? "Audit context could not be read.");
    setContext(body);
    setScopeId(body.scope.id);
    setContextError(null);
    return body;
  }, [fixture]);

  useEffect(() => {
    void loadContext(initialScopeId).catch((error) => {
      setContextError(error instanceof Error ? error.message : "Audit context could not be read.");
    });
  }, [initialScopeId, loadContext]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as {
        type?: string;
        scope?: string;
        canonicalId?: string;
        auditContext?: { mode?: string; id?: string };
      };
      if (message.type === "signal-audit-open-finding" && message.canonicalId) {
        setFindingReviewId(message.canonicalId);
        return;
      }
      if (message.type !== "signal-audit-world-ready" && message.type !== "signal-audit-world-updated") return;
      const frameAudit = message.auditContext?.mode === "audit" ? message.auditContext.id ?? "" : "";
      if (message.type === "signal-audit-world-ready" &&
          (message.scope !== scopeRef.current || frameAudit !== auditRef.current)) {
        sendContext(scopeRef.current, auditRef.current);
        return;
      }
      setWorldState("ready");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendContext]);

  const traceFinding = useCallback((canonicalId: string, active: boolean) => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "signal-audit-trace-canonical", canonicalId, active },
      window.location.origin
    );
  }, []);

  const refreshAfterFindingAction = useCallback(async () => {
    const updated = await loadContext(scopeRef.current);
    sendContext(updated.scope.id, auditRef.current);
  }, [loadContext, sendContext]);

  const selectedAudit = context?.audits.find((audit) => audit.id === auditId) ?? null;
  const currentAudit = context?.audits[0] ?? null;
  const priorAudit = context?.audits[1] ?? null;

  async function changeScope(nextScope: string) {
    setScopeId(nextScope);
    setAuditId("");
    setNotice(null);
    sendContext(nextScope, "");
    try {
      await loadContext(nextScope);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : "Audit context could not be read.");
    }
  }

  function changeAudit(nextAudit: string) {
    setAuditId(nextAudit);
    setNotice(null);
    sendContext(scopeId, nextAudit);
  }

  async function runAudit(event: FormEvent) {
    event.preventDefault();
    if (!scopeId || !runContent.trim()) {
      setRunError("Choose a project and provide evidence to compare.");
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId, title: runTitle, kind: runKind, content: runContent }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        source?: { id: string };
        findings?: unknown[];
      };
      if (!response.ok || body.error) throw new Error(body.error ?? "Audit failed.");
      setAuditId("");
      setRunOpen(false);
      setRunTitle("");
      setRunContent("");
      const updated = await loadContext(scopeId);
      sendContext(updated.scope.id, "");
      setNotice(`Audit complete · ${body.findings?.length ?? 0} finding${body.findings?.length === 1 ? "" : "s"} · world updated`);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Audit failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "#05060d" }}>
      <header
        className="relative z-30 flex h-[46px] shrink-0 items-center gap-3 px-4"
        style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
        data-shoot="audit-world-header"
      >
        <span className="shrink-0 text-[12px] font-semibold tracking-[0.18em] text-[var(--i-text)]">SIGNAL AUDIT</span>
        <select
          aria-label="Project"
          value={scopeId}
          onChange={(event) => void changeScope(event.target.value)}
          className="max-w-[210px] rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        >
          {(context?.scopes ?? []).map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
        </select>
        <select
          aria-label="Audit context"
          value={auditId}
          onChange={(event) => changeAudit(event.target.value)}
          className="max-w-[300px] rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        >
          <option value="">Current project world</option>
          {(context?.audits ?? []).map((audit) => (
            <option key={audit.id} value={audit.id}>
              {audit.position === "current" ? "Current Audit" : audit.position === "prior" ? "Prior Audit" : "Earlier Audit"} · {dateLabel(audit.createdAt)} · {audit.title}
            </option>
          ))}
        </select>
        <span className="min-w-0 truncate text-[10.5px]" style={{ color: worldState === "ready" ? "var(--i-signal)" : "var(--i-text-faint)" }}>
          {worldState === "loading" ? "Opening world…" : worldState === "updating" ? "World morphing…" : selectedAudit ? `${selectedAudit.findingCount} findings in this Audit` : notice ?? (fixture ? "Deterministic evidence fixture" : "Live canonical graph")}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setOverviewOpen((open) => !open)}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px]"
          style={{ border: "1px solid var(--i-border-strong)", color: overviewOpen ? "var(--i-signal)" : "var(--i-text-soft)" }}
        >
          Project Overview
        </button>
        <Link href={`/audit/history${scopeId ? `?scope=${encodeURIComponent(scopeId)}` : ""}`} className="shrink-0 text-[11px]" style={{ color: "var(--i-text-faint)" }}>
          History
        </Link>
        <button
          type="button"
          onClick={() => { setRunOpen(true); setRunError(null); }}
          disabled={Boolean(fixture)}
          className="shrink-0 rounded-md px-3 py-1.5 text-[11.5px] font-medium"
          style={{ background: "var(--i-signal-soft)", border: "1px solid var(--i-signal)", color: "var(--i-signal)", opacity: fixture ? 0.45 : 1 }}
          title={fixture ? "Run Audit is disabled for deterministic fixtures" : "Run Audit through Signal's canonical pipeline"}
        >
          Run Audit
        </button>
      </header>

      <div className="relative min-h-0 flex-1" data-shoot="audit-world-viewport">
        {worldMounted && (
          <iframe
            ref={frameRef}
            src={frameSrc}
            title="Signal Audit World"
            className="absolute inset-0 h-full w-full border-0"
          />
        )}

        {contextError && (
          <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-[11px]" style={{ background: "var(--i-panel)", border: "1px solid var(--i-red)", color: "var(--i-red)" }}>
            {contextError}
          </div>
        )}

        {overviewOpen && context && (
          <section
            className="absolute left-4 top-4 z-40 w-[340px] rounded-xl p-4 shadow-2xl"
            style={{ background: "color-mix(in srgb, var(--i-panel) 96%, transparent)", border: "1px solid var(--i-border-strong)" }}
            aria-label="Project Overview"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="i-label text-[9px]" style={{ color: "var(--i-text-faint)" }}>PROJECT OVERVIEW</div>
                <h2 className="mt-1 text-[16px] font-medium text-[var(--i-text)]">{context.scope.name}</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--i-text-soft)]">Audit discovers. Reality governs. Signal responds.</p>
              </div>
              <button type="button" onClick={() => setOverviewOpen(false)} aria-label="Close Project Overview" className="text-[18px] text-[var(--i-text-faint)]">×</button>
            </div>
            <div className="mt-4 space-y-2">
              {[currentAudit, priorAudit].filter(Boolean).map((audit) => (
                <button
                  key={audit!.id}
                  type="button"
                  onClick={() => { changeAudit(audit!.id); setOverviewOpen(false); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left"
                  style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}
                >
                  <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--i-text-faint)]">{audit!.position} Audit · {dateLabel(audit!.createdAt)}</span>
                  <span className="mt-1 block truncate text-[12px] text-[var(--i-text)]">{audit!.title}</span>
                  <span className="mt-0.5 block text-[10.5px] text-[var(--i-text-soft)]">{audit!.findingCount} findings · {audit!.openFindingCount} open</span>
                </button>
              ))}
              {!currentAudit && <p className="text-[11px] text-[var(--i-text-faint)]">No evidence Audits have been run for this project yet.</p>}
            </div>
          </section>
        )}

        {runOpen && !fixture && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6" role="presentation">
            <form
              onSubmit={(event) => void runAudit(event)}
              className="w-full max-w-[620px] rounded-2xl p-5 shadow-2xl"
              style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)" }}
              aria-label="Run Audit"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="i-label text-[9px] text-[var(--i-signal)]">RUN AUDIT</div>
                  <h2 className="mt-1 text-[18px] font-medium text-[var(--i-text)]">Compare new evidence with {context?.scope.name ?? "this project"}</h2>
                  <p className="mt-1 text-[11px] text-[var(--i-text-soft)]">New Findings enter review. Reality does not change automatically.</p>
                </div>
                <button type="button" onClick={() => setRunOpen(false)} aria-label="Close Run Audit" className="text-[20px] text-[var(--i-text-faint)]">×</button>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_190px] gap-3">
                <input
                  value={runTitle}
                  onChange={(event) => setRunTitle(event.target.value)}
                  placeholder="Audit title (optional)"
                  className="rounded-md px-3 py-2 text-[12px] outline-none"
                  style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
                />
                <select
                  value={runKind}
                  onChange={(event) => setRunKind(event.target.value)}
                  className="rounded-md px-3 py-2 text-[12px] outline-none"
                  style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
                >
                  {AUDIT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </select>
              </div>
              <textarea
                value={runContent}
                onChange={(event) => setRunContent(event.target.value)}
                rows={12}
                placeholder="Paste a transcript, notes, estimates, or task list…"
                className="mt-3 w-full resize-y rounded-md px-3 py-2.5 font-mono text-[11.5px] leading-relaxed outline-none"
                style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              />
              {runError && <p className="mt-2 text-[11px]" style={{ color: "var(--i-red)" }}>{runError}</p>}
              <div className="mt-4 flex items-center justify-between gap-4">
                <Link href={`/audit/new${scopeId ? `?scope=${encodeURIComponent(scopeId)}` : ""}`} className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)]">
                  Need file upload? Open the full Audit form
                </Link>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRunOpen(false)} className="rounded-md px-3 py-1.5 text-[11px] text-[var(--i-text-soft)]" style={{ border: "1px solid var(--i-border-strong)" }}>Cancel</button>
                  <button disabled={running} type="submit" className="rounded-md px-3 py-1.5 text-[11px] font-medium disabled:opacity-50" style={{ background: "var(--i-signal-soft)", border: "1px solid var(--i-signal)", color: "var(--i-signal)" }}>
                    {running ? "Running…" : "Run Audit"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {findingReviewId && !fixture && (
          <AuditFindingOverlay
            scopeId={scopeId}
            canonicalId={findingReviewId}
            onClose={() => setFindingReviewId(null)}
            onTrace={(active) => traceFinding(findingReviewId, active)}
            onCanonicalChange={refreshAfterFindingAction}
          />
        )}
      </div>
    </div>
  );
}
