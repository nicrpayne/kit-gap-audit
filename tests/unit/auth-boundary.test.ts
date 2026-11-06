import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { bridgeTransportTokenFor, SESSION_COOKIE, sessionTokenFor } from "../../lib/auth";

const request = (path: string, headers?: HeadersInit) =>
  new NextRequest(`http://localhost${path}`, { headers });

test("Missing operator credentials fail closed in deployed/unknown runtimes", async () => {
  const original = { ...process.env };
  try {
    delete process.env.APP_PASSWORD;
    for (const runtime of ["production", "unknown", undefined]) {
      if (runtime === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else Object.assign(process.env, { NODE_ENV: runtime });
      for (const path of ["/api/scopes", "/control-room"]) {
        const response = await middleware(request(path));
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
      assert.equal(
        (await middleware(request("/api/version"))).headers.get("x-middleware-next"),
        "1",
      );
    }
    for (const runtime of ["development", "test"]) {
      Object.assign(process.env, { NODE_ENV: runtime });
      assert.equal(
        (await middleware(request("/api/scopes"))).headers.get("x-middleware-next"),
        "1",
      );
    }
  } finally {
    process.env = original;
  }
});

test("Existing operator sessions and scoped bridge credentials retain their boundaries", async () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_PASSWORD: "fictional-local-test-password",
    });
    const token = await sessionTokenFor(process.env.APP_PASSWORD!);
    assert.equal(
      (
        await middleware(request("/control-room", { cookie: `${SESSION_COOKIE}=${token}` }))
      ).headers.get("x-middleware-next"),
      "1",
    );
    assert.equal(
      (
        await middleware(
          request("/api/scopes", { authorization: `Bearer ${process.env.APP_PASSWORD}` }),
        )
      ).status,
      200,
    );
    assert.equal(
      (await middleware(request("/api/scopes", { cookie: "report_reader=fictional" }))).status,
      401,
    );
    assert.equal((await middleware(request("/control-room"))).status, 307);
    const bridge = await bridgeTransportTokenFor(process.env.APP_PASSWORD!);
    assert.equal(
      (await middleware(request("/api/bridge/bootstrap", { authorization: `Bearer ${bridge}` })))
        .status,
      200,
    );
    assert.equal(
      (await middleware(request("/api/scopes", { authorization: `Bearer ${bridge}` }))).status,
      401,
    );
    assert.equal(
      (
        await middleware(
          request("/api/bridge/bootstrap", { authorization: `Bearer ${process.env.APP_PASSWORD}` }),
        )
      ).status,
      401,
    );
    const shared = await middleware(request("/shared/reports/fictional-report"));
    assert.equal(shared.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(
      shared.headers.get("x-middleware-next"),
      "1",
      "recipient routes still authenticate independently",
    );
  } finally {
    process.env = original;
  }
});
