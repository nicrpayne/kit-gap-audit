# Disposable staging end-to-end proof

## Invocation

```sh
KIT_GAP_BASE_URL='http://127.0.0.1:3318' \
APP_PASSWORD='<disposable secret>' \
./bin/kit-gap bootstrap \
  --canonical-name 'Harbor Relay' \
  --alias HR \
  --owner-hint Morgan \
  --source-hint handoff \
  --ke-root /tmp/signal-activation-bridge-e2e-ke-0908.h7puFb \
  --output-dir /tmp/kit-gap-bridge-e2e-output-0908
```

This invoked the real standalone bridge CLI. It did not require a Scope and created the previously unknown ProjectBootstrap.

## Package and review

- ProjectBootstrap: `cmtss9vos0000itr27f6v5dwa`
- Package: `hermes-bootstrap-237aed637a5a791362c52ccabbe8b1e8`
- Signal scan: `cmtss9vpl0002itr20bljb0fm`
- Compiler: `kit-gap-bootstrap-1.1`
- Size: 18,112 bytes
- Census: 3 artifacts / 5 evidence / 4 current heads / 1 relation / 5 proposals
- Proposal census: 1 capability / 1 decision / 1 dependency / 2 sources
- Review: 3 accepted / 1 deferred / 1 information-only, revision 6

Identical reinvocation returned the same package and scan with `reused: true`. Signal remained at one package and one scan.

## Provenance drill

Accepted candidate `cmtss9vqe000eitr2wh4mth4p` proposed capability `Harbor Relay should expose a safe handoff dashboard.` from current intelligence `hermes:opp-harbor`.

Its supporting evidence is `hermes-ev:ev-1`, exact quote `Harbor Relay handoff dashboard.`, content hash `hash-1`, source file label `Harbor-Relay-Sync.txt`, offsets 20–51 in Unicode code points, lineage root `lineage-source-d0f78c…`, artifact `artifact-source-d0f78c…`, and stable canonical reference `ke://source/transcript/Harbor-Relay-Sync`. The serialized locator contains no local path. The derivative wiki passage is separately marked derivative and shares lineage instead of claiming independent support.

## Activation and first Audit

- Scope: `cmtssg44n0000itg4s5wqoxww`
- ContextSnapshot 01: `cmtssg455000bitg4912wz1y1`
- First Audit: `cmtssg45d000ditg466l0ierl`
- First Audit findings: 2
- Activation retry: reused the same Scope, ContextSnapshot, Audit, and findings

Canonical writes: 1 Scope, 1 alias, 1 Capability, 1 Decision, 1 SourceRegistration, 1 ContextSnapshot, 1 Audit, 2 Findings, and 1 ProjectActivation. Zero CapabilityWorkLinks, DecisionGates, ScopeDependencies, milestones, people, or allocations were written.

ContextSnapshot census: 4 sources, 10 evidence entries, 5 derived claims, 4 intelligence objects, and 1 intelligence relation. The manifest held 1 canonical capability, 1 canonical decision, 1 canonical source, zero canonical dependencies, and 2 external candidates.

Forecast returned `409 FORECAST_UNAVAILABLE` because no executable work mapping exists. The UI stated the same reason. This is the required honest result, not a failed activation.
