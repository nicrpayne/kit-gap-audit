# Performance and console

## Dense production-shaped world

- 513 visual nodes painted at Fit
- Rubric telemetry: 120 fps on the local 120 Hz display after idle settlement
- JavaScript heap: 18.6 MB
- Browser DOM nodes: 844
- Long-task entries: 0
- Production-build browser console: 0 errors, 0 warnings

## Search

- 429-document build + index: 10.59 ms
- Median query: 0.239 ms
- p95 query: 1.338 ms
- Maximum query in the benchmark: 2.297 ms

## Interaction observations

- Ten repeated Hermes anchor selections remained responsive with one patched action group per card.
- Five Finding overlay open/close cycles preserved camera and canonical selection exactly.
- Six current/prior context switches reused the same iframe `timeOrigin` and exact camera.
- Direct pan and zoom remained effective during Force morph.
- Extreme zoom restored exactly to Rings Fit.

Development navigation emitted Next.js fixed-layout auto-scroll warnings. The optimized production build did not emit them. The build itself passes; unrelated pre-existing unused-variable lint warnings remain outside Audit.

