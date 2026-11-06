import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import { middleware } from "../../middleware";
import { POST as login } from "../../app/api/login/route";
import { POST as logout } from "../../app/api/logout/route";
import { requireReportOwner } from "../../lib/reports/sharingHttp";
import { authenticateOperatorCookie } from "../../lib/auth/operatorSessions";
import {
  equalCredential,
  isOperatorToken,
  legacySessionWindowOpen,
  operatorCredentialVersion,
  operatorTokenHash,
} from "../../lib/auth/operatorPolicy";
import {
  isSameOriginWrite,
  isTrustedBearerWrite,
  operatorOrigin,
} from "../../lib/auth/requestPolicy";
import { safeReturnPath } from "../../lib/auth/returnPath";

const origin = "https://signal.example";
const token = `op1_${"a".repeat(64)}`;
const password = "fictional-auth-test";
const request = (path: string, method = "POST", headers: HeadersInit = {}, body?: string) =>
  new NextRequest(`${origin}${path}`, { method, headers, body });

test("Credential policy and legacy grace are bounded and domain-separated", () => {
  assert(equalCredential("same", "same"));
  assert(!equalCredential("same", "different"));
  assert.notEqual(
    operatorCredentialVersion(password, "1"),
    operatorCredentialVersion(password, "2"),
  );
  assert.notEqual(
    operatorCredentialVersion(password, "1"),
    operatorCredentialVersion("changed", "1"),
  );
  assert(isOperatorToken(token));
  assert(!isOperatorToken("a".repeat(64)));
  const start = Date.parse("2026-01-01T00:00:00Z"),
    end = start + 7 * 86400_000;
  const env = {
    OPERATOR_LEGACY_SESSION_FROM: new Date(start).toISOString(),
    OPERATOR_LEGACY_SESSION_UNTIL: new Date(end).toISOString(),
  };
  assert(legacySessionWindowOpen(env, start));
  assert(!legacySessionWindowOpen(env, start - 1));
  assert(!legacySessionWindowOpen(env, end));
  assert(
    !legacySessionWindowOpen(
      { ...env, OPERATOR_LEGACY_SESSION_UNTIL: new Date(end + 1).toISOString() },
      start,
    ),
  );
  assert(!legacySessionWindowOpen({}, start));
  assert(!legacySessionWindowOpen({ ...env, OPERATOR_LEGACY_SESSION_FROM: "invalid" }, start));
});

test("Browser write origins are exact; forwarded host and same-site claims do not grant access", () => {
  const saved = { ...process.env };
  try {
    delete process.env.OPERATOR_APP_ORIGIN;
    for (const bad of [
      "https://evil.example",
      "null",
      `${origin}.evil.example`,
      "https://signal.example:444",
    ]) {
      assert(
        !isSameOriginWrite(
          request("/api/scopes", "POST", { origin: bad, "sec-fetch-site": "same-site" }),
        ),
      );
    }
    assert(!isSameOriginWrite(request("/api/scopes")));
    assert(isSameOriginWrite(request("/api/scopes", "POST", { origin })));
    assert(
      !isSameOriginWrite(
        request("/api/scopes", "POST", { origin, "sec-fetch-site": "cross-site" }),
      ),
    );
    assert(
      !isSameOriginWrite(
        request("/api/scopes", "POST", {
          origin: "https://evil.example",
          "x-forwarded-host": "evil.example",
        }),
      ),
    );
    assert(isTrustedBearerWrite(request("/api/scopes")));
    assert(
      !isTrustedBearerWrite(request("/api/scopes", "POST", { origin: "https://evil.example" })),
    );
    process.env.OPERATOR_APP_ORIGIN = "https://public.example";
    assert(isSameOriginWrite(request("/api/scopes", "POST", { origin: "https://public.example" })));
    for (const invalid of ["oops", "https://user@public.example", "https://public.example/path"]) {
      process.env.OPERATOR_APP_ORIGIN = invalid;
      assert.equal(operatorOrigin(request("/api/scopes")), null);
      assert(!isSameOriginWrite(request("/api/scopes", "POST", { origin })));
    }
  } finally {
    process.env = saved;
  }
});

test("Login return paths cannot execute scripts or navigate to another site", () => {
  for (const value of [
    null,
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/\\evil.example",
    "/\nevil.example",
  ])
    assert.equal(safeReturnPath(value), "/");
  assert.equal(
    safeReturnPath("/reports/example/share?pair=1#preview"),
    "/reports/example/share?pair=1#preview",
  );
});

test("Real auth boundaries enforce expiry, revocation, rotation, origin and failure behavior", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    APP_PASSWORD: password,
    OPERATOR_SESSION_EPOCH: "1",
    OPERATOR_APP_ORIGIN: origin,
  });
  const now = new Date();
  const row = {
    tokenHash: operatorTokenHash(token),
    credentialVersion: operatorCredentialVersion(password),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null as Date | null,
  };
  // Prisma delegates are proxies without method descriptors, so mock.method
  // cannot wrap them. Replace only these three boundaries and always restore.
  const original = {
    lookup: prisma.operatorSession.findUnique,
    writes: prisma.operatorSession.updateMany,
    rate: prisma.$queryRaw,
  };
  const lookup = mock.fn(async () => row);
  const writes = mock.fn(async () => ({ count: 1 }));
  const rate = mock.fn(async () => [{ count: 21, resetsAt: new Date(now.getTime() + 60_000) }]);
  prisma.operatorSession.findUnique = lookup as typeof prisma.operatorSession.findUnique;
  prisma.operatorSession.updateMany = writes as typeof prisma.operatorSession.updateMany;
  prisma.$queryRaw = rate as typeof prisma.$queryRaw;
  try {
    assert.equal(await authenticateOperatorCookie(token, password, now), "session");
    assert.equal(await authenticateOperatorCookie(token, password, row.expiresAt), null);
    row.revokedAt = now;
    assert.equal(await authenticateOperatorCookie(token, password, now), null);
    row.revokedAt = null;
    process.env.OPERATOR_SESSION_EPOCH = "2";
    assert.equal(await authenticateOperatorCookie(token, password, now), null);
    process.env.OPERATOR_SESSION_EPOCH = "1";
    assert.equal(await authenticateOperatorCookie(token, "other-password", now), null);
    const cookie = `kit_session=${token}`;
    for (const path of [
      "/api/scopes",
      "/api/allocations",
      "/api/scenarios",
      "/api/reports/test/shares",
      "/api/audit/refresh",
      "/api/bridge/bootstrap",
    ]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        assert.equal((await middleware(request(path, method, { cookie }))).status, 403);
        assert.equal((await middleware(request(path, method, { cookie, origin }))).status, 200);
      }
    }
    await requireReportOwner(request("/api/reports/test/shares", "POST", { cookie, origin }), true);
    await assert.rejects(
      requireReportOwner(request("/api/reports/test/shares", "POST", { cookie }), true),
      { status: 403 },
    );
    const crossSite = await logout(
      request("/api/logout", "POST", { cookie, origin: "https://evil.example" }),
    );
    assert.equal(crossSite.status, 403);
    assert.equal(writes.mock.callCount(), 0);
    assert.equal((await logout(request("/api/logout", "POST", { cookie, origin }))).status, 200);
    const limited = await login(
      request(
        "/api/login",
        "POST",
        { origin, "content-type": "application/json" },
        JSON.stringify({ password }),
      ),
    );
    assert.equal(limited.status, 429);
    assert(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(limited.headers.get("set-cookie"), null);
    rate.mock.mockImplementation(async () => {
      throw new Error("private database host details");
    });
    const down = await login(
      request(
        "/api/login",
        "POST",
        { origin, "content-type": "application/json" },
        JSON.stringify({ password }),
      ),
    );
    assert.equal(down.status, 503);
    assert(!(await down.text()).includes("private database"));
    assert.equal(down.headers.get("set-cookie"), null);
    lookup.mock.mockImplementation(async () => {
      throw new Error("private database host details");
    });
    const inaccessible = await middleware(request("/api/scopes", "GET", { cookie }));
    assert.equal(inaccessible.status, 503);
    assert.equal(inaccessible.headers.get("set-cookie"), null);
    await assert.rejects(
      requireReportOwner(request("/api/reports/test/shares", "GET", { cookie })),
      { status: 503 },
    );
    writes.mock.mockImplementation(async () => {
      throw new Error("private database host details");
    });
    const signOutFailed = await logout(request("/api/logout", "POST", { cookie, origin }));
    assert.equal(signOutFailed.status, 503);
    assert.equal(signOutFailed.headers.get("set-cookie"), null);
  } finally {
    prisma.operatorSession.findUnique = original.lookup;
    prisma.operatorSession.updateMany = original.writes;
    prisma.$queryRaw = original.rate;
    process.env = saved;
  }
});
