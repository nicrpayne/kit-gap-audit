// SIGNAL GRAPH — THE MOTION CONTRACT.
//
// The instrument is used live on calls, so how it FEELS is a product
// requirement, not a finish. This measures the feel and asserts the parts of
// it that can be stated as laws:
//
//   H  zoom tiers do not chatter at their thresholds
//   T  the camera tween arrives, eases, and can always be interrupted
//   S  selection never moves the camera on its own
//   R  memoisation isolates camera motion from semantic state
//   P  the latency and frame-time budget
//
// EVERY MEASUREMENT IS WARM. The dev server compiles a route on first use,
// and a 6-second compile is not an interaction latency — each path below is
// exercised and discarded before it is timed.
//
//   node scripts/audit-motion-proof.mjs [--json out.json]
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const jsonAt = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

let failures = 0;
const results = {};
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const record = (k, v) => {
  results[k] = v;
  return v;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));

const settle = (ms = 500) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1560, 960); await settle(250); };
const fit = async () => { await p.locator('[data-shoot="camera-fit"]').click(); await settle(700); };
const zoomLevel = () => p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
/** Two camera readings that differ only by float noise. */
const cameraSettledEnough = (a, c) =>
  Math.abs(a.x - c.x) < 0.01 && Math.abs(a.y - c.y) < 0.01 && Math.abs(a.k - c.k) < 0.0001;

const cam = () => p.evaluate(() => {
  const v = document.querySelector('[data-shoot="signal-graph"]').viewBox.baseVal;
  const r = document.querySelector('[data-shoot="signal-graph"]').getBoundingClientRect();
  return { x: v.x + v.width / 2, y: v.y + v.height / 2, k: r.width / v.width };
});

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(2000);

// ── WARM EVERY PATH ────────────────────────────────────────────────────
// Dev compiles the review console, the finding inspector and the search
// panel on first use. None of that is interaction latency.
await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await settle(1600);
await p.keyboard.press("Escape");
await settle(500);
await p.evaluate(() => document.querySelector('[data-shoot^="node-dependency:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await settle(900);
await p.keyboard.press("Escape");
await p.locator('[data-shoot="graph-search"]').fill("offline");
await settle(900);
await p.locator('[data-shoot="graph-search"]').fill("");
await settle(500);
await p.locator('[data-shoot="expand-all"]').click();
await settle(900);
await p.locator('[data-shoot="collapse-all"]').click();
await fit();
await park();

// ══ H. ZOOM HYSTERESIS ════════════════════════════════════════════════
//
// The defect this tranche exists to kill: at a bare threshold, trackpad
// wobble flips the tier every frame and every close-only label strobes.
// Micro-scrolls are dispatched as real wheel events at the SVG, the way a
// trackpad delivers them.
async function wobbleAt(targetK, label) {
  await fit();
  // Walk up to just under the threshold with real wheel events.
  await p.mouse.move(700, 500);
  for (let i = 0; i < 60; i++) {
    const k = (await cam()).k;
    if (k >= targetK * 0.995) break;
    await p.mouse.wheel(0, -40);
    await p.waitForTimeout(16);
  }
  await settle(300);
  const at = (await cam()).k;
  const out = await p.evaluate(async () => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const seen = [];
    for (let i = 0; i < 24; i++) {
      svg.dispatchEvent(new WheelEvent("wheel", { deltaY: i % 2 ? 14 : -14, clientX: 700, clientY: 500, bubbles: true, cancelable: true }));
      await new Promise((r) => requestAnimationFrame(r));
      seen.push(svg.getAttribute("data-zoom"));
    }
    let flips = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) flips++;
    return { flips, tiers: [...new Set(seen)].join("/") };
  });
  record(label, { atK: Number(at.toFixed(3)), ...out });
  check(
    `H${label.endsWith("far") ? "1" : "2"} no tier chatter at the ${label.replace("wobble.", "")} boundary`,
    out.flips === 0,
    `${out.flips} flips over 24 micro-scrolls at k=${at.toFixed(2)} (${out.tiers})`
  );
  return out;
}
await wobbleAt(1.05, "wobble.far");
await wobbleAt(2.1, "wobble.medium");

// H3 — the deadband must still be CROSSABLE. Hysteresis that never lets go
// is a worse bug than chatter.
{
  await fit();
  await p.mouse.move(700, 500);
  const tiers = [];
  for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(20); tiers.push(await zoomLevel()); }
  for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(20); tiers.push(await zoomLevel()); }
  const seq = tiers.filter((t, i) => i === 0 || t !== tiers[i - 1]);
  record("sweep.tiers", seq.join(" → "));
  check(
    "H3 a full zoom sweep still reaches every tier and comes back",
    seq[0] === "far" && seq.includes("close") && seq[seq.length - 1] === "far" && seq.length <= 6,
    seq.join(" → ")
  );
}
await fit();

// ══ T. CAMERA TWEEN ═══════════════════════════════════════════════════
//
// A camera that cuts is a page jump. A camera that cannot be interrupted is
// worse than one that cuts.
const flyTo = () => p.evaluate(() => {
  document.querySelector('[data-shoot="cluster-toggle-linear"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

/** The zoom `flyTo` is aiming at — expanding a cluster frames it at 1.35.
    Named so an interruption proof can say "it did not arrive". */
const FLY_K = 1.35;

// T1/T2 — it animates, and it lands inside the budget.
//
// Clicked and sampled inside ONE page evaluation. Driving the click from the
// test runner while a sampler ran in the page put a CDP round trip between
// the two clocks and inflated a 320ms tween to 531ms — measuring the harness,
// not the instrument.
{
  await fit();
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(500);
  const t = record("fly", await p.evaluate(async () => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    const frames = [];
    let raf;
    const t0 = performance.now();
    const tick = () => { frames.push({ t: performance.now() - t0, vb: svg.getAttribute("viewBox") }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    document.querySelector('[data-shoot="cluster-toggle-linear"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    cancelAnimationFrame(raf);
    const distinct = [...new Set(frames.map((f) => f.vb))];
    // The tween has landed at the last frame whose camera differed from the
    // one before it.
    let settledAt = 0;
    for (let i = frames.length - 1; i > 0; i--) {
      if (frames[i].vb !== frames[i - 1].vb) { settledAt = frames[i].t; break; }
    }
    return { steps: distinct.length, settledAt: Math.round(settledAt), frames: frames.length };
  }));
  check("T1 fly-to animates rather than cutting", t.steps > 8, `${t.steps} distinct camera positions`);
  check(
    "T2 and lands inside the motion budget",
    t.settledAt >= 240 && t.settledAt <= 440,
    `settled at ${t.settledAt}ms (target ~${320}ms)`
  );
  await settle(400);
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// T3 — it arrives at the destination it promised, not near it.
{
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
  await settle(400);
  await flyTo();
  await settle(900);
  const landed = await cam();
  await settle(300);
  const still = await cam();
  record("fly.landed", landed);
  check(
    "T3 the tween comes to rest and stays there",
    Math.abs(landed.x - still.x) < 0.5 && Math.abs(landed.y - still.y) < 0.5 && Math.abs(landed.k - still.k) < 0.005,
    `k=${landed.k.toFixed(2)} at (${Math.round(landed.x)}, ${Math.round(landed.y)})`
  );
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// T4/T5/T6 — INTERRUPTION. The graph must never make the user wait.
//
// `reaims` marks the one interruption that is itself a camera command. Under
// the Interaction Contract, selecting a node runs the framing law, so it does
// not merely CANCEL the flight — it may cancel it and then make its own,
// minimal move from wherever the camera actually got to. The law being
// defended is the same one either way: the flight in progress is abandoned,
// nothing is queued, and whatever happens next comes to rest. So an
// interruption that re-aims is held to "abandoned the old destination and
// settled" rather than to "did not move again".
async function interrupt(label, act, n, reaims = false) {
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
  await settle(400);
  await flyTo();
  await p.waitForTimeout(90); // mid-flight
  const mid = await cam();
  await act();
  await p.waitForTimeout(60);
  const justAfter = await cam();
  await p.waitForTimeout(500); // if the tween survived, it would arrive by now
  const later = await cam();
  await p.waitForTimeout(400);
  const settled = await cam();
  const stopped =
    Math.abs(later.x - justAfter.x) < 1.5 && Math.abs(later.y - justAfter.y) < 1.5 && Math.abs(later.k - justAfter.k) < 0.01;
  const cameToRest =
    Math.abs(settled.x - later.x) < 1.5 && Math.abs(settled.y - later.y) < 1.5 && Math.abs(settled.k - later.k) < 0.01;
  const abandoned = Math.abs(later.k - FLY_K) > 0.02;
  const ok = reaims ? cameToRest && abandoned : stopped;
  record(`interrupt.${label}`, { mid: mid.k, after: justAfter.k, later: later.k, settled: settled.k, stopped, cameToRest, abandoned });
  check(
    `T${n} a running tween is cancelled by ${label}`,
    ok,
    `k ${mid.k.toFixed(2)} → ${justAfter.k.toFixed(2)} → ${later.k.toFixed(2)}` +
      (reaims ? ` → ${settled.k.toFixed(2)} (abandoned the ${FLY_K} destination, then came to rest)` : "")
  );
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}
await interrupt("wheel zoom", async () => { await p.mouse.move(700, 500); await p.mouse.wheel(0, -200); }, 4);
await interrupt("a pan drag", async () => {
  await p.mouse.move(700, 500);
  await p.mouse.down();
  await p.mouse.move(760, 540);
  await p.mouse.up();
}, 5);
await interrupt("selecting a node", async () => {
  await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}, 6, true);
await p.keyboard.press("Escape");
await settle(400);

// T7 — RETARGET. A second fly-to during the first must win, from wherever
// the camera has got to, without snapping back to the start.
{
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
  await settle(400);
  await flyTo();
  await p.waitForTimeout(90);
  await p.locator('[data-shoot="camera-fit"]').click(); // Fit is itself a focus move
  await p.waitForTimeout(700);
  const after = await cam();
  const home = { x: 700, y: 700 };
  record("retarget", after);
  check(
    "T7 a second camera command retargets the first",
    Math.abs(after.x - home.x) < 2 && Math.abs(after.y - home.y) < 2,
    `ended at (${Math.round(after.x)}, ${Math.round(after.y)}) — home`
  );
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ══ S. SELECTION DOES NOT YANK THE CAMERA ═════════════════════════════
{
  await fit();
  await settle(400);
  const before = await cam();
  await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle(700);
  const after = await cam();
  record("select.camera", { before, after });
  // Read back through the SVG's own viewBox, so the comparison is against
  // sub-pixel float noise rather than exact equality — a camera that has not
  // moved still reads a few ten-millionths apart.
  check(
    "S1 selecting a node moves the camera not at all",
    cameraSettledEnough(before, after),
    `(${Math.round(before.x)}, ${Math.round(before.y)}) @ ${before.k.toFixed(3)} unchanged`
  );
  await p.keyboard.press("Escape");
  await settle(400);
}

// S2 — AND A SEARCH RESULT DOES EXACTLY WHAT A CLICK DOES.
//
// This proof used to assert the opposite: that choosing a search result FLEW,
// forcing at least 230% zoom. Hands-on testing at 438 real nodes found that
// to be the single worst behaviour on the surface — it threw away whatever
// view the reader had built in order to show them a node they could usually
// already see, and it made the camera depend on HOW the selection happened
// rather than on what was selected.
//
//   SELECTION SOURCE MUST NOT CHANGE CAMERA SEMANTICS.
//
// So the law is now the same one S1 states, and this proves the two agree:
// at Fit the whole field is visible, so a search result moves nothing at all.
{
  await fit();
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(700);
  const before = await cam();
  await p.locator('[data-shoot="search-results"] button').first().click();
  await settle(900);
  const after = await cam();
  record("search.fly", { before, after });
  check(
    "S2 choosing a search result obeys the same framing law as a click — no forced zoom",
    cameraSettledEnough(before, after),
    `k ${before.k.toFixed(2)} → ${after.k.toFixed(2)} at Fit, where the neighbourhood is already visible`
  );
  await p.locator('[data-shoot="graph-search"]').fill("");
  await p.keyboard.press("Escape");
  await fit();
}

// ══ R. MEMOISATION ════════════════════════════════════════════════════
//
// HOW FAST CAN REACT TURN A CAMERA FRAME AROUND. Measured passively, as the
// interval between successive writes of the SVG's own viewBox — one commit,
// one write. Nothing is sampled per frame, so the instrument does not force
// a layout and does not pay for its own measurement.
//
// This is the metric memoisation moves. Counting DOM mutations does not:
// React re-renders a memo-less node, diffs it, finds the output identical
// and writes nothing, so the mutation count is the same either way while the
// render cost is not. Three gestures, chosen for what each one changes:
//
//   pan       x and y only. Every node's props are identical, so a memoised
//             field skips all 64 and an unmemoised one re-renders all 64 to
//             produce the same output.
//   trackpad  k by ~1% a step — inside one quantisation step, so the nodes
//             usually are not told anything changed.
//   notch     k by ~10% a step, several steps at once. Nothing to skip; this
//             is the honest worst case.
const commitInterval = async (label, fn) => {
  const stamps = await p.evaluate(async (n) => {
    const svg = document.querySelector('[data-shoot="signal-graph"]');
    window.__cs = [];
    const t0 = performance.now();
    window.__cmo?.disconnect();
    window.__cmo = new MutationObserver(() => window.__cs.push(performance.now() - t0));
    window.__cmo.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    return n;
  });
  void stamps;
  await fn();
  await settle(300);
  const gaps = await p.evaluate(() => {
    window.__cmo.disconnect();
    const cs = window.__cs;
    return cs.slice(1).map((v, i) => v - cs[i]);
  });
  gaps.sort((a, b) => a - b);
  const v = {
    commits: gaps.length + 1,
    median: gaps.length ? +gaps[Math.floor(gaps.length / 2)].toFixed(1) : 0,
    p95: gaps.length ? +gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))].toFixed(1) : 0,
  };
  record(`commit.${label}`, v);
  return v;
};

{
  await fit();
  await park();
  const pan = await commitInterval("pan", async () => {
    await p.mouse.move(700, 500);
    await p.mouse.down();
    for (let i = 0; i < 40; i++) { await p.mouse.move(700 + i * 4, 500 + i * 2); }
    await p.mouse.up();
  });
  await fit();
  const trackpad = await commitInterval("trackpad", async () => {
    await p.evaluate(async () => {
      const svg = document.querySelector('[data-shoot="signal-graph"]');
      for (let i = 0; i < 40; i++) {
        svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -7, clientX: 700, clientY: 500, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
  });
  await fit();
  const notch = await commitInterval("notch", async () => {
    await p.evaluate(async () => {
      const svg = document.querySelector('[data-shoot="signal-graph"]');
      for (let i = 0; i < 20; i++) {
        svg.dispatchEvent(new WheelEvent("wheel", { deltaY: i < 10 ? -60 : 60, clientX: 700, clientY: 500, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
  });
  await fit();
  console.log(
    `      camera commit interval — pan ${pan.median}ms · trackpad ${trackpad.median}ms · notch ${notch.median}ms` +
      `   (${pan.commits}/${trackpad.commits}/${notch.commits} commits)`
  );
  check("R0 the camera commits inside a frame budget while panning", pan.median <= 18, `median ${pan.median}ms, p95 ${pan.p95}ms`);
}

const mutations = async (fn) => {
  await p.evaluate(() => {
    window.__mut = 0;
    window.__mo?.disconnect();
    window.__mo = new MutationObserver((rs) => { window.__mut += rs.length; });
    window.__mo.observe(document.querySelector('[data-shoot="graph-nodes"]'), {
      attributes: true, childList: true, subtree: true, characterData: true,
    });
  });
  await fn();
  await settle(450);
  return p.evaluate(() => { window.__mo.disconnect(); return window.__mut; });
};

{
  await fit();
  await park();
  // One wheel tick: camera-only. Semantics unchanged.
  const wheel = record("mut.wheel", await mutations(async () => {
    await p.mouse.move(700, 500);
    await p.mouse.wheel(0, -60);
  }));
  await fit();
  await park();
  // Hover: exactly one node's neighbourhood changes.
  const hover = record("mut.hover", await mutations(async () => {
    const box = await p.locator('[data-shoot^="node-finding:"]').first().boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }));
  await park();
  const select = record("mut.select", await mutations(async () => {
    await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }));
  await p.keyboard.press("Escape");
  await settle(400);
  const search = record("mut.search", await mutations(async () => {
    await p.locator('[data-shoot="graph-search"]').fill("offline");
  }));
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(400);
  console.log(`      node-layer DOM writes — wheel ${wheel} · hover ${hover} · select ${select} · search ${search}`);

  // The states memoisation must NOT suppress.
  await fit();
  const states = await p.evaluate(async () => {
    const q = (s) => document.querySelectorAll(s).length;
    const out = {};
    document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    out.selected = q('[data-shoot^="node-"][data-selected="true"]');
    out.dimmed = [...document.querySelectorAll('[data-shoot^="node-"]')].filter((e) => parseFloat(e.getAttribute("opacity") || "1") < 0.2).length;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    out.clearedSelected = q('[data-shoot^="node-"][data-selected="true"]');
    return out;
  });
  record("states", states);
  check("R1 selection still reaches the node it selected", states.selected === 1, `${states.selected} selected`);
  check("R2 selection still dims the rest", states.dimmed > 10, `${states.dimmed} dimmed`);
  check("R3 clearing selection still releases it", states.clearedSelected === 0, `${states.clearedSelected} left selected`);
}
{
  await fit();
  await p.locator('[data-shoot="graph-search"]').fill("offline");
  await settle(700);
  const matched = await p.locator('[data-shoot^="node-"][data-matched="true"]').count();
  check("R4 search matches still mark their nodes", matched > 0, `${matched} matched`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(500);
  const identBefore = await p.locator('[data-shoot^="node-"][data-identity="latent"]').count();
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(800);
  const identAfter = await p.locator('[data-shoot^="node-"][data-identity="latent"]').count();
  check("R5 expansion still promotes latent marks", identBefore > 0 && identAfter === 0, `${identBefore} latent → ${identAfter}`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ══ P. THE BUDGET ═════════════════════════════════════════════════════
const latency = async (label, fn, ready) => {
  const runs = [];
  for (let i = 0; i < 7; i++) {
    const ms = await p.evaluate(async (r) => {
      const f = new Function("return " + r)();
      const t0 = performance.now();
      window.__go?.();
      for (let k = 0; k < 240; k++) {
        if (f()) return performance.now() - t0;
        await new Promise((res) => requestAnimationFrame(res));
      }
      return -1;
    }, ready);
    runs.push(ms);
    await settle(350);
  }
  runs.sort((a, b) => a - b);
  const v = { median: Math.round(runs[3]), worst: Math.round(runs[6]) };
  record(`lat.${label}`, v);
  return v;
};

// Frame times under sustained camera work.
{
  await fit();
  await park();
  await p.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const tick = (t) => { window.__f.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await p.mouse.move(640, 520);
  for (let i = 0; i < 28; i++) { await p.mouse.wheel(0, i % 2 ? 220 : -220); await p.waitForTimeout(30); }
  await p.mouse.down();
  for (let i = 0; i < 26; i++) await p.mouse.move(640 + i * 7, 520 + i * 4);
  await p.mouse.up();
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(700);
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(500);
  const f = await p.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__f.slice(3).sort((a, b) => a - b); });
  const q = (n) => f[Math.min(f.length - 1, Math.floor(f.length * n))];
  const frames = record("frames", {
    n: f.length,
    median: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    over50: f.filter((x) => x > 50).length,
  });
  check("P1 pan / zoom holds 60fps", frames.median <= 18, `median ${frames.median}ms, p95 ${frames.p95}ms`);
  check("P2 and drops no long frames", frames.over50 === 0, `${frames.over50} frames over 50ms of ${frames.n}`);
}

await fit();
await park();
{
  const box = await p.locator('[data-shoot^="node-finding:"]').first().boundingBox();
  await p.evaluate(([x, y]) => {
    window.__go = () => {
      document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
      document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    };
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  const hov = await latency("hover", null, `() => [...document.querySelectorAll('[data-shoot^="node-"]')].some(e => parseFloat(e.getAttribute("opacity")||"1") < 0.2)`);
  check("P3 hover responds immediately", hov.median < 50, `median ${hov.median}ms, worst ${hov.worst}ms`);
  await p.evaluate(() => { window.__go = null; });
  await park();
  await settle(400);
}
{
  await p.evaluate(() => {
    window.__go = () => {
      const sel = document.querySelector('[data-shoot^="node-"][data-selected="true"]');
      if (sel) { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return; }
      document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };
  });
  const runs = [];
  for (let i = 0; i < 7; i++) {
    const ms = await p.evaluate(async () => {
      const t0 = performance.now();
      document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let k = 0; k < 240; k++) {
        if (document.querySelector('[data-shoot^="node-"][data-selected="true"]')) return performance.now() - t0;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return -1;
    });
    runs.push(ms);
    await p.keyboard.press("Escape");
    await settle(380);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.select", { median: Math.round(runs[3]), worst: Math.round(runs[6]) });
  check("P4 selection responds within budget", v.median < 100, `median ${v.median}ms, worst ${v.worst}ms`);
  await p.evaluate(() => { window.__go = null; });
}
{
  const terms = ["offline", "SOF", "design", "vpn", "notion", "sync", "jsa"];
  const runs = [];
  for (let i = 0; i < 7; i++) {
    await p.locator('[data-shoot="graph-search"]').fill("");
    await settle(250);
    const t0 = await p.evaluate(() => performance.now());
    await p.locator('[data-shoot="graph-search"]').fill(terms[i]);
    const t1 = await p.evaluate(async () => {
      for (let k = 0; k < 240; k++) {
        if (document.querySelector('[data-shoot^="node-"][data-matched="true"]')) return performance.now();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now();
    });
    runs.push(t1 - t0);
    await settle(280);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.search", { median: Math.round(runs[3]), worst: Math.round(runs[6]) });
  check("P5 search responds within budget", v.median < 100, `median ${v.median}ms, worst ${v.worst}ms`);
  await p.locator('[data-shoot="graph-search"]').fill("");
  await settle(400);
}
{
  const runs = [];
  for (let i = 0; i < 6; i++) {
    const before = await p.locator('[data-shoot^="node-"][data-identity="latent"]').count();
    const t0 = await p.evaluate(() => performance.now());
    await p.locator(i % 2 ? '[data-shoot="collapse-all"]' : '[data-shoot="expand-all"]').click();
    const t1 = await p.evaluate(async (b) => {
      for (let k = 0; k < 240; k++) {
        if (document.querySelectorAll('[data-shoot^="node-"][data-identity="latent"]').length !== b) return performance.now();
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now();
    }, before);
    runs.push(t1 - t0);
    await settle(420);
  }
  runs.sort((a, b) => a - b);
  const v = record("lat.expand", { median: Math.round(runs[3]), worst: Math.round(runs[5]) });
  check("P6 expansion state responds within budget", v.median < 100, `median ${v.median}ms, worst ${v.worst}ms`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── PAGE HEALTH ────────────────────────────────────────────────────────
{
  const scroll = await p.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  check("Z1 no page scroll after all of that", scroll.x <= 1 && scroll.y <= 1, JSON.stringify(scroll));
  check("Z2 no page errors during the whole run", pageErrors.length === 0, pageErrors.join(" | "));
}

console.log("\n── MEASURED ──");
for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(20)} ${JSON.stringify(v)}`);
if (jsonAt) writeFileSync(jsonAt, JSON.stringify(results, null, 2));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
