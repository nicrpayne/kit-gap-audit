import type { SavedReportHandoff } from "./savedHandoff";
import { capabilityEstimatePresentation } from "./capabilityEstimatePresentation";

/** Explicit allowlist: no simulation corpus, owner links, credentials, request
 * hashes or live fetch instructions enter the recipient response. */
export function recipientSnapshot(bundle: SavedReportHandoff) {
  return {
    version: "recipient-report.v1" as const,
    comparisonId: bundle.comparisonId,
    reports: bundle.reports.map(({ reportId, briefSnapshot: b, snapshotFingerprint, presentation: p }) => ({
      reportId, fingerprint: snapshotFingerprint, project: b.identity.project.value.name,
      mode: b.identity.mode, generatedAt: b.identity.generatedAt,
      outcome: { ...b.headline.likelyWindow.value }, target: b.headline.targetDate.value,
      targetFrequency: b.headline.confidenceAtTarget.value, reason: b.headline.keyReason.value,
      movement: b.headline.movement.value ? { days: b.headline.movement.value.days, confidencePoints: b.headline.movement.value.confidencePoints } : null,
      commitment: { status: p.commitment.status, date: p.commitment.date, label: p.commitment.label, source: { owner: p.commitment.source.owner, asOf: p.commitment.source.asOf } },
      assumptions: b.forecast?.assumptions?.items.map(i => ({ label: i.label, detail: i.detail })) ?? [],
      scope: { tickets: b.movable.scope.value.executableItemCount, effort: { ...b.movable.scope.value.remainingEffortDays },
        estimateQuality: b.movable.scope.value.estimateQuality ?? null },
      capacity: { availability: b.movable.capacity.value.availability, forecastFte: b.movable.capacity.value.forecastEffectiveFte,
        namedFte: b.movable.capacity.value.namedEffectiveFte, people: b.movable.capacity.value.contributors.map(c => ({ name: c.name, effectiveFte: c.effectiveFte })) },
      // The effective capacity schedule is already frozen in the report. Never
      // reinterpret the current roster or invent a person's move date here.
      forecastStart: b.forecast?.basis?.scopes.find(s => s.scopeId === b.identity.project.value.id)?.startDate ?? null,
      capacityPhases: b.forecast?.basis?.scopes.find(s => s.scopeId === b.identity.project.value.id)?.capacityPhases?.map(phase => ({ ...phase })) ?? [],
      decisions: b.calls.decisions.value.map(d => ({ title: d.title, owner: d.owner, status: d.status, neededBy: d.neededBy, gated: d.gated, delay: { ...d.modeledDelay } })),
      dependencies: b.calls.dependencies.value.map(d => ({ name: d.name, likelyDate: d.likelyDate, currentness: d.currentness })),
      asks: p.leadershipAsks.map(a => ({ label: a.label, owner: a.owner, neededBy: a.neededBy })),
      schedule: b.timeline.schedule?.value.events.map(e => ({ title: e.title, date: e.date, endDate: e.endDate, state: e.temporalState, meaning: e.semanticState ?? e.kind ?? "event",
        source: e.sourceLabel ?? e.source ?? "Not recorded", evidence: e.evidence?.map(q => ({ quote: q.quote, source: q.sourceRef, passage: q.passageId })) ?? [] })) ?? null,
      evidence: b.evidence.scopeReceipts ? { capturedAt: b.evidence.scopeReceipts.capturedAt, capabilities: b.evidence.scopeReceipts.capabilities.map(c => ({ name: c.name, excluded: c.excludedFromScenario,
        references: c.references.map(r => r.capture ? { quote: r.capture.excerpt, source: r.capture.sourceRef, sourceDate: r.capture.sourceDate,
          acceptedAt: r.capture.acceptedAt, snapshot: r.capture.contextSnapshotId, evidenceId: r.evidenceId, locator: { ...r.capture.locator } } : { quote: null }) })) } : null,
      estimates: (b.forecast?.basis?.capabilityEstimates ?? []).filter(e => e.scopeId === b.identity.project.value.id).map(e => {
        const v = capabilityEstimatePresentation(e);
        return { name: e.capabilityName, authority: v.authorityLabel, basis: v.basisLabel, range: v.range, quote: v.originalQuote,
          sourceDate: v.sourceDate, snapshot: v.contextSnapshotId, interpretation: v.interpretation, review: v.reviewSummary,
          rawAssertion: v.rawAssertion, usedInSimulation: v.usedInSimulation, coveredItemIds: v.coveredItemIds,
          additionalItemIds: v.additionalItemIds, reviewer: v.reviewer, reviewedAt: v.reviewedAt };
      }),
      sources: b.identity.sourceSnapshots.map(s => ({ owner: s.owner, asOf: s.asOf, currentness: s.currentness, note: s.note ?? null })),
      caveats: b.caveats.value.map(c => ({ code: c.code, message: c.message })),
      sourceWarnings: [...b.evidence.warnings.value, ...b.changes.currentness.value.warnings],
    })),
  };
}
export type RecipientSnapshot = ReturnType<typeof recipientSnapshot>;
