import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { PATCH } from "../app/api/decisions/[id]/route";

type DecisionRecord = {
  id: string;
  scopeId: string;
  title: string;
  status: string;
  resolution: string | null;
  rationale: string | null;
  owner: string | null;
  neededBy: Date | null;
  readinessRole: string;
  updatedAt: Date;
};

type MockTransaction = {
  $executeRaw: (...args: unknown[]) => Promise<number>;
  decision: {
    findUnique: () => Promise<DecisionRecord>;
    update: (args: { data: Record<string, unknown> }) => Promise<DecisionRecord & { gate: null }>;
  };
  decisionEvidence: { create: () => Promise<Record<string, never>> };
  projectDerivedState: { upsert: () => Promise<Record<string, never>> };
};

type MutablePrisma = {
  $transaction: (callback: (tx: MockTransaction) => Promise<unknown>, options?: unknown) => Promise<unknown>;
  projectDerivedState: { findUnique: () => Promise<unknown> };
};

const params = { params: Promise.resolve({ id: "pure-proof-no-database" }) };
const request = (body: BodyInit) => new NextRequest("http://signal.test/api/decisions/pure-proof-no-database", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body,
});
const jsonRequest = (body: unknown) => request(JSON.stringify(body));

async function responseError(response: Response) {
  return { status: response.status, error: (await response.json()).error as string };
}

async function main() {
  const invalidJson = await responseError(await PATCH(request("{"), params));
  assert.equal(invalidJson.status, 400);
  assert.match(invalidJson.error, /Invalid JSON/);

  const nullBody = await responseError(await PATCH(request("null"), params));
  assert.equal(nullBody.status, 400);
  assert.match(nullBody.error, /must be an object/);

  const nonStringResolution = await responseError(await PATCH(jsonRequest({ resolution: 42 }), params));
  assert.equal(nonStringResolution.status, 400);
  assert.match(nonStringResolution.error, /must be text/);
  console.log("PASS malformed, null and non-text request bodies fail closed before database access");

  const mutablePrisma = prisma as unknown as MutablePrisma;
  const originalTransaction = mutablePrisma.$transaction;
  const originalDerivedFind = mutablePrisma.projectDerivedState.findUnique;
  let existing!: DecisionRecord;
  let lastUpdate: Record<string, unknown> | null = null;
  const currentDecision = () => existing;
  const capturedUpdate = () => lastUpdate;
  const reset = (status: string, resolution: string | null) => {
    existing = {
      id: "pure-proof-no-database",
      scopeId: "pure-proof-scope",
      title: "Which SSO provider is approved?",
      status,
      resolution,
      rationale: null,
      owner: null,
      neededBy: null,
      readinessRole: "needs_review",
      updatedAt: new Date("2026-10-12T12:00:00.000Z"),
    };
    lastUpdate = null;
  };
  const tx: MockTransaction = {
    $executeRaw: async () => 0,
    decision: {
      findUnique: async () => ({ ...existing }),
      update: async ({ data }) => {
        lastUpdate = data;
        existing = { ...existing, ...data, updatedAt: new Date("2026-10-12T12:01:00.000Z") } as DecisionRecord;
        return { ...existing, gate: null };
      },
    },
    decisionEvidence: { create: async () => ({}) },
    projectDerivedState: { upsert: async () => ({}) },
  };

  mutablePrisma.$transaction = async (callback) => callback(tx);
  mutablePrisma.projectDerivedState.findUnique = async () => null;
  try {
    reset("open", null);
    for (const body of [
      { status: "decided" },
      { status: "decided", resolution: null },
      { status: "decided", resolution: "  \n  " },
    ]) {
      const rejected = await responseError(await PATCH(jsonRequest(body), params));
      assert.equal(rejected.status, 400);
      assert.match(rejected.error, /Record what was decided/);
      assert.equal(lastUpdate, null);
    }

    const stale = await responseError(await PATCH(jsonRequest({
      status: "decided",
      expectedUpdatedAt: "2026-10-12T11:59:00.000Z",
    }), params));
    assert.equal(stale.status, 409, "the concurrency guard still wins before transition validation");
    assert.equal(lastUpdate, null);

    const decided = await PATCH(jsonRequest({
      status: "decided",
      resolution: "  Use the approved SSO provider.  ",
    }), params);
    assert.equal(decided.status, 200);
    assert.equal(capturedUpdate()?.resolution, "Use the approved SSO provider.");
    assert.equal(currentDecision().status, "decided");
    assert.equal(currentDecision().resolution, "Use the approved SSO provider.");
    console.log("PASS every new decided transition requires and stores a trimmed, nonempty resolution; stale writes remain 409");

    lastUpdate = null;
    const erased = await responseError(await PATCH(jsonRequest({ resolution: null }), params));
    assert.equal(erased.status, 400);
    assert.match(erased.error, /cannot be erased/);
    assert.equal(lastUpdate, null);

    const erasedWhileReopening = await responseError(await PATCH(jsonRequest({
      status: "open",
      resolution: "   ",
    }), params));
    assert.equal(erasedWhileReopening.status, 400);
    assert.match(erasedWhileReopening.error, /cannot be erased/);
    assert.equal(lastUpdate, null);

    const unrelated = await PATCH(jsonRequest({ title: "Which SSO provider did the owner approve?" }), params);
    assert.equal(unrelated.status, 200);
    const unrelatedUpdate = capturedUpdate();
    assert(unrelatedUpdate && !("resolution" in unrelatedUpdate));
    assert.equal(currentDecision().resolution, "Use the approved SSO provider.");
    console.log("PASS a recorded resolution cannot be erased, including while reopening, but unrelated edits preserve it");

    reset("decided", "Recorded decision text");
    const reopened = await PATCH(jsonRequest({ status: "open" }), params);
    assert.equal(reopened.status, 200);
    assert.equal(currentDecision().status, "open");
    assert.equal(currentDecision().resolution, "Recorded decision text");
    lastUpdate = null;
    const erasedAfterReopen = await responseError(await PATCH(jsonRequest({ resolution: null }), params));
    assert.equal(erasedAfterReopen.status, 400);
    assert.match(erasedAfterReopen.error, /cannot be erased/);
    assert.equal(lastUpdate, null);
    assert.equal(currentDecision().resolution, "Recorded decision text");

    reset("decided", "Recorded dismissed decision text");
    const dismissed = await PATCH(jsonRequest({ status: "dismissed" }), params);
    assert.equal(dismissed.status, 200);
    assert.equal(currentDecision().status, "dismissed");
    assert.equal(currentDecision().resolution, "Recorded dismissed decision text");
    lastUpdate = null;
    const erasedAfterDismissal = await responseError(await PATCH(jsonRequest({ resolution: "   " }), params));
    assert.equal(erasedAfterDismissal.status, 400);
    assert.match(erasedAfterDismissal.error, /cannot be erased/);
    assert.equal(lastUpdate, null);
    console.log("PASS decide -> reopen/dismiss -> clear cannot erase the recorded resolution across sequential requests");

    reset("decided", null);
    const historicalEdit = await PATCH(jsonRequest({
      title: "Historical agreement from the approved source",
      readinessRole: "reference",
    }), params);
    assert.equal(historicalEdit.status, 200);
    const historicalUpdate = capturedUpdate();
    assert(historicalUpdate && !("resolution" in historicalUpdate));
    assert.equal(currentDecision().resolution, null);

    lastUpdate = null;
    const historicalStatusEcho = await PATCH(jsonRequest({ status: "decided", readinessRole: "reference" }), params);
    assert.equal(historicalStatusEcho.status, 200);
    const historicalEchoUpdate = capturedUpdate();
    assert(historicalEchoUpdate && !("resolution" in historicalEchoUpdate));
    assert.equal(currentDecision().resolution, null);

    lastUpdate = null;
    const historicalBlankWrite = await responseError(await PATCH(jsonRequest({ resolution: "  " }), params));
    assert.equal(historicalBlankWrite.status, 400);
    assert.match(historicalBlankWrite.error, /needs a resolution/);
    assert.equal(lastUpdate, null);
    console.log("PASS source-approved historical decisions remain intact and accept unrelated edits without invented text");
  } finally {
    mutablePrisma.$transaction = originalTransaction;
    mutablePrisma.projectDerivedState.findUnique = originalDerivedFind;
    await prisma.$disconnect();
  }

  const inspector = readFileSync("components/decisions/DecisionInspector.tsx", "utf8");
  assert.match(inspector, /<label htmlFor="decision-resolution"/);
  assert.match(inspector, /aria-describedby="decision-resolution-requirement"/);
  assert.match(inspector, /disabled=\{busy \|\| !resolutionReady\}/);
  assert.match(inspector, /Record decision is unavailable until you enter what was decided\./);
  assert.match(inspector, /Your draft is preserved\. Retry the action\./);
  console.log("PASS the client names the required field, explains the disabled action and preserves failed retry drafts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
