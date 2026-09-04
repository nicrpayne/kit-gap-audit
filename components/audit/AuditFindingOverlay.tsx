"use client";

import { useCallback, useEffect, useState } from "react";
import type { TruthFinding, TruthMapModel } from "@/lib/audit/truth";
import type { FindingProvenance, groundingLabel } from "@/lib/audit/provenance";
import type { ActionId, PrimaryAction } from "@/lib/audit/actions";
import { dispatchFindingAction } from "@/lib/audit/reviewActions";
import FindingInspector from "./FindingInspector";
import AuditReviewConsole, { type ConsoleMode } from "./AuditReviewConsole";

type Provenance = FindingProvenance & { grounding: ReturnType<typeof groundingLabel> };
type TruthPayload = { model: TruthMapModel; provenance: Record<string, Provenance>; error?: string };

export default function AuditFindingOverlay({
  scopeId,
  canonicalId,
  onClose,
  onTrace,
  onCanonicalChange,
}: {
  scopeId: string;
  canonicalId: string;
  onClose: () => void;
  onTrace: (active: boolean) => void;
  onCanonicalChange: () => Promise<void>;
}) {
  const findingId = canonicalId.startsWith("finding:") ? canonicalId.slice("finding:".length) : canonicalId;
  const [payload, setPayload] = useState<TruthPayload | null>(null);
  const [finding, setFinding] = useState<TruthFinding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [mode, setMode] = useState<ConsoleMode>("A");
  const [evidenceSolo, setEvidenceSolo] = useState(false);
  const [awaitingEvidence, setAwaitingEvidence] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/audit/truth?scope=${encodeURIComponent(scopeId)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as TruthPayload;
    if (!response.ok || body.error) throw new Error(body.error ?? "Finding review could not be loaded.");
    const nextFinding = body.model.findings.find((candidate) => candidate.id === findingId) ?? null;
    if (!nextFinding) throw new Error(`Finding ${canonicalId} is not available in this project.`);
    setPayload(body);
    setFinding(nextFinding);
    setError(null);
  }, [canonicalId, findingId, scopeId]);

  useEffect(() => {
    setPayload(null);
    setFinding(null);
    setResult(null);
    setMode("A");
    setEvidenceSolo(false);
    setAwaitingEvidence(false);
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Finding review could not be loaded."));
  }, [load]);

  const changeTrace = useCallback((active: boolean) => {
    setEvidenceSolo(active);
    onTrace(active);
  }, [onTrace]);

  const runAction = useCallback(async (action: PrimaryAction, text: string) => {
    if (!finding) return;
    setResult(null);
    if (action.id === "need_more_evidence") {
      setAwaitingEvidence((value) => !value);
      return;
    }
    if (action.id === "correct") {
      setResult({ ok: false, message: "Correct / edit is not implemented yet — it remains intentionally unavailable." });
      return;
    }
    setBusy(action.id);
    try {
      const next = await dispatchFindingAction(action.id, finding.id, text);
      setResult(next);
      if (next.ok) {
        await load();
        await onCanonicalChange();
      }
    } catch (reason) {
      setResult({ ok: false, message: reason instanceof Error ? reason.message : "That did not go through." });
    } finally {
      setBusy(null);
    }
  }, [finding, load, onCanonicalChange]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Finding review"
        data-shoot="audit-finding-review"
        className="flex max-h-[calc(100%-24px)] w-full max-w-[1240px] flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)" }}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div>
            <div className="i-label text-[9px]" style={{ color: "var(--i-signal)" }}>GOVERNED FINDING REVIEW</div>
            <div className="mt-1 text-[11px] text-[var(--i-text-soft)]">{canonicalId} · Reality changes only through the existing confirmed Signal actions below.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Finding review" className="text-[22px] text-[var(--i-text-faint)]">×</button>
        </header>

        {error ? (
          <div className="p-6 text-[12px]" style={{ color: "var(--i-red)" }}>{error}</div>
        ) : !payload || !finding ? (
          <div className="p-6 text-[12px] text-[var(--i-text-soft)]">Loading governed Finding workflow…</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FindingInspector
                model={payload.model}
                finding={finding}
                provenance={payload.provenance[finding.id] ?? null}
                onSelect={() => undefined}
                onEvidenceSolo={(payload.provenance[finding.id]?.kind ?? "none") === "none" ? null : () => changeTrace(true)}
              />
            </div>
            <AuditReviewConsole
              model={payload.model}
              finding={finding}
              provenance={payload.provenance[finding.id] ?? null}
              evidenceSolo={evidenceSolo}
              onEvidenceSolo={changeTrace}
              mode={mode}
              onMode={setMode}
              onAction={(action, text) => void runAction(action, text)}
              busy={busy}
              result={result}
              awaitingEvidence={awaitingEvidence}
            />
          </>
        )}
      </section>
    </div>
  );
}
