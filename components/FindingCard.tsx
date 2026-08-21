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

/** What the preview endpoint returns — the exact issue that would be filed,
    plus where it would land. Mirrors TicketPayload in lib/findings. */
export interface TicketPreview {
  title: string;
  description: string;
  teamKey: string;
  scopeName: string;
  projectNames: string[];
  provenance: "source" | "context-package";
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
  const [preview, setPreview] = useState<TicketPreview | null>(null);

  // STEP ONE IS A READ. "Draft ticket" used to file a real issue in a real
  // external workspace on one click. It now fetches what WOULD be filed and
  // shows it; nothing has left Signal at this point.
  async function draftTicket() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/ticket/preview`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't prepare this ticket.");
      }
      const { preview: p } = await res.json();
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // STEP TWO IS THE WRITE, and it is the only thing here that reaches
  // Linear. Reached solely from the review panel's explicit action.
  async function createInLinear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create the Linear issue.");
      }
      const { finding: updated } = await res.json();
      onChange(updated);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Returns a stranded finding to an actionable state without pretending to
  // know what happened in Linear. See app/api/findings/[id]/unlink.
  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/unlink`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't unlink this finding.");
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

      {finding.status === "open" && !dismissing && !preview && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Deliberately no longer the primary-filled button. It used to
              look like the commit action because it WAS one; it is now a
              read, and the filled treatment belongs to the control that
              actually writes to Linear. */}
          <button
            onClick={draftTicket}
            disabled={busy}
            data-shoot="draft-ticket"
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Draft ticket"}
          </button>
          <button
            onClick={() => setDismissing(true)}
            disabled={busy}
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
          >
            Dismiss
          </button>
          {/* An unlinked finding keeps its old identifier, so say what
              happened rather than showing a bare "open" and losing it. */}
          {finding.linearIssueId && (
            <span className="text-[11px] text-[var(--color-ink-soft)]">
              Previously filed as {finding.linearIssueId} — no longer linked.
            </span>
          )}
        </div>
      )}

      {/* THE REVIEW STATE. Nothing has been created yet, and it says so.
          The only control that reaches Linear names Linear. */}
      {finding.status === "open" && preview && (
        <div
          data-shoot="ticket-review"
          className="rounded-lg border border-[var(--color-line)] bg-black/[0.02] p-4 flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent)]">
              Review before filing
            </span>
            <span className="text-[11px] text-[var(--color-ink-soft)]">Nothing has been created yet.</span>
          </div>

          <div className="text-xs text-[var(--color-ink-soft)] flex flex-wrap gap-x-5 gap-y-1">
            <span>Team <b className="text-[var(--color-ink)]">{preview.teamKey}</b></span>
            <span>Scope <b className="text-[var(--color-ink)]">{preview.scopeName}</b></span>
            <span>
              {preview.projectNames.length > 0 ? (
                <>Projects <b className="text-[var(--color-ink)]">{preview.projectNames.join(", ")}</b></>
              ) : (
                <b className="text-[var(--color-amber)]">No project filter — files against the team</b>
              )}
            </span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] mb-1">Title</div>
            <div className="text-sm font-medium" data-shoot="preview-title">{preview.title}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] mb-1">Body</div>
            <pre className="m-0 max-h-56 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
              {preview.description}
            </pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={createInLinear}
              disabled={busy}
              data-shoot="create-in-linear"
              className="i-btn-primary px-3.5 py-1.5 text-xs"
            >
              {busy ? "Creating…" : "Create issue in Linear"}
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={busy}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <span className="text-[11px] text-[var(--color-ink-soft)]">
              This writes to your Linear workspace.
            </span>
          </div>
        </div>
      )}

      {/* THE WAY OUT OF A STRANDED FINDING. QA found one asserting
          "Ticketed · SOF-807" after the issue was deleted, with nothing to
          act on. Signal cannot verify what happened in Linear from here —
          see the reconciliation proposal — but a person who knows can say. */}
      {finding.status === "ticketed" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={unlink}
            disabled={busy}
            data-shoot="unlink-ticket"
            className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50"
          >
            {busy ? "Unlinking…" : "Unlink — this ticket no longer exists"}
          </button>
          <span className="text-[11px] text-[var(--color-ink-soft)]">
            Returns the finding to open. Does not touch Linear.
          </span>
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
