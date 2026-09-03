/*
 * SIGNAL AUDIT · PHASE 1 RUBRIC TRANSPLANT HOST
 *
 * The Rubric browser runtime below this file is an unmodified copy of the
 * supplied CC BY 4.0 reference. This shim replaces only its local server
 * boundary with a frozen Rubric-native fixture so the actual application can
 * execute inside Next.js before any Signal graph data is connected.
 *
 * Original work: Copyright (c) 2026 Jay E | RoboNuggets
 * https://skool.com/robonuggets · CC BY 4.0
 * https://creativecommons.org/licenses/by/4.0/legalcode
 * Changes: static, non-mutating fixture transport for Signal Audit Phase 1.
 */
(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let fixturePromise = null;
  const fixture = () => fixturePromise || (fixturePromise = nativeFetch('./graph.json').then(r => r.json()));
  const json = value => Promise.resolve(new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  }));

  window.fetch = async function phaseOneFetch(input, init) {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);

    const graph = await fixture();
    if (url.pathname === '/api/graph') return json(graph);

    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const results = !q ? [] : graph.nodes
        .filter(n => `${n.label || ''} ${n.path || ''}`.toLowerCase().includes(q))
        .slice(0, 40)
        .map(n => ({
          path: n.path || n.id,
          name: n.label,
          type: n.type,
          ext: n.ext,
          size: n.size,
          dept: n.dept,
          layer: n.layer,
          access: n.access,
          files: n.files,
        }));
      return json({ results });
    }

    if (url.pathname === '/api/expand') return json({ nodes: [] });
    if (url.pathname === '/api/file') {
      const path = url.searchParams.get('path') || 'reference fixture';
      return json({
        content: `# ${path}\n\nPhase 1 is running Rubric's own selection and viewer machinery against a frozen, non-Signal reference fixture.`,
      });
    }
    if (url.pathname === '/api/open') {
      return json({ ok: false, error: 'Device opening is disabled in the Phase 1 reference fixture.' });
    }
    if (url.pathname === '/api/tweak' || url.pathname === '/api/bake' || url.pathname === '/api/rescan') {
      return json({ ok: true, fixture: true });
    }
    return json({ error: 'Unavailable in the Phase 1 reference fixture.' });
  };
})();
