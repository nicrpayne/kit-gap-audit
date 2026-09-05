import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SignalBasisMark,
  SignalControl,
  SignalMeter,
  SignalPanel,
  SignalStateMark,
  SignalWidget,
} from "../components/instrument/SignalPrimitives";

const html = renderToStaticMarkup(
  <main>
    <SignalWidget title="Inspector" label="Audit" status="risk" footer="Open in Audit">
      Current conflict
    </SignalWidget>
    <SignalPanel>Structural window</SignalPanel>
    <SignalStateMark status="attention" label="Needs action" time="stale" timeLabel="Stale · 4d" />
    <SignalBasisMark basis="inferred" />
    <SignalBasisMark basis="external" />
    <SignalControl selected>Selected control</SignalControl>
    <SignalControl disabled aria-describedby="disabled-reason">Disabled control</SignalControl>
    <SignalMeter>Computed value</SignalMeter>
  </main>
);

assert.match(html, /class="signal-widget/);
assert.match(html, /data-signal-status="risk"/);
assert.match(html, /data-signal-time="stale"/);
assert.match(html, /Stale · 4d/);
assert.match(html, /data-signal-basis="inferred"/);
assert.match(html, /stroke-dasharray="6 4"/);
assert.match(html, /data-signal-basis="external"/);
assert.match(html, /stroke-dasharray="2 3"/);
const source = readFileSync("components/instrument/SignalPrimitives.tsx", "utf8");
assert.match(source, /export function SignalHandoff/);
assert.match(source, /signal-handoff__arrow/);
assert.match(html, /aria-pressed="true"/);
assert.match(html, /disabled=""/);
assert.match(html, /class="signal-meter/);

console.log("PASS shared Signal primitives expose semantic, time, basis, interaction, and material contracts");
