import assert from "node:assert/strict";
import { controlRoomComposition } from "../lib/control-room/composition";
import { EMPTY_SCENARIO, type ProjectPayload } from "../lib/instrument/useProject";
import { makeSignalEstimate } from "../lib/scope/signalEstimates";

const items = Array.from({length:10},(_,n)=>({id:`JSA-${100+n}`,label:`Fictional ${n}`,low:1,likely:3,high:7,estimateSource:"issue_placeholder",kind:"ticket",state:"started",assignee:null,points:null,quote:null,rationale:null,parentIdentifier:null,parentTitle:null,projectName:"Fixture"}));
const capabilities = [items.slice(0,1),items.slice(1)].map((work,n)=>{
  const id=`cap-${n}`;
  return {id,name:id,description:null,status:"accepted",revision:1,workLinks:work.map(i=>({id:i.id,externalId:i.id,state:"active",externalUrl:null,provider:"linear"})),
    acceptedEstimate:makeSignalEstimate(id,1,{alreadyDone:"Fixture",reuseFrom:"",remainingWork:"Reviewed remainder",rationale:"Fixture only",evidenceReference:"fixture",asOfDate:"2026-10-08",reviewerDisplayName:"Fixture",range:n?{low:12,likely:15,high:18}:{low:3,likely:4,high:5},coveredOpenItemIds:work.map(i=>i.id),additionalOpenItemIds:[]},work.map(i=>i.id),`estimate-${n}`)};
});
const data={scopes:[{scopeId:"fixture",name:"Fixture",items,executionItems:items,completedWork:[],capabilities,teamCapacity:1,capacitySource:"explicit"}],people:[],allocations:[],contextSwitchCostPct:0} as unknown as ProjectPayload;
assert.equal(controlRoomComposition(data,EMPTY_SCENARIO)[0].days,19,"dashboard must not revive the 36.7d raw ticket sum");
const removed={...EMPTY_SCENARIO,bypassedFeatureIds:new Set(["capability:cap-0"]),excludedItemIds:new Set([items[0].id])};
assert.equal(controlRoomComposition(data,removed)[0].days,15,"removed card reduces exactly its reviewed effort");
assert.equal(controlRoomComposition(data,removed)[0].features,1);
assert.equal(controlRoomComposition(data,{...EMPTY_SCENARIO,capacityOverrideByScope:{fixture:2}})[0].days,9.5);
assert.equal(controlRoomComposition(data,EMPTY_SCENARIO)[0].days,19,"reset leaves accepted basis unchanged");
console.log("PASS Control Room/Scope reviewed composition: Reality19 not36.7, Scenario15 not33, current capacity and reset");
