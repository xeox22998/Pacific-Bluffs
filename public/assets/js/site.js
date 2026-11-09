/* =====================================================================
   PACIFIC BLUFFS — Accueil public : animations et données
   Données publiques (base partagée) : carte en vigueur + événements à venir.
   (Pas de privatisation sur l'accueil : le staff les note dans son espace.)
   ===================================================================== */
(function () {
  const RM = Motion.RM;
  const FINE = Motion.FINE;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hueFor = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const ICON_MENU = '<svg class="i" viewBox="0 0 24 24"><path d="M4 8h16M4 16h16"/></svg>';
  const ICON_X = '<svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  /* ---------- Écran d'intro (une fois par session) : le triangle se dessine, le nom s'écrit ---------- */
  function intro(done) {
    const loader = $('#loader');
    let seen = false;
    try { seen = sessionStorage.getItem('pacific:intro') === '1'; } catch (e) { /* navigation privée */ }
    if (RM || seen || !loader) { if (loader) loader.remove(); done(); return; }
    try { sessionStorage.setItem('pacific:intro', '1'); } catch (e) { /* navigation privée */ }
    const bar = $('#ldBar');
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 1500);
      bar.style.width = (100 * (1 - Math.pow(1 - p, 3))).toFixed(1) + '%';
      if (p < 1) { requestAnimationFrame(tick); return; }
      loader.classList.add('is-done');
      setTimeout(done, 380);
      setTimeout(() => loader.remove(), 1300);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Compte à rebours jusqu'à 23h ---------- */
  function countdown() {
    const el = $('#countdown');
    const upd = () => {
      const now = new Date();
      const h = now.getHours();
      if (h >= 23 || h < 5) { el.innerHTML = 'La soirée a commencé · <b>rejoignez-nous sur la plage</b>'; return; }
      const open = new Date(now);
      open.setHours(23, 0, 0, 0);
      const s = Math.max(0, Math.floor((open - now) / 1000));
      el.innerHTML = `Ouverture ce soir à 23h · dans <b>${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}</b>`;
    };
    upd();
    setInterval(upd, 1000);
  }

  /* ---------- Navigation ---------- */
  function nav() {
    const navEl = $('#nav');
    const box = $('#navLinks');
    const ind = $('#navInd');
    const links = $$('a', box);
    const sections = links.map((a) => $(a.getAttribute('href')));
    let lastY = scrollY;
    const moveInd = (a) => {
      if (!a) { ind.style.opacity = '0'; return; }
      ind.style.opacity = '1';
      ind.style.left = a.offsetLeft + 'px';
      ind.style.width = a.offsetWidth + 'px';
    };
    links.forEach((a) => a.addEventListener('mouseenter', () => moveInd(a)));
    box.addEventListener('mouseleave', () => moveInd(links.find((l) => l.classList.contains('is-active'))));
    return () => {
      const y = scrollY;
      navEl.classList.toggle('is-stuck', y > 44);
      if (Math.abs(y - lastY) > 6) {
        navEl.classList.toggle('is-hidden', y > lastY && y > 320 && !document.body.classList.contains('menu-open'));
        lastY = y;
      }
      const mid = innerHeight * 0.35;
      let cur = null;
      sections.forEach((s, i) => {
        if (!s) return;
        const r = s.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) cur = links[i];
      });
      links.forEach((l) => l.classList.toggle('is-active', l === cur));
      if (!box.matches(':hover')) moveInd(cur);
    };
  }
  function mobileMenu() {
    const b = $('#burger');
    const m = $('#mnav');
    $$('a', m).forEach((a, i) => a.style.setProperty('--i', i));
    const set = (open) => {
      m.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      b.setAttribute('aria-expanded', String(open));
      b.innerHTML = open ? ICON_X : ICON_MENU;
    };
    b.addEventListener('click', () => set(!m.classList.contains('is-open')));
    $$('a', m).forEach((a) => a.addEventListener('click', () => set(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }

  /* ---------- Hero : constellation en parallaxe + dispersion au scroll ---------- */
  function hero() {
    const stage = $('#heroStage');
    const cards = $$('.fc', stage);
    const wm = $('.wm');
    let mx = 0, my = 0, cx = 0, cy = 0, dirs = [];
    if (FINE && !RM) addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    const measure = () => {
      const w = stage.offsetWidth, h = stage.offsetHeight;
      dirs = cards.map((c) => {
        const x = c.offsetLeft + c.offsetWidth / 2 - w / 2;
        const y = c.offsetTop + c.offsetHeight / 2 - h / 2;
        const len = Math.hypot(x, y) || 1;
        return { x: x / len, y: y / len, d: Number(c.dataset.depth) || 1 };
      });
    };
    measure();
    addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);
    if (RM) return () => {};
    return () => {
      const h = stage.offsetHeight;
      if (scrollY > h * 1.4) return;
      cx = lerp(cx, mx, 0.06);
      cy = lerp(cy, my, 0.06);
      const p = clamp(scrollY / (h * 0.9), 0, 1);
      cards.forEach((c, i) => {
        const d = dirs[i];
        const tx = -cx * 38 * d.d + d.x * p * 260 * d.d;
        const ty = -cy * 30 * d.d + d.y * p * 190 * d.d - p * 70 * d.d;
        c.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${(1 + p * 0.12 * d.d).toFixed(3)})`;
        c.style.opacity = (1 - p * 0.9).toFixed(3);
      });
      wm.style.transform = `translate3d(${(-cx * 12).toFixed(1)}px,${(p * 90 - cy * 8).toFixed(1)}px,0) scale(${(1 - p * 0.14).toFixed(3)})`;
      wm.style.opacity = (1 - p * 0.75).toFixed(3);
    };
  }

  /* ---------- « Ce soir, je veux… » ---------- */
  function typer() {
    const el = $('#typer');
    const ask = $('#ask');
    const items = [['voir la carte', '#carte'], ['découvrir nos menus', '#menus'], ['une carte membre', '#membres'], ['voir les prochains événements', '#evenements'], ['rencontrer la direction', '#direction']];
    let i = 0, pos = items[0][0].length, deleting = true;
    if (RM) return;
    const step = () => {
      const full = items[i][0];
      if (deleting) {
        pos--;
        el.textContent = full.slice(0, pos);
        if (pos <= 0) { deleting = false; i = (i + 1) % items.length; ask.href = items[i][1]; setTimeout(step, 320); return; }
        setTimeout(step, 26);
      } else {
        pos++;
        el.textContent = full.slice(0, pos);
        if (pos >= full.length) { deleting = true; setTimeout(step, 2300); return; }
        setTimeout(step, 50 + Math.random() * 45);
      }
    };
    setTimeout(step, 2800);
  }

  /* ---------- Bandeau défilant (réagit à la vitesse du scroll) ---------- */
  function marquee(root, base) {
    const track = $('.mq-track', root);
    const group = $('.mq-group', root);
    while (track.scrollWidth < innerWidth * 2.4) track.appendChild(group.cloneNode(true));
    let x = 0, w = group.offsetWidth, dir = -1, boost = 0, skew = 0;
    addEventListener('resize', () => { w = group.offsetWidth; });
    if (document.fonts) document.fonts.ready.then(() => { w = group.offsetWidth; });
    return (dt, vel) => {
      if (Math.abs(vel) > 0.5) dir = vel > 0 ? -1 : 1;
      boost = lerp(boost, Math.min(30, Math.abs(vel) * 0.8), 0.1);
      skew = lerp(skew, clamp(-vel * 0.25, -12, 12), 0.12);
      x += dir * (base + boost) * (dt / 16);
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
    };
  }

  /* ---------- La carte + nos menus ---------- */
  const CATS = ['Plats', 'Desserts', 'Cocktails', 'Mocktails', 'Vins & Champagne'];
  const SINGULAR = { 'Plats': 'Plat', 'Desserts': 'Dessert', 'Cocktails': 'Cocktail', 'Mocktails': 'Mocktail', 'Vins & Champagne': 'Cave' };
  const flagHtml = (m) => (m.drapeau ? ` <span class="flag" role="img" aria-label="Origine">${esc(m.drapeau)}</span>` : '');
  // Photo importée par la direction (base partagée), ou gardée dans ce navigateur (mode local)
  const photoOf = (m) => (m.photo ? '/api/photo/' + encodeURIComponent(m.id) + '?v=' + encodeURIComponent(m.photo)
    : (typeof m.photoData === 'string' && m.photoData.startsWith('data:image/') ? m.photoData : ''));
  let currentCat = 'Tout';
  let renderedMenu = '';
  function menuFilters() {
    const fil = $('#menuFilters');
    fil.insertAdjacentHTML('beforeend', ['Tout'].concat(CATS).map((c, i) =>
      `<button type="button" role="tab" data-cat="${c}" class="${i === 0 ? 'is-active' : ''}" aria-selected="${i === 0}">${c === 'Tout' ? 'Tout' : CLUB.MENU_ICONS[c] + ' ' + c}</button>`).join(''));
    fil.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) applyFilter(b.dataset.cat); });
    const refresh = () => setInd($('button.is-active', fil));
    requestAnimationFrame(refresh);
    addEventListener('resize', refresh);
    if (document.fonts) document.fonts.ready.then(refresh);
  }
  function setInd(btn) { const ind = $('#filterInd'); if (btn && ind) { ind.style.left = btn.offsetLeft + 'px'; ind.style.width = btn.offsetWidth + 'px'; } }
  function applyFilter(cat) {
    currentCat = cat;
    $$('#menuFilters button').forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      if (on) setInd(b);
    });
    let k = 0;
    $$('#menuGrid .prod').forEach((p) => {
      const show = cat === 'Tout' || p.dataset.cat === cat;
      p.classList.toggle('is-hidden', !show);
      p.classList.remove('pop');
      if (show) { void p.offsetWidth; p.style.setProperty('--d', (k++ * 45) + 'ms'); p.classList.add('pop', 'is-in'); }
    });
  }
  function renderMenu(menu) {
    const items = menu.filter((m) => m && m.dispo !== false);
    const key = JSON.stringify(items);
    if (key === renderedMenu) return;
    const first = !renderedMenu;
    renderedMenu = key;
    const dishes = items.filter((m) => CATS.includes(m.categorie)).sort((a, b) => CATS.indexOf(a.categorie) - CATS.indexOf(b.categorie));
    $('#menuGrid').innerHTML = dishes.map((m, i) => `
      <article class="prod" data-cat="${esc(m.categorie)}" data-reveal style="--d:${(i % 4) * 70}ms">
        <div class="prod-card card" data-tilt="10">
          ${photoOf(m)
    ? `<div class="viz viz-photo"><span class="prod-tag">${SINGULAR[m.categorie] || esc(m.categorie)}</span><img src="${esc(photoOf(m))}" alt="${esc(m.nom)}" loading="lazy"></div>`
    : `<div class="viz viz-emoji" style="--hue:${Number(m.hue) || hueFor(m.nom)}"><span class="prod-tag">${SINGULAR[m.categorie] || esc(m.categorie)}</span><span class="em" aria-hidden="true">${esc(m.emoji || '🍽️')}</span></div>`}
          <div class="prod-meta"><b>${esc(m.nom)}${flagHtml(m)}</b><span class="price">${esc(m.prix)} $</span></div>
          ${m.desc ? `<p class="prod-desc">${esc(m.desc)}</p>` : ''}
        </div>
      </article>`).join('');
    const menus = items.filter((m) => m.categorie === 'Menus');
    $('#menusGrid').innerHTML = menus.map((m) => `
      <article class="menu-neon" data-reveal="rise">
        <div class="mn-in${photoOf(m) ? ' has-photo' : ''}">
          ${photoOf(m) ? `<div class="mn-photo"><img src="${esc(photoOf(m))}" alt="${esc(m.nom)}" loading="lazy"></div>` : ''}
          <h3>${esc(m.nom)}</h3>
          <div class="mn-price">${esc(m.prix)} $</div>
          ${m.desc ? `<p class="mn-desc">${esc(m.desc)}</p>` : ''}
          ${(m.compo || []).map((c) => `<div class="mn-line"><span>${esc(c.label)}</span><b>${esc(c.value)}</b></div>`).join('')}
        </div>
      </article>`).join('');
    $('#menus').hidden = !menus.length;
    // Prix affichés dans les cartes flottantes du hero
    $$('[data-item]').forEach((el) => {
      const m = items.find((x) => x.id === el.dataset.item);
      if (m) el.textContent = el.dataset.fmt.replace('{p}', m.prix);
    });
    if (!first) {
      $$('#menuGrid .prod, #menusGrid .menu-neon').forEach((el) => el.classList.add('is-in'));
      applyFilter(currentCat);
    }
    Motion.scan($('#carte'));
  }

  /* ---------- Événements à venir ---------- */
  /* Visuels animés du Pacific Bluffs : coucher de soleil, palmier, vagues, ballon de plage,
     vinyle au palmier, égaliseur et lumières de fête */
  const PALM_PATH = 'M12 8C9.5 5.4 5.4 5.4 2.6 9.2C5.8 7.6 9 7.7 11.9 9.1ZM12 8C10.6 4.7 7.4 3.1 4.6 3.7C7.5 4.5 10 6.2 11.6 8.9ZM12 8C13.4 4.7 16.6 3.1 19.4 3.7C16.5 4.5 14 6.2 12.4 8.9ZM12 8C14.5 5.4 18.6 5.4 21.4 9.2C18.2 7.6 15 7.7 12.1 9.1ZM12 8C11.7 5.3 12.2 3 13.7 1.3C13.1 3.4 12.9 5.6 12.9 8.3ZM11.1 8.6C11.6 13 11.4 17.6 10.3 22.6H13.2C13.8 17.6 13.5 13 12.7 8.6Z';
  const FRONDS = 'M50 42C42 35 31 37 26 51C32 43 40 41 50 44ZM50 42C45 33 36 29 29 32C37 33 44 36 49.5 43.5ZM50 42C48 33 45 27 40 23C45 28 48 34 51 42ZM50 42C53 33 57 28 63 25C58 30 54 35 51 43ZM50 42C57 35 66 32 73 35C65 35 57 39 51 44ZM50 42C59 38 69 42 74 53C68 46 59 43 50 44Z';
  function vizHtml(kind, hue) {
    if (kind === 'vinyl') return `<div class="viz viz-vinyl" style="--hue:${hue}"><div class="disc"><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PALM_PATH}"/></svg></b></div><div class="sheen"></div></div>`;
    if (kind === 'eq') return `<div class="viz viz-eq" style="--hue:${hue}">${Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>`;
    if (kind === 'sunset') return '<div class="viz viz-sunset"><span class="ss-sun"></span><span class="ss-sea"></span><i class="ss-palm"></i><i class="ss-palm r"></i></div>';
    if (kind === 'ball') return '<div class="viz viz-ball"><span class="sand"></span><span class="shd"></span><span class="bw"><span class="ball"></span></span></div>';
    if (kind === 'waves') return `<div class="viz viz-waves" style="--hue:${hue}"><span class="wv-moon"></span><i></i><i></i><i></i></div>`;
    if (kind === 'palm') return `<div class="viz viz-palm" style="--hue:${hue}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="pv-sun" cx="56" cy="58" r="24"/><path class="pv-sea" d="M0 80Q12.5 76 25 80T50 80T75 80T100 80V100H0Z"/><path class="pv-sea2" d="M-10 86Q2.5 82 15 86T40 86T65 86T90 86T115 86V100H-10Z"/><path class="pv-tree" d="M35 100C38 84 42 66 47 48.6L50 49.2C46 66 42.5 84 40.5 100Z"/><g transform="translate(-1.5 6)"><g class="pv-fr pv-tree"><path d="${FRONDS}"/></g></g></svg></div>`;
    if (kind === 'island') return `<div class="viz viz-emoji" style="--hue:${hue}"><span class="em" aria-hidden="true">🏝️</span></div>`;
    return `<div class="viz viz-beams" style="--hue:${hue}"><span class="beam"></span><span class="beam"></span><span class="beam"></span><span class="floor"></span></div>`;
  }
  /* Teintes des visuels d'événements : orange couchant, rose, violet du ciel, lagon et soleil */
  const SUN_HUES = [25, 330, 280, 190, 45];
  const sunHue = (str) => SUN_HUES[hueFor(str) % SUN_HUES.length];
  function renderEvents(events) {
    const today = isoOf(new Date());
    const tmw = new Date(); tmw.setDate(tmw.getDate() + 1);
    const tomorrow = isoOf(tmw);
    const kinds = ['sunset', 'vinyl', 'waves', 'palm', 'ball', 'eq', 'beams'];
    let html = events.map((e, i) => {
      const d = new Date(e.date + 'T00:00:00');
      const soon = e.date === today ? 'Ce soir' : e.date === tomorrow ? 'Demain' : '';
      // Avec une affiche : la carte devient l'affiche, et un clic l'ouvre en grand
      return `<article class="evt${e.affiche ? ' has-poster' : ''}" data-reveal style="--d:${i * 90}ms"${e.affiche ? ` data-poster="${esc(e.affiche)}" data-title="${esc(e.nom)}" tabindex="0" role="button" aria-label="Voir l'affiche : ${esc(e.nom)}" data-cursor="Voir"` : ''}>
        ${e.affiche ? `<img class="evt-poster" src="${esc(e.affiche)}" alt="Affiche : ${esc(e.nom)}" loading="lazy">` : vizHtml(kinds[i % kinds.length], sunHue(e.nom))}
        <div class="evt-date"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span></div>
        ${soon ? `<span class="evt-soon">${soon}</span>` : ''}
        <div class="evt-over"><span class="ev-tag">${DAYS[d.getDay()]}${e.heureDebut ? ' · ' + esc(e.heureDebut) : ''}</span><h3>${esc(e.nom)}</h3>${e.texte ? `<p>${esc(e.texte)}</p>` : ''}</div>
      </article>`;
    }).join('');
    html += `<article class="evt" data-reveal style="--d:${events.length * 90}ms">
      ${vizHtml('waves', 190)}
      <div class="evt-date"><b>7/7</b><span>soirs</span></div>
      <div class="evt-over"><span class="ev-tag">Tous les soirs · 23:00</span><h3>Soirée classique</h3><p>DJ, bar et animateurs : le Pacific Bluffs ouvre sa plage chaque soir dès 23h.</p></div>
    </article>`;
    if (!events.length) {
      html += `<article class="evt info card" data-reveal style="--d:120ms">
        <span class="e-ic">🌴</span><h3>Prochains événements bientôt annoncés</h3>
        <p>Les soirées spéciales apparaîtront ici dès qu'elles seront programmées. En attendant, le Pacific Bluffs vous attend chaque soir dès 23h.</p>
        <a class="btn btn-sm" href="#carte">Voir la carte <svg class="i sm arr" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
      </article>`;
    }
    $('#eventsGrid').innerHTML = html;
    Motion.scan($('#evenements'));
    heroEvents(events);
  }
  /* Affiche en grand (clic sur une carte d'événement) */
  function posterViewer() {
    const open = (card) => {
      const box = document.createElement('div');
      box.className = 'poster-view';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Affiche : ' + card.dataset.title);
      box.innerHTML = `<img src="${esc(card.dataset.poster)}" alt="Affiche : ${esc(card.dataset.title)}"><button class="icon-btn" type="button" aria-label="Fermer">${ICON_X}</button>`;
      const close = () => { box.classList.add('is-out'); setTimeout(() => box.remove(), 260); removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      box.addEventListener('click', close);
      addEventListener('keydown', onKey);
      document.body.appendChild(box);
      $('button', box).focus();
    };
    const grid = $('#eventsGrid');
    grid.addEventListener('click', (e) => { const c = e.target.closest('.evt.has-poster'); if (c) open(c); });
    grid.addEventListener('keydown', (e) => { const c = e.target.closest('.evt.has-poster'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c); } });
  }
  /* Cartes flottantes du haut : les prochains événements à la place des articles de la carte.
     S'il y a peu d'événements, les places restantes parlent des soirées (jamais de la carte). */
  const HERO_SLOTS = [0, 2, 3, 5, 1];
  const HERO_FILL = {
    0: { viz: ['beams', 330], b: 'Ce soir au Pacific Bluffs', s: 'Soirée classique · 23:00', href: '#evenements' },
    2: { viz: ['sunset', 25], b: 'Prochaines soirées', s: 'Bientôt annoncées', href: '#evenements' },
    3: { viz: ['island', 190], b: 'Cartes membres', s: 'Avantages VIP', href: '#membres' },
    5: { viz: ['eq', 320], b: 'DJ & animateurs', s: 'Chaque soir', href: '#evenements' },
  };
  function heroCard(c, viz, live, b, s, href, label) {
    c.innerHTML = `<div class="fc-bob"><div class="fc-in">${viz}${live ? '<span class="fc-live">Ce soir</span>' : ''}<div class="fc-meta"><b>${esc(b)}</b><span>${esc(s)}</span></div></div></div>`;
    c.setAttribute('href', href);
    c.setAttribute('aria-label', label || `${b}, ${s}`);
    c.dataset.cursor = 'Voir';
  }
  function heroEvents(events) {
    const cards = $$('#constellation .fc');
    const today = isoOf(new Date());
    const kinds = ['vinyl', 'sunset', 'palm', 'waves', 'beams'];
    HERO_SLOTS.forEach((slot, i) => {
      const c = cards[slot], e = events[i];
      if (!c) return;
      if (!e) {
        const f = HERO_FILL[slot];
        if (f && c.dataset.fill !== '1') { heroCard(c, vizHtml(f.viz[0], f.viz[1]), false, f.b, f.s, f.href); c.dataset.fill = '1'; }
        return;
      }
      const d = new Date(e.date + 'T00:00:00');
      const when = (e.date === today ? 'Ce soir' : DAYS[d.getDay()].slice(0, 3) + '. ' + d.getDate() + ' ' + MONTHS[d.getMonth()]) + (e.heureDebut ? ' · ' + e.heureDebut : '');
      const viz = e.affiche ? `<div class="viz viz-poster"><img src="${esc(e.affiche)}" alt="" loading="lazy"></div>` : vizHtml(kinds[i % kinds.length], sunHue(e.nom));
      heroCard(c, viz, e.date === today, e.nom, when, '#evenements', `${e.nom}, ${when}`);
      c.dataset.fill = '';
    });
  }
  function weekStrip() {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const today = (new Date().getDay() + 6) % 7;
    $('#week').innerHTML = days.map((d, i) => `<span class="${i === today ? 'today' : ''}"${i === today ? ' title="Ce soir"' : ''}>${d}</span>`).join('');
  }

  /* Données publiques : base partagée, sinon données locales de ce navigateur */
  async function loadPublic() {
    const mode = await ClubApi.detect();
    if (mode === 'shared') {
      try { return await ClubApi.req('public'); } catch (e) { /* on retombe sur les données locales */ }
    }
    const out = { events: [], menu: null, cartes: null };
    try {
      const db = JSON.parse(localStorage.getItem('pacific:data') || 'null');
      if (db) {
        const t = isoOf(new Date());
        const cat = (e) => e.categorie || (e.nom === 'Soirée classique' ? 'classique' : 'grand');
        out.events = (db.events || [])
          .filter((e) => e.date >= t && e.statut !== 'Annulée' && (e.public === true || (e.public === undefined && cat(e) === 'grand')))
          .sort((a, b) => (a.date + (a.heureDebut || '')).localeCompare(b.date + (b.heureDebut || ''))).slice(0, 12)
          .map((e) => ({ id: e.id, nom: e.nom, date: e.date, heureDebut: e.heureDebut, texte: e.descPublic || '', categorie: cat(e), affiche: e.afficheData || '' }));
        if (Array.isArray(db.menu) && db.menu.length) out.menu = db.menu;
        if (Array.isArray(db.cartes) && db.cartes.length) out.cartes = db.cartes;
      }
    } catch (e) { /* stockage indisponible */ }
    return out;
  }


  /* ---------- Cartes membres (tarifs et avantages modifiables par la direction) ---------- */
  let renderedTiers = '';
  function members(tiers) {
    const key = JSON.stringify(tiers);
    if (key === renderedTiers) return;
    const first = !renderedTiers;
    renderedTiers = key;
    $('#tiersGrid').innerHTML = tiers.map((t) => `
      <article class="tier-neon ${t.cls}" data-reveal="rise">
        <div class="tn-in">
          <div class="tn-head">
            <div class="tn-name">${esc(String(t.nom || t.key).toUpperCase())}</div>
            <div class="tn-price">${t.prix.toLocaleString('fr-FR')} $ <small>/ semaine</small></div>
            <div class="tn-sub">${esc(t.acces)}</div>
          </div>
          <ul class="tn-list">${t.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
      </article>`).join('');
    if (!first) $$('#tiersGrid .tier-neon').forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Direction ---------- */
  function direction() {
    $('#dirGrid').innerHTML = CLUB.DIRECTION.map((p) => `
      <article class="dir card lift" data-reveal="rise">
        <div class="avatar" style="--hue:${p.hue}"><i aria-hidden="true"></i><span>${esc(p.initiales)}</span></div>
        <b>${esc(p.nom)}</b><span class="role">${esc(p.role)}</span>
      </article>`).join('');
  }

  /* ---------- La lune du logo : un clic la fait briller et lance des confettis ---------- */
  function moonTap() {
    const m = $('#wmMoon');
    if (!m) return;
    m.addEventListener('click', () => {
      m.classList.remove('pop');
      m.getBoundingClientRect();
      m.classList.add('pop');
      const r = $('.mo', m).getBoundingClientRect();
      Motion.burst(r.left + r.width / 2, r.top + r.height / 2, 28);
    });
  }

  /* ---------- Le nom du logo découpé lettre à lettre (arrivée + vague qui passe dessus) ---------- */
  function titleLetters() {
    const t = $('.wm-title');
    if (!t) return;
    t.innerHTML = [...t.textContent].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  }

  /* ---------- Ciel de fête : étoiles, lanternes colorées qui montent, lucioles et étoiles filantes ---------- */
  function beachLights() {
    const cv = $('#lights');
    if (!cv || RM || !cv.getContext) return () => {};
    const ctx = cv.getContext('2d');
    const hero = cv.parentElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const COLORS = [[255, 138, 61], [255, 79, 139], [163, 107, 255], [63, 208, 220], [255, 209, 102]];
    const rnd = (a, b) => a + Math.random() * (b - a);
    let w = 0, h = 0, stars = [], orbs = [], flies = [], mx = 0.5, shoot = null, nextShoot = 2500;
    const orb = (anywhere) => ({ x: rnd(0, w), y: anywhere ? rnd(0, h) : h + 24, r: rnd(3, 13), vy: rnd(0.12, 0.42), sway: rnd(0, 6.3), c: COLORS[Math.floor(Math.random() * COLORS.length)], a: rnd(0.14, 0.34) });
    const fly = () => ({ x: rnd(0, w), y: rnd(h * 0.35, h * 0.95), vx: rnd(-0.3, 0.3), vy: rnd(-0.2, 0.2), r: rnd(1, 2), ph: rnd(0, 6.3) });
    const size = () => {
      w = hero.offsetWidth; h = hero.offsetHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = w * h;
      stars = Array.from({ length: Math.round(Math.min(90, area / 14000)) }, () => ({ x: rnd(0, w), y: rnd(0, h * 0.62), r: rnd(0.4, 1.3), tw: rnd(0, 6.3), sp: rnd(0.02, 0.06) }));
      orbs = Array.from({ length: Math.round(Math.min(38, area / 30000)) }, () => orb(true));
      flies = Array.from({ length: Math.round(Math.min(16, area / 70000)) }, fly);
    };
    size();
    addEventListener('resize', size);
    if (FINE) addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; }, { passive: true });
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); };
    return (dt) => {
      if (scrollY > h) return;
      const k = dt / 16;
      ctx.clearRect(0, 0, w, h);
      const light = document.documentElement.dataset.theme === 'light';
      // Étoiles (la nuit seulement)
      if (!light) {
        ctx.fillStyle = '#fff';
        for (const s of stars) { s.tw += s.sp * k; ctx.globalAlpha = 0.2 + 0.8 * Math.abs(Math.sin(s.tw)); dot(s.x, s.y, s.r); }
      }
      // Lanternes colorées (bokeh) qui montent, poussées par le vent de la souris
      const wind = (mx - 0.5) * 0.5;
      ctx.globalAlpha = 1;
      for (const o of orbs) {
        o.y -= o.vy * k; o.sway += 0.01 * k; o.x += (Math.sin(o.sway) * 0.3 + wind) * k;
        if (o.y < -30 || o.x < -30 || o.x > w + 30) Object.assign(o, orb(false));
        const a = o.a * Math.min(1, o.y / (h * 0.3)) * (light ? 0.6 : 1);
        const [r, g, b] = o.c, R = o.r * 2.2;
        const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
        grd.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(3)})`);
        grd.addColorStop(0.45, `rgba(${r},${g},${b},${(a * 0.5).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd; dot(o.x, o.y, R);
      }
      // Lucioles
      ctx.fillStyle = light ? '#ff9a3c' : '#ffe9a0';
      for (const f of flies) {
        f.ph += 0.04 * k;
        f.vx = clamp(f.vx + rnd(-0.03, 0.03), -0.5, 0.5);
        f.vy = clamp(f.vy + rnd(-0.03, 0.03), -0.4, 0.4);
        f.x += f.vx * k; f.y += f.vy * k;
        if (f.x < 0 || f.x > w) f.vx *= -1;
        if (f.y < h * 0.3 || f.y > h) f.vy *= -1;
        const a = 0.3 + 0.7 * Math.abs(Math.sin(f.ph));
        ctx.globalAlpha = a; dot(f.x, f.y, f.r);
        ctx.globalAlpha = a * 0.22; dot(f.x, f.y, f.r * 4);
      }
      // Étoile filante de temps en temps (la nuit)
      nextShoot -= dt;
      if (!light && !shoot && nextShoot <= 0) { shoot = { x: rnd(w * 0.08, w * 0.6), y: rnd(10, h * 0.28), vx: rnd(7, 10), vy: rnd(2.5, 4), life: 1 }; nextShoot = rnd(5000, 11000); }
      if (shoot) {
        shoot.x += shoot.vx * k; shoot.y += shoot.vy * k; shoot.life -= 0.022 * k;
        const tx = shoot.x - shoot.vx * 9, ty = shoot.y - shoot.vy * 9;
        const g = ctx.createLinearGradient(tx, ty, shoot.x, shoot.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(255,240,225,${Math.max(0, shoot.life).toFixed(3)})`);
        ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(shoot.x, shoot.y); ctx.stroke();
        if (shoot.life <= 0 || shoot.x > w + 60) shoot = null;
      }
      ctx.globalAlpha = 1;
    };
  }

  /* Liens « pastille » qui filtrent la carte */
  function linkHelpers() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-filter]');
      if (a) setTimeout(() => applyFilter(a.dataset.filter), 450);
    });
  }

  /* ---------- Pied de page : le logo géant se remplit ---------- */
  function foot() {
    const g = $('#footGiant');
    return () => {
      const r = g.getBoundingClientRect();
      g.style.setProperty('--fill', (clamp((innerHeight - r.top - 20) / (r.height + 40), 0, 1) * 100).toFixed(1) + '%');
    };
  }
  function progress() {
    const bar = $('#progress');
    const tt = $('#totop');
    const ring = $('#ttProg');
    tt.addEventListener('click', () => scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }));
    return () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 0;
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      ring.style.strokeDashoffset = (131.95 * (1 - p)).toFixed(2);
      tt.classList.toggle('is-on', scrollY > innerHeight * 0.8);
    };
  }

  /* ---------- Démarrage ---------- */
  countdown();
  mobileMenu();
  typer();
  weekStrip();
  menuFilters();
  renderMenu(CLUB.MENU);
  members(CLUB.MEMBERSHIP);
  direction();
  linkHelpers();
  titleLetters();
  moonTap();
  posterViewer();
  Motion.init({ cursor: true });

  loadPublic().then((d) => {
    if (Array.isArray(d.menu) && d.menu.length) renderMenu(CLUB.upgradeMenu(d.menu)); // ancienne carte enregistrée → nouvelle
    if (Array.isArray(d.cartes) && d.cartes.length) members(CLUB.membershipTiers(d.cartes));
    renderEvents(Array.isArray(d.events) ? d.events : []);
  });

  const navUpd = nav();
  const heroUpd = hero();
  const footUpd = foot();
  const progressUpd = progress();
  const mq = marquee($('#marquee'), 1.1);
  const lights = beachLights();

  let lastY = -1, lastT = performance.now(), vel = 0;
  const loop = (t) => {
    const dt = Math.min(64, t - lastT);
    lastT = t;
    const y = scrollY;
    const dy = lastY < 0 ? 0 : y - lastY;
    const moved = y !== lastY;
    lastY = y;
    vel = lerp(vel, dy, 0.2);
    heroUpd();
    if (moved) { navUpd(); footUpd(); progressUpd(); }
    if (!RM) { mq(dt, vel); lights(dt); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  intro(() => document.body.classList.add('is-ready'));
})();
