import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { buildPortfolioInputs } from "../lib/forecast/compute";
import { getScopedIssues } from "../lib/linear";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import {
  ScopeRealityConflictError,
  createCanonicalCapability,
  linkCanonicalWork,
  updateCanonicalCapability,
  type OwnerWorkItem,
} from "../lib/scope/reality";

process.env.KIT_DEV_FIXTURES = "1";

const browserB = new PrismaClient();
const idempotency = (name: string) => `scope-cross-device-proof:${name}`;

function owner(issue: Awaited<ReturnType<typeof getScopedIssues>>[number]): OwnerWorkItem {
  return {
    externalId: issue.identifier,
    externalUrl: issue.url ?? null,
    title: issue.title,
    state: issue.state,
    updatedAt: issue.updatedAt ?? null,
  };
}

async function snapshot(scopeId: string) {
  const payload = await buildPortfolioInputs();
  const scope = payload.scopes.find((candidate) => candidate.scopeId === scopeId)!;
  const simulation = runPortfolioSimulation([{
    scopeId,
    items: scope.items,
    gates: scope.gates,
    teamCapacity: scope.teamCapacity,
    dependsOnScopeIds: [],
    startDate: payload.startDate,
    targetDate: scope.targetDate,
  }]).get(scopeId)!;
  return {
    state: scope.forecastCoverage.state,
    modeled: scope.forecastCoverage.census.modeledExecutionIssueCount,
    total: scope.forecastCoverage.census.executionIssueCount,
    missingEstimate: scope.executionItems.filter((item) => item.estimateSource === "issue_placeholder").length,
    likely: simulation.likelyDate.toISOString().slice(0, 10),
    window: [simulation.earliestDate.toISOString().slice(0, 10), simulation.latestDate.toISOString().slice(0, 10)],
    items: scope.items,
  };
}

async function main() {
  const scope = await prisma.scope.create({ data: {
    name: "JSA Cross-device Fixture",
    teamKey: "JSA",
    projectNames: ["KIT JSA"],
    teamCapacity: 2,
    executionState: "configured",
    estimationContext: "Deterministic fixture only; not a prediction of the real JSA delivery date.",
  } });
  const issues = await getScopedIssues(scope);
  assert.equal(issues.length, 10);
  const byTitle = (needle: string) => issues.filter((issue) => issue.title.includes(needle)).map(owner);

  const crew = await createCanonicalCapability(scope.id, {
    name: "Crew acknowledgment",
    description: "Capture signed participation in the JSA.",
    work: byTitle("Crew acknowledgement"),
    idempotencyKey: idempotency("crew"),
  });
  const guidance = await createCanonicalCapability(scope.id, {
    name: "Arc-Angel JSA guidance",
    description: "Contextual safety guidance during authoring.",
    work: byTitle("Arc-Angel"),
    idempotencyKey: idempotency("guidance"),
  });
  const initial = await snapshot(scope.id);
  assert.equal(initial.state, "modeled_subset");
  assert.equal(initial.modeled, 2);
  assert.equal(initial.total, 10);

  const notifications = await createCanonicalCapability(scope.id, {
    name: "Notifications",
    description: "Notify crews and reviewers at meaningful workflow transitions.",
    note: "Operator assertion for deterministic JSA staging fixture.",
    idempotencyKey: idempotency("notifications-create"),
  });

  // A second database client stands in for Browser B. The row is immediately
  // visible because it is server Reality, not a module/localStorage value.
  const browserBRead = await browserB.capability.findUnique({ where: { id: notifications.capability.id } });
  assert.equal(browserBRead?.name, "Notifications");

  const mappedNotifications = await linkCanonicalWork(notifications.capability.id, {
    expectedRevision: notifications.capability.revision,
    work: byTitle("JSA Notifications"),
    idempotencyKey: idempotency("notifications-link"),
  });
  const afterNotifications = await snapshot(scope.id);
  assert.equal(afterNotifications.modeled, 4);

  // Retrying the exact request is an answer about the first mutation.
  const retry = await linkCanonicalWork(notifications.capability.id, {
    expectedRevision: notifications.capability.revision,
    work: byTitle("JSA Notifications"),
    idempotencyKey: idempotency("notifications-link"),
  });
  assert.equal(retry.changed, false);
  assert.equal(retry.capability.workLinks.length, mappedNotifications.capability.workLinks.length);

  // A stale Browser A revision cannot overwrite Browser B's later edit.
  await assert.rejects(
    () => updateCanonicalCapability(notifications.capability.id, {
      expectedRevision: notifications.capability.revision,
      description: "Stale overwrite",
      idempotencyKey: idempotency("stale-edit"),
    }),
    (error) => error instanceof ScopeRealityConflictError,
  );

  const groups = [
    ["PDF / Docufy", "Signed and reviewable JSA documents.", "PDF / Docufy"],
    ["Offline", "Reliable field work without connectivity.", "Offline"],
    ["Approval flow", "Governed supervisor review and escalation.", "Approval flow"],
  ] as const;
  for (const [name, description, title] of groups) {
    await createCanonicalCapability(scope.id, {
      name,
      description,
      work: byTitle(title),
      idempotencyKey: idempotency(`create-${name}`),
    });
  }
  const complete = await snapshot(scope.id);
  assert.equal(complete.state, "forecastable");
  assert.equal(complete.modeled, 10);
  assert.equal(complete.total, 10);
  assert.ok(complete.missingEstimate > 0, "missing estimates remain explicit instead of becoming zero duration");

  const movedOut = await updateCanonicalCapability(notifications.capability.id, {
    expectedRevision: mappedNotifications.capability.revision,
    status: "outside",
    idempotencyKey: idempotency("notifications-out"),
  });
  assert.equal(movedOut.capability.status, "outside");
  const browserBMove = await browserB.capability.findUnique({ where: { id: notifications.capability.id } });
  assert.equal(browserBMove?.status, "outside");
  const outside = await snapshot(scope.id);
  assert.equal(outside.modeled, 8);
  assert.equal(outside.state, "modeled_subset");

  const movedBack = await updateCanonicalCapability(notifications.capability.id, {
    expectedRevision: movedOut.capability.revision,
    status: "accepted",
    idempotencyKey: idempotency("notifications-in"),
  });
  assert.equal(movedBack.capability.status, "accepted");
  const restored = await snapshot(scope.id);
  assert.equal(restored.state, "forecastable");

  const derived = await prisma.projectDerivedState.findUniqueOrThrow({ where: { scopeId: scope.id } });
  assert.equal(derived.realityRevision, derived.computedRevision);
  assert.equal(derived.status, "current");

  const events = await prisma.capabilityEvent.count({ where: { scopeId: scope.id } });
  assert.equal(events, 9);
  console.log(JSON.stringify({
    ok: true,
    scopeId: scope.id,
    initial: { coverage: initial.state, modeled: initial.modeled, execution: initial.total, likely: initial.likely, window: initial.window },
    afterNotifications: { coverage: afterNotifications.state, modeled: afterNotifications.modeled, execution: afterNotifications.total, likely: afterNotifications.likely, window: afterNotifications.window },
    complete: { coverage: complete.state, modeled: complete.modeled, execution: complete.total, missingEstimateItems: complete.missingEstimate, likely: complete.likely, window: complete.window },
    outside: { coverage: outside.state, modeled: outside.modeled, execution: outside.total, likely: outside.likely, window: outside.window },
    restored: { coverage: restored.state, modeled: restored.modeled, execution: restored.total, likely: restored.likely, window: restored.window },
    concurrency: { staleWriteRejected: true, idempotentRetryCreatedDuplicate: false },
    crossDevice: { browserBReadCreate: true, browserBReadMove: true },
    derived: { realityRevision: derived.realityRevision, computedRevision: derived.computedRevision, status: derived.status },
    historyEvents: events,
    warning: "Deterministic staging fixture; not a prediction of the real JSA date.",
    capabilityIds: { crew: crew.capability.id, guidance: guidance.capability.id, notifications: notifications.capability.id },
  }, null, 2));
}

main().finally(async () => {
  await browserB.$disconnect();
  await prisma.$disconnect();
});
