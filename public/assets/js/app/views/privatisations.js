/* =====================================================================
   PACIFIC BLUFFS — Privatisations (notées par le staff, plus de demande depuis l'accueil)
   Direction + Comptabilité les notent et les gèrent ; les managers consultent.
   Une privatisation datée (et non refusée) devient automatiquement une soirée
   privée au planning, mise à jour à chaque changement (voir syncRdvEvent).
   ===================================================================== */

let rdvFilter = 'actives';
const RDV_FILTERS = [['actives', 'À traiter'], ['Nouvelle', 'Nouvelles'], ['En cours', 'En cours'], ['Acceptée', 'Acceptées'], ['Refusée', 'Refusées'], ['Terminée', 'Terminées'], ['toutes', 'Toutes']];

function canHandleRdv() { return [ROLES.DIRECTION, ROLES.SECRETAIRE].includes(CURRENT_USER.role); }
function rdvBadge(s) {
  const map = { 'Nouvelle': 'sun', 'En cours': 'warn', 'Acceptée': 'good', 'Refusée': 'bad', 'Terminée': '' };
  return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
}
function rdvWhen(r) {
  if (!r.date) return 'Date à définir';
  return fmtDate(r.date) + (r.heure ? ' · ' + r.heure : '');
}
function receivedAt(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR') + ' à ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function renderPrivatisations() {
  const all = [...DB.rdv].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const count = (s) => all.filter((r) => r.statut === s).length;
  const actions = canHandleRdv() ? `<button class="btn btn-sun" type="button" onclick="openAddRdvModal()" data-magnetic="0.2">${icon('plus', 'sm')}Noter une privatisation</button>` : '';
  let html = pageHead('Privatisations', 'Privatisations du Pacific Bluffs',
    "Notez ici les privatisations convenues avec les clients (téléphone en jeu, face à face). Dès qu'une date est indiquée, la soirée privée s'ajoute automatiquement au planning, avec les postes à pourvoir.", actions);

  html += `<div class="stats-row stagger">
    ${statTile('Nouvelles', 'party', count('Nouvelle'), { tone: count('Nouvelle') ? 'warnv' : '', foot: 'à recontacter' })}
    ${statTile('En cours', 'phone', count('En cours'), { foot: 'en discussion' })}
    ${statTile('Acceptées', 'checkCircle', count('Acceptée'), { tone: 'pos', foot: 'soirées à préparer' })}
    ${statTile('Total noté', 'list', all.length)}
  </div>`;

  html += `<div class="pill-row" role="tablist" aria-label="Filtrer les demandes">${RDV_FILTERS.map(([k, l]) => `<button class="pill plain ${rdvFilter === k ? 'is-active' : ''}" type="button" role="tab" aria-selected="${rdvFilter === k}" onclick="rdvFilter='${k}';renderPage(false)">${l}</button>`).join('')}</div>`;

  const list = all.filter((r) => rdvFilter === 'toutes' || (rdvFilter === 'actives' ? ['Nouvelle', 'En cours', 'Acceptée'].includes(r.statut) : r.statut === rdvFilter));
  if (!list.length) return html + emptyState('🥂', 'Aucune demande ici', rdvFilter === 'actives' ? 'Toutes les demandes ont été traitées.' : 'Aucune demande avec ce statut.');
  html += `<div class="grid-cards stagger">${list.map((r) => `
    <article class="rdv card lift ${r.statut === 'Nouvelle' ? 'is-new' : ''}" tabindex="0" onclick="openRdv('${r.id}')" onkeydown="if(event.key==='Enter')openRdv('${r.id}')">
      <div class="rdv-top"><span class="rdv-ref">${esc(r.ref)}</span>${rdvBadge(r.statut)}</div>
      <h3>${esc(r.nom)}</h3>
      <div class="rdv-meta">
        <span>${icon('calendar', 'sm')}${esc(rdvWhen(r))}</span>
        <span>${icon('users', 'sm')}${r.personnes ? r.personnes + ' invité' + (r.personnes > 1 ? 's' : '') : 'Invités ?'}</span>
        ${r.typeEvent ? `<span>${icon('sun', 'sm')}${esc(r.typeEvent)}</span>` : ''}
      </div>
      ${r.message ? `<p class="rdv-msg">${esc(r.message)}</p>` : ''}
      <div class="rdv-foot"><span>${icon('phone', 'sm')}${esc(r.telephone || '—')}</span><span>${r.eventId ? `${icon('calendar', 'sm')}Au planning` : 'Notée le ' + receivedAt(r.createdAt)}</span></div>
      ${canHandleRdv() && ['Nouvelle', 'En cours'].includes(r.statut) ? `<div class="rdv-quick">
        <button class="btn btn-xs btn-sun" type="button" onclick="event.stopPropagation();decideRdv('${r.id}','Acceptée',false)">${icon('check', 'sm')}Accepter</button>
        <button class="btn btn-xs btn-danger" type="button" onclick="event.stopPropagation();decideRdv('${r.id}','Refusée',false)">${icon('x', 'sm')}Refuser</button>
      </div>` : ''}
    </article>`).join('')}</div>`;
  return html;
}

function openRdv(id) {
  const r = DB.rdv.find((x) => x.id === id);
  if (!r) return;
  const h = canHandleRdv();
  const ev = r.eventId ? DB.events.find((e) => e.id === r.eventId) : null;
  openModal(`Demande ${esc(r.ref)}`, `
    <div class="rdv-detail">
      <div class="sheet-h"><span class="av lg" style="--hue:${hueFor(r.nom)}">${esc(r.nom.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase())}</span>
        <div><div class="confirm-text"><b>${esc(r.nom)}</b></div><div class="muted" style="font-size:13.5px">${icon('phone', 'sm')} ${esc(r.telephone || '—')} · notée le ${receivedAt(r.createdAt)}</div></div></div>
      ${h ? `<div class="rdv-decide">
        <button class="btn btn-sm btn-sun" type="button" onclick="decideRdv('${r.id}','Acceptée',true)" ${r.statut === 'Acceptée' ? 'disabled' : ''}>${icon('check', 'sm')}Accepter</button>
        <button class="btn btn-sm btn-danger" type="button" onclick="decideRdv('${r.id}','Refusée',true)" ${r.statut === 'Refusée' ? 'disabled' : ''}>${icon('x', 'sm')}Refuser</button>
        <button class="btn btn-sm" type="button" onclick="decideRdv('${r.id}','En cours',true)" ${r.statut === 'En cours' ? 'disabled' : ''}>En cours</button>
        <button class="btn btn-sm" type="button" onclick="decideRdv('${r.id}','Terminée',true)" ${r.statut === 'Terminée' ? 'disabled' : ''}>Terminée</button>
      </div>` : ''}
      <div class="grid-2" style="margin-top:14px">
        <div class="field"><label for="rdvStatut">Statut</label>${h ? `<select class="input" id="rdvStatut" onchange="setRdvField('${r.id}','statut',this.value)">${RDV_STATUTS.map((s) => `<option ${r.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : `<div style="padding:12px 18px">${rdvBadge(r.statut)}</div>`}</div>
        <div class="field"><label>Type d'événement</label><div class="input" style="display:flex;align-items:center">${esc(r.typeEvent || 'Non précisé')}</div></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="rdvDate">Date souhaitée</label><input class="input" id="rdvDate" type="date" value="${esc(r.date || '')}" ${h ? `onchange="setRdvField('${r.id}','date',this.value)"` : 'disabled'}></div>
        <div class="field"><label for="rdvHeure">Heure</label><input class="input" id="rdvHeure" type="time" value="${esc(r.heure || '')}" ${h ? `onchange="setRdvField('${r.id}','heure',this.value)"` : 'disabled'}></div>
      </div>
      <div class="field"><label>Nombre d'invités</label><div class="input" style="display:flex;align-items:center">${r.personnes || 'Non précisé'}</div></div>
      <div class="sub-h">Détails</div>
      <div class="doc-preview" style="min-height:0">${esc(r.message) || '<span class="muted">Aucun détail.</span>'}</div>
      <div class="sub-h">Au planning</div>
      ${ev ? `<div class="line-item"><span>${esc(ev.nom)} — ${fmtDate(ev.date)} · ${esc(ev.heureDebut || '')} ${statusBadge(ev.statut)}</span><button class="btn btn-xs" type="button" onclick="openEventDetail('${ev.id}')">Ouvrir la soirée</button></div>`
        : `<p class="muted" style="font-size:13.5px">${r.statut === 'Refusée' ? 'Privatisation refusée : rien au planning.' : "Indiquez une date : la soirée privée s'ajoutera automatiquement au planning."}</p>`}
      <div class="sub-h">Notes internes</div>
      ${(r.notes || []).length ? r.notes.map((n) => `<div class="line-item"><span style="white-space:pre-wrap">${esc(n.texte)}</span><span class="muted" style="flex-shrink:0">${esc(n.par)} · ${esc(n.date)}</span></div>`).join('') : '<p class="muted" style="font-size:13.5px">Aucune note.</p>'}
      ${h ? `<div class="field" style="margin-top:10px"><textarea class="input" id="rdvNote" placeholder="Ajouter une note (appel passé, devis annoncé…)" style="min-height:70px"></textarea></div><button class="btn btn-sm" type="button" onclick="addRdvNote('${r.id}')">${icon('plus', 'sm')}Ajouter la note</button>` : ''}
    </div>`,
    (isDirection() ? `<button class="btn btn-sm btn-danger" type="button" onclick="deleteRdv('${r.id}')">${icon('trash', 'sm')}Supprimer</button>` : '')
    + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>', { size: 'lg' });
}
function setRdvField(id, field, value) {
  const r = DB.rdv.find((x) => x.id === id);
  if (!r) return;
  r[field] = value;
  r.updatedAt = new Date().toISOString();
  const had = !!r.eventId;
  syncRdvEvent(r);
  if (field === 'statut') { logActivity('Privatisation : ' + value, `${r.nom} (${r.ref})`); toast('Statut mis à jour.', 'success'); }
  else if (!had && r.eventId) toast('Soirée privée ajoutée au planning.', 'success');
  else saveSoon();
  refresh();
  if (document.querySelector('.rdv-detail')) openRdv(id);
}
/* Report automatique sur le planning : une privatisation datée et non refusée = une soirée privée au programme.
   La soirée suit la date, l'heure et le statut ; une soirée classique sans personne inscrite ce jour-là laisse la place. */
function syncRdvEvent(r) {
  let ev = r.eventId ? DB.events.find((e) => e.id === r.eventId) : null;
  const dropEvent = () => {
    if (!ev) return;
    if (ev.assignments.some((a) => a.userId)) { ev.statut = 'Annulée'; return; }   // l'équipe inscrite garde une trace
    DB.events = DB.events.filter((e) => e.id !== ev.id);
    r.eventId = null;
  };
  if (r.statut === 'Refusée' || !r.date) { dropEvent(); return null; }
  if (!ev) {
    ev = { id: uid('ev'), categorie: 'grand', public: false, descPublic: '', heureFin: '', statut: 'À venir', assignments: defaultSlots() };
    DB.events.push(ev);
    r.eventId = ev.id;
  }
  if (ev.date !== r.date) {
    // le club est privatisé ce soir-là : la soirée classique prévue (si personne n'y est inscrit) est retirée
    DB.events = DB.events.filter((e) => !(e.date === r.date && e.id !== ev.id && eventCat(e) === 'classique' && !e.assignments.some((a) => a.userId)));
  }
  ev.nom = 'Privatisation — ' + r.nom;
  ev.date = r.date;
  ev.heureDebut = r.heure || ev.heureDebut || '23:00';
  ev.description = `Privatisation ${r.ref} · ${r.typeEvent || 'Privatisation'} · ${r.personnes || '?'} invité(s) · tél. ${r.telephone || '—'}${r.message ? '\n' + r.message : ''}`;
  ev.statut = r.statut === 'Terminée' ? 'Terminée' : 'À venir';
  return ev;
}
/* Accepter / refuser / changer l'état d'une demande (Direction + Comptabilité) */
function decideRdv(id, statut, reopen) {
  const r = DB.rdv.find((x) => x.id === id);
  if (!r || !canHandleRdv()) return;
  r.statut = statut;
  r.updatedAt = new Date().toISOString();
  r.traitePar = userLabel(CURRENT_USER.id);
  syncRdvEvent(r);
  logActivity('Privatisation : ' + statut, `${r.nom} (${r.ref})`);
  const hint = statut === 'Refusée' ? ' Retirée du planning.' : (r.eventId ? ' La soirée privée est au planning.' : ' Indiquez une date pour la mettre au planning.');
  toast(`Privatisation ${statut.toLowerCase()}.${hint}`, statut === 'Refusée' ? 'error' : 'success');
  refresh();
  if (reopen) openRdv(id);
}
function addRdvNote(id) {
  const r = DB.rdv.find((x) => x.id === id);
  const txt = document.getElementById('rdvNote').value.trim();
  if (!r || !txt) return;
  (r.notes = r.notes || []).push({ par: userLabel(CURRENT_USER.id), date: fmtDateShort(todayISO()) + ' ' + nowHM(), texte: txt.slice(0, 1000) });
  if (r.statut === 'Nouvelle') r.statut = 'En cours';
  logActivity('Note ajoutée — privatisation', `${r.nom} (${r.ref})`);
  refresh();
  openRdv(id);
}
/* À la connexion : les privatisations datées pas encore au planning y sont ajoutées */
function syncAllRdv() {
  if (!CURRENT_USER || !DB || !canHandleRdv()) return;
  let n = 0;
  (DB.rdv || []).forEach((r) => { if (r.date && r.statut !== 'Refusée' && !r.eventId) { syncRdvEvent(r); n++; } });
  if (n) saveSoon();
}
function deleteRdv(id) {
  const r = DB.rdv.find((x) => x.id === id);
  if (!r) return;
  confirmAction(`Supprimer la privatisation ${esc(r.ref)} de ${esc(r.nom)} ?${r.eventId ? ' La soirée privée sera aussi retirée du planning.' : ''}`, () => {
    if (r.eventId) {
      const ev = DB.events.find((e) => e.id === r.eventId);
      DB.events = DB.events.filter((e) => e.id !== r.eventId);
      if (ev) DB.attendances = DB.attendances.filter((a) => a.eventId !== ev.id || ['À valider', 'Validé'].includes(a.statut));
    }
    DB.rdv = DB.rdv.filter((x) => x.id !== id);
    logActivity('Privatisation supprimée', r.ref);
    toast('Privatisation supprimée.', 'success'); refresh();
  }, 'Supprimer');
}
function openAddRdvModal() {
  openModal('Noter une privatisation', `
    <p class="field-hint" style="margin-bottom:12px">Convenue par téléphone en jeu ou en face à face. Avec une date, la soirée privée s'ajoute automatiquement au planning.</p>
    <div class="grid-2">
      <div class="field"><label for="arNom">Client (prénom et nom RP)</label><input class="input" id="arNom"></div>
      <div class="field"><label for="arTel">Téléphone (en jeu)</label><input class="input" id="arTel"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="arDate">Date de la soirée</label><input class="input" id="arDate" type="date"></div>
      <div class="field"><label for="arHeure">Heure</label><input class="input" id="arHeure" type="time" value="23:00"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="arPers">Nombre d'invités</label><input class="input" id="arPers" type="number" min="1"></div>
      <div class="field"><label for="arType">Type d'événement</label><select class="input" id="arType">${CLUB.PRIVATISATION_TYPES.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="arStatut">Statut</label><select class="input" id="arStatut">${RDV_STATUTS.filter((s) => s !== 'Refusée' && s !== 'Terminée').map((s) => `<option ${s === 'Acceptée' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="arMsg">Détails (thème, besoins, prix convenu…)</label><textarea class="input" id="arMsg"></textarea></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveManualRdv()">Enregistrer</button>`);
}
function saveManualRdv() {
  const nom = document.getElementById('arNom').value.trim();
  if (!nom) { toast('Indiquez le nom du client.', 'error'); return; }
  const r = {
    id: uid('rdv'), ref: 'P-' + Math.random().toString(16).slice(2, 8).toUpperCase(), nom,
    telephone: document.getElementById('arTel').value.trim(), date: document.getElementById('arDate').value, heure: document.getElementById('arHeure').value,
    personnes: Number(document.getElementById('arPers').value) || 0, typeEvent: document.getElementById('arType').value,
    message: document.getElementById('arMsg').value.trim(), statut: document.getElementById('arStatut').value || 'Acceptée',
    createdAt: new Date().toISOString(), notePar: userLabel(CURRENT_USER.id), notes: [], eventId: null,
  };
  DB.rdv.unshift(r);
  syncRdvEvent(r);
  logActivity('Privatisation notée', `${r.nom} (${r.ref})${r.date ? ' — ' + fmtDate(r.date) : ''}`);
  toast(r.eventId ? `Privatisation notée et ajoutée au planning (${fmtDate(r.date)}).` : 'Privatisation notée. Indiquez une date pour la mettre au planning.', 'success');
  closeModal(); refresh();
}
