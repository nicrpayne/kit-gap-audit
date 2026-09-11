"use client";

import Link from "@/components/instrument/SignalLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectParam } from "@/lib/shell/useProjectParam";
import AuditFindingOverlay from "./AuditFindingOverlay";
import worldStyles from "./AuditWorld.module.css";
import { SignalControl } from "@/components/instrument/SignalPrimitives";
import AuditChangeInbox from "./AuditChangeInbox";
import AuditRefreshControl from "./AuditRefreshControl";

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
  const [context, setContext] = useState<AuditContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const { projectId: urlScopeId, select: selectUrlScope } = useProjectParam(
    context ? context.scopes.map((scope) => scope.id) : null
  );
  const [scopeId, setScopeId] = useState(initialScopeId ?? urlScopeId ?? "");
  const [auditId, setAuditId] = useState("");
  const scopeRef = useRef(scopeId);
  const auditRef = useRef(auditId);
  const [worldMounted, setWorldMounted] = useState(false);
  const [worldState, setWorldState] = useState<"loading" | "ready" | "updating">("loading");
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
    const requestedScope = urlScopeId ?? initialScopeId;
    let cancelled = false;
    void loadContext(requestedScope)
      .then((updated) => {
        if (cancelled) return;
        setAuditId("");
        setNotice(null);
        sendContext(updated.scope.id, "");
      })
      .catch((error) => {
        if (!cancelled) setContextError(error instanceof Error ? error.message : "Audit context could not be read.");
      });
    return () => { cancelled = true; };
  }, [initialScopeId, loadContext, sendContext, urlScopeId]);

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

  useEffect(() => {
    const refreshWorld = () => void loadContext(scopeRef.current).then((updated) => sendContext(updated.scope.id, ""));
    window.addEventListener("signal-audit-refresh-complete", refreshWorld);
    return () => window.removeEventListener("signal-audit-refresh-complete", refreshWorld);
  }, [loadContext, sendContext]);

  const selectedAudit = context?.audits.find((audit) => audit.id === auditId) ?? null;

  function changeScope(nextScope: string) {
    setScopeId(nextScope);
    setAuditId("");
    setNotice(null);
    sendContext(nextScope, "");
    // The shared hook publishes ?project= with a history entry, clears an
    // object selection that belonged to the previous project, and preserves
    // explicit Scenario context. The embedded Rubric world still morphs over
    // its bridge above; it is never remounted just to make the URL honest.
    selectUrlScope(nextScope);
  }

  function changeAudit(nextAudit: string) {
    setAuditId(nextAudit);
    setNotice(null);
    sendContext(scopeId, nextAudit);
  }

  return (
    <div
      className={`${worldStyles.auditWorld} relative flex min-h-0 flex-1 flex-col overflow-hidden`}
      style={{ background: "var(--signal-surface-canvas)" }}
      data-review-open={findingReviewId ? "true" : "false"}
    >
      <header
        className="signal-shell__identity relative z-30 flex h-[46px] shrink-0 items-center gap-3 px-4"
        data-shoot="audit-world-header"
      >
        <span className="shrink-0 text-[12px] font-semibold tracking-[0.18em] text-[var(--i-text)]">SIGNAL AUDIT</span>
        <select
          aria-label="Project"
          value={scopeId}
          onChange={(event) => changeScope(event.target.value)}
          className="signal-meter min-h-8 max-w-[210px] rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
        >
          {(context?.scopes ?? []).map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
        </select>
        <select
          aria-label="Audit context"
          value={auditId}
          onChange={(event) => changeAudit(event.target.value)}
          className="signal-meter min-h-8 max-w-[300px] rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
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
        <SignalControl
          type="button"
          onClick={() => frameRef.current?.contentWindow?.postMessage({ type: "signal-audit-show-overview" }, window.location.origin)}
          data-shoot="project-overview"
          className="shrink-0 px-2.5 py-1.5 text-[11px]"
        >
          Project Overview
        </SignalControl>
        <Link href={`/audit/history${scopeId ? `?scope=${encodeURIComponent(scopeId)}` : ""}`} className="shrink-0 text-[11px]" style={{ color: "var(--i-text-faint)" }}>
          History
        </Link>
        <AuditRefreshControl scopeId={scopeId} fixture={fixture} />
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

        <AuditChangeInbox
          scopeId={scopeId}
          fixture={fixture}
          onTrace={(canonicalId) => traceFinding(canonicalId, true)}
        />

        {contextError && (
          <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-[11px]" style={{ background: "var(--i-panel)", border: "1px solid var(--i-red)", color: "var(--i-red)" }}>
            {contextError}
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
