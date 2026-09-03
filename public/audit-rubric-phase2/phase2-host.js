/*
 * SIGNAL AUDIT · PHASE 2 RUBRIC HOST
 *
 * Audit-local boundary around the byte-identical Rubric runtime. This file
 * supplies canonical Signal data/actions and translates visible words. It
 * never supplies positions, targets, forces, ring geometry, or camera state.
 */
(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const query = new URLSearchParams(window.location.search);
  let scope = query.get('scope') || '';
  let audit = query.get('audit') || '';
  const fixture = query.get('fixture') || '';
  const hidden = new Set();
  let graphPromise = null;
  let trace = null;
  let searchRestore = null;

  // Visible vocabulary translation at the drawing boundary. Rubric keeps
  // drawing its own labels at its own live coordinates; only the exact words
  // passed to Canvas are substituted.
  const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
  const canvasLabels = {
    'SKILLS': 'PROJECT MODEL',
    'MEMORY': 'PROJECT WORLD',
    'ROUTINES': 'ATTENTION',
    'APPLICATIONS': 'SOURCE SYSTEMS',
    'CLAUDE.MD': 'REALITY',
  };
  CanvasRenderingContext2D.prototype.fillText = function signalLabel(text) {
    const args = [...arguments];
    args[0] = canvasLabels[String(text)] || text;
    return nativeFillText.apply(this, args);
  };

  const endpoint = (mode, q) => {
    const p = new URLSearchParams({ mode });
    if (scope) p.set('scope', scope);
    if (audit) p.set('audit', audit);
    if (fixture) p.set('fixture', fixture);
    if (q) p.set('q', q);
    return '/api/audit/rubric?' + p.toString();
  };
  const json = (value, status) => Promise.resolve(new Response(JSON.stringify(value), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  }));
  const graph = () => graphPromise || (graphPromise = nativeFetch(endpoint('graph')).then(async r => {
    const value = await r.json();
    if (!r.ok || value.error) throw new Error(value.error || 'Signal graph unavailable');
    return value;
  }));
  const visibleGraph = async () => {
    const value = await graph();
    if (!hidden.size) return value;
    return {
      ...value,
      meta: { ...value.meta, hiddenCount: hidden.size },
      nodes: value.nodes.filter(n => !hidden.has(n.id)),
      links: value.links.filter(l => !hidden.has(l.s) && !hidden.has(l.t)),
    };
  };
  const nodeById = async id => (await graph()).nodes.find(n => n.id === id);
  const detailMarkdown = n => {
    const attrs = n.attributes || {};
    const lines = [
      '# ' + n.label,
      '',
      `**Signal type:** ${n.kind || attrs.kind || 'object'}`,
      `**Canonical ID:** \`${n.canonicalId || n.id}\``,
      `**Canonical reference:** \`${n.canonicalRef || 'presentation only'}\``,
    ];
    if (n.presentationOnly) lines.push('**Viewport role:** Presentation only — canonical truth is unchanged.');
    if (n.sourceProvider) lines.push(`**Source system:** ${n.sourceProvider}`);
    if (n.currentness) lines.push(`**Currentness:** ${n.currentness}`);
    if (n.disagreement) lines.push(`**Reality relationship:** ${n.disagreement}`);
    if (n.basisSummary) lines.push(`**Relationship basis:** ${n.basisSummary}`);
    if (n.desc) lines.push('', n.desc);
    if (n.connections && n.connections.length) {
      lines.push('', '## Canonical relationships', '');
      for (const c of n.connections) lines.push(`- ${c.direction === 'out' ? '→' : '←'} **${c.intelRel || c.rel}** (${c.basis}) — ${c.label}`);
    }
    return lines.join('\n');
  };

  window.fetch = async function signalRubricFetch(input, init) {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);

    if (url.pathname === '/api/graph') return json(await visibleGraph());
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ results: [] });
      const response = await nativeFetch(endpoint('search', q));
      return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/api/expand') return json({ nodes: [] });
    if (url.pathname === '/api/file') {
      const n = await nodeById(url.searchParams.get('path') || '');
      return n ? json({ content: detailMarkdown(n) }) : json({ error: 'Signal object not found' }, 404);
    }
    if (url.pathname === '/api/open') {
      const body = init && init.body ? JSON.parse(init.body) : {};
      const n = await nodeById(body.path || '');
      if (!n || !n.sourceResolver || !/^https?:\/\//i.test(n.sourceResolver)) return json({ ok: false, error: 'No verified source resolver is available.' });
      window.open(n.sourceResolver, '_blank', 'noopener,noreferrer');
      return json({ ok: true });
    }
    if (url.pathname === '/api/tweak') {
      const body = init && init.body ? JSON.parse(init.body) : {};
      if (body.action === 'hide' && body.id) hidden.add(body.id);
      if (body.action === 'unhide-all') hidden.clear();
      return json({ ok: true, presentationOnly: true });
    }
    if (url.pathname === '/api/rescan') { graphPromise = null; return json({ ok: true, readOnly: true }); }
    if (url.pathname === '/api/bake') return json({ ok: false, error: 'Signal Audit does not persist Rubric settings.' });
    return json({ error: 'Unavailable at the Signal adapter boundary.' }, 404);
  };

  const escape = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const signalNode = () => window.BrainCore && window.BrainCore.S.sel;

  function action(event) {
    const button = event.target.closest && event.target.closest('#brain-card .act');
    if (!button) return;
    const n = signalNode();
    if (!n) return;
    const act = button.dataset.act;
    if (act === 'fly') return;
    if (act === 'view') {
      event.preventDefault(); event.stopImmediatePropagation();
      window.BrainCore.openViewer(n.id);
    } else if (act === 'copy') {
      event.preventDefault(); event.stopImmediatePropagation();
      navigator.clipboard.writeText(n.canonicalRef || n.canonicalId || n.id);
      window.BrainCore.toast('Signal reference copied');
    } else if (act === 'open') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (n.sourceResolver) window.open(n.sourceResolver, '_blank', 'noopener,noreferrer');
    } else if (act === 'remove') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!confirm(`Hide “${n.label}” from this Audit view?\nCanonical Signal truth will not change.`)) return;
      hidden.add(n.id);
      window.BrainCore.select(null);
      window.BrainCore.S.refreshData('Hiding from this view');
    } else if (act === 'trace') {
      event.preventDefault(); event.stopImmediatePropagation();
      activateTrace(n.id);
    }
  }
  document.addEventListener('click', action, true);

  function patchCard() {
    const card = document.getElementById('brain-card');
    const n = signalNode();
    const actions = card && card.querySelector('.card-actions');
    const alreadyPatched = card && card.dataset.signalId === (n && n.id)
      && actions && actions.dataset.signalPatched === 'true';
    if (!card || !n || card.style.display === 'none' || alreadyPatched) return;
    card.dataset.signalId = n.id;
    const title = card.querySelector('.card-title');
    const stats = card.querySelector('.card-stats');
    const path = card.querySelector('.card-path');
    const badges = card.querySelector('.card-badges');
    if (title) title.textContent = n.label;
    if (stats) stats.textContent = [n.kind || 'Signal object', n.status, n.currentness, n.disagreement].filter(Boolean).join(' · ');
    if (path) path.textContent = n.canonicalRef || n.canonicalId || '';
    if (badges) badges.innerHTML = [
      `<span class="badge">${escape(n.kind || (n.presentationOnly ? 'presentation' : 'Signal object'))}</span>`,
      n.currentness ? `<span class="badge">${escape(n.currentness)}</span>` : '',
      n.basisSummary ? `<span class="badge signal-basis">${escape(n.basisSummary)}</span>` : '',
    ].join('');
    card.querySelectorAll('.act').forEach(button => {
      const labels = { view: 'View here', open: 'Open source', copy: 'Copy reference', remove: 'Hide from view', fly: 'Fly to' };
      if (labels[button.dataset.act]) button.textContent = labels[button.dataset.act];
      if (button.dataset.act === 'open' && !n.sourceResolver) button.style.display = 'none';
      if (button.dataset.act === 'edit' || button.dataset.act === 'toggle') button.style.display = 'none';
    });
    if (actions && n.canonicalId && !actions.querySelector('[data-act="view"]')) {
      actions.insertAdjacentHTML('afterbegin', '<button class="act" data-act="view">View here</button>');
    }
    if (actions && n.canonicalId && !actions.querySelector('[data-act="copy"]')) {
      actions.insertAdjacentHTML('beforeend', '<button class="act" data-act="copy">Copy reference</button>');
    }
    const tracePath = window.BrainCore.S.meta.traceByNode && window.BrainCore.S.meta.traceByNode[n.id];
    if (actions && tracePath && tracePath.length) actions.insertAdjacentHTML('beforeend', '<button class="act" data-act="trace">Trace provenance</button>');

    const oldRows = card.querySelector('.card-neigh');
    const sub = card.querySelector('.card-sub');
    if (!n.connections || !n.connections.length) {
      if (oldRows) oldRows.remove();
      if (sub) sub.remove();
      if (actions) actions.dataset.signalPatched = 'true';
      return;
    }
    if (sub) sub.textContent = 'Canonical connections';
    if (oldRows) {
      oldRows.innerHTML = n.connections.slice(0, 16).map(c => `
        <div class="nrow" data-id="${escape(c.transportId)}">
          <span class="dot" style="background:${c.basis === 'attested' ? '#56d97a' : c.basis === 'external' ? '#58abf5' : '#f5a623'}"></span>
          <span class="nlab">${escape(c.label)}</span>
          <span class="nkind">${c.direction === 'out' ? '→' : '←'} ${escape(c.intelRel || c.rel)} · ${escape(c.basis)}</span>
        </div>`).join('');
      oldRows.querySelectorAll('.nrow').forEach(row => row.onclick = () => {
        const target = window.BrainCore.S.byId.get(row.dataset.id);
        if (target) { window.BrainCore.select(target); window.BrainCore.flyToNode(target); }
      });
    }
    if (actions) actions.dataset.signalPatched = 'true';
  }

  function patchViewer() {
    const viewer = document.getElementById('brain-viewer');
    if (!viewer || !viewer.classList.contains('open')) return;
    const n = signalNode();
    const path = viewer.querySelector('.v-path');
    if (n && path) {
      const value = n.canonicalRef || n.canonicalId || '';
      if (path.textContent !== value) path.textContent = value;
    }
  }

  const setText = (element, value) => { if (element && element.textContent !== value) element.textContent = value; };

  function patchWords() {
    const hud = document.getElementById('brain-hud');
    if (hud) {
      const brand = hud.querySelector('.hud-rubric');
      const product = hud.querySelector('.hud-product');
      const skin = hud.querySelector('.hud-skin');
      setText(brand, 'SIGNAL');
      setText(product, 'AUDIT WORLD');
      setText(skin, 'Canonical graph · read-only view');
    }
    const search = document.getElementById('brain-search');
    if (search) search.placeholder = `Search ${window.BrainCore.S.meta.canonicalNodes || 0} Signal objects… ( / )`;
    document.querySelectorAll('.lg-sub').forEach(el => {
      el.childNodes.forEach(node => {
        if (node.nodeType !== 3) return;
        const value = node.textContent.replace('ARMS layers', 'Signal roles').replace('Departments', 'Project territories');
        if (node.textContent !== value) node.textContent = value;
      });
    });
    const fileNames = document.querySelector('#chk-filelabels')?.closest('label');
    if (fileNames) {
      fileNames.childNodes.forEach(node => {
        if (node.nodeType === 3 && node.textContent.includes('File names')) node.textContent = node.textContent.replace('File names', 'Object names');
      });
    }
    const tip = document.getElementById('brain-tip');
    const hover = window.BrainCore.S.hover;
    if (tip && hover && (hover.canonicalId || hover.presentationOnly)) {
      const identity = hover.presentationOnly && !hover.canonicalId
        ? `${(hover.memberIds || []).length} canonical objects represented · presentation only`
        : hover.canonicalRef || hover.canonicalId;
      const expected = `<b>${escape(hover.label)}</b><div class="tmut">${escape(hover.kind || (hover.type === 'hub' ? 'Signal territory' : 'Signal object'))}${hover.currentness ? ' · ' + escape(hover.currentness) : ''}</div><div class="tmut">${escape(identity)}</div><div class="tfaint">click to inspect · double-click to fly</div>`;
      tip.dataset.signalId = hover.id;
      if (tip.innerHTML !== expected) tip.innerHTML = expected;
    } else if (tip && (!hover || !hover.canonicalId)) {
      delete tip.dataset.signalId;
    }
  }

  function installSearchRestore() {
    const input = document.getElementById('brain-search');
    if (!input || document.getElementById('signal-search-clear')) return;
    const clear = document.createElement('button');
    clear.id = 'signal-search-clear'; clear.type = 'button'; clear.title = 'Clear and restore prior view'; clear.textContent = '×';
    input.parentElement.appendChild(clear);
    const remember = () => {
      if (!searchRestore) searchRestore = { cam: { ...window.BrainCore.S.cam }, selected: window.BrainCore.S.sel && window.BrainCore.S.sel.id };
      clear.style.display = 'block';
    };
    input.addEventListener('input', () => { if (input.value.trim()) remember(); });
    document.getElementById('brain-results').addEventListener('mousedown', remember, true);
    clear.onclick = () => restoreSearch();
  }

  function restoreSearch() {
    const input = document.getElementById('brain-search');
    const results = document.getElementById('brain-results');
    if (input) input.value = '';
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
    if (searchRestore) {
      window.BrainCore.S.fly = null;
      window.BrainCore.S.cam = { ...searchRestore.cam };
      window.BrainCore.select(searchRestore.selected ? window.BrainCore.S.byId.get(searchRestore.selected) || null : null);
    }
    searchRestore = null;
    const clear = document.getElementById('signal-search-clear');
    if (clear) clear.style.display = 'none';
    window.BrainCore.toast('Prior Audit view restored');
  }

  function installTraceOverlay() {
    if (document.getElementById('signal-trace-overlay')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'signal-trace-overlay'; document.body.appendChild(canvas);
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
        canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (trace && window.BrainCore) {
        const S = window.BrainCore.S;
        ctx.fillStyle = 'rgba(5,6,13,.58)'; ctx.fillRect(0, 0, innerWidth, innerHeight);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.font = '600 11px Outfit, sans-serif';
        for (const edge of trace) {
          const a = S.byId.get(edge.s), b = S.byId.get(edge.t);
          if (!a || !b || a.x == null || b.x == null) continue;
          const ax = a.x * S.cam.k + S.cam.x, ay = a.y * S.cam.k + S.cam.y;
          const bx = b.x * S.cam.k + S.cam.x, by = b.y * S.cam.k + S.cam.y;
          ctx.strokeStyle = edge.basis === 'attested' ? 'rgba(86,217,122,.95)' : edge.basis === 'external' ? 'rgba(88,171,245,.95)' : 'rgba(245,166,35,.95)';
          ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          for (const [node, x, y] of [[a, ax, ay], [b, bx, by]]) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillText(node.label, x + 8, y - 7);
          }
        }
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  function activateTrace(id) {
    trace = window.BrainCore.S.meta.traceByNode && window.BrainCore.S.meta.traceByNode[id] || null;
    window.BrainCore.toast(trace && trace.length ? 'Canonical provenance path' : 'No supported provenance path to Reality');
  }

  function installShell() {
    if (!document.getElementById('signal-audit-nav')) {
      const nav = document.createElement('nav'); nav.id = 'signal-audit-nav';
      nav.innerHTML = `<a href="/">Signal</a><span>Audit World</span><span class="scope">${escape(window.BrainCore.S.meta.scopeName || '')}</span><span>Phase 2</span>`;
      document.body.appendChild(nav);
    }
    installSearchRestore(); installTraceOverlay();
    const canvas = document.getElementById('brain-canvas');
    if (!canvas || canvas.dataset.signalInstalled) return;
    canvas.dataset.signalInstalled = 'true';
    canvas.addEventListener('mousedown', () => { trace = null; }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && searchRestore) { event.preventDefault(); event.stopImmediatePropagation(); restoreSearch(); }
      else if (event.key === 'Escape') trace = null;
    }, true);
  }

  function installSignalAuditBridge() {
    // buildPanels installs refreshData after the graph and controls exist.
    // Do not announce readiness earlier: the parent would legitimately send
    // its context straight back and hit a bridge with nothing to refresh yet.
    if (window.__signalAuditBridgeInstalled || typeof window.BrainCore.S.refreshData !== 'function') return;
    window.__signalAuditBridgeInstalled = true;
    const announce = type => {
      if (window.parent === window) return;
      window.parent.postMessage({
        type,
        scope: window.BrainCore.S.meta.scopeId || scope,
        auditContext: window.BrainCore.S.meta.auditContext || { mode: 'current' },
      }, window.location.origin);
    };
    window.addEventListener('message', async event => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.type !== 'signal-audit-set-context') return;
      scope = typeof message.scope === 'string' ? message.scope : scope;
      audit = typeof message.audit === 'string' ? message.audit : '';
      graphPromise = null;
      hidden.clear();
      await window.BrainCore.S.refreshData('Updating Audit context');
      announce('signal-audit-world-updated');
    });
    announce('signal-audit-world-ready');
  }

  const observer = new MutationObserver(() => {
    if (!window.BrainCore || !window.BrainCore.S || !window.BrainCore.S.meta) return;
    patchWords(); patchCard(); patchViewer(); installShell(); installSignalAuditBridge();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
