import { prisma } from "../lib/prisma";
import { getScopedIssues } from "../lib/linear";
import { createCanonicalCapability, type OwnerWorkItem } from "../lib/scope/reality";

process.env.KIT_DEV_FIXTURES = "1";

const owner = (issue: Awaited<ReturnType<typeof getScopedIssues>>[number]): OwnerWorkItem => ({
  externalId: issue.identifier,
  externalUrl: issue.url ?? null,
  title: issue.title,
  state: issue.state,
  updatedAt: issue.updatedAt ?? null,
});

async function main() {
  const scope = await prisma.scope.create({ data: {
    name: "JSA",
    teamKey: "JSA",
    projectNames: ["KIT JSA"],
    teamCapacity: 2,
    executionState: "configured",
    estimationContext: "Production-shaped deterministic staging fixture. Not a prediction of the real JSA date.",
  } });
  const issues = await getScopedIssues(scope);
  const work = (needle: string) => issues.filter((issue) => issue.title.includes(needle)).map(owner);
  const create = (name: string, description: string, status: "accepted" | "outside" | "future", linked: OwnerWorkItem[]) =>
    createCanonicalCapability(scope.id, {
      name,
      description,
      status,
      work: linked,
      note: "Deterministic cross-device review fixture.",
      idempotencyKey: `scope-cross-device-visual:${name}`,
    });
  await create("Crew acknowledgment", "Signed participation record for the field crew.", "accepted", work("Crew acknowledgement"));
  await create("Arc-Angel JSA guidance", "Contextual hazard prompts during JSA authoring.", "accepted", work("Arc-Angel"));
  await create("Notifications", "Notify crews and reviewers at meaningful transitions.", "accepted", []);
  await create("PDF / Docufy", "Signed JSA output and compliance packet.", "outside", work("PDF / Docufy"));
  await create("Offline", "Queue and reconcile submissions without connectivity.", "future", []);
  await create("Approval flow", "Supervisor review, escalation, and audit trail.", "accepted", []);
  console.log(JSON.stringify({ ok: true, scopeId: scope.id, executionItems: issues.length }, null, 2));
}

main().finally(() => prisma.$disconnect());
