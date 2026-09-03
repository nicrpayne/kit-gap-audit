# Data veracity

## Production-shaped census

- Canonical objects: **438**
- Canonical relationships: **543**
- Duplicate canonical IDs: **0**
- Missing edge endpoints: **0**
- Presentation-only nodes: **75**
- Total visual nodes passed to Rubric: **513**
- Nodes painted at Fit: **513**
- Canonical identities represented: **438 / 438**
- Canonical objects dropped for appearance: **0**
- Unsupported canonical relationships: **0**

Structural projection:

- Reality: 1
- Project Model canonical objects: 6
- Project World canonical objects: 431
- Attention echoes: 60
- Source-system anchors: 6
- Structural hubs: 9

Presentation aggregates supplement canonical nodes. They never replace canonical identity or mutate canonical truth.

## Canonical populations

| Kind | Count |
|---|---:|
| Passages | 164 |
| External intelligence | 161 |
| Findings | 37 |
| Transcripts | 30 |
| Documents/sources | 18 |
| Checkpoints | 14 |
| Lanes | 8 |
| Decision | 1 |
| Decision gate | 1 |
| Dependency | 1 |
| Intelligence hub | 1 |
| Reality | 1 |
| Scope | 1 |

Finding handling is 15 handled / 22 unhandled. External intelligence is 155 current / 6 superseded. Subtypes: 59 observations, 24 commitments, 20 unknowns, 17 risks, 15 decisions, 15 dependencies, 6 climate-evidence records and 5 availability observations.

Relationship basis is 199 attested, 286 external and 58 inferred. Trust/basis, currentness and provider remain independent of disagreement distance.

## Source Horizon

| Provider | Linked objects | Artifacts | Passages | Claims |
|---|---:|---:|---:|---:|
| Documents | 138 | 18 | 51 | 69 |
| Figma | 2 | 0 | 0 | 0 |
| Hermes | 142 | 1 | 0 | 137 |
| Linear | 12 | 0 | 0 | 10 |
| Meetings / Transcripts | 240 | 30 | 113 | 97 |
| Notion | 2 | 0 | 0 | 0 |

These counts are overlapping typed provenance memberships, explicitly labeled `linked objects`; they do not claim to partition 438 objects. All six provider anchors are unique. Provider identity comes only from typed canonical fields or exact passage inheritance through `extracted_from`; prose is never used.

All 164 passages attach to an actual source/transcript endpoint. External subtype/currentness, Finding handling, Decision state and Dependency state survive projection.

## Known suspicious production records

### DATA BUG — Decision `Test`

- Canonical ID: `decision:cmsv9c5580001l71ybameg630`
- State: open; owner Nic; `gated: true`
- Relationship: inferred `attests` → Decisions lane

### DATA BUG — Gate `This is a test connection`

- Canonical ID: `gate:cmsv9d3uo0005l71yidsi4iua`
- Estimate: low 1 / likely 4 / high 10
- Relationship: attested `blocks` → Decision `Test`

These appear to be test residue in the production-shaped capture and could affect forecast semantics because the gate is attested and blocking. They were not deleted or reclassified. They require an approved canonical cleanup workflow and owner confirmation.

