"use client";

import { useState } from "react";
import FindingCard, { FindingData } from "./FindingCard";

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

  async function draftSelected() {
    const ids = Array.from(selected).filter((id) =>
      findings.find((f) => f.id === id && f.status === "open")
    );
    if (ids.length === 0) return;

    setBulkDrafting(true);
    setBulkSummary(null);

    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/findings/${id}/ticket`, { method: "POST" }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to create ticket.");
        }
        return res.json();
      }))
    );

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

    setBulkSummary(
      failed === 0
        ? `Drafted ${succeeded} ticket${succeeded === 1 ? "" : "s"}.`
        : `Drafted ${succeeded} of ${ids.length} tickets. ${failed} failed — try those individually to see the specific error.`
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
                onClick={draftSelected}
                disabled={bulkDrafting}
                className="i-btn-primary px-3 py-1.5 text-xs"
              >
                {bulkDrafting ? "Drafting…" : `Draft ${selected.size} ticket${selected.size === 1 ? "" : "s"}`}
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
