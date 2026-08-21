"use client";

import { useState } from "react";
import FindingCard, { FindingData, type TicketPreview } from "./FindingCard";

/** One row of the bulk review panel: the finding, and exactly what would be
    filed for it. Held in state so the writes can only ever target findings
    a person has actually seen. */
interface BulkPreview {
  id: string;
  title: string;
  preview: TicketPreview;
}

const FILTERS: { key: string; label: string; types?: string[] }[] = [
  { key: "all", label: "All" },
  { key: "missing_work", label: "Missing tickets", types: ["missing_work"] },
  { key: "decision", label: "Decisions", types: ["decision"] },
  { key: "risk", label: "Risks", types: ["risk"] },
  { key: "contradiction", label: "Contradictions", types: ["contradiction"] },
];

export default function AuditFindings({ initialFindings }: { initialFindings: FindingData[] }) {
  const [findings, setFindings] = useState(initialFindings);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDrafting, setBulkDrafting] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);
  const [bulkPreviews, setBulkPreviews] = useState<BulkPreview[]>([]);

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const visible = activeFilter?.types
    ? findings.filter((f) => activeFilter.types!.includes(f.type))
    : findings;
  const visibleOpenIds = visible.filter((f) => f.status === "open").map((f) => f.id);
  const allVisibleOpenSelected =
    visibleOpenIds.length > 0 && visibleOpenIds.every((id) => selected.has(id));

  function updateFinding(updated: FindingData) {
    setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleOpenSelected) {
        visibleOpenIds.forEach((id) => next.delete(id));
      } else {
        visibleOpenIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  // STEP ONE: READ ONLY. This button used to fan real Linear writes across
  // every selected finding at once — the single most dangerous control in
  // the app, since one click could create a dozen issues in a workspace
  // Signal does not own. It now fetches previews and shows what WOULD be
  // filed. Nothing leaves Signal here.
  async function reviewSelected() {
    const ids = Array.from(selected).filter((id) =>
      findings.find((f) => f.id === id && f.status === "open")
    );
    if (ids.length === 0) return;

    setBulkDrafting(true);
    setBulkSummary(null);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/findings/${id}/ticket/preview`).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? "Couldn't prepare this ticket.");
          }
          const { preview } = await res.json();
          return { id, preview };
        })
      )
    );

    const ready: BulkPreview[] = [];
    let unpreviewable = 0;
    results.forEach((r) => {
      if (r.status === "fulfilled") {
        const f = findings.find((x) => x.id === r.value.id);
        ready.push({ id: r.value.id, title: f?.title ?? r.value.preview.title, preview: r.value.preview });
      } else unpreviewable += 1;
    });

    setBulkPreviews(ready);
    setBulkDrafting(false);
    if (unpreviewable > 0) {
      setBulkSummary(
        `${unpreviewable} finding${unpreviewable === 1 ? "" : "s"} could not be prepared and ${
          unpreviewable === 1 ? "is" : "are"
        } not included below.`
      );
    }
  }

  // STEP TWO: THE WRITES. Reached only from the review panel's explicit
  // action, and only for the findings shown in it.
  async function createSelectedInLinear() {
    const ids = bulkPreviews.map((b) => b.id);
    if (ids.length === 0) return;

    setBulkDrafting(true);
    setBulkSummary(null);

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/findings/${id}/ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? "Failed to create the Linear issue.");
          }
          return res.json();
        })
      )
    );
    setBulkPreviews([]);

    let succeeded = 0;
    let failed = 0;
    results.forEach((result, i) => {
      const id = ids[i];
      if (result.status === "fulfilled") {
        succeeded += 1;
        updateFinding(result.value.finding as FindingData);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        failed += 1;
      }
    });

    // "Created … in Linear", not "Drafted". The old wording described a
    // draft while the behaviour was a live external write; naming it
    // accurately is part of the fix, not cosmetic.
    setBulkSummary(
      failed === 0
        ? `Created ${succeeded} issue${succeeded === 1 ? "" : "s"} in Linear.`
        : `Created ${succeeded} of ${ids.length} issues in Linear. ${failed} failed — try those individually to see the specific error.`
    );
    setBulkDrafting(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => {
          const count = f.types ? findings.filter((x) => f.types!.includes(x.type)).length : findings.length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                filter === f.key
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)] font-medium"
                  : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-black/5"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visibleOpenIds.length > 0 && (
        <div className="flex items-center gap-4 mb-6 px-1">
          <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)] cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleOpenSelected}
              onChange={toggleSelectAllVisible}
              className="rounded border-[var(--color-line)]"
            />
            Select all ({visibleOpenIds.length})
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-[var(--color-ink-soft)]">{selected.size} selected</span>
              <button
                onClick={reviewSelected}
                disabled={bulkDrafting}
                data-shoot="bulk-review"
                className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50"
              >
                {bulkDrafting
                  ? "Preparing…"
                  : `Review ${selected.size} ticket${selected.size === 1 ? "" : "s"}`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                disabled={bulkDrafting}
                className="text-xs text-[var(--color-ink-soft)] hover:underline"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
      {bulkSummary && (
        <div className="text-sm text-[var(--color-ink-soft)] mb-4 px-1">{bulkSummary}</div>
      )}

      {/* BULK REVIEW. Every issue that would be created, listed, before any
          of them is. The write targets exactly these findings — not the
          selection, which could have changed underneath. */}
      {bulkPreviews.length > 0 && (
        <div
          data-shoot="bulk-review-panel"
          className="mb-5 rounded-xl border border-[var(--color-line)] bg-black/[0.02] p-4 flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent)]">
              Review {bulkPreviews.length} issue{bulkPreviews.length === 1 ? "" : "s"} before filing
            </span>
            <span className="text-[11px] text-[var(--color-ink-soft)]">Nothing has been created yet.</span>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {bulkPreviews.map((b) => (
              <li
                key={b.id}
                className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs"
              >
                <div className="font-medium text-[var(--color-ink)]">{b.preview.title}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                  Team {b.preview.teamKey} · {b.preview.scopeName}
                  {b.preview.projectNames.length > 0
                    ? ` · ${b.preview.projectNames.join(", ")}`
                    : " · no project filter"}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={createSelectedInLinear}
              disabled={bulkDrafting}
              data-shoot="bulk-create-in-linear"
              className="i-btn-primary px-3.5 py-1.5 text-xs"
            >
              {bulkDrafting
                ? "Creating…"
                : `Create ${bulkPreviews.length} issue${bulkPreviews.length === 1 ? "" : "s"} in Linear`}
            </button>
            <button
              onClick={() => setBulkPreviews([])}
              disabled={bulkDrafting}
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

      {visible.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              onChange={updateFinding}
              selectable={f.status === "open"}
              selected={selected.has(f.id)}
              onToggleSelect={() => toggleSelect(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
