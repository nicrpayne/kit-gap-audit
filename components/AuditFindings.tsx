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

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const visible = activeFilter?.types
    ? findings.filter((f) => activeFilter.types!.includes(f.type))
    : findings;

  function updateFinding(updated: FindingData) {
    setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => {
          const count = f.types ? findings.filter((x) => f.types!.includes(x.type)).length : findings.length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                filter === f.key
                  ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
                  : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-black/5"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((f) => (
            <FindingCard key={f.id} finding={f} onChange={updateFinding} />
          ))}
        </div>
      )}
    </div>
  );
}
