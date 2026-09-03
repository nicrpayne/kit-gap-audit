# Remaining work — intentionally not Phase 1

- Phase 2: replace the frozen Rubric fixture boundary with a thin, coordinate-free `SignalRubricAdapter`.
- Phase 3: translate Rubric labels and actions into Signal-native meaning and safe actions. The Phase 1 popup intentionally still shows Rubric's raw `Edit` and `Remove` controls; it is not connected to canonical Signal truth.
- Phase 4: add bounded disagreement/trust/provenance semantics without replacing Rubric's primary structure.
- Replace CDN-hosted D3/Marked dependencies only if product packaging requires local assets; doing so was not necessary to prove the supplied runtime transplant.
- Exact content parity with Nic's supplied reference screenshot requires its exact original graph fixture, which was not present in the reference pack.

