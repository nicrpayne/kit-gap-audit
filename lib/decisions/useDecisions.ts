"use client";

// THE DECISION CIRCUIT'S DATA LAYER.
//
// Decisions are Reality, so every write here goes through mutateReality
// (lib/instrument/reality.ts). That is not a style choice: deciding
// something removes a gate from the forecast, and Forecast three clicks
// later must answer with the new truth rather than the truth it happened
// to fetch on page load. The same revision bus that carries a capacity
// commit from Portfolio carries this.
//
// The decisions payload itself also re-reads on that bus, so two surfaces
// that both change Reality stay in agreement without a refresh.

import { useCallback, useEffect, useState } from "react";
import { mutateReality, subscribeReality } from "@/lib/instrument/reality";
import type { DecisionsPayload } from "./model";

export interface DecisionsModel {
  data: DecisionsPayload | null;
  loading: boolean;
  error: string | null;
  /** Re-read the decisions payload alone. Reality-wide invalidation is the
      job of mutateReality; this is the local half of the same refresh. */
  refresh: () => Promise<void>;
  /** Fetch + invalidate shared truth + re-read. Returns the parsed body so
      callers can surface a duplicate warning or a validation failure. */
  write: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; body: Record<string, unknown> }>;
}

export function useDecisions(): DecisionsModel {
  const [data, setData] = useState<DecisionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/decisions", { cache: "no-store" });
      if (!res.ok) throw new Error(`Decisions unavailable (${res.status})`);
      setData((await res.json()) as DecisionsPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decisions unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Another instrument changing Reality can change what a Decision means --
  // a Scope's target moving changes what "needed by" is measured against --
  // so this payload participates in the same invalidation everything else
  // does rather than trusting its first read forever.
  useEffect(() => subscribeReality(() => void refresh()), [refresh]);

  const write = useCallback<DecisionsModel["write"]>(
    async (url, init) => {
      const res = await mutateReality(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        /* a 204 or a non-JSON error page is not a parse failure worth surfacing */
      }
      // mutateReality already invalidated shared truth on success, which
      // brings this payload back through the subscription above; the
      // explicit refresh covers the failure path and keeps the caller's
      // await meaningful.
      if (!res.ok) await refresh();
      return { ok: res.ok, status: res.status, body };
    },
    [refresh]
  );

  return { data, loading, error, refresh, write };
}
