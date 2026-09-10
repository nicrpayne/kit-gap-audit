import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizedPersonName, rosterReadings, validateRosterDraft, type RosterPersonDraft } from "@/lib/capacity/reconciliation";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";

export const dynamic = "force-dynamic";

const json = (value: unknown) => value as Prisma.InputJsonValue;

interface LegacyBasisInput {
  scopeId: string;
  forecastFte: number;
  source: "explicit" | "inferred" | "allocations";
}

interface RosterRequest {
  people?: RosterPersonDraft[];
  legacyBases?: LegacyBasisInput[];
  contextSwitchCostPct?: number;
  confirmComplete?: boolean;
  confirmDifferences?: boolean;
  removePersonIds?: string[];
}

export async function GET() {
  const [people, allocations, scopes, reconciliations, settings] = await Promise.all([
    prisma.person.findMany({ where: { synthetic: false }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.allocation.findMany(),
    prisma.scope.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, teamCapacity: true } }),
    prisma.capacityReconciliation.findMany(),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  return NextResponse.json({ people, allocations, scopes, reconciliations, contextSwitchCostPct: settings?.contextSwitchCostPct ?? 0 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as RosterRequest | null;
  if (!body || !Array.isArray(body.people) || !Array.isArray(body.legacyBases)) {
    return NextResponse.json({ error: "people and legacyBases are required" }, { status: 400 });
  }
  if (body.confirmComplete !== true) {
    return NextResponse.json({ error: "A partial roster can be explored, but cannot become canonical until its completeness is explicitly confirmed.", code: "ROSTER_INCOMPLETE" }, { status: 422 });
  }

  const [scopes, settings] = await Promise.all([
    prisma.scope.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const contextSwitchCostPct = settings?.contextSwitchCostPct ?? 0;
  if (body.contextSwitchCostPct !== undefined && Math.abs(body.contextSwitchCostPct - contextSwitchCostPct) > 1e-6) {
    return NextResponse.json({
      error: "Capacity settings changed while the roster was open. Review the refreshed effective FTE before saving.",
      code: "STALE_CAPACITY_SETTINGS",
      contextSwitchCostPct,
    }, { status: 409 });
  }
  const scopeIds = new Set(scopes.map((scope) => scope.id));
  const basisIds = body.legacyBases.map((basis) => basis.scopeId);
  const validSources = new Set(["explicit", "inferred", "allocations"]);
  if (basisIds.length !== scopes.length || new Set(basisIds).size !== scopes.length || basisIds.some((id) => !scopeIds.has(id)) || body.legacyBases.some((basis) => !Number.isFinite(basis.forecastFte) || basis.forecastFte <= 0 || !validSources.has(basis.source))) {
    return NextResponse.json({
      error: "The reconciliation basis is incomplete or stale. Reopen Set actual team and review every tracked project.",
      code: "INVALID_RECONCILIATION_BASIS",
    }, { status: 409 });
  }
  const issues = validateRosterDraft(body.people, scopeIds);
  if (issues.length) return NextResponse.json({ error: issues[0].message, issues }, { status: 422 });

  const existingPeople = await prisma.person.findMany({ include: { allocations: true } });
  const existingById = new Map(existingPeople.map((person) => [person.id, person]));
  const submittedIds = new Set(body.people.flatMap((person) => person.id ? [person.id] : []));
  const omittedActive = existingPeople.filter((person) => person.active && !person.synthetic && !submittedIds.has(person.id));
  const confirmedRemovals = new Set(body.removePersonIds ?? []);
  const unconfirmed = omittedActive.filter((person) => !confirmedRemovals.has(person.id));
  if (unconfirmed.length) {
    return NextResponse.json({
      error: `Confirm the impact of removing ${unconfirmed.map((person) => person.name).join(", ")} from the tracked team.`,
      code: "REMOVAL_CONFIRMATION_REQUIRED",
      people: unconfirmed.map((person) => ({ id: person.id, name: person.name, activeAllocationCount: person.allocations.filter((item) => item.fraction > 0).length })),
    }, { status: 409 });
  }
  for (const person of body.people) {
    if (person.id && (!existingById.has(person.id) || existingById.get(person.id)?.synthetic)) {
      return NextResponse.json({ error: `Unknown named person id: ${person.id}` }, { status: 400 });
    }
  }

  const submittedIdByName = new Map(body.people.map((person) => [normalizedPersonName(person.name), person.id ?? null]));
  const historicalCollision = existingPeople.find((person) => {
    const submittedId = submittedIdByName.get(normalizedPersonName(person.name));
    return submittedId !== undefined && submittedId !== person.id;
  });
  if (historicalCollision) {
    return NextResponse.json({
      error: `“${historicalCollision.name}” already exists in team history. Restore that identity instead of creating a duplicate person.`,
      code: "DUPLICATE_PERSON_IDENTITY",
      personId: historicalCollision.id,
    }, { status: 409 });
  }

  const readings = rosterReadings(body.people, scopes.map((scope) => scope.id), contextSwitchCostPct);
  const basisByScope = new Map(body.legacyBases.map((basis) => [basis.scopeId, basis]));
  const mismatch = scopes.filter((scope) => {
    const basis = basisByScope.get(scope.id);
    const raw = readings.byScope.get(scope.id)?.raw ?? 0;
    return raw > 1e-6 && basis && Math.abs(raw - basis.forecastFte) > 1e-6;
  });
  if (mismatch.length && body.confirmDifferences !== true) {
    return NextResponse.json({
      error: "The proposed named capacity differs from the legacy Forecast basis. Confirm the reconciliation difference before saving.",
      code: "CAPACITY_DIFFERENCE_CONFIRMATION_REQUIRED",
      differences: mismatch.map((scope) => ({ scopeId: scope.id, scopeName: scope.name, legacy: basisByScope.get(scope.id)?.forecastFte, named: readings.byScope.get(scope.id)?.raw ?? 0 })),
    }, { status: 409 });
  }

  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    const idByDraft = new Map<number, string>();
    for (let index = 0; index < body.people!.length; index += 1) {
      const draft = body.people![index];
      const person = draft.id
        ? await tx.person.update({ where: { id: draft.id }, data: { name: draft.name.trim(), fte: draft.fte, active: true, synthetic: false } })
        : await tx.person.create({ data: { name: draft.name.trim(), fte: draft.fte, active: true, synthetic: false } });
      idByDraft.set(index, person.id);
    }

    const replacedIds = existingPeople.filter((person) => person.synthetic || (person.active && !submittedIds.has(person.id))).map((person) => person.id);
    if (replacedIds.length) {
      await tx.allocation.deleteMany({ where: { personId: { in: replacedIds } } });
      await tx.person.updateMany({ where: { id: { in: replacedIds } }, data: { active: false } });
    }
    const rosterIds = [...idByDraft.values()];
    if (rosterIds.length) await tx.allocation.deleteMany({ where: { personId: { in: rosterIds } } });
    for (let index = 0; index < body.people!.length; index += 1) {
      const draft = body.people![index];
      const personId = idByDraft.get(index)!;
      for (const allocation of draft.allocations.filter((item) => item.fte > 1e-6)) {
        await tx.allocation.create({ data: { personId, scopeId: allocation.scopeId, fraction: allocation.fte / draft.fte } });
      }
    }

    for (const scope of scopes) {
      const reading = readings.byScope.get(scope.id) ?? { raw: 0, effective: 0 };
      const basis = basisByScope.get(scope.id);
      const prior = await tx.capacityReconciliation.findUnique({ where: { scopeId: scope.id } });
      const exact = reading.raw > 1e-6;
      const event = {
        at: now.toISOString(), event: exact ? "named_roster_reconciled" : "aggregate_left_unreconciled",
        legacyAggregateFte: scope.teamCapacity, legacyForecastFte: basis?.forecastFte ?? null,
        namedRawFte: reading.raw, namedEffectiveFte: reading.effective,
        rosterPersonIds: rosterIds, removedPersonIds: replacedIds,
      };
      const priorHistory = Array.isArray(prior?.history) ? prior.history : [];
      await tx.capacityReconciliation.upsert({
        where: { scopeId: scope.id },
        create: {
          scopeId: scope.id, status: exact ? "named_exact" : "aggregate_unreconciled",
          legacyAggregateFte: scope.teamCapacity, legacyForecastFte: basis?.forecastFte ?? null,
          legacySource: basis?.source ?? (scope.teamCapacity == null ? "inferred" : "explicit"),
          namedRawFte: exact ? reading.raw : null, namedEffectiveFte: exact ? reading.effective : null,
          completenessConfirmed: exact, reconciledAt: exact ? now : null,
          provenance: json({ actor: "operator", contract: "complete-named-roster-v1", receiptId: randomUUID() }),
          history: json([...priorHistory, event]),
        },
        update: {
          status: exact ? "named_exact" : "aggregate_unreconciled",
          legacyAggregateFte: prior?.legacyAggregateFte ?? scope.teamCapacity,
          legacyForecastFte: prior?.legacyForecastFte ?? basis?.forecastFte ?? null,
          legacySource: prior?.legacySource ?? basis?.source ?? (scope.teamCapacity == null ? "inferred" : "explicit"),
          namedRawFte: exact ? reading.raw : null, namedEffectiveFte: exact ? reading.effective : null,
          completenessConfirmed: exact, reconciledAt: exact ? now : null,
          provenance: json({ actor: "operator", contract: "complete-named-roster-v1", receiptId: randomUUID() }),
          history: json([...priorHistory, event]),
        },
      });
      await invalidateDerivedReads(tx, scope.id, "Complete named team roster reconciled");
    }
    return { rosterIds, removedPersonIds: replacedIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const derived = [];
  for (const scope of scopes) derived.push(await recomputeDerivedReads(scope.id));
  return NextResponse.json({
    status: "named_exact", workforceFte: readings.workforceFte, freeFte: readings.freeFte,
    scopes: scopes.map((scope) => ({ scopeId: scope.id, scopeName: scope.name, ...readings.byScope.get(scope.id) })),
    ...outcome, derived: derived.map((item) => item ? { scopeId: item.scopeId, status: item.status, revision: item.computedRevision } : null),
  });
}
