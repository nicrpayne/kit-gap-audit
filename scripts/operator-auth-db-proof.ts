import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";
import {
  authenticateOperatorCookie,
  consumeLoginAttempt,
  createOperatorSession,
  revokeOperatorSession,
} from "../lib/auth/operatorSessions";
import {
  LOGIN_ATTEMPTS,
  LOGIN_WINDOW_MS,
  OPERATOR_SESSION_SECONDS,
  operatorTokenHash,
} from "../lib/auth/operatorPolicy";
import { middleware } from "../middleware";
import { POST as logout } from "../app/api/logout/route";

async function main() {
  assertDisposableDatabaseProofEnvironment(process.env, "SIGNAL_AUTH_DB_PROOF");
  assert.equal(await prisma.operatorSession.count(), 0, "Use a fresh disposable auth database");
  assert.equal(
    await prisma.operatorLoginRateLimit.count(),
    0,
    "Use a fresh disposable rate-limit table",
  );
  const saved = { ...process.env },
    password = "fictional-local-auth-only",
    origin = "https://signal.example";
  Object.assign(process.env, {
    APP_PASSWORD: password,
    OPERATOR_SESSION_EPOCH: "1",
    OPERATOR_APP_ORIGIN: origin,
  });
  const scope = await prisma.scope.create({
    data: { name: "Fictional auth sentinel", teamKey: "TEST" },
  });
  const report = await prisma.report.create({
    data: {
      scopeId: scope.id,
      likelyDate: new Date("2026-12-01"),
      earliestDate: new Date("2026-11-20"),
      latestDate: new Date("2026-12-15"),
      shippedCount: 0,
      blockingCount: 0,
      resolvedSinceLastCount: 0,
      summaryMarkdown: "Fictional report preserved across authentication changes.",
    },
  });
  const snapshot = async () =>
    JSON.stringify({
      scopes: await prisma.scope.findMany({ orderBy: { id: "asc" } }),
      reports: await prisma.report.findMany({ orderBy: { id: "asc" } }),
    });
  const before = await snapshot(),
    now = new Date();
  try {
    const [one, two] = await Promise.all([
      createOperatorSession(password, now),
      createOperatorSession(password, now),
    ]);
    assert.notEqual(one.token, two.token, "Logins produce independently revocable tokens");
    assert.equal(one.expiresAt.getTime() - now.getTime(), OPERATOR_SESSION_SECONDS * 1000);
    const rows = await prisma.operatorSession.findMany();
    assert(
      !JSON.stringify(rows).includes(one.token) && !JSON.stringify(rows).includes(password),
      "No raw tokens or passwords stored",
    );
    assert.equal(await authenticateOperatorCookie(one.token, password, now), "session");
    assert.equal(
      await authenticateOperatorCookie(one.token, password, one.expiresAt),
      null,
      "Server expiry, independent of browser cookie",
    );
    assert.equal(await authenticateOperatorCookie(one.token, "rotated-password", now), null);
    process.env.OPERATOR_SESSION_EPOCH = "2";
    assert.equal(
      await authenticateOperatorCookie(one.token, password, now),
      null,
      "Emergency rotation invalidates all sessions",
    );
    process.env.OPERATOR_SESSION_EPOCH = "1";
    await revokeOperatorSession(one.token, now);
    assert.equal(await authenticateOperatorCookie(one.token, password, now), null);
    assert.equal(
      await authenticateOperatorCookie(two.token, password, now),
      "session",
      "Other browser remains signed in",
    );
    const cookie = `kit_session=${two.token}`;
    assert.equal(
      (await middleware(new NextRequest(`${origin}/api/scopes`, { headers: { cookie } }))).status,
      200,
    );
    const response = await logout(
      new NextRequest(`${origin}/api/logout`, { method: "POST", headers: { cookie, origin } }),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(
      (await middleware(new NextRequest(`${origin}/api/scopes`, { headers: { cookie } }))).status,
      401,
      "Replaying copied cookie after logout fails",
    );
    const attempts = await Promise.all(Array.from({ length: 50 }, () => consumeLoginAttempt(now)));
    assert.equal(
      attempts.filter((result) => result.allowed).length,
      LOGIN_ATTEMPTS,
      "Atomic limit holds under concurrent requests",
    );
    assert.equal(
      await prisma.operatorLoginRateLimit.count(),
      1,
      "No unbounded attacker-controlled keys",
    );
    assert.equal(
      (await consumeLoginAttempt(new Date(now.getTime() + LOGIN_WINDOW_MS - 1))).allowed,
      false,
    );
    assert.equal(
      (await consumeLoginAttempt(new Date(now.getTime() + LOGIN_WINDOW_MS))).allowed,
      true,
      "Rate window recovers exactly at expiry",
    );
    const stored = await prisma.operatorSession.findUniqueOrThrow({
      where: { tokenHash: operatorTokenHash(two.token) },
    });
    assert(stored.revokedAt);
    assert.equal(await snapshot(), before, "Auth does not mutate project data or saved reports");
    console.log(
      "PASS real PostgreSQL: independent random sessions, hashed storage, expiry, revocation/replay, password/epoch rotation, concurrent throttling, reset boundary, project/report preservation",
    );
  } finally {
    // Only this explicitly disposable proof's auth/sentinel records are removed.
    await prisma.operatorSession.deleteMany();
    await prisma.operatorLoginRateLimit.deleteMany();
    await prisma.report.delete({ where: { id: report.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
    process.env = saved;
  }
}
main().finally(() => prisma.$disconnect());
