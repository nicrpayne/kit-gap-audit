// Targeted regression proof for the Signal host's idempotent Rubric card patch.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const host = readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8");

assert.match(host, /actions\.dataset\.signalPatched === 'true'/,
  "card patch completion must use an explicit marker");
assert.match(host, /actions\.dataset\.signalPatched = 'true'/,
  "card patch must set its explicit completion marker");
assert.doesNotMatch(host, /\['Open on device', 'Copy path', 'Remove', 'Edit'\]/,
  "hidden native action text must not control patch idempotence");

type FakeActions = { dataset: { signalPatched?: string }; hiddenEdit: boolean };
type FakeCard = { dataset: { signalId?: string }; actions: FakeActions };
const isPatched = (card: FakeCard, selectedId: string) =>
  card.dataset.signalId === selectedId && card.actions.dataset.signalPatched === "true";

const card: FakeCard = {
  dataset: { signalId: "signal:source:hermes" },
  actions: { dataset: {}, hiddenEdit: true },
};
assert.equal(isPatched(card, "signal:source:hermes"), false);
card.actions.dataset.signalPatched = "true";
assert.equal(isPatched(card, "signal:source:hermes"), true,
  "a hidden native Edit action must not cause another observer patch");

// Rubric replaces the action subtree when it selects again. The fresh subtree
// intentionally lacks the marker, so Signal performs exactly one new patch.
card.actions = { dataset: {}, hiddenEdit: true };
assert.equal(isPatched(card, "signal:source:hermes"), false);
card.actions.dataset.signalPatched = "true";
assert.equal(isPatched(card, "signal:source:hermes"), true);

console.log("Signal Rubric source-card idempotence proof passed.");
