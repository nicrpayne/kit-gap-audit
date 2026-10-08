# Audit Inspector usefulness: protected-baseline evidence

Status: lead-approved bounded adapter/translation exceptions. This note does
not authorize a broad protected Audit rebaseline.

## Reviewed protected files

### `public/audit-rubric-phase2/phase2-host.js`

- Protected-base blob: `de42e297da8232e2917b47054920d61858436c00`
- Original reviewed blob: `0ec853e1952b22b1ac0bcdb0be69b2595f01fb1d`
- October 7 source-context repair reviewed blob: `a21a90235cdfee7b3c8346d98a00e00a0421ed0e`
- October 8 source-date repair reviewed blob: `8c5a8836626be019f927df63d89251d64d4116b1`

The existing exact snapshot-qualified navigation remains intact. The bounded
addition makes the native Rubric search results a labelled listbox, makes each
result keyboard-focusable, supports Arrow/Home/End traversal and Enter/Space
selection through the result's existing click action, and keeps the result list
visible when focus moves from the input into it. Escape uses the existing
restore behavior. No result ranking, search source, graph data, camera, layout,
or selection target is changed.

### `public/audit-rubric-phase3/phase3-host.js`

- Protected-base blob: `d3f3c4951e77cb53b17a2a278d60ec8740131313`
- Approved reviewed blob: `a799e130722132432811041ce2311298f97807ce`

The bounded addition renders an exact passage's already-transported
`sourceRef`, snapshot-qualified canonical id, and stored surrounding context.
Each row is appended with `textContent`; absent or blank values produce no row.
The close button receives the accessible name `Close Inspector`. No graph
node, relationship, trust/currentness classification, camera, layout, or
selection target is created or changed by this host.

## Behavioral evidence

Run:

```sh
npx tsx scripts/audit-inspector-usefulness-proof.ts
```

The proof executes both current protected hosts in headless Chromium with a
minimal deterministic DOM. It verifies:

- ArrowDown moves focus from the search input to an actual result;
- the inherited native blur timeout does not hide a keyboard-focused result;
- Enter invokes that result's existing native click selection;
- exact source reference, snapshot-qualified identity, and stored surrounding
  context appear in the passage Inspector;
- missing surrounding context remains null rather than being reconstructed;
- the close control exposes its accessible name; and
- the canonical adapter still validates without adding relationships or
  spatial fields.

A separate local Next fixture pass exercised the generated Phase 3 route at
1440 x 1000 and confirmed the same ArrowDown/Enter path, visible focus outline,
provenance wrapping, and Inspector selection. It used deterministic fixture
data and performed no database or provider writes.

Corroborating checks:

```sh
npx tsc --noEmit --incremental false
npx eslint lib/audit/provenance.ts lib/audit/intelligence.ts lib/audit/requirements.ts lib/audit/graph.ts app/audit/rubric-phase3/route.ts scripts/audit-inspector-usefulness-proof.ts
npx tsx scripts/signal-rubric-adapter-proof.ts
npx tsx scripts/signal-rubric-phase3-proof.ts
npx tsx scripts/signal-rubric-phase3a-proof.ts
npx tsx scripts/signal-rubric-phase3b-proof.ts
```

The DB-backed graph proof still requires an explicit disposable
`DATABASE_URL`; no database-backed result is claimed by this note.

## Protected-manifest decision

The lead reviewed the bounded exceptions listed here against unchanged
protected base `02afba325ddf30fdd8620822dfa9bb870e2ca949` and unchanged protected
world count 33. With the inherited graph-token exception below, their aggregate
working-tree fingerprint is
`69944cdbdfd3baf2b3e11cb379956135aaf1e159fa6036a87f06a95007432be8`
after the bounded October 8 source-date repair (previously
`ee91c5a1762d457362b23c81b926a5d96c6d85eccca37c4f24bf1dd2ab847439`).
The integrity self-test reconstructs that original base in a disposable Git
repository, applies both exact reviewed hosts, and independently rejects a
mutation of either reviewed host, an ordinary protected file, or an added
protected path.

## October 7: quote viewer context

The user authorized the next Scope-admission and original-conversation repair.
The bounded Phase 2 change renders a passage with DOM `textContent`, preserving
its exact text, source reference and snapshot-qualified identity. It presents
the source title and date explicitly found in a dated source reference, never a
retrieval date or inferred speaker. Missing context and missing original web
links are disclosed; only supplied HTTP(S) source resolvers become links.
Background graph selection cannot relabel an already-open quote. The native
core, all geometry, every graph identity, the Phase 3 host and the protected
world of 33 files are unchanged. This is not a wholesale rebaseline.

`node scripts/audit-quote-viewer-proof.mjs` exercises the actual host in Chromium
and WebKit: verbatim multiline quote, inert HTML/script text, dated and undated
sources, supplied and missing surrounding context, stable snapshot identity,
safe links and missing-link honesty. The integrity negative tests still reject
unreviewed edits of either exception, ordinary protected files and added paths.

### Inherited graph token exception discovered during verification

The baseline integrity check had not recorded an existing change from commit
`a65eacc`: completed, canceled **and duplicate** work uses the faint color. The
entire diff is one condition in `components/audit/graphTokens.ts`, from base blob
`17c438015ea94168acf54beae9e3b1fcf454dc72` to existing HEAD blob
`c3d6f55a0a8c17e809736b6c98b96c90c39e4af1`. This repair does not modify that file.
The exact exception is now recorded and covered by the negative mutation test;
no other baseline change is allowed. Layout, camera and canonical data remain
unchanged. This accounts for all three exceptions in the aggregate fingerprint.

## October 8: supplied source date and original quote anchors

Independent staging acceptance on `af6268d` reproduced a supplied meeting date
being presented as missing. A newly transported quote also used snake-case
character offsets, which the camel-case-only projection dropped. The bounded
Phase 2 host diff reads `attributes.sourceDate` before the existing filename
fallback and accepts both underscore- and hyphen-delimited dated references.
It still uses only DOM `textContent`; retrieval times do not supply source
dates, and no original source links, speakers, or conversation text are invented.
Only this one protected host changed. The other 32 protected files are unchanged.

The pure `audit-evidence-metadata-proof.ts` exercises source-date validation,
old-source/fresh-retrieval separation, both offset spellings, producer hashes,
all three passage construction paths (requirement, finding, intelligence), the
canonical graph adapter, and the actual viewer function using inert elements.
This is not browser acceptance. The existing browser quote proof now contains
the regression cases; independent staging browser re-verification is required
before promotion. No changes to graph layout, geometry, search or selection.
