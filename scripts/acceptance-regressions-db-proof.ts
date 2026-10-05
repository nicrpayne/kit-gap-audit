import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { currentDecisionCandidates } from "../lib/decisions/candidates";
import { auditRunHistory } from "../lib/audit/history";
import { POST as importCandidates } from "../app/api/decisions/import/route";
import { POST as acceptCandidate } from "../app/api/decision-candidates/[id]/accept/route";
import { POST as attachEvidence } from "../app/api/decisions/[id]/evidence/route";
import { remainingIssuesFor } from "../lib/forecast/build";
import { deliveryRelevantIssueIds } from "../lib/forecast/coverage";
import type { LinearIssueSummary } from "../lib/linear";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(process.env.REPORTS_DB_PROOF === "1" && ["postgres:", "postgresql:"].includes(url.protocol)
  && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port
  && url.username === "signal_t0_local" && /^\/signal_t0_test_\d+$/.test(url.pathname), "Disposable loopback DB only");
delete process.env.LINEAR_API_KEY;
const key = randomUUID(), scopes = [`acceptance-${key}`, `other-${key}`];
const snapshots = [`old-${key}`, `new-${key}`, `other-snap-${key}`];
const sourceId = `source-${key}`;
const runIds = [`source-run-${key}`, `package-run-${key}`, `other-run-${key}`];
const checks: string[] = [];
const request = (body: unknown) => new NextRequest("http://localhost/api/decisions/import", { method: "POST", body: JSON.stringify(body) });
async function main() {
  try {
    const issue = (identifier: string, fields: Partial<LinearIssueSummary> = {}): LinearIssueSummary => ({
      identifier, title: identifier, description: null, state: "Todo", stateType: "unstarted", estimate: 1,
      completedAt: null, parentIdentifier: null, parentTitle: null, assignee: null, labels: [], projectName: "QA", ...fields,
    });
    const issues = [issue("open"), issue("duplicate", { stateType: "duplicate" }), issue("canceled", { stateType: "canceled" }),
      issue("cancel-timestamp", { canceledAt: "2026-08-13T00:00:00Z" }), issue("done-timestamp", { completedAt: "2026-08-13T00:00:00Z" }),
      issue("done", { stateType: "completed" }), issue("parent"), issue("child", { parentIdentifier: "parent" }),
      issue("triage", { stateType: "triage" }), issue("name-only", { state: "Duplicate" })];
    for (const includeTriage of [true, false]) {
      const expected = ["open", "child", ...(includeTriage ? ["triage"] : []), "name-only"];
      assert.deepEqual(remainingIssuesFor(issues, includeTriage).map(i => i.identifier), expected);
      assert.deepEqual(deliveryRelevantIssueIds(issues, includeTriage), expected);
    }
    checks.push("Forecast and coverage exclude completed, canceled and duplicate types/timestamps; no inference from customizable names; leaves/triage preserved");
    for (const id of scopes) await prisma.scope.create({ data: { id, name: id, teamKey: "QA" } });
    for (let index = 0; index < snapshots.length; index++) await prisma.contextSnapshot.create({ data: {
      id: snapshots[index], scopeId: index === 2 ? scopes[1] : scopes[0], producer: "manual", packageId: snapshots[index],
      packageVersion: "1.1", package: {}, contextHash: snapshots[index], completenessSummary: {}, createdAt: new Date(`2026-09-${10 + index}T00:00:00Z`),
    } });
    const manualBody = { scopeId: scopes[0], text: "Question alpha | Exact meeting sentence\nQuestion beta | Another quoted sentence", sourceLabel: "QA manual notes" };
    assert.equal((await (await importCandidates(request(manualBody))).json()).imported, 2);
    for (const [name, snapshot] of [["old", snapshots[0]], ["current", snapshots[1]], ["unknown", null]] as const) {
      await prisma.decisionCandidate.create({ data: { claimKey: `${key}:${name}`, scopeId: scopes[0], title: name, contextSnapshotId: snapshot, sourceLabel: "QA", status: "pending" } });
    }
    await importCandidates(request({ ...manualBody, scopeId: scopes[1] }));
    const candidates = await currentDecisionCandidates([scopes[0]]);
    assert.deepEqual(candidates.map(c => c.title).sort(), ["Question alpha", "Question beta", "current"]);
    const retry = await (await importCandidates(request(manualBody))).json(); assert.equal(retry.imported, 0); assert.equal(retry.alreadyKnown, 2);
    const alpha = candidates.find(c => c.title === "Question alpha")!;
    const accepted = await acceptCandidate(request({}), { params: Promise.resolve({ id: alpha.id }) });
    assert.equal(accepted.status, 200); const result = await accepted.json();
    assert.equal(result.decision.gate, null); assert.equal(result.decision.evidence[0].kind, "manual");
    assert.equal(result.decision.evidence[0].excerpt, "Question alpha | Exact meeting sentence");
    assert.equal((await (await acceptCandidate(request({}), { params: Promise.resolve({ id: alpha.id }) })).json()).created, false);
    for (const name of ["old", "unknown"]) {
      const row = await prisma.decisionCandidate.findUniqueOrThrow({ where: { claimKey: `${key}:${name}` } });
      assert.equal((await acceptCandidate(request({}), { params: Promise.resolve({ id: row.id }) })).status, 409);
    }
    await prisma.decisionCandidate.update({ where: { id: candidates.find(c => c.title === "Question beta")!.id }, data: { status: "dismissed" } });
    assert.deepEqual((await currentDecisionCandidates([scopes[0]])).map(c => c.title), ["current"]);
    const attach = (candidateId: string, decisionId = result.decision.id) => attachEvidence(request({ fromCandidateId: candidateId }), { params: Promise.resolve({ id: decisionId }) });
    const evidenceBefore = await prisma.decisionEvidence.count({ where: { decisionId: result.decision.id } });
    const refused = await prisma.decisionCandidate.findMany({ where: { OR: [{ claimKey: { in: [`${key}:old`, `${key}:unknown`] } }, { scopeId: scopes[1] }, { scopeId: scopes[0], status: "dismissed" }] } });
    for (const row of refused) assert.equal((await attach(row.id)).status, 409);
    assert.equal(await prisma.decisionEvidence.count({ where: { decisionId: result.decision.id } }), evidenceBefore);
    await importCandidates(request({ ...manualBody, text: "Question gamma | Verbatim attachment" }));
    const gamma = (await currentDecisionCandidates([scopes[0]])).find(c => c.title === "Question gamma")!;
    const attachment = await attach(gamma.id); assert.equal(attachment.status, 200);
    const attached = await attachment.json(); assert.equal(attached.evidence[0].kind, "manual");
    assert.equal(attached.evidence[0].excerpt, "Question gamma | Verbatim attachment"); assert.equal(attached.evidence[0].contextSnapshotId, null);
    assert.equal((await (await attach(gamma.id)).json()).alreadyAttached, true);
    assert.equal(await prisma.decisionEvidence.count({ where: { decisionId: result.decision.id } }), evidenceBefore + 1);
    assert.equal(await prisma.decision.count({ where: { scopeId: { in: scopes } } }), 1);
    const current = candidates.find(c => c.title === "current")!;
    await prisma.decisionCandidate.update({ where: { id: current.id }, data: { excerpts: ["Exact current package quote"], evidenceRefs: ["qa-current-passage"] } });
    const concurrent = await Promise.all([attach(current.id), attach(current.id)]);
    assert(concurrent.some(response => response.status === 200));
    assert(concurrent.every(response => [200, 409].includes(response.status)));
    assert.equal((await (await attach(current.id)).json()).alreadyAttached, true);
    const currentEvidence = await prisma.decisionEvidence.findMany({ where: { decisionId: result.decision.id, contextSnapshotId: snapshots[1] } });
    assert.equal(currentEvidence.length, 1); assert.equal(currentEvidence[0].kind, "context_package");
    assert.equal(currentEvidence[0].excerpt, "Exact current package quote"); assert.equal(currentEvidence[0].evidenceItemId, "qa-current-passage");
    await importCandidates(request({ ...manualBody, text: "Question delta | Another valid choice" }));
    const delta = (await currentDecisionCandidates([scopes[0]])).find(c => c.title === "Question delta")!;
    const secondDecision = await (await acceptCandidate(request({}), { params: Promise.resolve({ id: delta.id }) })).json();
    assert.equal((await attach(gamma.id, secondDecision.decision.id)).status, 409);
    assert.equal(await prisma.decisionEvidence.count({ where: { decisionId: result.decision.id } }), evidenceBefore + 2);
    checks.push("Current-package attachment preserves exact quote and locator; simultaneous retries create one citation, and accepted candidates cannot be redirected to another Decision");
    checks.push("Attach-to-existing preserves exact manual provenance, rejects stale/dismissed/cross-project candidates, retries without duplicate evidence or Decisions");
    checks.push("Manual import survives reads/retries, stays project-scoped, preserves exact manual evidence, accepts once without a gate, and dismissal sticks; stale/unknown packages stay excluded/rejected");
    await prisma.source.create({ data: { id: sourceId, scopeId: scopes[0], title: "Legacy source", kind: "notes", content: "Exact legacy words" } });
    for (let index = 0; index < runIds.length; index++) await prisma.auditRun.create({ data: {
      id: runIds[index], sourceId: index === 0 ? sourceId : null, contextSnapshotId: index === 0 ? null : snapshots[index],
      issueCount: 5, findingCount: 2, model: "qa", createdAt: new Date(`2026-09-${20 + index}T00:00:00Z`),
    } });
    const history = await auditRunHistory(scopes[0], 1, 1);
    assert.equal(history.total, 2); assert.equal(history.totalPages, 2); assert.equal(history.runs[0].id, runIds[1]);
    assert.equal((await auditRunHistory(scopes[0], 2, 1)).runs[0].id, runIds[0]);
    assert.equal((await auditRunHistory(scopes[1], 1)).runs[0].id, runIds[2]);
    checks.push("Package-only and legacy-source audit runs are both visible with stable pagination and project isolation");
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    await prisma.auditRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.decisionEvidence.deleteMany({ where: { decision: { scopeId: { in: scopes } } } });
    await prisma.decision.deleteMany({ where: { scopeId: { in: scopes } } });
    await prisma.decisionCandidate.deleteMany({ where: { scopeId: { in: scopes } } });
    await prisma.source.deleteMany({ where: { id: sourceId } });
    await prisma.contextSnapshot.deleteMany({ where: { id: { in: snapshots } } });
    await prisma.scope.deleteMany({ where: { id: { in: scopes } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
