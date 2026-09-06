# Add Project operator experience

## Entry and shape

`Add project` is the final action in Signal's normal project selector and is also available from Settings → Projects and the global command menu. Every entry opens the same compact, route-backed side sheet over the current instrument. There is no landing page, onboarding splash, or separate mode-selection screen.

The sheet contains:

- Project name — required;
- Aliases / acronyms;
- Owner hint — optional and never staffing;
- Source hints — optional provider refs, titles, links, or filenames;
- `Search existing knowledge` — on by default;
- primary `CREATE & SCAN`;
- secondary `Advanced: start blank`.

Boundary copy is always visible:

> Signal can search existing knowledge and prepare a governed proposal. Nothing becomes project Reality during the scan.

Submitting closes the sheet and moves directly to Scan. `POST /api/project-bootstraps` creates only the pre-Reality bootstrap aggregate; `POST /api/project-bootstraps/:id/scans` starts the asynchronous scan. No Scope or canonical delivery object is created.

## Launch payload

```json
{
  "canonicalName": "Harbor Relay",
  "aliases": ["Relay", "HR Pilot"],
  "ownerHint": "Delivery operations",
  "sourceHints": [
    { "provider": "transcript", "ref": "Field handoff workshop" },
    { "provider": "notion", "ref": "notion://page/relay-pilot" }
  ],
  "searchExistingKnowledge": true,
  "mode": "bootstrap_existing_knowledge"
}
```

The invented fixture illustrates interaction only; it asserts nothing about a real project.

## Scan instrument

The scan reports observed work, not a synthetic percent understood:

```text
Providers checked           7 · 5 available · 2 unavailable
Artifacts found            43 · 14 direct identity matches
Intelligence heads          9 · 2 contradictory
Evidence passages          27 · 11 lineage roots
Aliases / collisions        1 low-risk overlap
Proposals compiled         18 reviewable · final package pending
Gaps                        2 unavailable providers
```

Pipeline stages show `queued | running | complete | partial | failed`. Provider rows keep unavailable/error state and last-success time. Counts may increase while a scan is active; the package revision makes clear which candidates were available when a disposition was made.

## Safe partial Review

`ENTER REVIEW` becomes available when identity is not blocked and at least one validated candidate section is available. It does not wait for every provider. Review retains a conspicuous partial-scan status, and Ready remains blocked until the final package arrives or the operator explicitly acknowledges each provider omission and package revision.

Partial entry never means the failed providers were checked successfully, never invents zero results, and never promotes partial candidates.

## Start blank

Start blank creates the same `ProjectBootstrap` and opens Review with operator-authored provenance and explicit missing-information records. It is intentionally secondary because the normal case is reconstruction. It does not bypass Ready, provenance rules, activation, or first Audit.

## Collision and sparse states

A collision blocks activation, not initial investigation. The operator can use the existing project, revise aliases and rescan, or assert distinct identities with a stored rationale. No default chooses the most likely identity. Sparse results say `Insufficient evidence to establish scope`; the operator may add hints, author candidates, or activate a minimal project after acknowledging gaps and the absence of an execution source.
