/**
 * The Audit world is an isolated document, so global custom properties do
 * not cross its iframe boundary. This is the one explicit bridge palette;
 * the visual-system proof verifies every value against app/globals.css.
 */
export const SIGNAL_AUDIT_EMBEDDED_THEME = `
  :root {
    --signal-surface-canvas: #0e1317;
    --signal-surface-panel: #151b20;
    --signal-surface-raised: #1c242a;
    --signal-surface-recessed: #070a0c;
    --signal-border-subtle: #29323a;
    --signal-border-strong: #3a4650;
    --signal-border-selected: #bec9d0;
    --signal-text-primary: #f3f0e7;
    --signal-text-secondary: #a1abb3;
    --signal-text-tertiary: #808c95;
    --signal-reality: #51c9db;
    --signal-reality-soft: rgb(81 201 219 / 14%);
    --signal-scenario: #a397fa;
    --signal-attention: #e3b455;
    --signal-risk: #f07162;
    --signal-positive: #53d7aa;
    --signal-source: #63acd0;
    --signal-evidence: #bec9d0;
    --signal-hover-overlay: rgb(255 255 255 / 4%);
    --signal-selected-overlay: rgb(190 201 208 / 9%);
    --signal-focus-ring: #a397fa;
    --signal-widget-fill: rgb(21 27 32 / 96%);
    --signal-widget-shadow: -18px 14px 40px rgb(0 0 0 / 42%), inset 0 1px rgb(255 255 255 / 4%);
  }
`;
