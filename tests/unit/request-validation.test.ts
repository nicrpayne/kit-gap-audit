import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { readJsonObject, RequestValidationError, validationResponse } from "../../lib/http/json";
import { parsePersonInput, validateExternalCommitment } from "../../lib/people/input";
import { parseScopeInput, parseScopePatchInput } from "../../lib/scopes/input";
import { parseActivationInput } from "../../lib/bootstrap/activationInput";
import { parseAllocationInput } from "../../lib/capacity/allocationInput";
import { POST as createPerson } from "../../app/api/people/route";
import { PATCH as editPerson } from "../../app/api/people/[id]/route";
import { POST as createScope } from "../../app/api/scopes/route";
import { PATCH as editScope } from "../../app/api/scopes/[id]/route";
import { POST as activate } from "../../app/api/project-bootstraps/[id]/activate/route";
import { POST as login } from "../../app/api/login/route";
import { PUT as allocate } from "../../app/api/allocations/route";

const request = (body: string, method = "POST") =>
  new NextRequest("http://localhost/api/test", {
    method,
    body,
    headers: { "content-type": "application/json", origin: "http://localhost" },
  });

test("JSON reader rejects null, primitives, arrays and malformed JSON", async () => {
  for (const body of ["null", "[]", "1", '"text"', "{"]) {
    await assert.rejects(readJsonObject(request(body)), RequestValidationError);
  }
  assert.deepEqual(await readJsonObject(request('{"name":"Example"}')), { name: "Example" });
  await assert.rejects(readJsonObject(new Request("http://localhost")), /JSON object/);
  await assert.rejects(
    readJsonObject(new Request("http://localhost", { method: "POST", body: "text" })),
    { status: 415 },
  );
});

test("JSON reader enforces bytes with and without Content-Length", async () => {
  const tooLarge = request('{"text":"éééé"}');
  await assert.rejects(readJsonObject(tooLarge, 15), { status: 413 });
  const declared = request("{}");
  declared.headers.set("content-length", "100");
  await assert.rejects(readJsonObject(declared, 15), { status: 413 });
  assert.deepEqual(await readJsonObject(request("{}"), 2), {});
  assert.throws(() => validationResponse(new Error("server failure")), /server failure/);
});

test("Person inputs preserve defaults and partial update semantics", () => {
  assert.deepEqual(parsePersonInput({}), {});
  assert.deepEqual(
    parsePersonInput({ name: " Example ", fte: 0.5, active: false, externalCommitmentFte: 0.2 }),
    {
      name: "Example",
      fte: 0.5,
      active: false,
      externalCommitmentFte: 0.2,
    },
  );
  for (const body of [
    { name: 123 },
    { name: null },
    { name: " " },
    { active: "false" },
    { fte: NaN },
    { fte: 0 },
    { fte: 2 },
    { externalCommitmentFte: -1 },
    { externalCommitmentFte: Infinity },
  ]) {
    assert.throws(() => parsePersonInput(body), RequestValidationError);
  }
  assert.throws(() => validateExternalCommitment(0.5, 0.6), RequestValidationError);
  assert.throws(() => validateExternalCommitment(0.5, -0.1), RequestValidationError);
  assert.throws(() => validateExternalCommitment(0.5, NaN), RequestValidationError);
  validateExternalCommitment(0.5, 0.5);
});

test("Scope and allocation schemas reject invalid shapes before external calls", () => {
  assert.deepEqual(
    parseScopeInput({ name: " Example ", teamKey: "EX", projectNames: ["One"], labelFilter: null }),
    {
      name: "Example",
      teamKey: "EX",
      projectNames: ["One"],
      labelFilter: null,
    },
  );
  for (const body of [
    {},
    { name: 1, teamKey: "EX" },
    { name: "Example", teamKey: "EX", projectNames: [null] },
  ]) {
    assert.throws(() => parseScopeInput(body), RequestValidationError);
  }
  assert.deepEqual(parseAllocationInput({ allocations: [] }), []);
  const allocation = { personId: "example-person", scopeId: "example-scope", fraction: 0.5 };
  assert.deepEqual(parseAllocationInput({ allocations: [allocation] }), [allocation]);
  for (const allocations of [
    null,
    [null],
    [1],
    [{}],
    [{ ...allocation, fraction: Infinity }],
    [allocation, allocation],
  ]) {
    assert.throws(() => parseAllocationInput({ allocations }), RequestValidationError);
  }
});

// These invoke the real handlers, not just schemas. Invalid requests must return
// before any database/client call, so the suite needs no connection or secrets.
test("Actual write handlers return 400 for malformed inputs, without database access", async () => {
  const handlers = [
    (body: string) => createPerson(request(body)),
    (body: string) =>
      editPerson(request(body, "PATCH"), { params: Promise.resolve({ id: "fictional-person" }) }),
    (body: string) => createScope(request(body)),
    (body: string) =>
      editScope(request(body, "PATCH"), { params: Promise.resolve({ id: "fictional" }) }),
    (body: string) => activate(request(body), { params: Promise.resolve({ id: "fictional" }) }),
    (body: string) => login(request(body)),
    (body: string) => allocate(request(body, "PUT")),
  ];
  for (const handler of handlers) {
    for (const body of ["null", "[]", "{"]) {
      const response = await handler(body);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, "string");
    }
  }
  assert.equal((await createPerson(request('{"name":123}'))).status, 400);
  assert.equal(
    (
      await editPerson(request('{"name":123}', "PATCH"), {
        params: Promise.resolve({ id: "fictional" }),
      })
    ).status,
    400,
  );
  assert.equal((await allocate(request('{"allocations":[null]}', "PUT"))).status, 400);
});

test("Project settings reject type coercion, impossible dates and unbounded lists", () => {
  assert.deepEqual(parseScopePatchInput({}), {});
  assert.deepEqual(
    parseScopePatchInput({
      name: " Example ",
      teamCapacity: 0,
      targetDate: "",
      labelFilter: " ",
      estimationContext: null,
      dependsOnScopeIds: [" one ", "one", ""],
      includeTriage: false,
    }),
    {
      name: "Example",
      teamCapacity: null,
      targetDate: null,
      labelFilter: null,
      estimationContext: null,
      dependsOnScopeIds: ["one"],
      includeTriage: false,
    },
  );
  for (const targetDate of [
    "2028-02-29",
    "2026-10-31T00:00:00.000Z",
    "2026-10-31T09:00:00-05:00",
  ]) {
    assert.equal(parseScopePatchInput({ targetDate }).targetDate, targetDate);
  }
  for (const body of [
    { name: 1 },
    { name: "" },
    { teamKey: [] },
    { projectNames: [null] },
    { dependsOnScopeIds: [false] },
    { notionPageUrls: "url" },
    { figmaUrls: [2] },
    { includeTriage: "false" },
    { teamCapacity: "3" },
    { teamCapacity: -1 },
    { teamCapacity: Infinity },
    { targetDate: "2026-02-30" },
    { targetDate: "2026-02-30T00:00:00Z" },
    { targetDate: "tomorrow" },
    { targetDate: "2026-10-31T09:00:00" },
    { targetDate: 1 },
    { targetDate: "2026-10-31T99:00:00Z" },
    { expectedRealityRevision: -1 },
    { expectedRealityRevision: 0.5 },
    { expectedRealityRevision: Number.MAX_SAFE_INTEGER + 1 },
    { notionPageUrls: Array(101).fill("page") },
    { estimationContext: "x".repeat(20_001) },
  ])
    assert.throws(() => parseScopePatchInput(body), RequestValidationError);
});

test("Activation cannot silently treat strings as acknowledgements or accept malformed execution", () => {
  assert.deepEqual(parseActivationInput({ expectedRevision: 0 }), { expectedRevision: 0 });
  assert.deepEqual(
    parseActivationInput({
      expectedRevision: 1,
      acknowledgeProviderGaps: false,
      execution: { state: "configured", teamKey: " EX ", projectNames: ["One"], labelFilter: null },
    }),
    {
      expectedRevision: 1,
      acknowledgeProviderGaps: false,
      execution: { state: "configured", teamKey: "EX", projectNames: ["One"], labelFilter: null },
    },
  );
  for (const body of [
    { expectedRevision: "1" },
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { expectedRevision: 1, acknowledgeProviderGaps: "false" },
    { expectedRevision: 1, acknowledgedBlockerIds: "blocker" },
    { expectedRevision: 1, execution: [] },
    { expectedRevision: 1, execution: null },
    { expectedRevision: 1, execution: { state: "made_up" } },
    { expectedRevision: 1, execution: { projectNames: [1] } },
  ])
    assert.throws(() => parseActivationInput(body), RequestValidationError);
});
