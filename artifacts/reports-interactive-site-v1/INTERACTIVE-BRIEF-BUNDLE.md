# InteractiveBriefBundleV1

Version: `interactive-brief-bundle.v1`
Handoff: `chatgpt-sites-handoff.v1`
Seal: SHA-256 over canonical, recursively key-sorted JSON before `bundleHash` is inserted.

## Identity and integrity

The bundle identifies the immutable Report, project, audience, purpose, generation/as-of time, Reality/Scenario mode, optional frozen comparison, DecisionBrief fingerprint, and exact bundle hash.

## Content

The projection includes only facts required by enabled recipe modules: outcome; likely/earliest/latest; target; explicit commitment or absence; supported delivery drivers; changes; decisions; confirmed asks; executable Scope; dependencies; Capacity; milestones; next; Findings; caveats; and frozen Scenario options.

An unavailable Forecast produces `delivery.status = unavailable`, null likely/window/confidence fields, and the exact missing-data reason. It cannot retain an attractive stale date in the publication projection.

## Provenance

Every material content group has owner, as-of, currentness, temporal role, and grounding. Internal source IDs and raw evidence passage IDs are not copied. Where the recipe allows source trace, the bundle uses an opaque bundle-local reference and `href: null`; the Site may say the trace exists in Signal but cannot access Signal.

## Permissions

The permission block is entirely negative authority: no live Signal access, queries, mutation, credentials, silent refresh, or publish authorization. No raw source excerpt is included because the existing DecisionBrief contract has no explicit shareability mark.

## Presentation

The frozen recipe supplies module order and density. Allowed interactions are allowlisted: module navigation, expand/collapse, bundle-local source trace, milestone exploration, and frozen scenario comparison. No action may write to Signal.

The full internal `DecisionBriefV1` is intentionally absent.
