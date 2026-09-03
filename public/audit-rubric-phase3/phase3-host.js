/*
 * SIGNAL AUDIT · PHASE 3 PRODUCT TRANSLATION
 *
 * Phase 2 still owns the canonical data/action/Search/Trace boundary. This
 * Audit-local layer adds only Signal material semantics, source-horizon
 * disclosure, and links to the existing canonical Audit workflow.
 */
(function () {
  'use strict';

  const query = new URLSearchParams(window.location.search);
  const scope = query.get('scope') || '';

  const materialColour = {
    attested: '#56d97a',
    inferred: '#f5a623',
    external: '#58abf5',
  };
  const counted = (value, singular) => `${value} ${singular}${value === 1 ? '' : 's'}`;

  function installMaterialChannels() {
    const core = window.BrainCore;
    if (!core || !core.S || !core.S.skin || core.S.skin.__signalPhase3Material) return;
    const skin = core.S.skin;
    skin.__signalPhase3Material = true;

    // Keep Rubric's node drawing. A quiet ring communicates trust/basis;
    // currentness is a separate dot or strike and never changes radius.
    const nativeDrawNode = skin.drawNode.bind(skin);
    skin.drawNode = function signalMaterialNode(ctx, n, r, on, dim, S) {
      nativeDrawNode(ctx, n, r, on, dim, S);
      if (!on || dim || n.presentationOnly || !n.canonicalId || n.type === 'router') return;
      const material = n.trustMaterial;
      if (!material) return;
      const selected = n === S.sel || n === S.hover;
      const colour = materialColour[material] || '#8b93ad';
      ctx.save();
      ctx.globalAlpha = selected ? 0.92 : 0.46;
      ctx.strokeStyle = colour;
      ctx.lineWidth = (selected ? 1.35 : 0.75) / S.cam.k;
      if (material === 'inferred') ctx.setLineDash([2.4 / S.cam.k, 2.4 / S.cam.k]);
      if (material === 'external') ctx.setLineDash([0.8 / S.cam.k, 2.6 / S.cam.k]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.4 / S.cam.k, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (n.currentness === 'superseded') {
        ctx.globalAlpha = selected ? 0.9 : 0.56;
        ctx.strokeStyle = '#8b93ad';
        ctx.lineWidth = 1 / S.cam.k;
        ctx.beginPath();
        ctx.moveTo(n.x - r * 0.8, n.y + r * 0.8);
        ctx.lineTo(n.x + r * 0.8, n.y - r * 0.8);
        ctx.stroke();
      } else if (n.currentness === 'current') {
        ctx.globalAlpha = selected ? 0.95 : 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(n.x + r * 0.72, n.y - r * 0.72, Math.max(0.8, 1.25 / S.cam.k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    // Canonical relationships stay Rubric haze. This overlay only exposes
    // their real basis; structural route/spoke links are untouched.
    const nativeDrawLink = skin.drawLink.bind(skin);
    skin.drawLink = function signalMaterialLink(ctx, link, index, inFocus, S) {
      nativeDrawLink(ctx, link, index, inFocus, S);
      // The native faint haze stays untouched at rest. Basis colour becomes
      // explicit only in Rubric focus, avoiding a second full mesh pass.
      if (!inFocus || !link.canonical || !link.basis || !link.sn || !link.tn) return;
      const colour = materialColour[link.basis] || '#8b93ad';
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.05 / S.cam.k;
      if (link.basis === 'inferred') ctx.setLineDash([3 / S.cam.k, 4 / S.cam.k]);
      if (link.basis === 'external') ctx.setLineDash([1 / S.cam.k, 4 / S.cam.k]);
      ctx.beginPath(); ctx.moveTo(link.sn.x, link.sn.y);
      if (S.curved && S.F && S.F.linkCtrl) {
        const control = S.F.linkCtrl(link.sn, link.tn, index);
        ctx.quadraticCurveTo(control[0], control[1], link.tn.x, link.tn.y);
      } else ctx.lineTo(link.tn.x, link.tn.y);
      ctx.stroke(); ctx.restore();
    };

    // Source counts use Rubric's own label positions and collision budget.
    const nativeDrawLabels = skin.drawLabels.bind(skin);
    skin.drawLabels = function signalWorldLabels(ctx, candidates, S) {
      const translated = candidates.map(row => {
        const n = row[0];
        if (!n.worldLabel) return row;
        const next = [{ ...n, label: n.worldLabel }, ...row.slice(1)];
        // Rubric seats one of three app anchors at twelve o'clock. Keep the
        // anchor exactly there, but nudge only its small identity label clear
        // of the native SOURCE SYSTEMS structural heading.
        if (n.type === 'app' && row[2] < 125) next[1] = row[1] + (row[1] < S.W / 2 ? -88 : 88);
        return next;
      });
      nativeDrawLabels(ctx, translated, S);
    };
  }

  function patchPhase3Card() {
    const core = window.BrainCore;
    const n = core && core.S && core.S.sel;
    const card = document.getElementById('brain-card');
    if (!n || !card || card.style.display === 'none') return;
    const actions = card.querySelector('.card-actions');
    if (card.dataset.signalPhase3Id === n.id && actions && actions.dataset.signalPhase3Patched === 'true') return;
    card.dataset.signalPhase3Id = n.id;

    const badges = card.querySelector('.card-badges');
    if (badges && n.trustMaterial) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.borderColor = materialColour[n.trustMaterial];
      badge.style.color = materialColour[n.trustMaterial];
      badge.textContent = `trust · ${n.trustMaterial}`;
      badges.appendChild(badge);
    }

    const stats = card.querySelector('.card-stats');
    if (stats && n.sourceDepth === 'system' && n.sourceCounts) {
      stats.textContent = [
        counted(n.sourceCounts.linkedObjects, 'linked object'),
        counted(n.sourceCounts.artifacts, 'artifact'),
        counted(n.sourceCounts.passages, 'passage'),
        counted(n.sourceCounts.claims, 'claim'),
      ].join(' · ');
    }

    const line = document.createElement('div');
    line.className = 'signal-phase3-line';
    if (n.sourceDepth === 'system') {
      line.innerHTML = '<strong>Source horizon</strong> · provenance aggregate only; canonical members remain unchanged.';
    } else if (n.layer === 'M' && n.realityRelationship) {
      line.innerHTML = `<strong>Reality distance</strong> · ${n.realityRelationship}. Trust and currentness are separate material channels.`;
    } else if (n.layer === 'S') {
      line.innerHTML = '<strong>Project Model</strong> · accepted model structure; not a disagreement band.';
    }
    if (line.textContent) card.appendChild(line);
    if (actions) actions.dataset.signalPhase3Patched = 'true';
  }

  function patchShell() {
    const core = window.BrainCore;
    if (!core || !core.S || !core.S.meta) return;
    const nav = document.getElementById('signal-audit-nav');
    if (nav && !nav.dataset.signalPhase3) {
      nav.dataset.signalPhase3 = 'true';
      const phase = [...nav.querySelectorAll('span')].find(node => /^Phase\s+2$/i.test(node.textContent || ''));
      if (phase) phase.textContent = 'Phase 3';
      const fresh = document.createElement('a');
      fresh.href = '/audit/new' + (scope ? `?scope=${encodeURIComponent(scope)}` : '');
      fresh.textContent = 'Fresh Audit';
      fresh.title = 'Use Signal’s existing evidence ingestion and human-review workflow';
      const refresh = document.createElement('button');
      refresh.type = 'button'; refresh.textContent = 'Refresh world';
      refresh.title = 'Rebuild the read-only adapter projection from current canonical Signal data';
      refresh.onclick = () => core.S.refreshData('Rebuilding the Signal world');
      nav.append(fresh, refresh);
    }

    const legend = document.getElementById('brain-legend');
    if (legend && !legend.querySelector('.signal-material-key')) {
      const key = document.createElement('div');
      key.className = 'signal-material-key';
      key.innerHTML = `
        <b>Signal semantic channels</b><br>
        Reality distance: aligned → drift/unassessed → conflict/blocking (bounded inside Project World)<br>
        <span class="signal-swatch" style="background:#56d97a"></span>attested
        <span class="signal-swatch" style="background:#f5a623"></span>inferred
        <span class="signal-swatch" style="background:#58abf5"></span>external<br>
        white dot = current · grey strike = superseded`;
      legend.appendChild(key);
    }

    const layout = document.querySelector('[data-sec="layout"]');
    if (layout && !document.getElementById('signal-layout-question')) {
      const question = document.createElement('div');
      question.id = 'signal-layout-question';
      question.className = 'signal-layout-question';
      const questions = {
        rings: 'How does the project world relate to Reality?',
        circle: 'How is the project world organized?',
        hex: 'How is the project world organized as a constellation?',
        force: 'What is structurally connected right now?',
      };
      const refreshQuestion = () => {
        question.textContent = questions[core.S.st.layout] || '';
      };
      layout.appendChild(question);
      layout.querySelectorAll('button').forEach(button => button.addEventListener('click', refreshQuestion));
      refreshQuestion();
    }
  }

  const observer = new MutationObserver(() => {
    installMaterialChannels();
    patchShell();
    patchPhase3Card();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
