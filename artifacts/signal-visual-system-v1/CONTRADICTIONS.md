# Semantic contradictions

**Verified contradiction count: 18.** A contradiction is counted when the
same hue/treatment communicates different product facts, or the same product
fact is communicated by materially different visual rules. Repeated call sites
under one underlying rule count once.

| # | Current contradiction | Where observed | v1 rule |
|---:|---|---|---|
| 1 | Cyan means verified Audit truth, generic legacy accent, accepted capability, and current-time marker | Audit, `.i-legacy`, Scope, Timeline | Cyan means current/verified Reality; links use source blue unless they activate truth |
| 2 | Reality is cyan when live but gray when baseline/ghost, sometimes without an explicit label | Control Room, Forecast, Portfolio, Audit | Live Reality = cyan; comparison ghost = neutral + “Reality reference” |
| 3 | Violet means Scenario, Decisions, inferred, human-required, selected, and keyboard focus | Suite-wide | Violet = hypothetical/decision structure and focus ring; inferred and human-required gain independent pattern/icon/label |
| 4 | Amber means uncertainty, dependency, stale forecast, open decision, warning, and decorative warm chrome | Control Room, Audit, Timeline, Decisions | Amber = attention/unresolved/stale only; dependency is structure plus explicit label |
| 5 | Red means blocker, unfavorable movement, over-allocation, conflict, destructive action, and Signal-owned dependency | Portfolio, Audit, Decisions | Coral = risk/conflict; destructive actions add action label/icon; dependency is not red by category |
| 6 | Mint means favorable movement, accepted Reality, cross-source agreement, availability, and external commitment | Portfolio, intelligence, Audit | Mint = confirmed positive/available/accepted; wording disambiguates event vs state |
| 7 | Blue/periwinkle means time frame, unknown external claim, feature identity, and source provenance | Timeline, Audit | Source blue is provenance; periwinkle is not added to the semantic core; unknown uses neutral hollow form |
| 8 | Silver is evidence passage in Audit but selected/neutral emphasis elsewhere has no shared rule | Audit, shared tools | Silver/evidence is neutral evidence and selection edge, never a status hue |
| 9 | Per-Scope colors identify Portfolio cards while the north star says Scope identity is its name, not a color | Portfolio versus Forecast | Retire Scope rainbow; use name/order/shape and semantic overlays |
| 10 | Selected state can be violet fill, cyan edge, raised graphite, brightness, or glow | Shell, Audit, Decisions, Timeline | Preserve object hue; add neutral selection edge/marker and ARIA state |
| 11 | Keyboard focus and Scenario both use the same violet halo with no shape distinction | Global instrument focus and Scenario controls | Focus = 2px outer ring + offset; Scenario = interior hue/dash + label |
| 12 | “Stale” is amber, faint gray, or prose-only depending on instrument | Timeline, Forecast legacy, Reports | Amber clock + dotted edge + age text everywhere |
| 13 | Superseded is opacity, temporal dimming, a status word, or absent | Audit sources, Timeline, reading surfaces | 55% + notch/strike glyph + replacement link |
| 14 | Inferred is violet text in intelligence but a long-dashed basis edge in Audit | Intelligence/Orbit, Audit | Promote Audit long dash + diamond + “Inferred” suite-wide |
| 15 | External is a short-dashed edge in Audit but generic metadata elsewhere | Audit, source/context surfaces | External always carries stitch pattern, producer marker, and source link |
| 16 | Essential microcopy and optional metadata both use `--i-text-faint` | Most instruments | Secondary for required comprehension; tertiary only for optional metadata |
| 17 | Hover uses brightness, white veil, background swap, or text recolor, creating different perceived depth | Audit, Timeline, shell, legacy views | One surface lift + strong border; semantic hue remains unchanged |
| 18 | The same raised/recessed material is recreated with many local hex gradients, so equivalent surfaces do not match | Decisions, Portfolio, Timeline, globals | Shared material recipe tokens; local geometry may vary, material may not |

## Highest-risk collisions

The first five rows can cause truth misreading, not merely aesthetic drift.
They must be resolved before broad restyling. Rows 9–18 primarily harm
cross-instrument continuity, accessibility, and maintainability.

## Why orange is not removed entirely

Amber remains useful because unresolved work needs a warm, visually distinct
signal. What is retired is generic orange chrome: menu rails, borders, labels,
or decorative highlights that are orange without indicating attention.
