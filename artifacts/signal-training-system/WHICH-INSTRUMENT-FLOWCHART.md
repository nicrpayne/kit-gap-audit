# Which Instrument?

```mermaid
flowchart TD
  START[What kind of question is this?]
  START --> NEW{New evidence or source?}
  NEW -->|yes| UP[KE / Hermes upstream]
  NEW -->|no| GAP{Disagrees with accepted Reality?}
  GAP -->|yes| AUD[Audit]
  GAP -->|no| OWN{Would the answer declare truth?}
  OWN -->|Product shape| S[Scope]
  OWN -->|Choice| D[Decisions]
  OWN -->|Precedence| DEP[Dependencies]
  OWN -->|People / allocation| CAP[Capacity]
  OWN -->|Milestone / commitment| TL[Timeline]
  OWN -->|no, it asks consequence| Q{Which consequence?}
  Q -->|Where do we land?| F[Forecast]
  Q -->|What deserves attention?| CR[Control Room]
  Q -->|How do we communicate?| R[Reports]
  Q -->|Where did it come from?| STI[Search → Trace → Inspector]
  START --> DORMANT{Starting dormant project?}
  DORMANT -->|yes| PA[Project Activation]
```

Use the owner test: **if the action makes a claim canonical, use the owner instrument.** Audit proposes, Scenario explores, Forecast calculates, Reports communicate.

The printable annotated asset is `screenshots/annotated/01-which-instrument.svg`.

