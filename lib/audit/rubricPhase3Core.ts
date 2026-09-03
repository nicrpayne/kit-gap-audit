/**
 * The Phase 3 Rubric extension is deliberately expressed as four guarded
 * textual patches over the accepted, byte-identical Phase 1 `_core.js`.
 *
 * This keeps the actual Rubric chassis reviewable: if upstream source moves,
 * a patch fails loudly instead of silently drifting into a second engine.
 * No layout, camera, gesture, force, hit-test, morph, or drawing primitive is
 * reimplemented here.
 */

export interface RubricCorePatch {
  id: string;
  purpose: string;
  before: string;
  after: string;
}

export const PHASE_3_CORE_PATCHES: RubricCorePatch[] = [
  {
    id: "preserve-link-semantics",
    purpose: "Carry canonical basis/currentness metadata through Rubric's native link aggregation.",
    before: "struct.push({ s: l.s, t: l.t, k: l.k, w: l.w || 1, sn: a, tn: b });",
    after: "struct.push({ ...l, w: l.w || 1, sn: a, tn: b });",
  },
  {
    id: "bounded-reality-distance",
    purpose: "Apply Signal's semantic disagreement score as a 0/6/12-unit modifier inside native Memory seating.",
    before: "const setT = (n, ang, r, group, hubId, spin) => { n._rA = ang; n._rR = r; n._rGroup = group; n._rHub = hubId; n._rSpin = spin; };",
    after: `const setT = (n, ang, r, group, hubId, spin) => { n._rA = ang; n._rR = r; n._rGroup = group; n._rHub = hubId; n._rSpin = spin; };
    // SIGNAL PHASE 3: a bounded semantic modifier inside Rubric's own Memory
    // slots. 0 = aligned, 0.5 = drift/unassessed, 1 = conflict/blocking.
    // The adapter supplies no coordinates or ring geometry.
    const signalRealityOffset = n => {
      const value = Number(n.realityDistance);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 12 : 6;
    };`,
  },
  {
    id: "apply-reality-distance-to-memory",
    purpose: "Keep Rubric's sector/row target and add only the bounded disagreement modifier for Project World nodes.",
    before: "setT(f, a0 - span + frac * 2 * span, r, a.key, a.hubId, 1);",
    after: "setT(f, a0 - span + frac * 2 * span, r + signalRealityOffset(f), a.key, a.hubId, 1);",
  },
  {
    id: "progressive-identity",
    purpose: "Use adapter disclosure thresholds inside Rubric's native label budget; node existence and truth do not change.",
    before: [
      "// app + routine names only past the skin's zoom threshold (Jay)",
      "      if ((n.type === 'app' || n.type === 'routine') && S.skin.labelMinZoom && S.cam.k < S.skin.labelMinZoom && !isFocus) continue;",
      "      // the names kill switch covers files, folders, routines and apps (Jay)",
      "      if ((n.type === 'file' || n.type === 'dir' || n.type === 'app' || n.type === 'routine') && st.fileLabels === false && !isFocus) continue;",
      "      const show = isFocus || big || (S.focusSet && S.focusSet.has(n.id) && S.cam.k > 0.85 && S.focusSet.size < 160) || r * S.cam.k > 9.6 - st.labels * 3;",
    ].join("\r\n"),
    after: [
      "// Signal identity is progressive disclosure, never progressive truth.",
      "      // Rubric still owns label placement and the global label budget.",
      "      const identityMinZoom = Number.isFinite(n.identityMinZoom) ? n.identityMinZoom : null;",
      "      if (identityMinZoom !== null && S.cam.k < identityMinZoom && !isFocus) continue;",
      "      if (identityMinZoom === null && (n.type === 'app' || n.type === 'routine') && S.skin.labelMinZoom && S.cam.k < S.skin.labelMinZoom && !isFocus) continue;",
      "      // the names kill switch covers files, folders, routines and apps (Jay)",
      "      if ((n.type === 'file' || n.type === 'dir' || n.type === 'app' || n.type === 'routine') && st.fileLabels === false && !isFocus) continue;",
      "      const show = isFocus || big || (identityMinZoom !== null && S.cam.k >= identityMinZoom) || (S.focusSet && S.focusSet.has(n.id) && S.cam.k > 0.85 && S.focusSet.size < 160) || r * S.cam.k > 9.6 - st.labels * 3;",
    ].join("\r\n"),
  },
];

export function buildPhase3RubricCore(source: string): string {
  let result = source;
  for (const patch of PHASE_3_CORE_PATCHES) {
    const first = result.indexOf(patch.before);
    const second = first < 0 ? -1 : result.indexOf(patch.before, first + patch.before.length);
    if (first < 0 || second >= 0) {
      throw new Error(`Rubric Phase 3 core patch ${patch.id} expected exactly one source match`);
    }
    result = result.slice(0, first) + patch.after + result.slice(first + patch.before.length);
  }
  return result;
}
