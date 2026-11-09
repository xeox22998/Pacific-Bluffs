/* =====================================================================
   PACIFIC BLUFFS — Moteur d'animations partagé
   - [data-reveal]      apparition au scroll (up, fade, scale, blur, left, right, rise, clip)
   - [data-stagger]     décale l'apparition des enfants [data-reveal]
   - [data-split]       découpe un titre mot à mot
   - [data-count]       compteur animé (data-prefix / data-suffix / data-decimals)
   - [data-magnetic]    bouton attiré par la souris
   - [data-tilt]        inclinaison 3D + reflet qui suit la souris
   - [data-theme-toggle] bascule jour / nuit (mémorisée)
   ===================================================================== */
(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const NUM = new Intl.NumberFormat('fr-FR');

  /* ---------- Apparition au scroll ---------- */
  let io = null;
  // Un élément entièrement découpé (data-reveal="clip") n'est jamais vu comme visible :
  // on surveille son parent à sa place.
  const proxies = new Map();
  function observer() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const t = e.target;
        if (t.hasAttribute('data-reveal') || t.hasAttribute('data-split')) t.classList.add('is-in');
        if (t.hasAttribute('data-count')) countUp(t);
        if (proxies.has(t)) { proxies.get(t).forEach((c) => c.classList.add('is-in')); proxies.delete(t); }
        io.unobserve(t);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    return io;
  }
  function watch(el) {
    const obs = observer();
    if (el.getAttribute('data-reveal') === 'clip' && el.parentElement) {
      const p = el.parentElement;
      if (!proxies.has(p)) proxies.set(p, []);
      proxies.get(p).push(el);
      obs.observe(p);
    } else {
      obs.observe(el);
    }
  }

  /* ---------- Découpe mot à mot ---------- */
  function split(root) {
    root.querySelectorAll('[data-split]:not(.split)').forEach((el) => {
      let i = 0;
      const walk = (node) => {
        [...node.childNodes].forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
              const w = document.createElement('span');
              w.className = 'w';
              const s = document.createElement('span');
              s.textContent = part;
              s.style.setProperty('--i', i++);
              w.appendChild(s);
              frag.appendChild(w);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1 && n.tagName !== 'BR') {
            walk(n);
          }
        });
      };
      walk(el);
      el.classList.add('split');
    });
  }

  /* ---------- Compteurs ---------- */
  function formatCount(el, v) {
    const dec = Number(el.dataset.decimals || 0);
    const txt = dec ? v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : NUM.format(Math.round(v));
    return (el.dataset.prefix || '') + txt + (el.dataset.suffix || '');
  }
  function countUp(el) {
    const target = Number(el.dataset.count) || 0;
    if (RM || el.dataset.counted) { el.textContent = formatCount(el, target); return; }
    el.dataset.counted = '1';
    const dur = Number(el.dataset.duration || 1600);
    const t0 = performance.now();
    const ease = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = formatCount(el, target * ease(p));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Décalage des enfants ---------- */
  function stagger(root) {
    root.querySelectorAll('[data-stagger]').forEach((box) => {
      const step = Number(box.dataset.stagger) || 80;
      [...box.children].filter((c) => c.hasAttribute('data-reveal')).forEach((c, i) => {
        c.style.setProperty('--d', (i * step) + 'ms');
      });
    });
  }

  /* ---------- Bouton magnétique ---------- */
  function magnetic(root) {
    if (!FINE || RM) return;
    root.querySelectorAll('[data-magnetic]:not([data-mg])').forEach((el) => {
      el.dataset.mg = '1';
      const k = Number(el.dataset.magnetic) || 0.3;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * k).toFixed(1) + 'px');
        el.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * k).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });
  }

  /* ---------- Inclinaison 3D ---------- */
  function tilt(root) {
    if (!FINE || RM) return;
    root.querySelectorAll('[data-tilt]:not([data-tl])').forEach((el) => {
      el.dataset.tl = '1';
      const max = Number(el.dataset.tilt) || 10;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((x - 0.5) * max).toFixed(2) + 'deg');
        el.style.setProperty('--px', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--py', (y * 100).toFixed(1) + '%');
        el.classList.add('is-tilting');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.classList.remove('is-tilting');
      });
    });
  }

  /* ---------- Curseur personnalisé ---------- */
  function cursor() {
    if (!FINE || RM || document.querySelector('.cursor-dot')) return;
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    ring.innerHTML = '<span></span>';
    document.body.append(dot, ring);
    document.documentElement.classList.add('has-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, shown = false;
    addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      dot.style.transform = `translate(${x}px,${y}px)`;
      if (!shown) { shown = true; rx = x; ry = y; }
    }, { passive: true });
    addEventListener('pointerdown', () => ring.classList.add('is-down'));
    addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('a,button,[data-cursor],label,summary,.pill');
      const label = t && t.dataset.cursor;
      ring.classList.toggle('is-hover', !!t && !label);
      ring.classList.toggle('has-label', !!label);
      ring.firstChild.textContent = label || '';
    });
    document.addEventListener('pointerleave', () => { dot.style.opacity = ring.style.opacity = '0'; });
    document.addEventListener('pointerenter', () => { dot.style.opacity = ring.style.opacity = '1'; });
    (function loop() {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = `translate(${rx.toFixed(1)}px,${ry.toFixed(1)}px)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- Confettis de fête : confettis, étincelles, points et petits palmiers ----------
     Couleurs du logo (orange, rose, violet), soleil jaune et bleu du lagon. Les confettis
     retombent un peu (gravité) pour faire « fête sur la plage ». */
  const PARTY = ['#ff8a3d', '#ff4f8b', '#ffd166', '#3fd0dc', '#a36bff', '#ffffff', '#ff6a5c'];
  function burst(x, y, n) {
    if (RM) return;
    n = n || 12;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const r = Math.random();
      s.className = 'burst' + (r < 0.14 ? ' palm' : r < 0.55 ? ' conf' : r < 0.75 ? ' dot' : '');
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = 45 + Math.random() * 80;
      const dur = 0.9 + Math.random() * 0.5;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--c', PARTY[Math.floor(Math.random() * PARTY.length)]);
      s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(a) * d + 30 + Math.random() * 40).toFixed(0) + 'px');
      s.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      s.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
      s.style.setProperty('--dur', dur.toFixed(2) + 's');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), dur * 1000 + 60);
    }
  }

  /* ---------- Ondulation + étoiles au clic ---------- */
  function clickFx() {
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.btn');
      if (!b || RM) return;
      const r = b.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const rp = document.createElement('span');
      rp.className = 'ripple';
      rp.style.width = rp.style.height = size + 'px';
      rp.style.left = (e.clientX - r.left - size / 2) + 'px';
      rp.style.top = (e.clientY - r.top - size / 2) + 'px';
      b.appendChild(rp);
      setTimeout(() => rp.remove(), 720);
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.btn-sun,.icon-btn.sun');
      if (b && e.clientX) burst(e.clientX, e.clientY, 14);
    });
  }

  /* ---------- Thème jour / nuit ----------
     Le site s'ouvre toujours en sombre ; le choix jour / nuit ne vaut que pour la visite en cours. */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { sessionStorage.setItem('pacific:theme', t); } catch (e) { /* stockage indisponible */ }
    document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }
  function themeToggles() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-toggle]');
      if (!b) return;
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Badge « Powered by Netlify » ----------
     Netlify l'ajoute en bas à droite (obligatoire sur l'offre gratuite, au-dessus
     de tout). On mesure sa hauteur dans --hud-h pour remonter nos éléments fixés
     en bas (barre d'onglets, fenêtres, notifications) au lieu de les laisser dessous. */
  function netlifyBadge() {
    const root = document.documentElement;
    let frame = null, best = 0, lastW = innerWidth;
    const apply = () => {
      if (!frame || !document.contains(frame)) { root.style.removeProperty('--hud-h'); root.classList.remove('has-hud'); return; }
      if (!frame.dataset.nlReady) return; // pas encore affiché
      const h = Math.round(frame.getBoundingClientRect().height);
      if (!h) return;
      best = best ? Math.min(best, h) : h; // hauteur badge fermé (sa fenêtre peut s'agrandir quand on l'ouvre)
      root.style.setProperty('--hud-h', Math.min(best, 110) + 'px');
      root.classList.add('has-hud');
    };
    const attach = (f) => {
      frame = f;
      new MutationObserver(apply).observe(f, { attributes: true, attributeFilter: ['style', 'data-nl-ready'] });
      apply();
    };
    const find = () => document.getElementById('nl-badge-frame') || document.getElementById('nl-hud-frame');
    const existing = find();
    if (existing) attach(existing);
    new MutationObserver(() => {
      const f = find();
      if (f && f !== frame) attach(f);
      else if (!f && frame) { frame = null; apply(); }
    }).observe(document.body, { childList: true });
    addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; best = 0; apply(); } });
  }

  /* ---------- Balayage d'une zone (appelé après chaque rendu) ---------- */
  function scan(root) {
    root = root || document;
    split(root);
    stagger(root);
    root.querySelectorAll('[data-reveal]:not(.is-in),[data-split]:not(.is-in),[data-count]:not([data-counted])').forEach((el) => {
      if (RM) {
        el.classList.add('is-in');
        if (el.hasAttribute('data-count')) countUp(el);
      } else {
        watch(el);
      }
    });
    magnetic(root);
    tilt(root);
  }

  let booted = false;
  function init(opts) {
    if (booted) return;
    booted = true;
    clickFx();
    themeToggles();
    netlifyBadge();
    if (opts && opts.cursor) cursor();
    scan(document);
  }

  window.Motion = { RM, FINE, init, scan, countUp, burst, setTheme };
})();
