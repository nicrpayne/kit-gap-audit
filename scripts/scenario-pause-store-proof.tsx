import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_SCENARIO, openSavedScenario, pauseScenarioWorkspace, restorePausedScenario, resetScenarioWorkspace, recordScenarioSaved, useScenarioWorkspace, scenarioIsActive } from "../lib/instrument/useProject";
import { encodeSavedScenario, SAVED_SCENARIO_BASELINE_VERSION, type SavedScenarioDetail } from "../lib/scenario/saved";
import { SCENARIO_DRAFT_STORAGE_KEY, SCENARIO_PARKED_DRAFTS_KEY } from "../lib/scenario/workspaceRecovery";

const values = new Map<string, string>();
let quota = false;
const sessionStorage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { if (quota) throw new Error("quota"); values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
Object.defineProperty(globalThis, "window", { value: { sessionStorage }, configurable: true });
// The real store's current-input fetch stays pending. Pausing must not need a
// successful network response, and must not write any server business object.
const requests: string[] = [];
globalThis.fetch = ((url: string) => { requests.push(url); return new Promise(() => {}); }) as typeof fetch;
let snapshot: ReturnType<typeof useScenarioWorkspace>;
function Probe() { snapshot = useScenarioWorkspace(); return null; }
const state = () => { renderToStaticMarkup(<Probe />); return snapshot!; };
const payload = encodeSavedScenario({ ...EMPTY_SCENARIO, excludedItemIds: new Set(["DEMO-1"]), estimateOverrideByItemId: { "DEMO-2": { low: 2, likely: 3, high: 5 } } });
const detail: SavedScenarioDetail = {
  id: "saved-demo", name: "Original what-if", revision: 4, status: "active", payload,
  baseline: { version: SAVED_SCENARIO_BASELINE_VERSION, fingerprint: `sha256:${"a".repeat(64)}`, scopeRevisionById: {} },
  freshness: { state: "stale", stale: true, differences: [{ kind: "portfolio_inputs_changed" }] },
  levers: { total: 2, capacityPlans: 0, phasedTransfers: 0, capacityOverrides: 0, workChanges: 1, decisionChanges: 0, estimateChanges: 1, staffingChanges: 0, capabilityChanges: 0, scopeProposalChanges: 0, draftCapabilities: 0 },
  createdAt: "2026-11-03T12:00:00Z", updatedAt: "2026-11-03T12:00:00Z", archivedAt: null, archiveReason: null,
};
openSavedScenario(detail);
const original = state();
assert(scenarioIsActive(original.scenario));
pauseScenarioWorkspace();
const paused = state();
assert(!scenarioIsActive(paused.scenario));
assert.equal(paused.scenarioBaseline, null);
assert.equal(paused.savedScenario, null);
assert.equal(paused.parkedDrafts.length, 1);
assert.deepEqual(paused.parkedDrafts[0].draft.payload, payload);
assert.deepEqual(paused.parkedDrafts[0].draft.baseline, detail.baseline);
assert.equal(paused.parkedDrafts[0].draft.saved?.revision, 4);
assert.equal(sessionStorage.getItem(SCENARIO_DRAFT_STORAGE_KEY), null);
assert(sessionStorage.getItem(SCENARIO_PARKED_DRAFTS_KEY));
assert.doesNotThrow(() => recordScenarioSaved(detail, JSON.stringify(payload), original.draftGeneration), "late save reply must not encode an empty active workspace or reattach the old draft");
assert.equal(state().savedScenario, null);
restorePausedScenario(paused.parkedDrafts[0].id);
const restored = state();
assert.deepEqual(encodeSavedScenario(restored.scenario), payload);
assert.deepEqual(restored.scenarioBaseline, original.scenarioBaseline);
assert.deepEqual(restored.savedScenario, original.savedScenario);
assert.equal(restored.scenarioDirty, original.scenarioDirty);
assert.match(restored.inputVerificationError!, /Checking/);
assert.throws(() => restorePausedScenario(paused.parkedDrafts[0].id), /Pause or save/);
quota = true;
assert.throws(() => pauseScenarioWorkspace(), /active Scenario is unchanged/);
assert.deepEqual(state().scenario, restored.scenario);
quota = false;
pauseScenarioWorkspace();
assert.equal(state().parkedDrafts.length, 2);
resetScenarioWorkspace();
assert.equal(state().parkedDrafts.length, 2, "ordinary reset must not erase paused backups");
assert.throws(() => restorePausedScenario("missing"), /no longer available/);
assert(requests.length > 0 && requests.every(path => path === "/api/instrument/project"));
console.log("PASS actual Scenario store: verified pause, exact reopen, original baseline, late-response isolation, quota preservation, no persistent API writes");
