/**
 * Resolve the one snapshot a current-world projection may read while retaining
 * the complete immutable list for provenance lookups.
 *
 * Selection is by the package pointer resolved upstream, never by creation
 * order. A missing selected row is an inconsistent read, so it fails closed
 * instead of silently reviving whichever historical snapshot happens to be
 * newest.
 */
export function selectCurrentSnapshotFromHistory<T extends { id: string }>(
  history: readonly T[],
  currentSnapshotId: string | null
): T | null {
  if (currentSnapshotId === null) return null;
  const selected = history.find((snapshot) => snapshot.id === currentSnapshotId);
  if (!selected) {
    throw new Error(
      "Current knowledge is still being processed. Retry after the refresh completes; historical evidence has been retained."
    );
  }
  return selected;
}
