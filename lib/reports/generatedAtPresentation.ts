import { formatInstant, toInstant } from "@/lib/time/dateContract";

/**
 * A saved report's generatedAt value is an Instant. Present its calendar
 * date in UTC everywhere so the immutable brief, snapshot banner, and
 * history index cannot disagree at a viewer's local midnight boundary.
 */
export function formatReportGeneratedDate(value: string | Date): string {
  return formatInstant(toInstant(value), {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
