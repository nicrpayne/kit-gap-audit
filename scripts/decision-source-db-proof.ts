import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { harvestCandidates, currentDecisionCandidates } from "../lib/decisions/candidates";
import { POST as acceptCandidate } from "../app/api/decision-candidates/[id]/accept/route";
import { PATCH } from "../app/api/decisions/[id]/route";
import { acceptAuditChange } from "../lib/audit/acceptChange";
import { buildPortfolioInputs } from "../lib/forecast/compute";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert(process.env.DECISION_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && /^\/signal_t0_test_\d+$/.test(url.pathname));
  process.env.KIT_DEV_FIXTURES = "1"; delete process.env.LINEAR_API_KEY;
  const key = randomUUID();
  const scope = await prisma.scope.create({ data: { name: `Decision proof ${key}`, teamKey: "PRF", executionState: "not_configured" } });
  const request = (body = {}) => new NextRequest("http://127.0.0.1/api/proof", { method: "POST", body: JSON.stringify(body) });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const quote = 'Convention adopted. Status: DECIDED. We use tasks, not steps.';
  try {
    const snapshot = await prisma.contextSnapshot.create({ data: { scopeId: scope.id, producer: "manual", packageId: key, packageVersion: "1.1", contextHash: key, completenessSummary: {}, package: {
      sources: [{ sourceRef: "fixture://meeting" }], evidence: [{ id: "quote", sourceRef: "fixture://meeting#quote", excerpt: quote }],
      derivedClaims: [{ id: "agreement", kind: "decision", statement: "A historical convention", evidenceRefs: ["missing", "quote"], extra: { fields: { status: "decided", approval_basis: "approved", readinessRole: "reference" } } }],
    } } });
    await harvestCandidates({ scopeId: scope.id });
    const candidates = await currentDecisionCandidates([scope.id]); assert.equal(candidates.length,1); assert.equal(candidates[0].suggestedStatus,"decided");
    assert.deepEqual(candidates[0].evidenceRefs,["quote"],"missing refs cannot misalign exact quotes");
    const result = await acceptCandidate(request(),params(candidates[0].id)); assert.equal(result.status,200);
    const accepted = (await result.json()).decision;
    assert.equal(accepted.status,"decided"); assert.equal(accepted.readinessRole,"reference");
    assert.equal(accepted.evidence[0].excerpt,quote); assert.equal(accepted.evidence[0].evidenceItemId,"quote");
    assert.equal(accepted.evidence[0].contextSnapshotId,snapshot.id); assert.equal(accepted.evidence[0].externalRef,"fixture://meeting#quote");
    assert.equal((await acceptCandidate(request(),params(candidates[0].id))).status,200);
    assert.equal(await prisma.decision.count({where:{scopeId:scope.id}}),1);
    console.log("PASS historical acceptance, exact quote/locator preservation, missing-ref alignment and idempotence");

    const patch = await PATCH(request({status:"decided",readinessRole:"reference",resolution:"Owner clarified the historical agreement",expectedUpdatedAt:accepted.updatedAt}),params(accepted.id)); assert.equal(patch.status,200);
    const corrected = await prisma.decision.findUniqueOrThrow({where:{id:accepted.id},include:{evidence:true}});
    assert(corrected.evidence.some(e=>e.sourceLabel==="Decision details history" && e.excerpt.includes("resolution:")));
    assert(corrected.evidence.some(e=>e.id===accepted.evidence[0].id && e.excerpt===quote));
    assert.equal((await PATCH(request({status:"open",expectedUpdatedAt:accepted.updatedAt}),params(accepted.id))).status,409);
    const before = JSON.stringify(await prisma.decision.findUnique({where:{id:accepted.id},include:{evidence:true}}));
    const proposal = await prisma.auditChangeProposal.create({data:{scopeId:scope.id,contextSnapshotId:snapshot.id,fingerprint:`fp-${key}`,category:"decision",owner:"decisions",changeType:"add",title:accepted.title,summary:"Old source repeated",whyProposed:"Fixture",currentState:{},proposedState:{action:"create_open_decision",title:accepted.title},evidence:[],retrievalBasis:"fixture",relevanceReason:"fixture"}});
    await acceptAuditChange(proposal.id,{idempotencyKey:`audit-${key}`});
    assert.equal(JSON.stringify(await prisma.decision.findUnique({where:{id:accepted.id},include:{evidence:true}})),before);
    await prisma.contextSnapshot.create({data:{scopeId:scope.id,producer:"manual",packageId:`new-${key}`,packageVersion:"1.1",contextHash:`new-${key}`,completenessSummary:{},package:{sources:[],evidence:[],derivedClaims:[{id:"same",kind:"decision",statement:accepted.title,evidenceRefs:[]}]}}});
    assert.equal((await harvestCandidates({scopeId:scope.id})).imported,0);
    assert.equal(await prisma.decision.count({where:{scopeId:scope.id}}),1);
    console.log("PASS owner correction survives refreshed proposal and harvest; stale edit refused; evidence history append-only");

    await prisma.decision.create({data:{scopeId:scope.id,title:"Reference still being discussed",readinessRole:"reference"}});
    const unresolved = await prisma.decision.create({data:{scopeId:scope.id,title:"Unknown release relevance"}});
    const input = (await buildPortfolioInputs()).scopes.find(s=>s.scopeId===scope.id)!;
    assert.deepEqual(input.openShapeQuestions.map(d=>d.id),[unresolved.id]);
    assert.equal(input.forecastCoverage.census.openShapeDecisionCount,1);
    console.log("PASS reference questions do not block readiness; unreviewed release questions remain visible");
  } finally {
    await prisma.auditChangeProposal.deleteMany({where:{scopeId:scope.id}});
    await prisma.contextSnapshot.deleteMany({where:{scopeId:scope.id}});
    await prisma.scope.delete({where:{id:scope.id}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
