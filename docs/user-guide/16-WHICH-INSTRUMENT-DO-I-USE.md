# Which Instrument Do I Use?

Start with the question, not the navigation label.

| I am thinking… | Use | Why |
|---|---|---|
| “I heard something important in a meeting.” | KE/wiki source pipeline | Record the source upstream; Signal is not a second wiki |
| “New evidence conflicts with current project Reality.” | Audit | Audit compares and proposes owner-specific changes |
| “What deserves attention right now?” | Master Control Room | It composes the operating picture and hands off to owners |
| “We know the product capability, but no ticket exists.” | Scope | Scope owns accepted product shape independently of execution mapping |
| “We genuinely have not chosen.” | Decisions | An open, usually ungated, Decision makes the tension operable |
| “The work cannot start until this choice is made.” | Decisions → Connect to delivery | A DecisionGate is the only allowed serial decision delay |
| “One project must finish before another can land.” | Dependencies | Declare topology only with explicit source and target |
| “These two topics are related.” | Audit/Trace, not Dependencies | Relatedness is not precedence |
| “I need to know who is actually available.” | Portfolio / Capacity | It owns named roster, allocations, and switching cost |
| “What if James moves to iTrack?” | Portfolio Scenario | Test allocation consequences without writing Reality |
| “What if this capability moves out?” | Scope Scenario | Test product-shape consequences |
| “Where are we likely to land?” | Forecast | Forecast owns modeled delivery consequence |
| “Can we hit September 30?” | Forecast target evaluation | A target is evaluated against the distribution; it is not the likely date |
| “What happened and what comes next?” | Timeline | It aligns events, forecast marks, commitments, and history in time |
| “Where did this claim come from?” | Search → Trace → Inspector | Search finds; Trace isolates the path; Inspector reads the selected object |
| “I need to brief leadership.” | Audit readiness → Reports | Readiness first; then freeze an audience-specific story |
| “I need to start a dormant project.” | Project Activation | Scan, review, manifest, activate, First Audit |

## Fast decision path

```text
Is this new raw evidence?
├─ yes → KE/Hermes upstream
└─ no
   Is it a disagreement with accepted Reality?
   ├─ yes → Audit
   └─ no
      Is it a governed input?
      ├─ product shape → Scope
      ├─ unresolved choice → Decisions
      ├─ precedence → Dependencies
      ├─ people/allocation → Capacity
      └─ milestone/commitment → Timeline
         ↓
      Is the question a consequence?
      ├─ where do we land? → Forecast
      ├─ what deserves attention? → Control Room
      └─ how do we communicate? → Reports
```

The key test is ownership: if clicking would declare something true, use the instrument that owns that truth. If you are only asking “what if?”, stay in Scenario. If you are asking “why?”, use Inspector and Trace.

