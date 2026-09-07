# Data model

Migration: `20260906170000_project_activation_phase1` (additive).

| Model | Ownership |
| --- | --- |
| `ProjectBootstrap` | Draft identity, lifecycle, active package pointer, review revision |
| `BootstrapScanRun` | Durable sequence, stage, provider coverage, metrics, warning/error, resulting package |
| `BootstrapPackage` | Immutable validated package JSON, content identity/hash, compiler/producer version, supersession |
| `BootstrapCandidate` | Typed review projection, immutable original, optional reviewed payload, active refresh generation, disposition |
| `BootstrapEvidenceLink` | Mutable attach/detach overlay without changing package evidence |
| `BootstrapReviewEvent` | Append-only human action history |

## Deliberate normalization boundary

Identity, job state, package identity, candidate type/disposition/fingerprint, evidence-link state, timestamps, and ancestry are normalized because they are queried and govern behavior. The complete compiler delivery and typed proposal bodies remain JSON because they are versioned transport contracts owned at the compiler boundary and must retain new producer fields without a migration or whitelist loss.

The package is not a `ContextSnapshot`. ContextSnapshot means accepted active-project context; bootstrap packages are investigatory input. No Phase 1 model references Scope, Forecast, Decision, DecisionGate, TimelineEvent, Person, Allocation, Report, Finding, WorkEstimate, or SourceRegistration.

## Migration safety

All tables and indexes are new. No existing column, constraint, data, relation, reader, or forecast input changed. Cascade behavior is confined to deleting the pre-Reality aggregate and its own history.

