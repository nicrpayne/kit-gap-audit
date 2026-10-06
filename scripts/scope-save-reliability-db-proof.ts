import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createCanonicalCapability, updateCanonicalCapability, capabilityWriteReceipt, SCOPE_WRITE_TRANSACTION } from "../lib/scope/reality";
import { scopeRealityError } from "../lib/scope/http";

const url = new URL(process.env.DATABASE_URL ?? "file:///missing");
assert(process.env.SCOPE_SAVE_DB_PROOF === "1" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port && url.username === "signal_t0_local" && /^\/signal_t0_test_\d+$/.test(url.pathname), "Disposable loopback database required");
process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;
const key = () => randomUUID();
const work = (id: string) => ({ externalId: id, title: id, externalUrl: null, state: "In Progress", updatedAt: null });

async function main() {
  const scope = await prisma.scope.create({ data: { name: "Scope save fault proof", teamKey: "JSA", projectNames: ["KIT JSA"], teamCapacity: 2, executionState: "configured" } });
  const transaction = prisma.$transaction.bind(prisma);
  const checks: string[] = [];
  try {
    // Reproduce the original five-second boundary against a real database.
    await assert.rejects(transaction(async (tx) => { await tx.$executeRaw`SELECT pg_sleep(5.5)`; }, { timeout: 5000 }));
    checks.push("original five-second transaction expiry reproduced");
    const created = await createCanonicalCapability(scope.id, { name: "Notifications", idempotencyKey: key() });
    const id = created.capability.id;
    const delayedKey = key();
    // Faults are local wrappers only, never a production test switch.
    prisma.$transaction = ((fn: any, options: any) => transaction(async (tx) => { await tx.$executeRaw`SELECT pg_sleep(6)`; return fn(tx); }, options)) as typeof prisma.$transaction;
    const delayed = await updateCanonicalCapability(id, { expectedRevision: 1, work: [work("SOF-101"), work("SOF-102"), work("SOF-103")], idempotencyKey: delayedKey });
    assert.equal(delayed.capability.revision, 2); assert.equal(delayed.capability.workLinks.length, 3);
    prisma.$transaction = transaction as typeof prisma.$transaction;
    checks.push("six-second three-ticket save commits with bounded twenty-second transaction");
    const retry = await updateCanonicalCapability(id, { expectedRevision: 1, work: [work("SOF-103"), work("SOF-102"), work("SOF-101")], idempotencyKey: delayedKey });
    assert.equal(retry.capability.revision, 2); assert.equal(retry.changed, false);
    assert.equal(await prisma.capabilityEvent.count({ where: { idempotencyKey: delayedKey } }), 1);
    await assert.rejects(updateCanonicalCapability(id, { expectedRevision: 1, name: "Wrong replay", idempotencyKey: delayedKey }), /different change/);
    assert.equal(await capabilityWriteReceipt(delayedKey, "different-scope"), null);
    checks.push("exact intent replay once, changed intent refused, receipt scope-isolated");
    const committedKey = key();
    prisma.$transaction = (async (fn: any, options: any) => { await transaction(fn, options); throw new Error("Injected lost commit acknowledgement"); }) as typeof prisma.$transaction;
    const recovered = await updateCanonicalCapability(id, { expectedRevision: 2, description: "Confirmed despite lost reply", idempotencyKey: committedKey });
    assert.equal(recovered.capability.revision, 3); assert((await capabilityWriteReceipt(committedKey, scope.id))?.committed);
    prisma.$transaction = transaction as typeof prisma.$transaction;
    checks.push("post-commit error recovered from matching durable event");
    const rollbackKey = key();
    prisma.$transaction = ((fn: any, options: any) => transaction(async (tx) => { await fn(tx); throw new Error("Injected rollback"); }, options)) as typeof prisma.$transaction;
    await assert.rejects(updateCanonicalCapability(id, { expectedRevision: 3, work: [work("SOF-104")], idempotencyKey: rollbackKey }), /rollback/);
    prisma.$transaction = transaction as typeof prisma.$transaction;
    assert.equal(await capabilityWriteReceipt(rollbackKey), null);
    assert.equal(await prisma.capabilityWorkLink.count({ where: { capabilityId: id, externalId: "SOF-104" } }), 0);
    assert.equal((await prisma.capability.findUniqueOrThrow({ where: { id } })).revision, 3);
    checks.push("rollback is not falsely confirmed and leaves no partial assignment");
    const findDerived = prisma.projectDerivedState.findUnique;
    prisma.projectDerivedState.findUnique = (async () => { throw new Error("Injected post-commit refresh failure"); }) as unknown as typeof findDerived;
    try {
      const saved = await updateCanonicalCapability(id, { expectedRevision: 3, description: "Saved while read unavailable", idempotencyKey: key() });
      assert.equal(saved.capability.revision, 4); assert.match(saved.refreshWarning ?? "", /Saved/);
    } finally { prisma.projectDerivedState.findUnique = findDerived; }
    checks.push("derived-read failure returns saved-with-warning, not failed save");
    await assert.rejects(updateCanonicalCapability(id, { expectedRevision: 1, name: "Stale edit", idempotencyKey: key() }), /another session/);
    const other = await createCanonicalCapability(scope.id, { name: "Other feature", idempotencyKey: key() });
    await assert.rejects(updateCanonicalCapability(other.capability.id, { expectedRevision: 1, work: [work("SOF-101")], idempotencyKey: key() }), /already linked/);
    const createKey = key(), input = { name: "New outside feature", status: "outside" as const, work: [work("SOF-105")], idempotencyKey: createKey };
    const first = await createCanonicalCapability(scope.id, input), second = await createCanonicalCapability(scope.id, input);
    assert.equal(first.capability.id, second.capability.id); assert.equal(second.created, false);
    await assert.rejects(createCanonicalCapability(scope.id, { ...input, name: "Different feature" }), /different change/);
    checks.push("stale revision and ownership collisions refused; create replay exactly once");
    const response = scopeRealityError(new Error("Transaction API error: raw private database detail"));
    assert.equal(response.status, 503); assert(!JSON.stringify(await response.json()).includes("raw private"));
    checks.push("friendly unconfirmed-save error does not leak database internals");
    assert.equal(SCOPE_WRITE_TRANSACTION.timeout, 20000);
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    prisma.$transaction = transaction as typeof prisma.$transaction;
    await prisma.scope.delete({ where: { id: scope.id } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
