# Widget system

## Principle

> **World first. Widgets around the world.**

On spatial instruments, the model is the primary object. Inspection and
control stay near it without replacing or unnecessarily dimming it. This is a
shared interaction language, not a command to turn every page into floating
panels.

## Widget anatomy

Every widget has, in order:

1. Optional 2px semantic rail (only when the whole widget has one state).
2. Header: 10px micro-label, concise title/state, optional count.
3. One primary job in the body.
4. Contextual actions at the edge nearest the world.
5. Optional footer for provenance, keyboard hint, or owner handoff.

Material: panel at 96% opacity, strong 1px edge, 8px radius, single ambient
shadow. Header/body dividers are subtle. Widgets never use large pills,
generic gradient color, or a second decorative frame.

## Family

### Floating Inspector

- Default detail surface after selecting an object.
- Right edge, 344–392px; world reserves a readable anchor zone rather than
  being covered edge-to-edge.
- `aria-modal="false"`; selection remains visible and world remains operable.
- Identity, state/trust, concise claim, provenance, relationships, Trace,
  Fly to, owner handoff, and copy reference.
- “Open full review” promotes to a governed review surface only when editing or
  consequential confirmation needs more room.

### Search

- Top-right or top-center, 280–360px collapsed to one row.
- Results expand downward over quiet canvas, never over the selected anchor.
- Search result selection flies to the object and opens the same Inspector;
  it does not invent a second detail surface.

### Overview / stats

- Top-left, 220–300px, at most four state-relevant values.
- Readout, not dashboard. Recessed values and no grabbable treatment.
- Collapse to one-line status after selection or Trace begins.

### Layout / control panel

- Upper-left below Overview; compact segmented modes and real controls only.
- Use icon + label for unfamiliar or irreversible controls. “Menu” and
  “Legend” use Signal shell type/material, not Rubric retro chrome.

### Legend

- Bottom-left, collapsed by default once the grammar is learned.
- Organize by independent axes: status hue, trust stroke, time glyph—not a
  single mixed list.
- Opening it must not reframe the world.

### Trace state

- Persistent compact strip at the bottom or within the Inspector header.
- Names origin and destination, active basis, hop count, and `Clear trace`.
- The world shows the route; the widget explains its status. Trace never
  becomes a modal.

### Confirmation / review

- Non-destructive confirmation stays in the Inspector with an inline summary.
- Governed writes use a wider side review surface (480–560px) that preserves a
  narrow live view of the selected object and route.
- A centered modal is reserved for destructive, cross-object, or legally
  consequential confirmation. It restores focus to the invoking control.

### Compact cards and tooltips

- Tooltip: label, value/unit, state/basis; ≤280px; no actions.
- Compact card: one identity, one current readout, one status line; may select
  but does not contain nested navigation.
- If more than two actions are needed, open the Inspector.

## Placement and collision rules

1. The selected world object and its first-order route receive a protected
   center zone.
2. Widgets prefer corners and edges; Inspector owns the right edge.
3. Only one expanded widget per corner and one Inspector at a time.
4. Search results may temporarily overlap a quiet region; they collapse on
   selection.
5. At 1024–1180px, Inspector becomes a flush dock and the world reframes once.
6. Below an instrument’s honest minimum width, show the established wider-
   screen message. Do not stack an unusable miniature world.

## Where widgets belong

| Instrument | Primary pattern |
|---|---|
| Audit World | Full widget family; canonical “world first” implementation |
| Control Room | Persistent overview/workspace panels; inspector can dock |
| Forecast | One dominant canvas + summoned side tools; minimal floating UI |
| Portfolio / Capacity | Dense bay/field + persistent inspector; cards remain in-flow |
| Decisions | Circuit + side inspector; edit/review can promote wider |
| Scope | Deck/composer + docked detail; do not float the composition list |
| Dependencies / Orbit | Spatial field + Inspector/Search/Legend subset |
| Timeline | Full-width temporal field + docked inspector; transport stays anchored |
| Reports | Reading surface; in-flow sections, citations, and side provenance only |

## Behavior rules

- `Escape` closes the highest temporary layer, then clears Trace, then clears
  selection; it does not unexpectedly navigate.
- Focus order follows visible spatial order: shell → local controls → world →
  Inspector → lower widgets.
- Opening/closing a widget uses 150–220ms transform/opacity; world camera moves
  independently and respects reduced motion.
- Widget state is deep-linkable when it changes what the user is inspecting.
- No widget owns truth it does not own. Cross-instrument values are read-only
  and include an explicit owner handoff.
