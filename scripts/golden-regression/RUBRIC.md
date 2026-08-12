# Golden set semantic rubric

This scores the dimension the deterministic harness (`deterministic.test.ts`,
`e2e.ts`) deliberately cannot: whether the real model, given the real
prompt (`lib/audit/prompts/audit-v1.ts`), actually produces the judgments
the golden set expects. **Neither script in this directory calls a real
model** -- this sandbox has no `ANTHROPIC_API_KEY` (see HANDOFF.md
"Testing discipline"). `e2e.ts` proves the deterministic layer correctly
enforces the golden outcomes *given* correct model judgment; it does not
prove the model will supply that judgment unprompted. Do not read a green
`e2e.ts` run as a live-model pass. Run this rubric by hand (or scripted,
scoring the model's real JSON output against it) the first time a real
`ANTHROPIC_API_KEY` is available in an environment that can also reach
`api.linear.app`, using `fixture.ts`'s package + `EXISTING_FINDINGS_SEED`
as the real `POST /api/refresh` input against a Scope seeded with those
existing Findings.

Score each golden finding 0-2 per axis. 2 = fully matches the expected
behavior described in the task brief; 1 = partially (right instinct,
wrong detail -- e.g. correctly downgrades blocking but for the wrong
stated reason); 0 = repeats the original failure.

| # | Golden finding | Axis A: right kind (finding/signal/clarification/none) | Axis B: reconciliation correct | Axis C: blocking correct | Axis D: rationale explains itself |
|---|---|---|---|---|---|
| 1 | App Store sandbox stalled | | | | |
| 2 | Possible duplicate CI/CD tracking | | | | |
| 3 | Separate auto-save ticket absent | | | | |
| 4 | SOF-510 direction reversed | | | | |
| 5 | Approval-permission model conflict | | | | |
| 6 | Migration cutover unowned | | | | |
| 7 | Notifications POC stalled | | | | |
| 8 | Storage/roles/notifications composite | | | | |
| 9 | Notification infra "not ticketed" | | | | |
| 10 | Job service / auth decision | | | | |
| 11 | GitHub/VPN access unresolved | | | | |

Axis D is the one true judgment call in this rubric (does the persisted
`rationale` -- which now carries an origin tag prefix, see
`lib/audit/run.ts`'s `ORIGIN_LABELS` -- actually let a reader answer "why
is this new," "why blocking or not," "what release boundary" without
digging further). Axes A-C should mostly just confirm what the
deterministic layer already enforces; a real low score there would mean
the model is citing evidence dishonestly (setting `reconciliation.
newObligation` or a `qualifiers` boolean untruthfully), which the code
cannot detect -- that is the one trust boundary this calibration pass
cannot close by itself, same as `evidenceRefs` citation always assumed
good faith from the model even before this pass.

**Passing bar for this rubric**: every row averages ≥ 1.5 across axes A-C
(axis D is directional, not gating), with golden findings 1, 3, 9, 10, 11
scoring 2 on axis A (never becoming a persisted Finding) and zero golden
findings scoring a blocking axis-C of 0 without an explicit, evidenced
release-gate justification.

**Finding 8 specifically** has no deterministic backstop at all (see
`calibratedOutput.ts`'s comment on it) -- it is scored purely by whether
the model declines to raise the stale composite once newer execution
evidence (SOF-601/SOF-618-equivalent) is shown. If real runs regularly
score this 0-1, that is the strongest signal in this whole rubric that a
future phase needs a light, explicit freshness signal beyond prompt
instruction (see docs/AUDIT-CALIBRATION.md's "Remaining product
decisions").
