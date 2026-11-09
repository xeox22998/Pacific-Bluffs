/* =====================================================================
   PACIFIC BLUFFS — Graphiques SVG animés
   - line()    : une série (courbe + aire légère, point final étiqueté)
   - columns() : colonnes groupées (1 ou 2 séries), valeurs négatives gérées
   - hbars()   : barres horizontales classées, valeur en bout de barre
   Les couleurs viennent des variables CSS (--chart-1, --chart-2) : le
   thème jour / nuit s'applique sans redessiner.
   ===================================================================== */
const Charts = (function () {
  let queue = [];
  let active = [];

  function niceStep(range, count) {
    const raw = range / count || 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function ticks(min, max, count) {
    if (min === max) max = min + 1;
    const step = niceStep(max - min, count);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  }

  const tipEl = () => document.getElementById('chartTip');
  function showTip(x, y, html) {
    const t = tipEl();
    t.innerHTML = html;
    t.style.left = Math.max(90, Math.min(innerWidth - 90, x)) + 'px';
    t.style.top = y + 'px';
    t.classList.add('on');
  }
  function hideTip() { tipEl().classList.remove('on'); }

  function svgOpen(W, H, label) {
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label || '')}">`;
  }

  /* ---------- Courbe ---------- */
  function line(el, cfg, animate) {
    if (!el) return;
    const W = Math.max(280, el.clientWidth), H = cfg.height || 220;
    const P = { l: 50, r: 58, t: 14, b: 28 };
    const vals = cfg.values, n = vals.length;
    const tk = ticks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
    const min = tk[0], max = tk[tk.length - 1];
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const x = (i) => P.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v) => P.t + ih * (1 - (v - min) / ((max - min) || 1));
    const pts = vals.map((v, i) => [x(i), y(v)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const base = y(Math.max(min, Math.min(0, max)));
    const area = `${d} L${x(n - 1).toFixed(1)} ${base.toFixed(1)} L${x(0).toFixed(1)} ${base.toFixed(1)} Z`;
    const every = Math.ceil(n / Math.max(2, Math.floor(iw / 54)));
    const last = pts[n - 1];
    let s = svgOpen(W, H, cfg.label);
    s += `<g class="grid">${tk.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('')}</g>`;
    if (min < 0) s += `<line class="zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
    s += `<g class="axis">${tk.map((v) => `<text x="${P.l - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmtCompact(v)}</text>`).join('')}`;
    s += cfg.labels.map((l, i) => (i % every === 0 || i === n - 1) ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : '').join('') + '</g>';
    s += `<path class="area" d="${area}"/><path class="line" d="${d}"/>`;
    s += `<line class="cross" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}"/>`;
    s += `<circle class="dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5"/>`;
    s += `<text class="lbl" x="${(last[0] + 10).toFixed(1)}" y="${(last[1] + 4).toFixed(1)}">${fmtCompact(vals[n - 1])}</text>`;
    s += `<circle class="dot hov" r="5" cx="-50" cy="-50"/>`;
    s += `<rect class="hit" x="${P.l - 10}" y="0" width="${iw + 20}" height="${H}"/></svg>`;
    el.innerHTML = s;

    if (animate && !Motion.RM) {
      const path = el.querySelector('.line');
      const ar = el.querySelector('.area');
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      ar.style.opacity = 0;
      el.querySelector('.dot').style.opacity = 0;
      el.querySelector('.lbl').style.opacity = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        path.style.transition = 'stroke-dashoffset 1.7s cubic-bezier(.65,0,.35,1)';
        path.style.strokeDashoffset = 0;
        ar.style.transition = 'opacity 1s ease .9s';
        ar.style.opacity = 1;
        ['.dot', '.lbl'].forEach((q) => { const e = el.querySelector(q); e.style.transition = 'opacity .5s ease 1.5s'; e.style.opacity = 1; });
      }));
    }

    const svg = el.querySelector('svg'), cross = el.querySelector('.cross'), hov = el.querySelector('.hov'), hit = el.querySelector('.hit');
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((sx - P.l) / (iw / (n - 1 || 1)))));
      const [px, py] = pts[i];
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.classList.add('on');
      hov.setAttribute('cx', px); hov.setAttribute('cy', py);
      showTip(r.left + px * (r.width / W), r.top + py * (r.height / H),
        `<b>${esc((cfg.tipLabels || cfg.labels)[i])}</b><span class="row"><i style="background:var(--chart-1)"></i>${esc(cfg.name || '')} : ${fmtMoney(vals[i])}</span>`);
    });
    hit.addEventListener('pointerleave', () => { cross.classList.remove('on'); hov.setAttribute('cx', -50); hideTip(); });
  }

  /* ---------- Colonnes (bout de donnée arrondi 4px, carré côté zéro) ---------- */
  function barPath(x, y, w, h, neg) {
    const r = Math.min(4, h, w / 2);
    if (!neg) return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
    return `M${x} ${y}V${y + h - r}Q${x} ${y + h} ${x + r} ${y + h}H${x + w - r}Q${x + w} ${y + h} ${x + w} ${y + h - r}V${y}Z`;
  }
  function columns(el, cfg, animate) {
    if (!el) return;
    const W = Math.max(280, el.clientWidth), H = cfg.height || 240;
    const P = { l: 50, r: 10, t: 16, b: 28 };
    const S = cfg.series, n = cfg.labels.length;
    const all = S.flatMap((s) => s.values);
    const tk = ticks(Math.min(0, ...all), Math.max(0, ...all), 4);
    const min = tk[0], max = tk[tk.length - 1];
    const iw = W - P.l - P.r, ih = H - P.t - P.b, band = iw / n, gap = 2;
    const bw = Math.max(4, Math.min(24, (band * 0.7 - gap * (S.length - 1)) / S.length));
    const groupW = bw * S.length + gap * (S.length - 1);
    const y = (v) => P.t + ih * (1 - (v - min) / ((max - min) || 1));
    const every = Math.ceil(n / Math.max(2, Math.floor(iw / 46)));
    let s = svgOpen(W, H, cfg.label);
    s += `<g class="grid">${tk.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('')}</g>`;
    s += `<line class="zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
    s += `<g class="axis">${tk.map((v) => `<text x="${P.l - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmtCompact(v)}</text>`).join('')}`;
    s += cfg.labels.map((l, i) => (i % every === 0) ? `<text x="${(P.l + i * band + band / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>` : '').join('') + '</g>';
    s += cfg.labels.map((l, i) => `<rect class="band" data-i="${i}" x="${(P.l + i * band + 2).toFixed(1)}" y="${P.t - 6}" width="${(band - 4).toFixed(1)}" height="${ih + 12}" rx="10"/>`).join('');
    S.forEach((se, si) => se.values.forEach((v, i) => {
      const bx = P.l + i * band + (band - groupW) / 2 + si * (bw + gap);
      const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0)), h = bot - top;
      if (h < 0.5) return;
      s += `<path class="bar ${se.cls}${v < 0 ? ' neg' : ''}" style="transition-delay:${i * 45 + si * 70}ms" d="${barPath(bx, top, bw, h, v < 0)}"/>`;
    }));
    s += cfg.labels.map((l, i) => `<rect class="hit" data-i="${i}" x="${(P.l + i * band).toFixed(1)}" y="0" width="${band.toFixed(1)}" height="${H}"/>`).join('');
    s += '</svg>';
    el.innerHTML = s;
    if (animate && !Motion.RM) {
      el.classList.add('pre');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('pre')));
    }
    const svg = el.querySelector('svg');
    el.querySelectorAll('.hit').forEach((h) => {
      const i = Number(h.dataset.i);
      const bandEl = el.querySelector(`.band[data-i="${i}"]`);
      h.addEventListener('pointerenter', () => bandEl.classList.add('on'));
      h.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const cx = r.left + (P.l + i * band + band / 2) * (r.width / W);
        const vmax = Math.max(0, ...S.map((se) => se.values[i]));
        showTip(cx, r.top + y(vmax) * (r.height / H) - 6,
          `<b>${esc((cfg.tipLabels || cfg.labels)[i])}</b>` + S.map((se) => `<span class="row"><i class="${se.cls}"></i>${esc(se.name)} : ${fmtMoney(se.values[i])}</span>`).join(''));
      });
      h.addEventListener('pointerleave', () => { bandEl.classList.remove('on'); hideTip(); });
    });
  }

  /* ---------- Barres horizontales ---------- */
  function hbars(el, cfg, animate) {
    if (!el) return;
    const max = Math.max(1, ...cfg.values.map((v) => Math.abs(v)));
    el.innerHTML = `<div class="hbars">${cfg.labels.map((l, i) => `
      <div class="hb-row"><span class="hb-l" title="${esc(l)}">${esc(l)}</span>
        <div class="hb-track"><div class="hb-bar" data-w="${((Math.abs(cfg.values[i]) / max) * 82).toFixed(2)}"></div><span class="hb-val">${fmtMoney(cfg.values[i])}</span></div>
      </div>`).join('')}</div>`;
    const bars = el.querySelectorAll('.hb-bar');
    const grow = () => bars.forEach((b, i) => { b.style.transitionDelay = (i * 60) + 'ms'; b.style.width = b.dataset.w + '%'; });
    if (animate && !Motion.RM) requestAnimationFrame(() => requestAnimationFrame(grow));
    else { bars.forEach((b) => { b.style.transition = 'none'; }); grow(); }
  }

  /* ---------- Vue tableau (accessibilité) ---------- */
  function dataTable(labels, series) {
    return `<details class="data-table"><summary>${icon('list', 'sm')} Voir les données en tableau</summary>
      <div class="table-scroll"><table class="tbl compact"><thead><tr><th></th>${series.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${labels.map((l, i) => `<tr><td>${esc(l)}</td>${series.map((s) => `<td class="num">${fmtMoney(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  /* ---------- Montage après rendu de page ---------- */
  function add(fn) { queue.push(fn); }
  function flush(animate) {
    active = queue;
    queue = [];
    active.forEach((fn) => fn(animate));
  }
  let rt = null;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => active.forEach((fn) => fn(false)), 180);
  });

  return { line, columns, hbars, dataTable, add, flush, hideTip };
})();
