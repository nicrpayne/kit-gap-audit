import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { prisma } from "../lib/prisma";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { sharingSetup, codeHash, keyedHash } from "../lib/reports/sharingPolicy";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && url.hostname === "127.0.0.1" && url.port === "55434" && (url.pathname === "/signal_t0_test_1004" || (url.pathname === "/signal_t0_test_1008" && url.username === "signal_t0_local")), "Disposable repair DB only");
  const runtime = Module as unknown as { _load(request: string, parent: unknown, isMain: boolean): unknown };
  const original = runtime._load;
  runtime._load = function(request, parent, isMain) { return request === "server-only" ? {} : original.call(this, request, parent, isMain); };
  const sharing = await import("../lib/reports/sharing");
  runtime._load = original;
  const config = sharingSetup({ REPORT_SHARING_SECRET: randomUUID() + randomUUID(), REPORT_PUBLIC_ORIGIN: "https://signal.example", REPORT_EMAIL_FROM: "reports@example.com", RESEND_API_KEY: "mock-only-never-sent" }).config!;
  const beforeScopes = await prisma.scope.findMany({ orderBy: { id: "asc" } }), beforeReports = await prisma.report.findMany({ orderBy: { id: "asc" } });
  const priorRates = (await prisma.reportShareRateLimit.findMany({ select: { key: true } })).map(r => r.key);
  const scope = await prisma.scope.create({ data: { name: `Private share proof ${randomUUID()}`, teamKey: "PRF", executionState: "not_configured" } });
  try {
    const ids = [];
    const comparisonId = randomUUID();
    for (const mode of ["reality", "scenario"] as const) {
      const owner = healthyOwnerFixture(); owner.project.id = scope.id; owner.project.name = scope.name;
      const brief = assembleDecisionBrief(owner);
      brief.identity.mode = mode; brief.identity.comparisonId = comparisonId; brief.identity.comparisonRequestHash = `hash-${comparisonId}`;
      const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
      const report = await prisma.report.create({ data: { scopeId: scope.id, mode, likelyDate: new Date("2026-11-01"), earliestDate: new Date("2026-10-20"), latestDate: new Date("2026-11-18"), shippedCount: 0, blockingCount: 0, resolvedSinceLastCount: 0, summaryMarkdown: "Fictional sharing proof", briefSnapshot: JSON.parse(JSON.stringify(brief)), briefRecipe: JSON.parse(JSON.stringify(recipe)) } });
      ids.push(report.id);
    }
    const initialReport = await prisma.report.findUniqueOrThrow({ where: { id: ids[0] } });
    const emails = Array.from({ length: 20 }, (_, i) => `reader-${i}@example.com`);
    const input = { emails, pair: true, days: 30, requestId: randomUUID() };
    const concurrent = await Promise.all([sharing.createReportShare(ids[0], input), sharing.createReportShare(ids[0], input)]);
    let share = concurrent[0]; assert.equal(share.id, concurrent[1].id, "create retries are idempotent");
    assert(!("snapshot" in share) && !("requestHash" in share), "management summary is allowlisted");
    await assert.rejects(sharing.createReportShare(ids[0], { ...input, days: 7 }), /already been used/);
    const full = await prisma.reportShare.findUniqueOrThrow({ where: { id: share.id } });
    assert.equal((full.snapshot as { reports: unknown[] }).reports.length, 2, "same-baseline Reality/Scenario pair captured");
    const frozen = JSON.stringify(full.snapshot);
    assert.deepEqual(await prisma.report.findUniqueOrThrow({ where: { id: ids[0] } }), initialReport, "publishing cannot change a saved report");
    await assert.rejects(sharing.createReportShare("missing", { ...input, requestId: randomUUID() }));
    const denied = await sharing.requestReportCode(config, share.id, "unapproved@example.com");
    assert.equal(denied.delivery, null); assert.match(denied.challengeId, /^[\w-]{36}$/);
    assert.equal((await sharing.requestReportCode(config, "unknown-share", emails[0])).delivery, null);
    const ratesBeforeAnonymous = await prisma.reportShareRateLimit.count();
    for (let i = 0; i < 110; i++) assert.equal((await sharing.requestReportCode(config, `unknown-${i}`, emails[0])).delivery, null);
    for (let i = 0; i < 205; i++) await assert.rejects(sharing.verifyReportCode(config, share.id, `unknown-${i}`, "00000000"));
    assert.equal(await prisma.reportShareRateLimit.count(), ratesBeforeAnonymous, "unknown requests neither allocate keys nor consume a legitimate reader's login budget");

    async function delivered(index: number) {
      const challenge = await sharing.requestReportCode(config, share.id, emails[index]);
      assert(challenge.delivery, `reader ${index} receives a mock delivery callback`);
      let code = "";
      await challenge.delivery(async (url, init) => {
        assert.equal(url, "https://api.resend.com/emails"); const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.to, [emails[index]]); code = body.text.match(/code is (\d{8})/)[1];
        assert(!body.text.includes(scope.name), "mail contains no report content");
        return new Response("{}", { status: 200 });
      });
      const row = await prisma.reportAccessChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } });
      assert.equal(row.codeHash, codeHash(config.secret, row.id, code)); assert(!JSON.stringify(row).includes(`"${code}"`));
      return { id: challenge.challengeId, code };
    }
    const valid = await delivered(0);
    await assert.rejects(sharing.verifyReportCode(config, "other-share", valid.id, valid.code));
    const session = await sharing.verifyReportCode(config, share.id, valid.id, valid.code);
    const storedSession = await prisma.reportReaderSession.findUniqueOrThrow({ where: { tokenHash: keyedHash(config.secret, `session:${session.token}`) } });
    assert(!JSON.stringify(storedSession).includes(session.token));
    assert.equal(JSON.stringify((await sharing.readSharedReport(config, share.id, session.token))?.snapshot), frozen);
    assert.equal(await sharing.readSharedReport(config, "other-share", session.token), null);
    assert.equal(await sharing.readSharedReport(config, share.id, "x".repeat(43)), null);
    await assert.rejects(sharing.verifyReportCode(config, share.id, valid.id, valid.code), /invalid, expired/);
    assert.equal(await sharing.readSharedReport(config, share.id, session.token, new Date(Date.now() + 9 * 3600_000)), null);
    await sharing.logoutReportReader(config, session.token);
    assert.equal(await sharing.readSharedReport(config, share.id, session.token), null);

    const wrong = await delivered(1), badCode = wrong.code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < 5; i++) await assert.rejects(sharing.verifyReportCode(config, share.id, wrong.id, badCode));
    assert.equal((await prisma.reportAccessChallenge.findUniqueOrThrow({ where: { id: wrong.id } })).attempts, 5, "bad attempts persist, not transaction rolled back");
    await assert.rejects(sharing.verifyReportCode(config, share.id, wrong.id, wrong.code));
    const expired = await delivered(2);
    await assert.rejects(sharing.verifyReportCode(config, share.id, expired.id, expired.code, new Date(Date.now() + 11 * 60_000)));
    const race = await delivered(3);
    const raced = await Promise.allSettled(Array.from({ length: 4 }, () => sharing.verifyReportCode(config, share.id, race.id, race.code)));
    assert.equal(raced.filter(r => r.status === "fulfilled").length, 1, "one successful concurrent redemption");

    const grant = await delivered(4), pendingGrant = await delivered(4);
    const grantSession = await sharing.verifyReportCode(config, share.id, grant.id, grant.code);
    share = await sharing.changeReportShare(ids[0], share.id, { revision: share.revision, action: "recipients", emails: emails.filter((_, i) => i !== 4) });
    assert.equal(await sharing.readSharedReport(config, share.id, grantSession.token), null, "removal invalidates existing reader session");
    share = await sharing.changeReportShare(ids[0], share.id, { revision: share.revision, action: "recipients", emails });
    assert.equal(await sharing.readSharedReport(config, share.id, grantSession.token), null, "regrant cannot resurrect old session");
    await assert.rejects(sharing.verifyReportCode(config, share.id, pendingGrant.id, pendingGrant.code), /invalid, expired/);
    await assert.rejects(sharing.changeReportShare(ids[0], share.id, { revision: 1, action: "recipients", emails }), /changed, expired/);
    await assert.rejects(sharing.changeReportShare(ids[1], share.id, { revision: share.revision, action: "revoke" }), /changed, expired/);

    for (let i = 0; i < 3; i++) assert((await sharing.requestReportCode(config, share.id, emails[5])).delivery);
    assert.equal((await sharing.requestReportCode(config, share.id, emails[5])).delivery, null, "recipient request flood limited");
    const failedMail = await sharing.requestReportCode(config, share.id, emails[6]);
    assert(failedMail.delivery); await failedMail.delivery(async () => new Response("private-provider-error", { status: 500 }));
    assert.equal((await prisma.reportAccessChallenge.findUniqueOrThrow({ where: { id: failedMail.challengeId } })).deliveredAt, null);

    const revoke = await delivered(7), pendingRevoke = await delivered(8);
    const revokeSession = await sharing.verifyReportCode(config, share.id, revoke.id, revoke.code);
    share = await sharing.changeReportShare(ids[0], share.id, { revision: share.revision, action: "revoke" });
    assert.equal(await sharing.readSharedReport(config, share.id, revokeSession.token), null);
    await assert.rejects(sharing.verifyReportCode(config, share.id, pendingRevoke.id, pendingRevoke.code));
    assert.equal((await sharing.requestReportCode(config, share.id, emails[9])).delivery, null);
    assert.equal(JSON.stringify((await prisma.reportShare.findUniqueOrThrow({ where: { id: share.id } })).snapshot), frozen, "recipient changes and revoke never rewrite captured facts");
    await assert.rejects(sharing.changeReportShare(ids[0], share.id, { revision: share.revision, action: "recipients", emails }));
    console.log("PASS private sharing DB: immutable pair, idempotent creation, cross-share isolation, code hashing, session hashing, wrong/expired codes, 5-attempt bound, replay/concurrency, revocation/regrant, mail failure and limits (mock transport only)");
  } finally {
    await prisma.reportShare.deleteMany({ where: { report: { scopeId: scope.id } } });
    await prisma.report.deleteMany({ where: { scopeId: scope.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
    await prisma.reportShareRateLimit.deleteMany({ where: { key: { notIn: priorRates } } });
    assert.deepEqual(await prisma.scope.findMany({ orderBy: { id: "asc" } }), beforeScopes);
    assert.deepEqual(await prisma.report.findMany({ orderBy: { id: "asc" } }), beforeReports);
    console.log("PASS cleanup: pre-existing Scope and Report rows preserved exactly; only proof-owned rows removed");
  }
}
main().finally(() => prisma.$disconnect());
