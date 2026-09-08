# Project Activation release readiness

Verified 2026-09-08. This is a release-candidate record, not a production deployment.

## Authority boundary

Hermes owns what was said. Signal owns what is true about delivery. Every transferred candidate is backed by a bounded quote and stable provenance. Nothing in the package is authoritative: the bridge emits proposals only; Signal review and activation govern Reality.

## Operational path

The knowledge-side runtime is the standalone repository at `/Users/nicholaspayne/AI-Agents/kit-gap-bridge`, version `0.2.0`, commit `d227238a2cb95d4c2ccbae6b8e61f6e20e167543`. From that repository:

```sh
KIT_GAP_BASE_URL='https://<signal-host>' \
APP_PASSWORD='<transport secret>' \
./bin/kit-gap bootstrap \
  --canonical-name '<project canonical name>' \
  --alias '<alias>' \
  --owner-hint '<optional owner>' \
  --source-hint '<optional source hint>' \
  --ke-root '<local KE root>'
```

The bridge reads the local corpus, creates or resolves a dormant ProjectBootstrap by identity, compiles and validates `BootstrapKnowledgePackageV1` version `1.1`, materializes a local gitignored package, and performs one `POST /api/project-bootstraps/:id/packages`. The request uses `Authorization: Bearer <APP_PASSWORD>`. Railway sees the JSON package, not the local filesystem or its paths. Response-loss recovery inspects Signal's package state before any retry; identical package retries reuse the existing scan.

The bridge can be run with `--dry-run` to compile without any Signal network write. An explicit `--bootstrap-id` may be used when the dormant bootstrap already exists. No active Scope is required in either mode.

## Real-path disposable proof

The synthetic, previously unknown project `Harbor Relay` was compiled from a local KE-shaped fixture and delivered by the real `kit-gap` CLI into a disposable Signal/PostgreSQL environment. Package `hermes-bootstrap-237aed637a5a791362c52ccabbe8b1e8` (18,112 bytes) created scan `cmtss9vpl0002itr20bljb0fm` under ProjectBootstrap `cmtss9vos0000itr27f6v5dwa`.

Package census: 3 artifacts, 5 evidence passages, 4 current intelligence heads, 1 typed relation, and 5 proposals. Review contained 1 capability, 1 decision, 1 dependency, and 2 source candidates. The operator accepted the capability, decision, and raw transcript; deferred the dependency; and marked the derivative wiki source information-only. All five dispositions persisted at review revision 6.

Activation wrote one Scope, one alias, one Capability, one Decision, one SourceRegistration, ContextSnapshot 01, one first Audit, two Findings, and one ProjectActivation. It wrote zero CapabilityWorkLinks, DecisionGates, ScopeDependencies, milestones, people, or allocations. A repeated activation reused the same Scope, ContextSnapshot, Audit, findings, and activation record.

Forecast remained unavailable with `409 FORECAST_UNAVAILABLE` and reason `Missing executable work mapping`. The first Audit reported the accepted capability's missing execution mapping at high severity and the unrepresented external dependency at medium severity.

## Distribution limitation

The standalone bridge repository is clean and committed but has no configured Git remote. Nothing was invented or pushed. A reviewed remote is required before production use so the exact commit can be published as an immutable tag/artifact and operators can follow a governed install, upgrade, and rollback procedure. Until that exists, the bridge is a verified local runtime, not a production-distributable service.

## Promotion rule

Before production promotion, review the Signal release-candidate diff and the bridge commit, configure the bridge remote/distribution path, set the production Signal URL and secret only in the bridge runtime environment, and run a controlled non-canonical smoke. Do not place the corpus, local paths, or transport secret in Railway. Production deployment remains a separate manual decision.
