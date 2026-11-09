import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { NextRequest } from "next/server";
import { parseBootstrapCreate, parseBootstrapPatch } from "../../lib/bootstrap/input";
import { RequestValidationError } from "../../lib/http/json";
import { prisma } from "../../lib/prisma";
import { POST as create } from "../../app/api/project-bootstraps/route";
import { PATCH as edit } from "../../app/api/project-bootstraps/[id]/route";
import { POST as manual } from "../../app/api/project-bootstraps/[id]/candidates/route";
import { PATCH as review } from "../../app/api/project-bootstraps/[id]/candidates/[candidateId]/route";

test("Project setup schemas retain explicit blanks and false; never truncate or silently filter bad values", () => {
  assert.deepEqual(parseBootstrapCreate({ canonicalName: " Harbor " }), {
    canonicalName: "Harbor",
    aliases: [],
    ownerHint: null,
    sourceHints: [],
    searchExistingKnowledge: true,
  });
  assert.deepEqual(
    parseBootstrapPatch({
      aliases: ["", " HR ", "HR"],
      ownerHint: " ",
      sourceHints: [],
      searchExistingKnowledge: false,
    }),
    {
      aliases: ["HR"],
      ownerHint: null,
      sourceHints: [],
      searchExistingKnowledge: false,
    },
  );
  assert.deepEqual(parseBootstrapPatch({}), {});
  for (const body of [
    { canonicalName: "-" },
    { canonicalName: "x".repeat(161) },
    { canonicalName: null },
    { aliases: [1] },
    { aliases: ["---"] },
    { aliases: Array(21).fill("One") },
    { ownerHint: false },
    { ownerHint: "x".repeat(201) },
    { sourceHints: [false] },
    { sourceHints: ["x".repeat(2049)] },
    { searchExistingKnowledge: "false" },
  ])
    assert.throws(() => parseBootstrapPatch(body), RequestValidationError);
});

test("Setup routes reject malformed/oversized bodies before any database call", async () => {
  const params = Promise.resolve({ id: "fictional", candidateId: "fictional-candidate" });
  for (const [handler, method] of [
    [create, "POST"],
    [edit, "PATCH"],
    [manual, "POST"],
    [review, "PATCH"],
  ] as const) {
    for (const [body, status] of [
      ["[]", 400],
      ["null", 400],
      ["{", 400],
      [JSON.stringify({ text: "x".repeat(65536) }), 413],
    ] as const) {
      const request = new NextRequest("http://localhost/api/project-bootstraps", {
        method,
        body,
        headers: { "content-type": "application/json" },
      });
      assert.equal((await handler(request, { params })).status, status);
    }
  }
});

test("A database outage is a safe 500, not a false 'not found' or leaked connection string", async () => {
  const log = mock.method(console, "error", () => undefined);
  const transaction = prisma.$transaction;
  prisma.$transaction = (async () => {
    throw new Error("postgres://private-credential@database");
  }) as typeof prisma.$transaction;
  try {
    const response = await edit(
      new NextRequest("http://localhost/api/project-bootstraps/fictional", {
        method: "PATCH",
        body: JSON.stringify({ ownerHint: "Example owner" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "fictional" }) },
    );
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /postgres|credential|not found/);
    assert.equal(log.mock.calls.length, 1);
  } finally {
    prisma.$transaction = transaction;
    log.mock.restore();
  }
});
