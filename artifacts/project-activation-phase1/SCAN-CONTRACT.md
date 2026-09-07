# Scan contract

Package version: `ProjectBootstrapPackage 1.0`.

## Current execution model

`POST /api/project-bootstraps/:id/scans` creates a queued row and returns `202`. Next's post-response work hook runs the scanner. Each stage and terminal error is persisted; clients poll the read/scan-status routes. If a process is interrupted, the incomplete run remains visible and the operator can start a new sequence. There is no queue service in current production, so this is deliberately smaller than claiming distributed resumability.

## Retrieval actually integrated

1. Normalize canonical name and aliases with Signal's existing search normalization.
2. Exact phrase/token matching across persisted Source, ContextDoc, stored package artifact/evidence, current intelligence statement/fields, and typed derived claims.
3. MiniSearch lexical/prefix/fuzzy retrieval using the same bounded fuzziness/prefix policy as Signal search.
4. Retain exact passage/source links and source-native locator metadata from stored packages.
5. Label `ke://wiki` and wiki provider material derivative; preserve declared raw lineage roots.
6. Retain bounded contradiction and supersession relations on matched current heads.
7. Compile typed proposals using deterministic field rules only.

## Honest coverage states

- Signal Sources and Context are locally searchable and reported `available`.
- Hermes and wiki are `partial` only when previously pushed matching material exists; Signal has no live pull or health endpoint.
- The checked bridge is JSA/active-Scope-oriented and cannot compile a generic pre-Scope bootstrap today.
- Notion/Figma/Linear are `not_configured` before Scope source/execution binding.
- Semantic/vector retrieval is `unavailable`; no vector distance, embedding, or semantic confidence is emitted.

The scanner persists snippets, metadata, stable refs, and package fields. It does not persist raw connector credentials, authorization fields, or secret/token keys. The inbound package route rejects those keys and packages over 5 MB.
