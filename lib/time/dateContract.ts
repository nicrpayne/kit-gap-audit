/**
 * Suite-wide date/time boundary.
 *
 * DateOnly is a calendar label. It is never interpreted in the browser's
 * timezone. Instant is a point on the UTC timeline and must be formatted in
 * an explicitly selected timezone.
 */

declare const dateOnlyBrand: unique symbol;
declare const instantBrand: unique symbol;

export type DateOnly = string & { readonly [dateOnlyBrand]: "DateOnly" };
export type Instant = string & { readonly [instantBrand]: "Instant" };

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_INSTANT_PATTERN = /T.*(?:Z|[+-]\d{2}:\d{2})$/i;

type DateOnlyInput = DateOnly | Date | string | number;
type CalendarFormatOptions = Pick<
  Intl.DateTimeFormatOptions,
  "weekday" | "era" | "year" | "month" | "day"
>;
type InstantFormatOptions = Intl.DateTimeFormatOptions & { timeZone: string };

function validDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/** Convert a canonical owner value to its UTC calendar day representation. */
export function toDateOnly(value: DateOnlyInput): DateOnly {
  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) {
    if (!validDateOnly(value)) throw new RangeError(`Invalid DateOnly value: ${value}`);
    return value as DateOnly;
  }
  if (typeof value === "string" && !OFFSET_INSTANT_PATTERN.test(value)) {
    throw new RangeError(`DateOnly source must be YYYY-MM-DD or an offset-bearing ISO timestamp: ${value}`);
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`Invalid date value: ${String(value)}`);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as DateOnly;
}

/** A Date exists here only as a UTC formatting carrier, never as local time. */
export function dateOnlyToUtcDate(value: DateOnlyInput): Date {
  const [year, month, day] = toDateOnly(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(
  value: DateOnlyInput,
  options: CalendarFormatOptions = { month: "short", day: "numeric" },
  locale = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(dateOnlyToUtcDate(value));
}

/** Accept only offset-bearing timestamps; a timezone-free datetime is ambiguous. */
export function toInstant(value: string | Date): Instant {
  if (value instanceof Date && !Number.isFinite(value.getTime())) throw new RangeError("Invalid Instant Date");
  const serialized = value instanceof Date ? value.toISOString() : value;
  if (!OFFSET_INSTANT_PATTERN.test(serialized)) {
    throw new RangeError(`Instant must include Z or an explicit UTC offset: ${serialized}`);
  }
  const date = new Date(serialized);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`Invalid Instant value: ${serialized}`);
  return date.toISOString() as Instant;
}

export function formatInstant(
  value: Instant | string | Date,
  options: InstantFormatOptions,
  locale = "en-US"
): string {
  const instant = toInstant(value);
  return new Intl.DateTimeFormat(locale, options).format(new Date(instant));
}
