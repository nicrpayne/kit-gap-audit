# Publication record

`ReportPublication` stores:

- publication id and immutable Report relation;
- DecisionBrief fingerprint;
- bundle version and unique SHA-256 hash;
- audience and purpose;
- destination type (`chatgpt_sites`);
- exact frozen bundle JSON and exclusions;
- created time and authenticated-operator placeholder;
- ordered lifecycle status and timestamps;
- optional external artifact id and HTTPS URL;
- last verification time and state.

Signal-authenticated sessions currently do not carry a named user identity, so V1 records `authenticated_operator` rather than inventing a person. ChatGPT-side states use `operator_attested_*`; only bundle readiness uses `signal_verified_bundle`.

Allowed lifecycle:

`bundle_ready → handoff_opened → draft_generated → previewed → published_shared`

Any preterminal state may become `failed`. Skips and rewinds return conflict. Published/shared requires the operator-confirmed HTTPS URL. No recipient analytics are stored.
