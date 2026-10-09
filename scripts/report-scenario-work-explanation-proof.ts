import assert from "node:assert/strict";
import { countModeledSourceWork, scenarioWorkExplanation } from "../lib/reports/scenarioWorkExplanation";
const base = { executionItemIds:["JSA-100","JSA-101"], excludedItemIds:["JSA-100","knowledge-estimate:optional:signal:estimate"], includedItemIds:[], excludedCapabilityWorkIds:["JSA-100"] };
const explanation = scenarioWorkExplanation(base).join(" ");
assert.match(explanation, /Removed 1 tracked execution item from/);
assert.match(explanation, /Excluded 1 modeled estimate or finding input; these are not additional tickets/);
assert(!explanation.includes("Removed 2"));
assert.match(scenarioWorkExplanation({...base,excludedItemIds:[]}).join(" "),/Removed 1 tracked/);
assert.match(scenarioWorkExplanation({...base,includedItemIds:["JSA-101","JSA-101"]}).join(" "),/Added 1 mapped/);
assert.deepEqual(scenarioWorkExplanation({...base,excludedItemIds:[],excludedCapabilityWorkIds:[]}),[]);
const counts={scopeId:"jsa",modeledItemIds:["JSA-100","JSA-101","ZERO","finding:1","synthetic"],sourceItems:[
  ...["JSA-100","JSA-101","ZERO","LATER","COVERED-1","COVERED-2"].map(id=>({id,kind:"ticket"})),
  {id:"JSA-100",kind:"ticket"}, {id:"finding:1",kind:"finding"}, {id:"finding:2",kind:"finding"},
],appliedCapabilityEstimates:[]};
assert.deepEqual(countModeledSourceWork(counts),{remainingIssueCount:3,unticketedFindingCount:1});
assert.deepEqual(countModeledSourceWork({...counts,modeledItemIds:["ZERO"]}),{remainingIssueCount:1,unticketedFindingCount:0});
assert.deepEqual(countModeledSourceWork({...counts,modeledItemIds:["aggregate"],appliedCapabilityEstimates:[
  {scopeId:"jsa",replacedItemIds:["COVERED-1","COVERED-2","COVERED-1","synthetic"]},
  {scopeId:"other",replacedItemIds:["LATER"]},
  {scopeId:"jsa",replacedItemIds:["LATER"],review:{usedInSimulation:false}},
]}),{remainingIssueCount:2,unticketedFindingCount:0});
assert.deepEqual(countModeledSourceWork({...counts,modeledItemIds:[],appliedCapabilityEstimates:[]}),{remainingIssueCount:0,unticketedFindingCount:0});
assert.deepEqual(countModeledSourceWork({...counts,modeledItemIds:["COVERED-1","aggregate"],appliedCapabilityEstimates:[{scopeId:"jsa",replacedItemIds:["COVERED-1","COVERED-2"]}]}),{remainingIssueCount:2,unticketedFindingCount:0});
console.log("PASS report explanations and frozen source counts: add/cut/zero tickets, findings, duplicate coverage, applied aggregates, excluded/reference/other-project estimates; model rows stay separate");
