import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DecisionInspector from "../components/decisions/DecisionInspector";

// tsx uses classic JSX for imported TSX; the Next build supplies its own runtime.
Object.assign(globalThis, { React });

const props = {
  decision: null, candidate: null, assumed: false, busy: false, attachTargets: [],
  onClose: () => {}, onAssume: () => {}, onConnect: () => {}, onDisconnect: async () => {},
  onUpdate: async () => {}, onAcceptCandidate: () => {}, onDismissCandidate: () => {}, onAttachToExisting: () => {},
};
const error = 'Knowledge changed. Review the current source <before retrying>.';
const html = renderToStaticMarkup(<DecisionInspector {...props} candidateError={error} />);
assert.match(html, /role="alert"/);
assert.match(html, /data-shoot="candidate-action-error"/);
assert.match(html, /Knowledge changed\. Review the current source &lt;before retrying&gt;\./);
assert.match(html, /inspector-empty/);
const clean = renderToStaticMarkup(<DecisionInspector {...props} candidateError={null} />);
assert(!clean.includes('candidate-action-error'));
console.log('PASS: candidate failure is announced and escaped even if refreshed data removes the selected stale candidate; no phantom alert without an error');
