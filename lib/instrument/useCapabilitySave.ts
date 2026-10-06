"use client";
import { useRef } from "react";
import { capabilityWriteIntent } from "@/lib/scope/writeIntent";
import { invalidateReality } from "@/lib/instrument/reality";

export function useCapabilitySave() {
  const keys = useRef(new Map<string, string>());
  const busy = useRef(false);
  return async (scopeId: string, capabilityId: string | null, input: Parameters<typeof capabilityWriteIntent>[2]) => {
    if (busy.current) throw new Error("A save is already being checked. Please wait.");
    busy.current = true;
    const intent = capabilityWriteIntent(capabilityId ? "edit" : "create", capabilityId ?? scopeId, input);
    const key = keys.current.get(intent) ?? crypto.randomUUID();
    keys.current.set(intent, key);
    try {
      let message = "Signal could not confirm this save. Your draft is still here. Retry the same save safely.";
      try {
        const response = await fetch(capabilityId ? `/api/capabilities/${capabilityId}` : `/api/scopes/${scopeId}/capabilities`, {
          method: capabilityId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, idempotencyKey: key }), signal: AbortSignal.timeout(45_000),
        });
        const body = await response.json();
        if (response.ok && body.capability?.id) {
          invalidateReality();
          return body as { refreshWarning?: string | null };
        }
        if (response.status < 500) {
          message = body.error ?? "This change needs review before it can be saved.";
        }
      } catch { /* A lost reply is not proof that the write failed. Read its receipt. */ }
      try {
        const response = await fetch(`/api/scopes/${scopeId}/capability-receipt?key=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        const { receipt } = await response.json();
        if (response.ok && receipt?.committed && receipt.intent === intent) {
          invalidateReality();
          return { refreshWarning: "Saved change confirmed. Reload if coverage has not caught up yet." };
        }
      } catch { /* Preserve the draft and the retry key while confirmation is unavailable. */ }
      throw new Error(message);
    } finally { busy.current = false; }
  };
}
