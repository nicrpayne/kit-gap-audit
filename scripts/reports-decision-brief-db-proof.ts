import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { isDecisionBriefV1 } from "../lib/reports/decisionBrief";
import { briefPayloadFingerprint, renderDecisionBriefMarkdown } from "../lib/reports/decisionBriefRender";

if (process.env.REPORTS_DB_PROOF !== "1") {
  throw new Error("Refusing to write: set REPORTS_DB_PROOF=1 for a disposable local fixture database.");
}

const prisma = new PrismaClient();
const base = process.env.BASE_URL ?? "http://localhost:3000";
let reportId: string | null = null;
let mutationDecisionId: string | null = null;

async function main() {
try {
  const scope = await prisma.scope.findUnique({ where: { id: "jsa" } });
  assert(scope, "seeded JSA scope exists");
  const unavailableScenario = await fetch(`${base}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeId: scope.id, mode: "scenario", scenarioId: "capacity-plus-1", scenarioSnapshot: { id: "capacity-plus-1" } }),
  });
  assert.equal(unavailableScenario.status, 409, "Reports refuses to relabel live Reality as a Scenario snapshot");
  assert((await unavailableScenario.json() as { error: string }).error.includes("UNAVAILABLE"));
  const response = await fetch(`${base}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeId: scope.id }),
  });
  const body = await response.json() as { report?: { id: string }; error?: string };
  assert(response.ok && body.report, body.error ?? `POST failed ${response.status}`);
  reportId = body.report.id;

  const saved = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  assert.equal(saved.briefVersion, "decision-brief.v1");
  assert.equal(saved.mode, "reality");
  assert(isDecisionBriefV1(saved.briefSnapshot));
  const brief = saved.briefSnapshot;
  const savedJson = JSON.stringify(brief);
  assert.equal(saved.summaryMarkdown, renderDecisionBriefMarkdown(brief));
  assert.equal(saved.likelyDate.toISOString(), brief.headline.likelyWindow.value.likely);
  assert.equal(saved.confidenceAtTarget, brief.headline.confidenceAtTarget.value);
  assert.equal(saved.blockingCount, brief.calls.decisions.value.filter((decision) => decision.gated).length);
  assert(brief.calls.decisions.value.every((decision) => decision.status === "open"));
  assert(brief.calls.decisions.value.filter((decision) => !decision.gated).every((decision) => decision.modeledDelay.likely === 0));
  assert(brief.caveats.value.some((caveat) => caveat.code === "KIT_CONSTRUCT_MISSING"));

  mutationDecisionId = (await prisma.decision.create({
    data: { scopeId: scope.id, title: "DB proof mutation after saved brief", status: "open" },
    select: { id: true },
  })).id;
  const unchanged = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  assert.equal(JSON.stringify(unchanged.briefSnapshot), savedJson, "later owner mutation cannot alter saved JSON");
  assert.equal(unchanged.summaryMarkdown, saved.summaryMarkdown, "later owner mutation cannot alter saved export");

  const history = await fetch(`${base}/api/reports?scopeId=${encodeURIComponent(scope.id)}`);
  const historyBody = await history.json() as { reports: { id: string; briefSnapshot: unknown }[] };
  const returned = historyBody.reports.find((report) => report.id === reportId);
  assert(returned && JSON.stringify(returned.briefSnapshot) === savedJson);

  const print = await fetch(`${base}/reports/${encodeURIComponent(reportId)}/print`);
  const html = await print.text();
  assert(print.ok);
  assert(html.includes(briefPayloadFingerprint(brief)));
  assert(html.includes("Current Forecast"));

  console.log(`PASS Reports DB boundary: migration + API generation + immutable JSON + exact Markdown + history + print (${reportId})`);
} finally {
  if (mutationDecisionId) await prisma.decision.deleteMany({ where: { id: mutationDecisionId } });
  if (reportId) await prisma.report.deleteMany({ where: { id: reportId } });
  await prisma.$disconnect();
}
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
