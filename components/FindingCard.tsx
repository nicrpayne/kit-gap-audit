"use client";

import { useState } from "react";
import SeverityDot from "./SeverityDot";

export interface FindingData {
  id: string;
  type: string;
  title: string;
  quote: string;
  rationale: string;
  severity: string;
  estimateHint: string | null;
  owner: string | null;
  blocks: string | null;
  blocking: boolean;
  matchedIssues: string[];
  status: string;
  linearIssueId: string | null;
  dismissReason: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  missing_work: "Missing ticket",
  decision: "Decision",
  risk: "Risk",
  contradiction: "Contradiction",
};

export default function FindingCard({
  finding,
  onChange,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  finding: FindingData;
  onChange: (updated: FindingData) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draftTicket() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/ticket`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create ticket.");
      }
      const { finding: updated } = await res.json();
      onChange(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDismiss() {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to dismiss.");
      }
      const { finding: updated } = await res.json();
      onChange(updated);
      setDismissing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded border-[var(--color-line)]"
              aria-label={`Select "${finding.title}"`}
            />
          )}
          <SeverityDot severity={finding.severity} />
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
            {TYPE_LABELS[finding.type] ?? finding.type}
          </span>
          {finding.type === "decision" && finding.blocking && (
            <span className="text-[10px] uppercase tracking-wide bg-[var(--color-danger-soft)] text-[var(--color-danger)] px-1.5 py-0.5 rounded">
              Blocking
            </span>
          )}
        </div>
        <StatusBadge finding={finding} />
      </div>

      <h3 className="font-display text-lg mb-2">{finding.title}</h3>
      <p className="text-sm italic text-[var(--color-ink-soft)] border-l-2 border-[var(--color-line)] pl-3 mb-3">
        &ldquo;{finding.quote}&rdquo;
      </p>
      <p className="text-sm text-[var(--color-ink)] mb-3">{finding.rationale}</p>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-ink-soft)] mb-4">
        {finding.owner && <span>Owner: {finding.owner}</span>}
        {finding.blocks && <span>Blocks: {finding.blocks}</span>}
        {finding.estimateHint && <span>Estimate: {finding.estimateHint}</span>}
        {finding.matchedIssues.length > 0 && (
          <span>Related: {finding.matchedIssues.join(", ")}</span>
        )}
      </div>

      {error && <div className="text-sm text-[var(--color-danger)] mb-3">{error}</div>}

      {finding.status === "open" && !dismissing && (
        <div className="flex gap-2">
          <button
            onClick={draftTicket}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
          >
            {busy ? "Working…" : "Draft ticket"}
          </button>
          <button
            onClick={() => setDismissing(true)}
            disabled={busy}
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {finding.status === "open" && dismissing && (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why dismiss this? (won't be re-raised)"
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={submitDismiss}
              disabled={busy || !reason.trim()}
              className="rounded-md bg-[var(--color-danger)] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Confirm dismiss
            </button>
            <button
              onClick={() => setDismissing(false)}
              disabled={busy}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ finding }: { finding: FindingData }) {
  if (finding.status === "ticketed") {
    return (
      <span className="text-xs bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)] px-2 py-0.5 rounded">
        Ticketed{finding.linearIssueId ? ` · ${finding.linearIssueId}` : ""}
      </span>
    );
  }
  if (finding.status === "dismissed") {
    return (
      <span className="text-xs bg-black/5 text-[var(--color-ink-soft)] px-2 py-0.5 rounded" title={finding.dismissReason ?? undefined}>
        Dismissed
      </span>
    );
  }
  if (finding.status === "resolved") {
    return (
      <span className="text-xs bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)] px-2 py-0.5 rounded">
        Resolved
      </span>
    );
  }
  return null;
}
