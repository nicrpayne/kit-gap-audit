# Add Project experience

## Entry points

V1 exposes the same action in two places:

1. **Global command (`⌘K`)** — `Add project…`, after the list of current projects and before section navigation.
2. **Settings → Projects** — primary `Add project` action above the current Scope manager.

Both open `/projects/new` (or a route-modal backed by the same component). A Control Room project selector may also show a final `+ Add project` row, but it should route to the same flow rather than implement a third form.

The current command menu in `components/instrument/CommandMenu.tsx` already merges Scope and destination items. It is the least invasive global entry point. The current `/scopes` form is execution-configuration-first and requires a Linear team; it should remain available during migration as “Manage delivery bindings,” not be stretched into activation.

## Screen A — Identity

Required:

- canonical name;
- at least one alias only when the canonical name is not how the project was normally discussed (the field may otherwise be empty).

Optional:

- aliases/acronyms;
- description (“what kind of project is this?”); 
- owner hint;
- known source hints, each with provider/ref/free note.

Inline behavior:

- normalize aliases for comparison but preserve entered casing;
- flag exact collisions against active projects and open bootstraps immediately;
- flag short ambiguous acronyms (`HR`, `OS`, `PA`) as review-required rather than invalid;
- recommend aliases from exact historical titles only after the first scan;
- allow the operator to declare two terms intentionally related but not identical.

## Screen B — Mode

Modes:

- **Bootstrap from existing knowledge** — recommended; scans Hermes/wiki/current-state/evidence/source artifacts and proposes a delivery model.
- **Start with a blank project** — creates the same review workspace with no corpus scan and explicit “operator-authored” provenance. This is not the primary V1 path but prevents the product from trapping genuinely new work.

Copy beside the recommended mode:

> Signal will search historical knowledge and build a proposal for review. No scope, staffing, dependency, date, Decision, or Forecast input will be accepted automatically.

The call to action is `Start knowledge scan`, not `Create project`. The project is not officially tracked until the later Activate act.

## Screen C — Source hints

Hints narrow discovery but never act as proof:

- pasted transcript title or source reference;
- wiki page URL/id;
- Notion page URL/id;
- Figma file/node URL;
- Linear project/team hint;
- spreadsheet/document filename;
- person/team name likely associated with the project.

Each hint is displayed after scan with `matched`, `not found`, or `provider unavailable`. A source hint may add five retrieval points but cannot turn a semantic-only result into high-grounding evidence.

## Scan launch payload

```json
{
  "canonicalName": "Harbor Relay",
  "aliases": ["Relay", "HR Pilot"],
  "description": "A coordination product for field handoffs",
  "ownerHint": "Delivery operations",
  "sourceHints": [
    { "provider": "transcript", "ref": "Field handoff workshop" },
    { "provider": "notion", "ref": "notion://page/relay-pilot" }
  ],
  "mode": "bootstrap_existing_knowledge"
}
```

`POST /api/project-bootstraps` creates only the bootstrap aggregate and returns its id. `POST /api/project-bootstraps/:id/scans` starts an asynchronous scan and returns a scan id. No Scope is created here.

## Progress grammar

Do not show a synthetic “83% understood.” Show deterministic stages and observed counts:

```text
Identity checks       Complete · 3 names checked
Connected providers   5 of 7 responded
Lexical retrieval     Complete · 43 artifacts considered
Semantic retrieval    Complete · 18 possible idea matches
Graph expansion       Complete · 12 related artifacts
Package validation    Complete · 31 proposals, 4 ambiguities
```

Provider failures remain visible and do not block the scan unless the failed provider was an explicit required hint. The operator can open coverage details, retry failed providers, or continue with a partial package after acknowledgment.

## Collision handling

Blocking collision example:

> “Relay” is already an alias for Relay Infrastructure. Historical results divide between two identities. Choose the existing project, remove the alias, or mark these as distinct identities before continuing.

Available acts:

- use existing project (exit bootstrap and open it);
- revise canonical name/aliases and rescan;
- assert distinct identities, with a reason stored in `identityResolution`;
- merge this bootstrap into an existing project as a knowledge refresh (later slice; disabled in Phase 1).

No default button chooses the most likely project.

## Sparse result handling

When little is found:

> Signal found two direct mentions and no current intelligence head. You can review them, add source hints, or activate a minimal project with explicit unknowns. It will not invent scope to fill the workspace.

The flow can still reach Ready if the operator supplies a canonical name, explicitly accepts the information gaps, and either configures an execution source or accepts `execution source not configured`.

