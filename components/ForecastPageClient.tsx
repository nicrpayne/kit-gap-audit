"use client";

import { useEffect, useState } from "react";
import Link from "@/components/instrument/SignalLink";
import ForecastView from "./ForecastView";

interface ScopeOption {
  id: string;
  name: string;
}

export default function ForecastPageClient() {
  const [scopes, setScopes] = useState<ScopeOption[] | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scopes")
      .then((res) => res.json())
      .then((body) => {
        setScopes(body.scopes);
        if (body.scopes[0]) setSelectedScopeId(body.scopes[0].id);
      });
  }, []);

  if (scopes === null) {
    return <div className="text-sm text-[var(--color-ink-soft)]">Loading…</div>;
  }

  if (scopes.length === 0) {
    return (
      <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
        No Scope configured yet.{" "}
        <Link href="/scopes" className="text-[var(--color-accent)] hover:underline">
          Add one
        </Link>{" "}
        to see a forecast.
      </div>
    );
  }

  return (
    <div>
      {scopes.length > 1 && (
        <div className="mb-6">
          <select
            value={selectedScopeId ?? ""}
            onChange={(e) => setSelectedScopeId(e.target.value)}
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selectedScopeId && <ForecastView scopeId={selectedScopeId} />}
    </div>
  );
}
