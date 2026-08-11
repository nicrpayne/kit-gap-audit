"use client";

import { useState } from "react";
import Link from "next/link";

export interface DecisionRow {
  id: string;
  title: string;
  quote: string;
  owner: string | null;
  blocks: string | null;
  blocking: boolean;
  createdAt: string;
  sourceId: string | null;
  sourceTitle: string;
}

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function DecisionCard({
  decision,
  onResolved,
}: {
  decision: DecisionRow;
  onResolved: (id: string) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!resolution.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${decision.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to resolve.");
      }
      onResolved(decision.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div
      className={`border rounded-xl bg-[var(--color-card)] p-5 ${
        decision.blocking ? "border-[var(--color-danger)]/40" : "border-[var(--color-line)]"
      }`}
    >
      <h3 className="font-display text-lg mb-2">{decision.title}</h3>
      <p className="text-sm italic text-[var(--color-ink-soft)] border-l-2 border-[var(--color-line)] pl-3 mb-3">
        &ldquo;{decision.quote}&rdquo;
      </p>
      <div className="grid grid-cols-2 gap-y-1 text-xs text-[var(--color-ink-soft)] mb-4">
        <div>Owner: {decision.owner ?? <span className="italic">unassigned</span>}</div>
        <div>Age: {ageLabel(decision.createdAt)}</div>
        <div className="col-span-2">Blocks: {decision.blocks ?? <span className="italic">not specified</span>}</div>
        <div className="col-span-2">
          Source:{" "}
          {decision.sourceId ? (
            <Link href={`/audit/${decision.sourceId}`} className="text-[var(--color-accent)] hover:underline">
              {decision.sourceTitle}
            </Link>
          ) : (
            <span>{decision.sourceTitle}</span>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-[var(--color-danger)] mb-3">{error}</div>}

      {!resolving ? (
        <button
          onClick={() => setResolving(true)}
          className="rounded-md bg-[var(--color-accent)] text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-accent-dark)]"
        >
          Mark resolved
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="What was decided? (fed to future audits as handled context)"
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy || !resolution.trim()}
              className="rounded-md bg-[var(--color-accent)] text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setResolving(false)}
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

export default function DecisionQueue({ initialDecisions }: { initialDecisions: DecisionRow[] }) {
  const [decisions, setDecisions] = useState(initialDecisions);

  function onResolved(id: string) {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
  }

  const blocking = decisions.filter((d) => d.blocking);
  const nonBlocking = decisions.filter((d) => !d.blocking);

  if (decisions.length === 0) {
    return (
      <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
        No open decisions.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {blocking.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-danger)] mb-3">
            Blocking ({blocking.length})
          </h2>
          <div className="space-y-4">
            {blocking.map((d) => (
              <DecisionCard key={d.id} decision={d} onResolved={onResolved} />
            ))}
          </div>
        </section>
      )}
      {nonBlocking.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)] mb-3">
            Non-blocking ({nonBlocking.length})
          </h2>
          <div className="space-y-4">
            {nonBlocking.map((d) => (
              <DecisionCard key={d.id} decision={d} onResolved={onResolved} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
