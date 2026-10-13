export interface AuditPassageRecord {
  id: string;
  excerpt: string;
  sourceRef?: string | null;
  observedAt?: string | null;
  kind: string;
}

/** Presentation only: identical words from the same known source are one
 * displayed passage, not independent corroboration. Keep every original
 * record/date available for inspection; never merge unknown sources. */
export function groupAuditPassages(records: readonly AuditPassageRecord[]) {
  const groups = new Map<string, { key: string; passage: AuditPassageRecord; records: AuditPassageRecord[] }>();
  for (const [index, record] of records.entries()) {
    const key = record.sourceRef
      ? JSON.stringify([record.sourceRef, record.excerpt])
      : JSON.stringify([null, record.id, index]);
    const group = groups.get(key);
    if (group) group.records.push(record);
    else groups.set(key, { key, passage: record, records: [record] });
  }
  return [...groups.values()];
}
