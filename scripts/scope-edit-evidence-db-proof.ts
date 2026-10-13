import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { updateCanonicalCapability } from "../lib/scope/reality";
import { freezeScopeEvidence } from "../lib/reports/scopeEvidence";
import { loadCapabilityAuditEvidenceOrigins } from "../lib/scope/capabilityEvidenceReadModel";
import { buildPortfolioInputs } from "../lib/forecast/compute";

const url = new URL(process.env.DATABASE_URL ?? "file:///missing");
assert(process.env.SCOPE_SAVE_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && url.username === "signal_t0_local" && ["/signal_t0_test_1008", "/signal_t0_test_1012"].includes(url.pathname), "Isolated evidence repair database required");
process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;

async function main() {
  const scope = await prisma.scope.create({data:{name:`Evidence edit proof ${randomUUID()}`,teamKey:"JSA",projectNames:["KIT JSA"],teamCapacity:1,executionState:"configured"}});
  const evidence=[{id:"fixture-passage",excerpt:"This exact original quote must survive.",sourceRef:"fixture://meeting",observedAt:"2026-09-30",kind:"transcript"}];
  try {
    const pkg={version:"1.1",packageId:randomUUID(),producer:"manual",scopeId:scope.id,generatedAt:"2026-10-08T12:00:00Z",sources:[{sourceRef:"fixture://meeting",sourceType:"transcript",registrationId:null,role:"raw_evidence",status:"active",observedAt:"2026-09-30T12:00:00Z",succeeded:true,detail:null}],evidence:[{...evidence[0],data:{occurredAt:"2026-09-30",charStart:10,charEnd:54,offsetUnit:"utf16_code_unit"}}],derivedClaims:[],completeness:{expectedSources:[],missingSources:[],excludedSources:[]},warnings:[]};
    const snapshot=await prisma.contextSnapshot.create({data:{scopeId:scope.id,producer:"manual",packageId:pkg.packageId,packageVersion:"1.1",contextHash:pkg.packageId,completenessSummary:{},package:pkg}});
    const audit=await prisma.auditRun.create({data:{contextSnapshotId:snapshot.id,issueCount:0,findingCount:0,model:"fixture"}});
    const capability = await prisma.capability.create({data:{scopeId:scope.id,name:"Fictional optional capability",provenance:{}}});
    const proposal=await prisma.auditChangeProposal.create({data:{scopeId:scope.id,auditRunId:audit.id,contextSnapshotId:snapshot.id,fingerprint:randomUUID(),category:"scope",owner:"Scope",changeType:"add",title:"Fixture",summary:"Fixture only",whyProposed:"Fixture only",currentState:{},proposedState:{},evidence,currentness:"current",retrievalBasis:"fixture",relevanceReason:"fixture",status:"accepted",canonicalObjectType:"Capability",canonicalObjectId:capability.id,acceptedAt:new Date("2026-10-08T12:30:00Z")}});
    const provenance={auditChangeProposalId:proposal.id,auditRunId:audit.id,contextSnapshotId:snapshot.id,evidence};
    await prisma.capability.update({where:{id:capability.id},data:{provenance}});
    const idempotencyKey = randomUUID();
    const input = {expectedRevision:1,name:capability.name,description:capability.description,note:"Only link the fictional ticket",evidence:[],work:[{externalId:"JSA-100",title:"Fictional work",externalUrl:null,state:"In Progress",updatedAt:null}],idempotencyKey};
    const saved = await updateCanonicalCapability(capability.id,input);
    assert.equal(saved.capability.workLinks.length,1);
    assert.deepEqual(saved.capability.provenance,provenance,"the exact editor request preserves original IDs and quote");
    const event = await prisma.capabilityEvent.findUniqueOrThrow({where:{idempotencyKey}});
    const after = event.afterState as Record<string,any>;
    assert.deepEqual(after.provenance,provenance);
    assert.equal(after.operatorEdit.note,input.note,"edit note is retained separately from the source receipt");
    assert.equal(after.operatorEdit.source,"manual");
    const replay = await updateCanonicalCapability(capability.id,input);
    assert.equal(replay.changed,false);
    assert.equal(await prisma.capabilityEvent.count({where:{idempotencyKey}}),1);
    const ref={ref:"fixture://additional-evidence",suppliedBy:"operator"};
    const added = await updateCanonicalCapability(capability.id,{expectedRevision:2,evidence:[ref],note:"Additional reference",idempotencyKey:randomUUID()});
    assert.deepEqual(added.capability.provenance,{...provenance,operatorEvidence:[ref]});
    const moved = await updateCanonicalCapability(capability.id,{expectedRevision:3,status:"outside",evidence:[],note:"Outside for now",idempotencyKey:randomUUID()});
    assert.deepEqual(moved.capability.provenance,added.capability.provenance);
    await assert.rejects(updateCanonicalCapability(capability.id,{expectedRevision:1,evidence:[],idempotencyKey:randomUUID()}),/another session/);
    const origins=await loadCapabilityAuditEvidenceOrigins(scope.id,[added.capability]);
    const frozen = freezeScopeEvidence({scopeId:scope.id,capturedAt:"2026-10-08T12:00:00Z",capabilities:[{...added.capability,status:"accepted"}],activationSnapshot:null,auditOrigins:origins});
    assert.deepEqual(frozen.capabilities[0].references[0].reference,provenance.evidence[0]);
    assert.equal(frozen.capabilities[0].references[0].capture?.excerpt,evidence[0].excerpt,"report projection resolves the exact stored accepted Audit origin");
    assert.equal(frozen.capabilities[0].references[0].capture?.sourceDate,"2026-09-30");
    assert(frozen.capabilities[0].references[0].auditHref?.includes(encodeURIComponent(`passage:${snapshot.id}:fixture-passage`)));
    assert.deepEqual(frozen.capabilities[0].references[1].reference,ref);
    assert.equal(frozen.capabilities[0].references[1].capture,null);
    const trace=(await buildPortfolioInputs()).scopes.find(row=>row.scopeId===scope.id)?.capabilities.find(row=>row.id===capability.id)?.evidenceTrace;
    assert.equal(trace?.[0].capture?.excerpt,evidence[0].excerpt,"Scope gets the same captured original quote");
    assert.deepEqual(await loadCapabilityAuditEvidenceOrigins("foreign",[added.capability]),[]);
    assert.deepEqual((await prisma.capability.findUniqueOrThrow({where:{id:capability.id}})).provenance,added.capability.provenance);
    console.log("PASS actual owner edit/mapping event, exact source receipt, note separation, additional references, release move, retry-once, stale refusal, Scope and frozen report exact Audit quote/locator/deep link; foreign refusal");
  } finally {
    await prisma.auditRun.deleteMany({where:{contextSnapshot:{scopeId:scope.id}}});
    await prisma.contextSnapshot.deleteMany({where:{scopeId:scope.id}});
    await prisma.scope.delete({where:{id:scope.id}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
