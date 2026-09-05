# Shared primitives

`components/instrument/SignalPrimitives.tsx` now exports:

- `SignalWidget`: floating/docked widget shell with semantic status rail, header, count, actions, body, and footer slots.
- `SignalPanel`: shared structural panel; computed by default, optionally operable through its material modifier.
- `SignalStateMark`: semantic state plus explicit current/stale/superseded symbol and text.
- `SignalBasisMark`: attested, inferred, and external line/symbol patterns; trust is not color-only.
- `SignalHandoff`: consistent cross-instrument ownership handoff.
- `SignalControl`: raised, operable control with independent selected, focus, disabled, and semantic status channels.
- `SignalMeter`: recessed, computed material.

The CSS contract preserves the approved material law: raised means operable; recessed means computed. These are small recipes rather than a generic card abstraction.

The shell, Control Room headers/panels, and current Audit widget chrome consume the shared contract. Routing and navigation structure are unchanged.

