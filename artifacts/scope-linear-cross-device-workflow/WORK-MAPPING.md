# Capability ↔ Linear work mapping

`CapabilityWorkLink` is the explicit, human-reviewed bridge between product shape and execution truth.

- one Capability can own many Linear issues;
- a current issue can be linked or unlinked;
- a Scope cannot claim the same provider/external id twice;
- the owner read verifies the issue still exists in the Scope's current Linear result before a link is accepted;
- URL, state, title and source timestamp are retained as provenance;
- idempotent retries return the first outcome;
- stale revisions return conflict instead of overwriting;
- no title-only automatic matching occurs.

The two critical absence states are separate:

- accepted Capability without active links: `NO EXECUTION WORK MAPPED`;
- current Linear work without a Capability link: `NO CAPABILITY YET`.

The execution tray contains the latter with issue id, state, estimate state, currentness and raw Linear URL. Completed mapped work stays available for coverage/history but is not added to remaining effort.
