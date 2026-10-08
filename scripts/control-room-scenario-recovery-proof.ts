import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ScenarioPreviewRefusal from '../components/instrument/ScenarioPreviewRefusal';

// Keep the boundary integration explicit: generic simulation failures (including
// dependency cycles) must retain the existing dependency recovery branch.
const page=readFileSync('components/ControlRoomPageClient.tsx','utf8');
const recovery=page.indexOf('if (m.scenarioPreviewRefusal)');
const ordinary=page.indexOf('if (!reading || !field || !m.startDate)');
assert.ok(recovery>=0 && recovery<ordinary);
const branch=page.slice(recovery,ordinary);
assert.match(branch, /<ScenarioPreviewRefusal[\s\S]*refusal=\{m\.scenarioPreviewRefusal\}[\s\S]*surface="Control Room"/);
assert.doesNotMatch(branch, /reviewScenarioAgainstCurrentReality|\.includes\(|\.match\(|\.test\(/);
assert.match(page.slice(ordinary), /href="\/scopes"[\s\S]*Fix project dependencies/);

// Render the actual shared recovery component: opening the library is a user
// action, the refusal stays visible, and merely rendering never resets a draft.
let resets=0;
const refusal={code:'stale_scenario_baseline' as const,message:'Inputs changed; retained draft requires review.',action:'Open Saved Scenarios for explicit review.',itemIds:[]};
const before=JSON.stringify(refusal);
const markup=renderToStaticMarkup(React.createElement(ScenarioPreviewRefusal,{refusal,surface:'Control Room',onBackToReality:()=>resets++}));
assert.match(markup,/role="alert"/);
assert.match(markup,/Control Room is not applying this Scenario/);
assert.match(markup,/saved-scenarios-open/);
assert.match(markup,/Your staged Scenario remains intact/);
assert.match(markup,/Back to Reality/);
assert.doesNotMatch(markup,/Fix project dependencies|role="dialog"/);
assert.equal(resets,0);
assert.equal(JSON.stringify(refusal),before);
for (const code of ['invalid_capacity_plan','stale_decision_plan','ambiguous_item_ownership'] as const) {
  const next={...refusal,code,action:`Specific recovery for ${code}`};
  const rendered=renderToStaticMarkup(React.createElement(ScenarioPreviewRefusal,{refusal:next,surface:'Control Room'}));
  assert.match(rendered,new RegExp(`Specific recovery for ${code}`));
  assert.match(rendered,/saved-scenarios-open/);
  assert.doesNotMatch(rendered,/Fix project dependencies/);
}
console.log('PASS: typed Scenario refusal uses shared explicit-review UI; dependency route retained; rendering preserves state.');
