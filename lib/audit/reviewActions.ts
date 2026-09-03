"use client";

// The one Finding-action dispatcher used by both the retired Audit viewport
// and the Rubric-powered Audit World. Business meaning stays in actions.ts;
// this module owns only the existing confirmed API routes.

import type { ActionId } from "./actions";
import { mutateReality } from "@/lib/instrument/reality";

export async function dispatchFindingAction(
  id: ActionId,
  findingId: string,
  text: string
): Promise<{ ok: boolean; message: string }> {
  switch (id) {
    case "open_decision": {
      const res = await mutateReality(`/api/findings/${findingId}/open-decision`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
      return res.ok
        ? { ok: true, message: body.note ?? "Decision opened." }
        : { ok: false, message: body.error ?? "The decision could not be opened." };
    }
    case "add_missing_work": {
      const res = await fetch(`/api/findings/${findingId}/ticket`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; preview?: { title?: string } };
      if (body.preview) {
        return {
          ok: false,
          message: `Preview ready — "${body.preview.title}". Filing to Linear needs explicit confirmation, which lands with the ticket-confirmation tranche.`,
        };
      }
      return { ok: false, message: body.error ?? "The ticket preview could not be composed." };
    }
    case "record_resolution": {
      const res = await mutateReality(`/api/findings/${findingId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Recorded. The finding is resolved." }
        : { ok: false, message: body.error ?? "That could not be recorded." };
    }
    case "reject": {
      const res = await mutateReality(`/api/findings/${findingId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Dismissed with your reason." }
        : { ok: false, message: body.error ?? "A reason is required to dismiss a finding." };
    }
    default:
      return { ok: false, message: "That action is not wired up." };
  }
}
