import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatReportGeneratedDate } from "../lib/reports/generatedAtPresentation";
import { describeSnapshot } from "../lib/reports/snapshot";

const utcRollover = "2026-09-28T00:15:00.000Z";
const sameInstantWithOffset = "2026-09-27T19:15:00.000-05:00";

assert.equal(formatReportGeneratedDate(utcRollover), "Sep 28, 2026");
assert.equal(
  formatReportGeneratedDate(sameInstantWithOffset),
  "Sep 28, 2026",
  "the displayed report date follows the immutable instant, not its serialized offset",
);

const chicagoCalendarDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
}).format(new Date(utcRollover));
assert.equal(chicagoCalendarDate, "Sep 27, 2026", "fixture crosses the deployed browser's local calendar boundary");
assert.notEqual(chicagoCalendarDate, formatReportGeneratedDate(utcRollover));

const verdict = describeSnapshot({
  generatedAt: new Date(utcRollover),
  snapshotLikelyDate: new Date("2026-10-17T00:00:00.000Z"),
  liveLikelyDate: new Date("2026-10-17T00:00:00.000Z"),
});
assert.match(verdict.line, /generated Sep 28, 2026/);

const reportsSource = readFileSync("components/ReportsPageClient.tsx", "utf8");
assert.match(
  reportsSource,
  /formatReportGeneratedDate\(r\.generatedAt\)/,
  "the History card must use the same explicit UTC convention as the snapshot banner",
);
assert.doesNotMatch(
  reportsSource,
  /\{formatTimestampDate\(r\.generatedAt\)\}/,
  "saved-report history must not inherit the browser's local calendar date",
);

console.log("PASS: saved-report history and snapshot provenance use one UTC date at local-midnight rollover.");
