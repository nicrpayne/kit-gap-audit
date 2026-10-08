import type { EvidenceItem, JsonValue } from "@/lib/context/package";

type EvidenceMetadataInput = Pick<EvidenceItem, "data" | "extra" | "independence">;

/** Read producer-supplied source dates only. Retrieval/acceptance timestamps
 * must never become the date the quoted statement was made. */
export function evidenceSourceDate(item: EvidenceMetadataInput): string | null {
  for (const source of [item.data, item.extra]) {
    for (const key of ["occurredAt", "meeting_date", "meetingDate", "source_date", "sourceDate"]) {
      const value = source?.[key];
      if (typeof value !== "string") continue;
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) continue;
      const day = value.slice(0, 10);
      const parsedDay = new Date(`${day}T00:00:00Z`);
      if (!Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) continue;
      if (!Number.isFinite(Date.parse(value))) continue;
      return value;
    }
  }
  return null;
}

/** Canonical field names for the bridge's two supported locator spellings.
 * Values are preserved, not recomputed or silently assigned a different unit. */
export function evidenceAnchor(item: EvidenceMetadataInput): Record<string, JsonValue> {
  const fields = {
    quoteHash: ["quoteHash", "passageHash"],
    charStart: ["charStart", "char_start"],
    charEnd: ["charEnd", "char_end"],
    offsetUnit: ["offsetUnit", "offset_unit"],
    primaryAnchor: ["primaryAnchor", "primary_anchor"],
  };
  const out: Record<string, JsonValue> = {};
  for (const source of [item.data, item.extra]) {
    for (const [field, aliases] of Object.entries(fields)) {
      if (out[field] !== undefined) continue;
      for (const alias of aliases) {
        const value = source?.[alias];
        if (value !== undefined && value !== null) {
          out[field] = value;
          break;
        }
      }
    }
  }
  return out;
}

export function evidenceIndependence(item: EvidenceMetadataInput): string | null {
  if (typeof item.independence === "string") return item.independence;
  return typeof item.data?.independence === "string" ? item.data.independence : null;
}
