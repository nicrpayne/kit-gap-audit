import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ScenarioBar from "../../components/portfolio/ScenarioBar";

const props = {
  dirty: false,
  saved: false,
  hasPendingTargets: false,
  saving: false,
  canCommit: false,
  overAllocated: false,
  capacityLines: [],
  namedTransferCount: 0,
  switchCostChanged: false,
  aggregateConversions: [],
  blockedCapacityScopes: [],
  blockedMoves: [],
  onCommit: () => {},
  onDiscard: () => {},
  onOpenAllocations: () => {},
  saveError: null,
  saveSummary: null,
};

test("Portfolio separates a saved what-if from unsaved edits and accepted Reality", () => {
  for (const saved of [true, false]) {
    const html = renderToStaticMarkup(
      React.createElement(ScenarioBar, { ...props, dirty: true, saved }),
    );
    assert.match(html, new RegExp(`Scenario · ${saved ? "saved" : "unsaved"}`));
    assert.doesNotMatch(html, new RegExp(`Scenario · ${saved ? "unsaved" : "saved"}`));
    assert.match(html, /Discard/);
  }
  for (const state of [{}, { hasPendingTargets: true }, { saved: true }]) {
    const html = renderToStaticMarkup(React.createElement(ScenarioBar, { ...props, ...state }));
    assert.match(html, />Reality</);
    assert.doesNotMatch(html, /Scenario · (saved|unsaved)/);
  }
});
