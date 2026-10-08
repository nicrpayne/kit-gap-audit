import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatDateOnly, formatInstantDate } from "../lib/time/dateContract";

// 20:12 on Oct 7 in Chicago is already Oct 8 in UTC. Live Now is an
// instant and must follow the user; forecast/target values are DateOnly and
// must not follow the user across that boundary.
const liveNow = "2026-10-08T01:12:00.000Z";
const chicagoNow = formatInstantDate(liveNow, {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const utcNow = formatInstantDate(liveNow, {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
assert.equal(chicagoNow, "Oct 7, 2026");
assert.equal(utcNow, "Oct 8, 2026");

for (const timezone of ["America/Chicago", "UTC", "Asia/Tokyo"]) {
  process.env.TZ = timezone;
  assert.equal(
    formatDateOnly("2026-10-08", { month: "short", day: "numeric", year: "numeric" }),
    "Oct 8, 2026",
    `${timezone}: canonical forecast/target day must not shift`,
  );
}

const pageSource = readFileSync(resolve(process.cwd(), "components/TimelinePageClient.tsx"), "utf8");
const transportSource = readFileSync(resolve(process.cwd(), "components/timeline/Transport.tsx"), "utf8");
assert(pageSource.includes("formatInstantDate(new Date(nowT)"), "Timeline formats Live Now as an instant");
assert(pageSource.includes(": fmtFull(playheadT ?? nowT)"), "historical playhead keeps the UTC DateOnly formatter");
assert(pageSource.includes("playheadDateLabel={playheadDateLabel}"), "Timeline passes one owner-formatted label to Transport");
assert(transportSource.includes("{playheadDateLabel}"), "Transport renders the same label as the embedded Timeline header");
assert(!transportSource.includes("fmtFull(playheadT)"), "Transport cannot independently drift back to UTC at Live Now");

console.log(JSON.stringify({
  liveInstant: liveNow,
  chicago: chicagoNow,
  utc: utcNow,
  canonicalForecastTarget: "Oct 8, 2026",
}, null, 2));
