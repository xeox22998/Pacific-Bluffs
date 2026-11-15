/* =====================================================================
   PACIFIC BLUFFS — Topo : qui a quoi d'activé
   À consulter avant de servir un client, pour lui apporter les services
   adaptés : ses cartes VIP (achetées ou offertes) et ce qu'il a gagné
   (escapade enchantée, séjour paradisiaque, bon de réduction de 25 %,
   soirée privée). Données : DB.avantages (modèle dans data.js).
   - Tout le staff le consulte (lecture seule pour les employés et le fisc).
   - Managers, comptabilité et direction le modifient directement ici :
     ajouter, corriger, marquer « utilisé », retirer (revérifié par le serveur).
   - Les récompenses se notent aussi sur la fiche Récompenses de l'onglet
     Ventes ; une carte VIP vendue sur la fiche Cartes VIP arrive toute seule.
   ===================================================================== */
let TOPO_Q = '';          // recherche (nom du client, occasion…)
let TOPO_TYPE = 'all';    // filtre par avantage
let TOPO_VIEW = 'actifs'; // 'actifs' (actifs et prévus) ou 'historique' (utilisés et expirés)

function topoList() { return (DB.avantages || []).filter((a) => a && a.beneficiaire); }
function isLive(a, today) { const s = avStatus(a, today); return s === 'actif' || s === 'prevu'; }
/* Avantage qui concerne la soirée en cours : séjour / escapade / soirée privée prévus ce soir, carte VIP au dernier jour */
function isTonight(a, today) {
  if (!isLive(a, today)) return false;
  if (a.type === 'vip') return a.dateFin === today;
  return !!a.dateDebut && a.dateDebut <= today && (a.dateFin || a.dateDebut) >= today;
}

function renderTopo() {
  const today = serviceDay();
  const edit = canEditTopo();
  const all = topoList();
  const live = all.filter((a) => isLive(a, today));
  const actions = edit ? `<button class="btn btn-sm btn-sun" type="button" onclick="openAvantageModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter</button>` : '';
  let html = pageHead('Topo', "Qui a quoi d'activé",
    `À consulter avant de servir un client : ses cartes VIP et ce qu'il a gagné (escapades enchantées, séjours paradisiaques, bons de réduction de 25 %, soirées privées), pour lui apporter les services adaptés. ${edit
      ? 'Vous pouvez tout modifier directement ici. Les récompenses se notent aussi sur la fiche <b>Récompenses</b> de l\'onglet Ventes, et les cartes VIP vendues arrivent toutes seules.'
      : 'Tenu à jour par les managers, la comptabilité et la direction.'}`, actions);
  if (!edit) html += `<div class="hint">${icon('eye', 'sm')}<span>Consultation seulement : prévenez un manager, la comptabilité ou la direction s'il faut corriger quelque chose.</span></div>`;

  // Chiffres
  const clients = new Set(live.map((a) => a.beneficiaire.trim().toLowerCase()));
  const count = (t) => live.filter((a) => a.type === t);
  const stays = live.filter((a) => avDuo(a.type));
  const tonightStays = stays.filter((a) => isTonight(a, today)).length;
  html += `<div class="stats-row stagger">
    ${statTile('Clients avec un avantage', 'users', clients.size, { foot: `${live.length} avantage${live.length > 1 ? 's' : ''} actif${live.length > 1 ? 's' : ''} ou prévu${live.length > 1 ? 's' : ''}` })}
    ${statTile('Cartes VIP actives', 'star', count('vip').filter((a) => avStatus(a, today) === 'actif').length, { foot: `${count('vip').filter((a) => a.origine === 'recompense').length} offerte(s) · ${count('vip').filter((a) => a.origine !== 'recompense').length} achetée(s)` })}
    ${statTile('Séjours & escapades', 'moon', stays.length, { foot: tonightStays ? `<b>${tonightStays}</b> ce soir` : 'à venir ou à utiliser' })}
    ${statTile('Bons de réduction 25 %', 'receipt', count('bon').length, { cls: 'dark', foot: 'à utiliser' })}
  </div>`;

  // Ce soir : qui dort, quelle soirée privée, quelle carte VIP se termine
  const tonight = live.filter((a) => isTonight(a, today));
  if (tonight.length) {
    html += `<section class="section">${sectionHead('Ce soir', tonight.length)}<div class="topo-tonight stagger">${tonight.map((a) => `
      <div class="card topo-chip"><span class="tc-ic" aria-hidden="true">${avType(a.type).emoji}</span><span><b>${esc(avNames(a))}</b><small>${esc(avLabel(a))}${a.type === 'vip' ? ' · dernier jour' : avDuo(a.type) ? ' · dort ici ce soir' : ' · ce soir'}</small></span></div>`).join('')}</div></section>`;
  }

  // Recherche et filtres
  const types = [{ id: 'all', label: 'Tout', emoji: '🌴' }].concat(AV_TYPES.map((t) => ({ id: t.id, label: t.plural, emoji: t.emoji })));
  html += `<section class="section">
    <div class="topo-tools">
      <input class="input topo-search" type="search" id="topoQ" placeholder="Chercher un client…" value="${esc(TOPO_Q)}" oninput="topoSearch(this.value)" aria-label="Chercher un client">
      <div class="seg" role="radiogroup" aria-label="Afficher">${[['actifs', 'Actifs et prévus'], ['historique', 'Utilisés et expirés']].map(([k, l]) => `<button class="seg-btn ${TOPO_VIEW === k ? 'is-on' : ''}" type="button" role="radio" aria-checked="${TOPO_VIEW === k}" onclick="setTopoView('${k}')">${l}</button>`).join('')}</div>
    </div>
    <div class="pill-row" role="tablist" aria-label="Avantages">${types.map((t) => {
      const n = t.id === 'all' ? null : all.filter((a) => a.type === t.id && (TOPO_VIEW === 'actifs') === isLive(a, today)).length;
      return `<button class="pill ${TOPO_TYPE === t.id ? 'is-active' : ''}" type="button" role="tab" aria-selected="${TOPO_TYPE === t.id}" onclick="setTopoType('${t.id}')"><span class="pi">${t.emoji}</span>${esc(t.label)}${n ? ` · ${n}` : ''}</button>`;
    }).join('')}</div>
    <div id="topoList">${topoListHtml()}</div>
  </section>`;
  return html;
}

/* Liste des clients et de leurs avantages (filtrée) */
function topoListHtml() {
  const today = serviceDay();
  const edit = canEditTopo();
  const q = TOPO_Q.trim().toLowerCase();
  const list = topoList().filter((a) => (TOPO_VIEW === 'actifs') === isLive(a, today))
    .filter((a) => TOPO_TYPE === 'all' || a.type === TOPO_TYPE)
    .filter((a) => !q || [a.beneficiaire, a.beneficiaire2, a.motif, a.note, avLabel(a)].some((v) => String(v || '').toLowerCase().includes(q)));
  if (!list.length) {
    if (q) return emptyState('🔎', 'Aucun client trouvé', `Personne ne correspond à « ${esc(TOPO_Q.trim())} »${TOPO_VIEW === 'actifs' ? ' parmi les avantages actifs : regardez aussi « Utilisés et expirés »' : ''}.`);
    return TOPO_VIEW === 'actifs'
      ? emptyState('🎁', 'Aucun avantage actif', edit ? 'Notez les récompenses sur la fiche Récompenses de l\'onglet Ventes (ou « Ajouter » ci-dessus) : elles apparaissent ici. Les cartes VIP vendues arrivent toutes seules.' : 'Les cartes VIP et les récompenses des clients apparaîtront ici.')
      : emptyState('🗂️', 'Rien dans l\'historique', 'Les avantages utilisés ou expirés apparaîtront ici.');
  }
  // un client = un nom (sans tenir compte des majuscules) ; l'avantage pour 2 se range au premier nom
  const order = { actif: 0, prevu: 1, utilise: 2, expire: 3 };
  const groups = new Map();
  list.forEach((a) => {
    const k = a.beneficiaire.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, { name: a.beneficiaire.trim(), items: [] });
    groups.get(k).items.push(a);
  });
  const rows = [...groups.values()].sort((x, y) => x.name.localeCompare(y.name, 'fr', { sensitivity: 'base' }));
  rows.forEach((g) => g.items.sort((a, b) => order[avStatus(a, today)] - order[avStatus(b, today)] || (a.dateFin || a.dateDebut || '9').localeCompare(b.dateFin || b.dateDebut || '9')));
  return `<div class="topo-grid">${rows.map((g) => `
    <div class="card topo-client">
      <div class="topo-who"><span class="av" style="--hue:${hueFor(g.name)}">${esc(g.name.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase())}</span>
        <div><b>${esc(g.name)}</b><small>${g.items.map((a) => avType(a.type).emoji).join(' ')} ${g.items.length} avantage${g.items.length > 1 ? 's' : ''}</small></div></div>
      <ul class="topo-items">${g.items.map((a) => topoItemHtml(a, today, edit)).join('')}</ul>
    </div>`).join('')}</div>`;
}
function topoItemHtml(a, today, edit) {
  const st = AV_STATUS[avStatus(a, today)];
  const by = a.origine === 'vente' ? (a.par ? `vendue par ${userLabel(a.par)}` : '') : a.par ? `noté par ${userLabel(a.par)}` : '';
  const meta = [avWhen(a), AV_ORIGINE_LABEL[a.origine] + (a.date && a.origine === 'recompense' ? ` le ${fmtDateShort(a.date)}` : ''), a.motif, by].filter(Boolean).map(esc).join(' · ');
  const used = a.type !== 'vip' || a.utilise; // une carte VIP se termine à sa date ; le reste se marque « utilisé »
  return `<li class="topo-item${st.label === 'Expiré' || a.utilise ? ' is-past' : ''}">
    <span class="ti-ic" aria-hidden="true">${avType(a.type).emoji}</span>
    <div class="ti-txt"><b>${esc(avLabel(a))}</b> <span class="badge ${st.cls}">${st.label}${isTonight(a, today) ? ' · ce soir' : ''}</span>
      ${a.beneficiaire2 ? `<small>Pour 2 : ${esc(avNames(a))}</small>` : ''}
      <small>${meta}</small>${a.note ? `<small class="ti-note">${esc(a.note)}</small>` : ''}</div>
    ${edit ? `<div class="ti-acts">
      ${used ? `<button class="btn btn-xs ${a.utilise ? '' : 'btn-sun'}" type="button" onclick="toggleAvantageUsed('${a.id}')">${a.utilise ? 'Remettre actif' : `${icon('check', 'sm')}Utilisé`}</button>` : ''}
      <button class="icon-btn xs" type="button" onclick="openAvantageModal('${a.id}')" aria-label="Modifier">${icon('edit', 'sm')}</button>
      <button class="icon-btn xs" type="button" onclick="removeAvantage('${a.id}')" aria-label="Retirer">${icon('trash', 'sm')}</button></div>` : ''}
  </li>`;
}

/* ---------- Filtres ---------- */
function topoSearch(v) { TOPO_Q = String(v || '').slice(0, 60); const el = document.getElementById('topoList'); if (el) { el.innerHTML = topoListHtml(); Motion.scan(el); } }
function setTopoType(t) { TOPO_TYPE = t === 'all' || AV_TYPES.some((x) => x.id === t) ? t : 'all'; renderPage(false); }
function setTopoView(v) { TOPO_VIEW = v === 'historique' ? 'historique' : 'actifs'; renderPage(false); }

/* ---------- Modifier le topo (encadrement) ---------- */
function openAvantageModal(id) {
  if (!canEditTopo()) return;
  const today = serviceDay();
  const a = id ? topoList().find((x) => x.id === id) : { type: 'vip', origine: 'recompense', beneficiaire: '', carte: 'Green', duree: 'mois', date: today, dateDebut: today, dateFin: vipEnd(today, 'mois'), motif: '', note: '', utilise: false };
  if (!a) return;
  const opt = (v, l, sel) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  openModal(id ? 'Modifier l\'avantage' : 'Ajouter au topo', `
    <div class="grid-2">
      <div class="field"><label for="avType">Avantage</label><select class="input" id="avType" onchange="avFormSync(true)">${AV_TYPES.map((t) => opt(t.id, `${t.emoji} ${t.label}`, a.type)).join('')}</select></div>
      <div class="field"><label for="avDate">Obtenu le</label><input class="input" id="avDate" type="date" value="${esc(a.date || '')}"></div>
    </div>
    <div class="grid-2" id="avVipRow">
      <div class="field"><label for="avCarte">Carte</label><select class="input" id="avCarte">${membershipTiers().map((t) => opt(t.key, 'Carte ' + t.nom, a.carte)).join('')}</select></div>
      <div class="field"><label for="avDuree">Durée</label><select class="input" id="avDuree" onchange="avAutoEnd()">${opt('semaine', '1 semaine', a.duree)}${opt('mois', '1 mois', a.duree)}</select></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="avNom">Client</label><input class="input" id="avNom" maxlength="60" value="${esc(a.beneficiaire)}" placeholder="Nom du client"></div>
      <div class="field" id="avNom2Row"><label for="avNom2">2e personne (chambre pour 2)</label><input class="input" id="avNom2" maxlength="60" value="${esc(a.beneficiaire2 || '')}" placeholder="Facultatif"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="avDebut" id="avDebutLbl">Début</label><input class="input" id="avDebut" type="date" value="${esc(a.dateDebut || '')}" onchange="avAutoEnd()"></div>
      <div class="field"><label for="avFin" id="avFinLbl">Fin</label><input class="input" id="avFin" type="date" value="${esc(a.dateFin || '')}"></div>
    </div>
    <div class="field"><label for="avMotif">Occasion</label><input class="input" id="avMotif" maxlength="80" value="${esc(a.motif || '')}" placeholder="ex : tirage au sort, concours, geste commercial"></div>
    <div class="field"><label for="avNote">Note pour le staff</label><textarea class="input" id="avNote" maxlength="200" rows="2" placeholder="ex : table réservée, préfère le champagne">${esc(a.note || '')}</textarea></div>
    <label class="check-row"><input class="tick" type="checkbox" id="avUsed" ${a.utilise ? 'checked' : ''}><span><b>Déjà utilisé</b><small>Le client a profité de cet avantage : il passe dans « Utilisés et expirés ».</small></span></label>
    ${id ? `<p class="field-hint">${esc(AV_ORIGINE_LABEL[a.origine] || '')}${a.origine === 'vente' ? ' sur la fiche Cartes VIP : modifier ici ne change pas la vente ni la comptabilité.' : '.'}</p>` : ''}`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveAvantage('${id || ''}')">Enregistrer</button>`);
  avFormSync(false);
}
/* Champs selon l'avantage : carte et durée (VIP), 2e personne (escapade, séjour), libellés des dates */
function avFormSync(changed) {
  const type = (document.getElementById('avType') || {}).value;
  if (!type) return;
  document.getElementById('avVipRow').hidden = type !== 'vip';
  document.getElementById('avNom2Row').hidden = !avDuo(type);
  const lbl = { vip: ['Valable du', 'au'], escapade: ['Date prévue', 'Jusqu\'au (facultatif)'], sejour: ['Date prévue', 'Jusqu\'au (facultatif)'], soiree: ['Date prévue', 'Jusqu\'au (facultatif)'], bon: ['Valable à partir du (facultatif)', 'Valable jusqu\'au (facultatif)'] }[type];
  document.getElementById('avDebutLbl').textContent = lbl[0];
  document.getElementById('avFinLbl').textContent = lbl[1];
  if (changed) {
    if (type === 'vip') { const d = document.getElementById('avDebut'); if (!d.value) d.value = document.getElementById('avDate').value || serviceDay(); avAutoEnd(); }
    else { document.getElementById('avDebut').value = ''; document.getElementById('avFin').value = ''; }
  }
}
/* Carte VIP : la fin suit le début et la durée (modifiable ensuite) */
function avAutoEnd() {
  if (document.getElementById('avType').value !== 'vip') return;
  const start = document.getElementById('avDebut').value;
  if (start) document.getElementById('avFin').value = vipEnd(start, document.getElementById('avDuree').value);
}
function saveAvantage(id) {
  if (!canEditTopo()) return;
  const val = (k) => (document.getElementById(k) || {}).value || '';
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const type = AV_TYPES.some((t) => t.id === val('avType')) ? val('avType') : 'vip';
  const nom = val('avNom').trim().slice(0, 60);
  if (!requireFields(['avNom'], 'Indiquez le nom du client.')) return;
  const data = {
    type, beneficiaire: nom, date: iso(val('avDate')), dateDebut: iso(val('avDebut')), dateFin: iso(val('avFin')),
    motif: val('avMotif').trim().slice(0, 80), note: val('avNote').trim().slice(0, 200), utilise: document.getElementById('avUsed').checked,
  };
  if (type === 'vip') {
    data.carte = membershipTiers().some((t) => t.key === val('avCarte')) ? val('avCarte') : 'Green';
    data.duree = val('avDuree') === 'mois' ? 'mois' : 'semaine';
    if (!data.dateDebut) data.dateDebut = data.date || serviceDay();
    if (!data.dateFin) data.dateFin = vipEnd(data.dateDebut, data.duree);
  }
  if (data.dateFin && data.dateDebut && data.dateFin < data.dateDebut) { toast('La date de fin est avant la date de début.', 'error'); return; }
  const nom2 = val('avNom2').trim().slice(0, 60);
  const a = id ? topoList().find((x) => x.id === id) : null;
  if (a) {
    Object.assign(a, data);
    if (type !== 'vip') { delete a.carte; delete a.duree; }
    if (avDuo(type) && nom2) a.beneficiaire2 = nom2; else delete a.beneficiaire2;
  } else {
    const n = Object.assign({ id: uid('av'), origine: 'recompense', par: CURRENT_USER.id, createdAt: new Date().toISOString() }, data);
    if (avDuo(type) && nom2) n.beneficiaire2 = nom2;
    DB.avantages.push(n);
  }
  const x = a || DB.avantages[DB.avantages.length - 1];
  logActivity(a ? 'Topo modifié' : 'Ajouté au topo', `${avLabel(x)} — ${avNames(x)}`);
  toast(a ? 'Topo mis à jour.' : 'Ajouté au topo.', 'success'); closeModal(); refresh();
}
function toggleAvantageUsed(id) {
  const a = topoList().find((x) => x.id === id);
  if (!a || !canEditTopo()) return;
  a.utilise = !a.utilise;
  logActivity(a.utilise ? 'Avantage utilisé' : 'Avantage remis actif', `${avLabel(a)} — ${avNames(a)}`);
  toast(a.utilise ? `${avLabel(a)} de ${avNames(a)} : marqué utilisé.` : 'Avantage remis actif.', 'success');
  refresh();
}
function removeAvantage(id) {
  const a = topoList().find((x) => x.id === id);
  if (!a || !canEditTopo()) return;
  confirmAction(`Retirer « ${esc(avLabel(a))} » de ${esc(avNames(a))} du topo ?${a.origine === 'vente' ? ' La vente de la carte reste dans les fiches et en comptabilité.' : ''}`, () => {
    DB.avantages = DB.avantages.filter((x) => x.id !== id);
    logActivity('Retiré du topo', `${avLabel(a)} — ${avNames(a)}`);
    toast('Retiré du topo.', 'success'); refresh();
  }, 'Retirer');
}
