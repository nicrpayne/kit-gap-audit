import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DATE_ONLY_PATTERN,
  formatDateOnly,
  formatInstant,
  toDateOnly,
  toInstant,
} from "../lib/time/dateContract";

const timezones = [
  "America/Chicago",
  "UTC",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
] as const;

const dateOnlyFixture = {
  likely: ["2026-09-18T03:03:40.000Z", "2026-09-18"],
  windowStart: ["2026-09-12T00:00:00.000Z", "2026-09-12"],
  windowEnd: ["2026-09-23T23:59:59.999Z", "2026-09-23"],
  target: ["2026-11-15T00:00:00.000Z", "2026-11-15"],
  milestoneDstStart: ["2026-03-08T00:00:00.000Z", "2026-03-08"],
  milestoneDstEnd: ["2026-11-01T00:00:00.000Z", "2026-11-01"],
  historicalReportYearBoundary: ["2027-01-01T00:00:00.000Z", "2027-01-01"],
  monthBoundary: ["2026-10-01T00:00:00.000Z", "2026-10-01"],
} as const;

const surfaces = [
  "Control Room",
  "Reports",
  "Forecast",
  "Portfolio/Capacity",
  "Scope",
  "Timeline",
] as const;

for (const timezone of timezones) {
  process.env.TZ = timezone;
  for (const [label, [raw, expected]] of Object.entries(dateOnlyFixture)) {
    assert.equal(toDateOnly(raw), expected, `${timezone}: ${label} serialization`);
    assert(DATE_ONLY_PATTERN.test(toDateOnly(raw)), `${timezone}: ${label} is an ISO calendar day`);
    const rendered = surfaces.map(() => formatDateOnly(raw, { month: "short", day: "numeric" }));
    assert.equal(new Set(rendered).size, 1, `${timezone}: ${label} agrees across all consumers`);
  }
  assert.equal(
    toDateOnly(dateOnlyFixture.likely[0]),
    "2026-09-18",
    `${timezone}: the production-shaped likely outcome never falls back to Sep 17`
  );
}

// An instant keeps its offset-bearing identity and is deliberately rendered
// in a named timezone. Unlike DateOnly, the visible calendar day may differ.
const instant = toInstant("2026-09-18T03:30:00.000Z");
const chicago = formatInstant(instant, {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const tokyo = formatInstant(instant, {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
assert.notEqual(chicago, tokyo, "instants retain intentional timezone-aware rendering");
assert.match(chicago, /09\/17\/2026/);
assert.match(tokyo, /09\/18\/2026/);
assert.throws(() => toDateOnly("2026-09-18T03:30:00"), /offset-bearing/);
assert.throws(() => toInstant("2026-09-18T03:30:00"), /explicit UTC offset/);

// Guard the real production surfaces, not only the helper. Each owner
// consumer must import the suite-wide date-only formatter.
const migratedConsumers = [
  "components/ControlRoomPageClient.tsx",
  "components/control-room/CommandWorkspace.tsx",
  "components/control-room/Inspector.tsx",
  "components/control-room/ProjectField.tsx",
  "components/ReportsPageClient.tsx",
  "components/ForecastView.tsx",
  "components/instrument/ForecastInstrument.tsx",
  "components/instrument/LivingForecast.tsx",
  "components/portfolio/ForecastField.tsx",
  "components/portfolio/ScenarioInspector.tsx",
  "components/PortfolioPageClient.tsx",
  "components/instrument/ScopeInstrument.tsx",
  "lib/timeline/geometry.ts",
] as const;
for (const path of migratedConsumers) {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  assert(source.includes("@/lib/time/dateContract"), `${path} imports the canonical date contract`);
}

console.log(JSON.stringify({
  result: "DATE CONTRACT VERIFIED",
  timezones,
  surfaces,
  canonicalLikelyDay: toDateOnly(dateOnlyFixture.likely[0]),
  boundaries: Object.fromEntries(Object.entries(dateOnlyFixture).map(([key, [, expected]]) => [key, expected])),
  instantProof: { chicago, tokyo },
}, null, 2));
