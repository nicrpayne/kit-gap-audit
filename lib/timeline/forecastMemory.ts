import type { ForecastSnapshot } from "./entries";

/** Last recorded belief at or before T. Pure client-safe projection; never
 * import the Timeline's database/provider loader into a client component. */
export function forecastMemoryAt(snapshots: ForecastSnapshot[], at: Date): ForecastSnapshot | null {
  let found: ForecastSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (new Date(snapshot.generatedAt).getTime() <= at.getTime()) found = snapshot;
    else break;
  }
  return found;
}
