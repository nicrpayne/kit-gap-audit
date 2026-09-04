# Semantic palette

## System character

Premium here means measured, not glossy: a graphite field, crisp machined
edges, warm-white type, quiet depth, and light only where it carries meaning.
The Control Room is the reference. Rubric contributes spatial behavior,
selection mechanics, and evidence topology—not orange/retro chrome.

## Core palette

| Role | Token | Value | Use |
|---|---|---|---|
| Accepted current truth | `--signal-reality` | `#51c9db` | live Reality, verified current fact, active truth spine |
| Hypothetical structure | `--signal-scenario` | `#a397fa` | Scenario, proposed/candidate state, decision structure |
| Attention | `--signal-attention` | `#e3b455` | unresolved, stale, warning, needs action |
| Risk | `--signal-risk` | `#f07162` | conflict, blocker, destructive action, critical state |
| Positive | `--signal-positive` | `#53d7aa` | accepted, available capacity, favorable movement |
| Source | `--signal-source` | `#63acd0` | source artifact, provenance link, evidence hub |
| Passage | `--signal-evidence` | `#bec9d0` | quoted passage, neutral evidence, selected neutral edge |
| Inactive | `--signal-inactive` | `#808c95` | secondary identity and inactive structure; not body text |

Each chromatic token also gets `-soft` (14% over transparency), `-muted`
(70% lightness/saturation expression for quiet marks), and `-contrast`
(text/icon intended to sit on a solid chromatic fill). Solid semantic fills
are reserved for tiny indicators and decisive controls; large areas use soft
fills or an edge.

## Surface and text palette

| Token | Value | Contract |
|---|---|---|
| `--signal-surface-void` | `#090c0f` | application ground and deepest negative space |
| `--signal-surface-canvas` | `#0e1317` | primary world/chart/workspace field |
| `--signal-surface-panel` | `#151b20` | persistent panels and widgets |
| `--signal-surface-raised` | `#1c242a` | interactive controls and selected neutral rows |
| `--signal-surface-recessed` | `#070a0c` | meters, wells, computed windows |
| `--signal-border-subtle` | `#29323a` | divisions and default panel edges |
| `--signal-border-strong` | `#3a4650` | operable boundaries and high-emphasis separation |
| `--signal-text-primary` | `#f3f0e7` | primary reading and decisive numbers |
| `--signal-text-secondary` | `#a1abb3` | body copy and persistent secondary labels |
| `--signal-text-tertiary` | `#808c95` | optional metadata; smallest allowed text color |

## Semantic axes

### Reality and Scenario

- Reality: cyan + solid line + “Reality”/“Current” label. When shown only as a
  comparison ghost, use neutral graphite/silver—not a second cyan object—and
  label it “Reality reference.”
- Scenario: violet + hollow/dashed treatment + “Scenario” or “Unsaved” label.
- Never recolor a Reality object violet merely because it is selected.

### Current, stale, superseded

- Current: solid edge, full opacity, cyan current marker when truth status is
  relevant.
- Stale: amber clock/age marker, dotted leading edge, explicit “Stale · {age}.”
- Superseded: 55% opacity, notched/struck timeline glyph, explicit replacement
  link. It is never deleted or shown as merely disabled.

### Attested, inferred, external

- Attested: solid stroke and a filled source dot.
- Inferred: long dash (`6 4`) and a diamond/spark marker; text says “Inferred.”
- External: short stitch (`2 3`) and an outward-corner marker; source/producer
  remains visible.
- Trust/basis never consumes the node’s semantic hue. Stroke pattern + label
  carry it in every context.

### Severity

- Critical/conflict: coral + triangle/exclamation + “Critical”/“Conflict.”
- Warning/attention: amber + diamond/clock + action wording.
- Informational: source blue + circle/info glyph.
- Success/accepted: mint + check + past-tense acceptance wording.

## Materials

- Canvas: opaque `surface-canvas`; optional structural grid at ≤4% white.
- Panel: opaque `surface-panel`, 1px subtle border, 8px radius, no cast shadow.
- Floating widget: 96% panel over canvas, 1px strong edge, one inward highlight,
  and a single 20–32px black ambient shadow. Blur is optional and capped at
  10px; content must remain readable with blur disabled.
- Raised control: top-lit raised→panel gradient, strong edge, 6–7px radius.
- Recessed readout: recessed fill, dark inner shadow, no hover lift.
- Divider: 1px subtle border. Use spacing, not extra cards, for grouping.

No gradient may introduce a new hue. Gradients describe depth within one
surface family. No chromatic glow is decorative; a halo must mean selected,
focused, active, or critical.

## Type hierarchy

- Display readout: 32–112px, 620–680 weight, tabular numerals, −0.03em tracking.
- Instrument title: 16–24px, 600–650; no serif.
- Panel title: 11–13px, 600.
- Body: 12–14px, 1.45–1.65 line-height, secondary text.
- Micro-label: 10px minimum, uppercase, 0.12–0.15em tracking, tertiary text.
- Reading-surface title: 28–34px serif permitted; body remains sans.

## Icon and center identity

Use simple line glyphs with a common 1.5px optical weight. A glyph communicates
an object or action; semantic state remains in the adjacent mark/label. The
Audit center should become a distinctive **Signal Core**—concentric signal
rings with an asymmetric live notch—rather than a generic “Reality” icon or a
Rubric-demo emblem. Until a brand-mark exploration is approved, the words
“Signal Reality” remain inside/alongside the core; do not treat the rail’s `S`
monogram as the final logo.

## Interaction

- Hover: border subtle→strong and/or +4% white surface lift. Do not change a
  semantic hue on hover.
- Selected: 1px evidence/silver inner edge, soft neutral halo, persistent
  selection marker, and `aria-pressed`/`aria-selected` as appropriate.
- Keyboard focus: 2px `--signal-focus-ring` (`#a397fa`) with 2px offset; it
  must remain visible around selected items.
- Active manipulation: raised control compresses 1px; the changed value and
  Scenario state update together.
- Disabled: no elevation, default cursor, primary text at 52%, explicit reason
  in accessible description. Disabled is not stale or superseded.

## Charts and distributions

- Use semantic series only when the series are semantic: Reality cyan,
  Scenario violet, risk tail coral, target/attention amber, accepted threshold
  mint. Do not cycle hues per Scope; labels and position identify Scopes.
- Gridlines use border-subtle at 35–55% opacity; axes use tertiary text.
- Reality-vs-Scenario retains solid vs hollow/dashed form.
- Unknown/unmodeled regions use one consistent hatch; hatch never means late,
  inferred, and missing simultaneously.
- Tooltips use the compact widget material and show series name, value, unit,
  and epistemic/time state when relevant.

## Provenance and handoff

- Source artifacts: blue hub/edge; evidence passages: silver quote treatment.
- Provenance routes: blue line plus direction arrow and a basis pattern.
- Deep links: text-secondary → text-primary on hover, with a small source-blue
  arrow. Cross-instrument handoff names the owner: “Open in Forecast →”.
- Copy-reference confirmations are quiet mint text in place; they do not spawn
  global toasts unless the source surface is no longer visible.
