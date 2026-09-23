import assert from "node:assert/strict";
import { forecastCapability, staffingFte } from "../lib/scope/capabilityForecast";

const range = { low: 8, likely: 10.5, high: 13 };
const start = new Date("2026-09-23T00:00:00.000Z");
const target = new Date("2026-10-31T00:00:00.000Z");
const jamesHalfTime = { contributors: [{ personId: "james", name: "James", fte: 0.5 }] };
const jamesFullTime = { contributors: [{ personId: "james", name: "James", fte: 1 }] };

assert.equal(staffingFte(jamesHalfTime), 0.5);
assert.equal(forecastCapability("notifications", range, null, start, target), null, "an unstaffed card must not fabricate a schedule");

const first = forecastCapability("notifications", range, jamesHalfTime, start, target);
const repeat = forecastCapability("notifications", range, jamesHalfTime, start, target);
const faster = forecastCapability("notifications", range, jamesFullTime, start, target);

assert.ok(first && repeat && faster);
assert.deepEqual(repeat, first, "the card forecast must be deterministic across renders and reports");
assert.ok(faster.likelyScheduleDays < first.likelyScheduleDays, "more focused FTE must shorten the isolated card schedule");
assert.ok(new Date(faster.likelyDate).getTime() < new Date(first.likelyDate).getTime(), "more focused FTE must move the likely date earlier");
assert.equal(first.staffingFte, 0.5);
assert.ok(first.confidenceAtTarget !== null);

console.log("Scope capability forecast proof passed: unstaffed cards stay blank, seeded outcomes are stable, and focused capacity moves the isolated landing window.");
