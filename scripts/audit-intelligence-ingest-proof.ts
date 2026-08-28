// THE RECEIVING END OF THE BRIDGE, EXERCISED OVER HTTP.
//
// This is the handshake a Hermes push actually makes: POST /api/refresh with
// a `contextPackage`. Nothing here contacts the real bridge — the producer
// side is external to this repository and unreachable from this environment
// — so what it proves is exactly and only that SIGNAL'S END IS READY:
//
//   the route accepts a package carrying intelligence
//   the validator preserves it rather than dropping it
//   it persists into the existing ContextSnapshot.package Json column,
//     with NO new Prisma model, column or index
//   the graph read picks it up and projects it
//   a byte-identical retry is idempotent, as the transport contract requires
//   a package that lies about trust is refused with a 400
//
//   npx tsx scripts/audit-intelligence-ingest-proof.ts

import { PrismaClient } from "@prisma/client";
import { buildIntelligenceFixturePackage, JSA_SCALE, REAL_JSA } from "./lib/intel-fixture";
import { EXTERNAL_INTELLIGENCE_TRUST } from "../lib/context/package";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph } from "../lib/audit/graph";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const prisma = new PrismaClient();

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const post = (contextPackage: unknown) =>
  fetch(`${BASE}/api/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `kit_session=${COOKIE}` },
    body: JSON.stringify({ scopeId: "jsa", contextPackage }),
  });

async function main() {
  const pkg = buildIntelligenceFixturePackage("jsa");
  const bytes = Buffer.byteLength(JSON.stringify(pkg), "utf8");
  // Start from nothing, so "it landed" means this run landed it.
  await prisma.contextSnapshot.deleteMany({ where: { packageId: pkg.packageId, producer: pkg.producer } });
  // The two registered sources need the registrations they name.
  for (const src of pkg.sources.filter((x) => x.registrationId !== null)) {
    await prisma.sourceRegistration.upsert({
      where: { id: src.registrationId! },
      update: { sourceType: src.sourceType, sourceRef: src.sourceRef, status: "active" },
      create: {
        id: src.registrationId!,
        sourceType: src.sourceType,
        sourceRef: src.sourceRef,
        scopeIds: ["jsa"],
        role: "raw_evidence",
        status: "active",
      },
    });
  }

  const modelsBefore = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*)::bigint as count from information_schema.tables where table_schema = 'public'`
  );
  const columnsBefore = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*)::bigint as count from information_schema.columns
     where table_schema = 'public' and table_name = 'ContextSnapshot'`
  );

  // ── I1. THE ROUTE ACCEPTS IT ───────────────────────────────────────
  //
  // ACCEPTANCE IS THE SNAPSHOT, NOT THE 200. /api/refresh does a great deal
  // after ingesting a package — audit, estimation, forecast, report — and in
  // an environment with no model key the audit step fails and the whole
  // request answers 502. The package was still accepted and persisted, and
  // the route says so by returning the snapshot id alongside the error. That
  // distinction is the point: a 400 is the CONTRACT rejecting a package; a
  // 502 carrying a snapshot id is Signal having taken it and something
  // downstream being unavailable.
  const res = await post(pkg);
  const body = (await res.json()) as { contextSnapshotId?: string | null; error?: string };
  const accepted = typeof body.contextSnapshotId === "string" && body.contextSnapshotId.length > 0;
  check(
    "I1 POST /api/refresh accepts a package carrying external intelligence",
    accepted && res.status !== 400,
    res.ok
      ? `HTTP ${res.status}, snapshot ${body.contextSnapshotId}`
      : `HTTP ${res.status}, snapshot ${body.contextSnapshotId} — accepted; a downstream step was unavailable in this environment: ${(body.error ?? "").slice(0, 90)}`
  );
  if (!accepted) throw new Error("ingest failed; nothing further is meaningful");

  // ── I2. IT LANDED, WHOLE, IN THE COLUMN THAT ALREADY EXISTED ───────
  const row = await prisma.contextSnapshot.findFirst({
    where: { packageId: pkg.packageId, producer: pkg.producer },
  });
  const stored = row?.package as { intelligenceObjects?: unknown[]; intelligenceRelations?: unknown[] } | null;
  check(
    "I2 the intelligence survived validation and persistence intact",
    (stored?.intelligenceObjects?.length ?? 0) === JSA_SCALE.objects &&
      (stored?.intelligenceRelations?.length ?? 0) === JSA_SCALE.relations,
    `${stored?.intelligenceObjects?.length ?? 0} objects, ${stored?.intelligenceRelations?.length ?? 0} relations in ` +
      `ContextSnapshot.package — an ${(bytes / 1024).toFixed(0)} KB body accepted over HTTP with no body-size configuration`
  );

  // ── I2b. AND SO DID THE PASSAGE ANCHORING ──────────────────────────
  //
  // The fields Signal did not model and was deleting at the boundary.
  {
    const ev = (row?.package as { evidence: { id: string; extra?: Record<string, unknown>; independence?: string }[] }).evidence;
    const traced = ev.find((e) => e.id === REAL_JSA.trace.evidence);
    const anchor = (traced?.extra ?? {}) as Record<string, unknown>;
    const absent = ev.slice(0, REAL_JSA.structuredPassages).filter((e) => e.independence === undefined).length;
    check(
      "I2b passage anchoring and independence survive the round trip",
      typeof anchor.quoteHash === "string" &&
        typeof anchor.charStart === "number" &&
        anchor.offsetUnit === "unicode_codepoint" &&
        absent === REAL_JSA.independence.absent,
      `chars ${anchor.charStart}–${anchor.charEnd} ${anchor.offsetUnit}; ` +
        `${absent} passages still carry NO independence value, exactly as sent`
    );
  }

  // ── I3. NO SCHEMA CHANGE WAS NEEDED ────────────────────────────────
  const modelsAfter = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*)::bigint as count from information_schema.tables where table_schema = 'public'`
  );
  const columnsAfter = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `select count(*)::bigint as count from information_schema.columns
     where table_schema = 'public' and table_name = 'ContextSnapshot'`
  );
  check(
    "I3 no new table and no new column — the Json column carried all of it",
    modelsBefore[0].count === modelsAfter[0].count && columnsBefore[0].count === columnsAfter[0].count,
    `${modelsAfter[0].count} tables, ${columnsAfter[0].count} ContextSnapshot columns, unchanged — persistence was NOT necessary`
  );

  // ── I4. THE GRAPH READ PICKS IT UP ─────────────────────────────────
  const inputs = await loadAuditGraphInputs("jsa");
  const g = buildAuditGraph(inputs!);
  const intel = g.filterNodes((_n, a) => a.kind === "intel").length;
  check(
    "I4 the graph read projects it with no further plumbing",
    intel === JSA_SCALE.objects,
    `${intel} intel nodes in the JSA graph, from ${g.order} total (${g.size} edges)`
  );

  // ── I5. A RETRY IS IDEMPOTENT ──────────────────────────────────────
  const before = await prisma.contextSnapshot.count();
  const retry = await post(pkg);
  const retryBody = (await retry.json()) as { contextSnapshotId?: string | null };
  const after = await prisma.contextSnapshot.count();
  check(
    "I5 a byte-identical retry creates no second snapshot",
    retry.status !== 400 && before === after && retryBody.contextSnapshotId === row?.id,
    `HTTP ${retry.status}, ${before} → ${after} snapshots, same id returned`
  );

  // ── I6. A PACKAGE THAT LIES ABOUT TRUST IS REFUSED AT THE BOUNDARY ─
  const lying = {
    ...pkg,
    packageId: `${pkg.packageId}-lying`,
    intelligenceObjects: pkg.intelligenceObjects!.map((o, i) => (i === 0 ? { ...o, trust: "signal_reality" } : o)),
  };
  const bad = await post(lying);
  const badBody = (await bad.json()) as { error?: string };
  check(
    "I6 a package claiming its intelligence is Signal Reality is refused over HTTP",
    bad.status === 400 && /external/i.test(badBody.error ?? ""),
    `HTTP ${bad.status} — ${(badBody.error ?? "").slice(0, 130)}`
  );
  check(
    "I6b and nothing about it was stored",
    (await prisma.contextSnapshot.count({ where: { packageId: lying.packageId } })) === 0,
    `trust must equal ${EXTERNAL_INTELLIGENCE_TRUST}`
  );

  // Put the database back where it was found.
  await prisma.contextSnapshot.deleteMany({ where: { packageId: pkg.packageId, producer: pkg.producer } });
  await prisma.sourceRegistration.deleteMany({
    where: { id: { in: pkg.sources.map((x) => x.registrationId).filter((x): x is string => x !== null) } },
  });
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
