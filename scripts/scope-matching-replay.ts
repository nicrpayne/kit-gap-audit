import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {compileScopeProposal, type CompiledScopeProposal} from '../lib/scope/proposal';
import {toContextPackage} from '../lib/bootstrap/refresh';
import type {ProjectBootstrapPackageV1} from '../lib/bootstrap/contracts';
import type {ProjectPayload} from '../lib/instrument/useProject';
import type {LinearIssueSummary} from '../lib/linear';

const dir=resolve(process.argv[2]);
const read=(name:string)=>JSON.parse(readFileSync(resolve(dir,name),'utf8'));
const project=read('instrument.json') as ProjectPayload;
const summaries=[];
for(const name of ['iTrack','JSA']){
  const key=name.toLowerCase();
  const scope=project.scopes.find(s=>s.name===name)!;assert(scope);
  const original=JSON.stringify(scope);
  const bootstrap=read(key+'-bootstrap.json');
  const pkg=toContextPackage(scope.scopeId,bootstrap.activePackage.package as ProjectBootstrapPackageV1);
  const before=read(key+'-proposal-before.json').proposal as CompiledScopeProposal & {contextSnapshotId:string};
  const issues:LinearIssueSummary[]=(scope.executionItems??[]).map(w=>({
    identifier:w.id,title:w.label.replace(new RegExp(`^${w.id}\\s+`),''),url:w.externalUrl??null,
    description:null,state:w.state??'Unknown',stateType:'unstarted',estimate:w.points??null,
    labels:[],completedAt:null,updatedAt:w.updatedAt??null,assignee:w.assignee??null,
    parentIdentifier:w.parentIdentifier??null,parentTitle:w.parentTitle??null,projectName:w.projectName??null,
  }));
  const leafIds=issues.map(i=>i.identifier).sort();
  for(const work of [...issues])if(work.parentIdentifier&&!issues.some(i=>i.identifier===work.parentIdentifier))issues.push({
    ...work,identifier:work.parentIdentifier,title:work.parentTitle??work.parentIdentifier,parentIdentifier:null,parentTitle:null,
  });
  const capabilities=(scope.capabilities??[]).map(c=>({id:c.id,name:c.name,description:c.description,status:c.status,revision:c.revision,workLinks:c.workLinks.map(w=>({externalId:w.externalId,state:w.state}))}));
  const result=compileScopeProposal({includeTriage:false,issues,capabilities,activeReleaseNames:[before.sourceWatermark.activeRelease.name!],snapshot:{
    id:before.sourceWatermark.contextSnapshotId!,packageId:pkg.packageId,packageVersion:pkg.version,producer:pkg.producer,
    contextHash:before.sourceWatermark.contextHash!,createdAt:new Date(before.sourceWatermark.contextAcceptedAt!),
    completenessSummary:before.sourceWatermark.completeness,package:pkg,
  }});
  const represented=new Set(result.items.flatMap(i=>[...i.workItemIds,...i.provenance.claimedElsewhere.map(w=>w.identifier)]));
  assert.deepEqual([...represented].sort(),leafIds,'Every current executable item must stay visible, including governed ownership exclusions');
  assert.equal(JSON.stringify(scope),original,'No accepted data mutation');
  if(name==='iTrack'){
    assert.deepEqual(result.items.find(i=>i.title==='iTrack Quality')?.workItemIds,[]);
    assert(!result.items.some(i=>/^JSA /.test(i.title)));
    assert.equal(result.items.find(i=>i.workItemIds.includes('SOF-837'))?.title,'Light / Dark mode review');
    assert.equal(result.items.find(i=>i.workItemIds.includes('SOF-953'))?.provenance.linearParent?.identifier,'SOF-952');
    assert.equal(new Set(result.items.flatMap(i=>i.workItemIds)).size,45);
  }
  writeFileSync(resolve(dir,key+'-proposal-after.json'),JSON.stringify(result,null,2),{mode:0o600});
  summaries.push({project:name,leafCount:leafIds.length,represented:represented.size,beforeItems:before.items.length,afterItems:result.items.length,
    excludedOtherProjectRefs:result.sourceWatermark.contextOtherProjectRefCount,summary:result.summary,
    candidates:result.items.map(i=>({title:i.title,target:i.targetCapabilityId,work:i.workItemIds.length,refs:i.provenance.contextRefs.length,action:i.action})),
  });
}
const report={status:'PASS',readOnly:true,compiler:'2.5',boundary:'Replay uses actual captured knowledge and current executable work; parent titles reconstructed from instrument data. Original issue descriptions, labels and hidden parent ancestors are unavailable in this API export. Separate synthetic regressions cover description contamination.',summaries};
writeFileSync(resolve(dir,'real-replay-proof.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));
