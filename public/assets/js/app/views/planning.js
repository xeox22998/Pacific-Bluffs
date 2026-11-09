/* =====================================================================
   PACIFIC BLUFFS — Mon planning, Présences, Programme (soirées)
   ===================================================================== */

const SVC_STEPS = ['Inscrit', 'Arrivée notée', 'Départ noté', 'Validé'];
let CAL_YEAR = new Date().getFullYear();
let CAL_MONTH = new Date().getMonth() + 1;
let presenceFilters = { employe: '', poste: '', statut: '', periode: 'toutes', search: '' };

/* Services à venir, plus ceux des 7 derniers jours dont le départ n'est pas encore noté
   (une soirée qui finit à 4 h du matin doit rester accessible le lendemain) */
function myUpcomingAssignments(userId, limit) {
  const list = [];
  const today = todayISO();
  const d = new Date(); d.setDate(d.getDate() - 7);
  const weekAgo = isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  DB.events.forEach((ev) => ev.assignments.forEach((a) => {
    if (a.userId !== userId) return;
    if (ev.date >= today) { list.push({ event: ev, assignment: a }); return; }
    const att = attendanceFor(ev.id, userId);
    if (ev.date >= weekAgo && (!att || ['À confirmer', 'Présent', 'Arrivé'].includes(att.statut))) list.push({ event: ev, assignment: a });
  }));
  list.sort((a, b) => (a.event.date + a.event.heureDebut).localeCompare(b.event.date + b.event.heureDebut));
  return limit ? list.slice(0, limit) : list;
}
function attendanceFor(eventId, userId) { return DB.attendances.find((a) => a.eventId === eventId && a.userId === userId); }
function ensureAttendance(eventId, userId, poste) {
  let a = attendanceFor(eventId, userId);
  if (!a) {
    a = { id: uid('att'), eventId, userId, poste, confirmation: false, heureArrivee: '', heureDepart: '', duree: '', statut: 'À confirmer', valideParId: null, dateValidation: '', modifications: [] };
    DB.attendances.push(a);
    saveSoon();
  }
  return a;
}
function eventName(id) { const e = DB.events.find((x) => x.id === id); return e ? e.nom : ''; }
/* Affichée sur l'accueil : cochée explicitement, ou par défaut tout grand événement */
function isPublicEvent(ev) { return ev.public === true || (ev.public === undefined && eventCat(ev) === 'grand'); }
function publicFields(checked, text) {
  return `<label class="check-row"><input class="tick" type="checkbox" id="evPublic" ${checked ? 'checked' : ''}><span><b>Afficher sur l'accueil du site</b><small>Le public voit le nom, la date, l'heure et l'affiche (seulement tant que la soirée est à venir).</small></span></label>
    <div class="field"><label for="evDescPublic">Texte affiché sur l'accueil (facultatif)</label><input class="input" id="evDescPublic" value="${esc(text)}" maxlength="160" placeholder="ex : DJ invité, dress code noir…"></div>`;
}
/* Pastille de couleur d'un type d'événement */
function catBadge(cat) {
  const c = catColor(cat);
  return `<span class="badge nodot cat" style="--cc:${c};--ci:${inkOn(c)}">${esc(catLabel(cat))}</span>`;
}
function catHue(cat) {
  if (cat === 'classique') return 42;
  const n = parseInt(catColor(cat).slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 42;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}
function catField(cur) {
  return `<div class="field"><label for="evCat">Type d'événement</label><select class="input" id="evCat" onchange="onCatChange(this.value)">
    ${EVENT_CATS.map((c) => `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>`;
}
/* Un grand événement est affiché sur l'accueil par défaut ; réunions, rendez-vous et soirées classiques restent internes */
function onCatChange(v) {
  const p = document.getElementById('evPublic');
  if (p) p.checked = v === 'grand';
  const h = document.getElementById('evSlotsHint');
  if (h) h.innerHTML = slotsHint(v);
}
/* Réunions et rendez-vous : pas de postes prédéfinis, tout le monde peut s'inscrire (liste des participants) */
function isOpenEvent(ev) { return ['reunion', 'rdv'].includes(eventCat(ev)); }
function defaultSlots() { return DB.postes.map((p) => ({ poste: p, userId: null, heureArriveePrevue: '', heureDepartPrevue: '' })); }
function slotsHint(cat) {
  return ['reunion', 'rdv'].includes(cat)
    ? "Pas de postes : tout le monde peut s'inscrire en indiquant son heure d'arrivée, puis son heure de départ."
    : `Les postes standards (${DB.postes.map(esc).join(', ')}) seront ajoutés automatiquement. Modifiables dans Administration → Postes.`;
}

/* ---------- Affiche (image) dans les fenêtres de création / modification ---------- */
let POSTER_EDIT = null;
function posterField(ev) {
  POSTER_EDIT = { data: null, changed: false };
  const src = posterSrc(ev);
  return `<div class="field"><label>Affiche (facultatif)</label>
    <div class="poster-field">
      <div class="poster-prev" id="posterPrev">${src ? `<img src="${esc(src)}" alt="Affiche actuelle">` : `<span>${icon('image')}Aucune affiche</span>`}</div>
      <div class="poster-side">
        <label class="btn btn-sm">${icon('upload', 'sm')}Choisir une image<input type="file" accept="image/*" hidden onchange="pickPoster(this)"></label>
        <button class="btn btn-sm btn-ghost" type="button" id="posterRm" onclick="removePoster()" ${src ? '' : 'hidden'}>${icon('trash', 'sm')}Retirer</button>
        <p class="field-hint">Format portrait conseillé (JPG, PNG). Visible par tout le monde sur l'accueil si l'événement y est affiché.</p>
      </div>
    </div></div>`;
}
async function pickPoster(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const data = await readPosterFile(file);
    POSTER_EDIT = { data, changed: true };
    document.getElementById('posterPrev').innerHTML = `<img src="${data}" alt="Nouvelle affiche">`;
    document.getElementById('posterRm').hidden = false;
  } catch (e) { toast(e.message, 'error'); }
}
function removePoster() {
  POSTER_EDIT = { data: null, changed: true };
  document.getElementById('posterPrev').innerHTML = `<span>${icon('image')}Aucune affiche</span>`;
  document.getElementById('posterRm').hidden = true;
}
/* Envoie l'affiche choisie (base partagée) ou la garde dans ce navigateur (mode local) */
async function savePoster(ev) {
  const p = POSTER_EDIT;
  POSTER_EDIT = null;
  if (!p || !p.changed) return;
  if (isShared()) {
    try {
      const r = await ClubApi.req('poster', { body: { eventId: ev.id, data: p.data } });
      if (r.v) ev.affiche = r.v; else delete ev.affiche;
    } catch (e) { toast("L'affiche n'a pas pu être envoyée : " + e.message, 'error'); }
  } else if (p.data) ev.afficheData = p.data;
  else delete ev.afficheData;
}
function busyBtn(btn, label) { if (btn) { btn.disabled = true; btn.textContent = label; } }

/* ---------- Couleurs du planning (direction et comptabilité) ---------- */
function openColorsModal() {
  openModal('Couleurs du planning', `
    <p class="field-hint" style="margin-bottom:14px">Choisissez la couleur de chaque type d'événement : elle s'applique au calendrier et aux cartes, pour toute l'équipe.</p>
    <div class="color-list">${EVENT_CATS.map((c) => `<label class="color-row"><input type="color" id="col_${c.id}" value="${catColor(c.id)}" oninput="this.nextElementSibling.querySelector('i').style.background=this.value"><span><b><i style="background:${catColor(c.id)}"></i>${c.label}</b><small>Cliquez sur la pastille pour changer</small></span></label>`).join('')}</div>`,
    `<button class="btn btn-sm btn-ghost" type="button" onclick="resetColors()">Couleurs d'origine</button><button class="btn btn-sm btn-sun" type="button" onclick="saveColors()">Enregistrer</button>`);
}
function saveColors() {
  DB.couleurs = EVENT_CATS.map((c) => ({ id: c.id, color: document.getElementById('col_' + c.id).value }));
  logActivity('Couleurs du planning modifiées', EVENT_CATS.map((c) => c.label).join(', '));
  toast('Couleurs enregistrées.', 'success'); closeModal(); refresh();
}
function resetColors() {
  EVENT_CATS.forEach((c) => { const el = document.getElementById('col_' + c.id); el.value = c.color; el.dispatchEvent(new Event('input')); });
}
/* Demandes de privatisation datées, pas encore transformées en soirée (visibles par ceux qui gèrent les privatisations) */
function rdvOn(date) {
  return (DB.rdv || []).filter((r) => r.date === date && !r.eventId && !['Refusée', 'Terminée'].includes(r.statut));
}

/* ---------- Carte de service : on s'inscrit avec son heure d'arrivée, on note son départ en fin de soirée ---------- */
function svcStep(att) {
  if (att.statut === 'Validé') return 3;
  if (att.statut === 'À valider' || att.statut === 'Terminé') return 2;
  return att.heureArrivee ? 1 : 0;
}
function renderServiceCard(ev, assignment, userId) {
  const att = ensureAttendance(ev.id, userId, assignment.poste);
  const step = svcStep(att);
  const started = ev.date <= todayISO();                 // le jour J (ou après) : on peut noter son départ
  const mineCard = userId === CURRENT_USER.id;
  let actions = '';
  if (!att.heureArrivee && att.statut !== 'Validé') {
    actions = mineCard ? `<div class="svc-in"><label for="arr_${att.id}">Heure d'arrivée</label><div><input class="input" id="arr_${att.id}" type="time" value="${esc(assignment.heureArriveePrevue || ev.heureDebut || '23:00')}"><button class="btn btn-sun" type="button" onclick="setArrival('${att.id}')">${icon('check', 'sm')}Valider</button></div></div>` : '<p class="svc-note">Heure d\'arrivée pas encore indiquée.</p>';
  } else if (step === 1) {
    actions = `<p class="svc-note">Arrivée : <b>${esc(att.heureArrivee)}</b>${mineCard ? ` <button class="btn btn-xs btn-ghost" type="button" onclick="openTimesModal('${att.id}')">Modifier</button>` : ''}</p>`;
    if (mineCard) actions += started
      ? `<div class="svc-in"><label for="dep_${att.id}">Heure de départ</label><div><input class="input" id="dep_${att.id}" type="time" value="${nowHM()}"><button class="btn btn-dark" type="button" onclick="setDeparture('${att.id}')">Terminer mon service</button></div></div>`
      : '<p class="svc-note">Vous indiquerez votre heure de départ le soir même : les heures seront comptées automatiquement.</p>';
  } else if (step === 2) {
    actions = `<p class="svc-note">Arrivée ${esc(att.heureArrivee || '—')} · Départ ${esc(att.heureDepart || '—')} · <b>${fmtDuration(att.heureArrivee, att.heureDepart)}</b> — en attente de validation.${mineCard ? ` <button class="btn btn-xs btn-ghost" type="button" onclick="openTimesModal('${att.id}')">Corriger</button>` : ''}</p>`;
  } else {
    actions = `<p class="svc-note ok">${fmtDuration(att.heureArrivee, att.heureDepart)} validées par ${esc(userLabel(att.valideParId))}.</p>`;
  }
  return `<article class="svc card lift">
    <div class="svc-top"><span class="svc-date">${fmtDate(ev.date)}</span>${statusBadge(att.statut)}</div>
    <h3>${esc(ev.nom)}</h3>
    <div class="steps" aria-label="Étape ${step + 1} sur ${SVC_STEPS.length}">${SVC_STEPS.map((s, i) => `<i class="${i <= step ? 'on' : ''}" style="--s:${i}" title="${s}"></i>`).join('')}</div>
    <div class="kv"><span>${isOpenEvent(ev) ? 'Inscription' : 'Poste'}</span><span>${esc(assignment.poste)}</span></div>
    <div class="kv"><span>Début de la soirée</span><span>${esc(ev.heureDebut || 'Non renseigné')}</span></div>
    <div class="svc-actions">${actions}</div>
  </article>`;
}
function attById(attId) { return DB.attendances.find((x) => x.id === attId); }
function setArrival(attId) {
  const a = attById(attId);
  const h = document.getElementById('arr_' + attId).value;
  if (!a || !h) { toast("Indiquez votre heure d'arrivée.", 'error'); return; }
  a.heureArrivee = h; a.confirmation = true; a.statut = 'Présent';
  logActivity('Arrivée indiquée', `${eventName(a.eventId)} — ${h}`);
  toast('Arrivée enregistrée : ' + h + '.', 'success'); refreshAll();
}
function setDeparture(attId) {
  const a = attById(attId);
  const h = document.getElementById('dep_' + attId).value;
  if (!a || !h) { toast('Indiquez votre heure de départ.', 'error'); return; }
  a.heureDepart = h; a.duree = fmtDuration(a.heureArrivee, h); a.statut = 'À valider';
  logActivity('Départ indiqué', `${eventName(a.eventId)} — ${h} (${a.duree})`);
  toast(`Service terminé : ${a.duree}, en attente de validation.`, 'success'); refreshAll();
}
/* Corriger ses heures tant qu'elles ne sont pas validées */
function openTimesModal(attId) {
  const a = attById(attId);
  if (!a || a.statut === 'Validé') return;
  openModal('Mes heures', `
    <p class="confirm-text" style="margin-bottom:12px">${esc(eventName(a.eventId))}</p>
    <div class="grid-2">
      <div class="field"><label for="tmArr">Heure d'arrivée</label><input class="input" id="tmArr" type="time" value="${esc(a.heureArrivee || '')}"></div>
      <div class="field"><label for="tmDep">Heure de départ</label><input class="input" id="tmDep" type="time" value="${esc(a.heureDepart || '')}"></div>
    </div>
    <p class="field-hint">Les heures sont comptées en centièmes : 60 min = 1,00 h (1 h 45 = 1,75 h). Laissez le départ vide si le service n'est pas fini.</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveTimes('${attId}')">Enregistrer</button>`);
}
function saveTimes(attId) {
  const a = attById(attId);
  const arr = document.getElementById('tmArr').value, dep = document.getElementById('tmDep').value;
  if (!arr) { toast("Indiquez l'heure d'arrivée.", 'error'); return; }
  a.heureArrivee = arr; a.heureDepart = dep; a.confirmation = true;
  a.duree = dep ? fmtDuration(arr, dep) : '';
  a.statut = dep ? 'À valider' : 'Présent';
  logActivity('Heures corrigées', `${eventName(a.eventId)} — ${arr} → ${dep || '…'}`);
  toast('Heures enregistrées.', 'success'); closeModal(); refresh();
}
/* Rafraîchit la page et, si elle est ouverte, la fenêtre du jour */
function refreshAll() {
  const day = document.querySelector('[data-day-modal]');
  refresh();
  if (day) openDayModal(day.dataset.dayModal);
}

/* ================= MON PLANNING ================= */
function renderPlanning() {
  const list = myUpcomingAssignments(CURRENT_USER.id);
  let html = pageHead('Mon planning', 'Mes services', "Inscrivez-vous avec votre heure d'arrivée, notez votre départ en fin de soirée : vos heures sont comptées automatiquement.");
  const mon = mondayOf(todayISO());
  const mineNow = weekHours(mon).rows.find((r) => r.userId === CURRENT_USER.id);
  const minePrev = weekHours(addDays(mon, -7)).rows.find((r) => r.userId === CURRENT_USER.id);
  html += `<div class="my-hours stagger">
    <div class="card"><small>Cette semaine · lun. ${fmtDateShort(mon)} → dim. ${fmtDateShort(addDays(mon, 6))}</small><b>${fmtHours(mineNow ? mineNow.total : 0)}</b><span>${mineNow ? mineNow.services : 0} service(s)${mineNow && mineNow.pending ? ` · ${mineNow.pending} à valider` : ''}</span></div>
    <div class="card"><small>Semaine dernière</small><b>${fmtHours(minePrev ? minePrev.total : 0)}</b><span>${minePrev ? minePrev.services : 0} service(s)</span></div>
  </div>`;
  html += `<section class="section">${renderMonthCalendar(CAL_YEAR, CAL_MONTH, 'mine')}</section>`;
  html += `<section class="section">${sectionHead('À venir au Pacific Bluffs')}${renderAgenda(10)}</section>`;
  html += `<section class="section">${sectionHead('Prochains services', list.length)}`;
  html += list.length ? `<div class="grid-cards stagger">${list.map((x) => renderServiceCard(x.event, x.assignment, CURRENT_USER.id)).join('')}</div>`
    : emptyState('📭', 'Aucun service prévu', 'Ouvrez le Programme et cliquez sur « Prendre ce poste » pour vous inscrire sur une soirée.');
  html += '</section>';

  const myAtt = DB.attendances.filter((a) => a.userId === CURRENT_USER.id)
    .map((a) => ({ a, ev: DB.events.find((e) => e.id === a.eventId) }))
    .sort((x, y) => ((y.ev && y.ev.date) || '').localeCompare((x.ev && x.ev.date) || ''));
  html += `<section class="section">${sectionHead('Historique de présence', myAtt.length)}`;
  html += myAtt.length ? `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Soirée</th><th>Date</th><th>Poste</th><th>Arrivée</th><th>Départ</th><th>Durée</th><th>Statut</th></tr></thead><tbody>
    ${myAtt.map(({ a, ev }) => `<tr><td class="strong">${esc(ev ? ev.nom : '—')}</td><td>${fmtDateShort(ev && ev.date)}</td><td>${esc(a.poste)}</td>
      <td>${esc(a.heureArrivee || '—')}</td><td>${esc(a.heureDepart || '—')}</td><td>${fmtDuration(a.heureArrivee, a.heureDepart)}</td><td>${statusBadge(a.statut)}</td></tr>`).join('')}
    </tbody></table></div></div>` : emptyState('🗂️', 'Aucun historique', 'Vos présences passées apparaîtront ici.');
  html += '</section>';
  return html;
}

/* Liste des prochains rendez-vous du club, en couleur, lisible sans cliquer :
   grands événements, réunions, rendez-vous et mes services (les soirées classiques restent dans le calendrier) */
function renderAgenda(limit) {
  const today = todayISO();
  const items = DB.events
    .filter((e) => e.date >= today && e.statut !== 'Annulée')
    .map((e) => ({ date: e.date, heure: e.heureDebut, nom: e.nom, cat: eventCat(e), mine: e.assignments.find((a) => a.userId === CURRENT_USER.id) }))
    .filter((x) => x.cat !== 'classique' || x.mine)
    .concat((DB.rdv || []).filter((r) => r.date >= today && !r.eventId && !['Refusée', 'Terminée'].includes(r.statut))
      .map((r) => ({ date: r.date, heure: r.heure, nom: 'Privatisation — ' + r.nom, cat: 'rdv', mine: null })))
    .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')))
    .slice(0, limit);
  if (!items.length) return emptyState('🗓️', 'Rien de spécial à venir', 'Les soirées classiques ont lieu chaque soir dès 23h (en gris dans le calendrier).');
  return `<div class="agenda stagger">${items.map((x) => {
    const dt = new Date(x.date + 'T00:00:00');
    const c = catColor(x.cat);
    return `<button class="ag-row" type="button" style="--cc:${c};--ci:${inkOn(c)}" onclick="openDayModal('${x.date}')">
      <span class="ag-day"><b>${dt.getDate()}</b><small>${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][dt.getMonth()]}</small></span>
      <span class="ag-info"><b>${esc(x.nom)}</b><small>${fmtDate(x.date)} · ${esc(x.heure || 'heure à définir')}</small></span>
      <span class="ag-tags">${catBadge(x.cat)}${x.mine ? `<span class="badge sun nodot">Mon poste : ${esc(x.mine.poste)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div>`;
}

/* ================= HEURES PAR SEMAINE (lundi → dimanche, pour verser les salaires le lundi) ================= */
let HOURS_WEEK = null; // lundi de la semaine affichée
function mondayOf(iso) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
/* Heures de chacun sur la semaine : services dont l'arrivée et le départ sont notés (la soirée compte le jour où elle commence) */
function weekHours(mon) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const per = new Map();
  DB.attendances.forEach((a) => {
    const ev = DB.events.find((e) => e.id === a.eventId);
    const i = ev ? days.indexOf(ev.date) : -1;
    const mins = durationMinutes(a.heureArrivee, a.heureDepart);
    if (i < 0 || mins === null || a.statut === 'Absent') return;
    const r = per.get(a.userId) || { userId: a.userId, days: Array(7).fill(0), total: 0, services: 0, pending: 0 };
    r.days[i] += mins; r.total += mins; r.services++;
    if (a.statut !== 'Validé') r.pending++;
    per.set(a.userId, r);
  });
  return { days, rows: [...per.values()].sort((x, y) => userLabel(x.userId).localeCompare(userLabel(y.userId))) };
}
function renderWeekHours() {
  const mon = HOURS_WEEK || mondayOf(todayISO());
  const { days, rows } = weekHours(mon);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const pending = rows.reduce((s, r) => s + r.pending, 0);
  const isNow = mon === mondayOf(todayISO());
  let html = `<div class="card week-hours">
    <div class="wh-head">
      <div class="cal-nav"><button class="icon-btn sm" type="button" onclick="shiftHoursWeek(-1)" aria-label="Semaine précédente">${icon('left')}</button>
        <div class="wh-title"><b>Semaine du ${fmtDateShort(days[0])} au ${fmtDateShort(days[6])}</b><small>lundi → dimanche${isNow ? ' · en cours' : ''}</small></div>
        <button class="icon-btn sm" type="button" onclick="shiftHoursWeek(1)" aria-label="Semaine suivante">${icon('right')}</button>
        ${isNow ? '' : '<button class="btn btn-xs" type="button" onclick="HOURS_WEEK=null;renderPage(false)">Cette semaine</button>'}</div>
      <div class="wh-sum"><span><b>${fmtHours(total)}</b> au total</span>${pending ? `<span class="badge warn">${pending} service(s) à valider</span>` : (rows.length ? '<span class="badge good">Tout est validé</span>' : '')}
        ${rows.length ? `<button class="btn btn-sm" type="button" onclick="exportWeekHours('${mon}')">${icon('download', 'sm')}Exporter</button>` : ''}</div>
    </div>`;
  if (!rows.length) return html + '<p class="muted" style="padding:6px 4px 2px;font-size:13.5px">Aucune heure enregistrée cette semaine (il faut une heure d\'arrivée et une heure de départ).</p></div>';
  html += `<div class="table-scroll"><table class="tbl compact wh-tbl"><thead><tr><th>Employé</th>${days.map((d, i) => `<th class="num">${DAY_LABELS[i]} ${Number(d.slice(8))}</th>`).join('')}<th class="num">Total</th><th class="num">Services</th><th>Validation</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="strong">${esc(userLabel(r.userId))}</td>${r.days.map((m) => `<td class="num${m ? '' : ' muted'}">${m ? hoursDec(m).toFixed(2).replace('.', ',') : '—'}</td>`).join('')}
      <td class="num strong">${fmtHours(r.total)}</td><td class="num">${r.services}</td><td>${r.pending ? `<span class="badge warn">${r.pending} à valider</span>` : '<span class="badge good">Validé</span>'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td class="strong">Total</td>${days.map((d, i) => { const m = rows.reduce((s, r) => s + r.days[i], 0); return `<td class="num">${m ? hoursDec(m).toFixed(2).replace('.', ',') : '—'}</td>`; }).join('')}<td class="num strong">${fmtHours(total)}</td><td class="num">${rows.reduce((s, r) => s + r.services, 0)}</td><td></td></tr></tfoot></table></div>
    <p class="field-hint" style="margin-top:10px">Heures en centièmes : 60 min = 1,00 h (1 h 45 = 1,75 h). Une soirée compte le jour où elle commence (23 h → 4 h = le jour de 23 h).</p></div>`;
  return html;
}
function shiftHoursWeek(n) { HOURS_WEEK = addDays(HOURS_WEEK || mondayOf(todayISO()), 7 * n); renderPage(false); }
function exportWeekHours(mon) {
  const { days, rows } = weekHours(mon);
  const n = (m) => hoursDec(m).toFixed(2).replace('.', ',');
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['Employé', ...days.map((d, i) => `${DAY_LABELS[i]} ${fmtDateShort(d)}`), 'Total (h)', 'Services', 'À valider'].map(q).join(';')];
  rows.forEach((r) => lines.push([q(userLabel(r.userId)), ...r.days.map(n), n(r.total), r.services, r.pending].join(';')));
  downloadFile(`pacific-bluffs-heures-semaine-${mon}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Heures de la semaine exportées.', 'success');
}

/* ================= PRÉSENCES ================= */
function renderPresences() {
  let html = pageHead('Présences', "Présences de l'équipe", "Heures de chacun du lundi au dimanche (pour verser les salaires le lundi), puis le détail des services à valider.");
  html += `<section class="section">${sectionHead('Heures de la semaine')}${renderWeekHours()}</section>`;
  html += sectionHead('Détail des services');
  let rows = [];
  DB.events.forEach((ev) => ev.assignments.forEach((a) => {
    if (!a.userId) return;
    rows.push({ ev, a, att: ensureAttendance(ev.id, a.userId, a.poste) });
  }));
  const f = presenceFilters;
  html += `<div class="filters-bar">
    <select class="input" onchange="presenceFilters.periode=this.value;refresh()">
      ${[['toutes', 'Toutes les périodes'], ['today', "Aujourd'hui"], ['week', 'Cette semaine'], ['past', 'Semaine précédente']].map(([v, l]) => `<option value="${v}" ${f.periode === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <select class="input" onchange="presenceFilters.employe=this.value;refresh()">
      <option value="">Tous les employés</option>${DB.users.map((u) => `<option value="${u.id}" ${f.employe === u.id ? 'selected' : ''}>${esc(fullName(u))}</option>`).join('')}
    </select>
    <select class="input" onchange="presenceFilters.poste=this.value;refresh()">
      <option value="">Tous les postes</option>${DB.postes.map((p) => `<option value="${esc(p)}" ${f.poste === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
    </select>
    <select class="input" onchange="presenceFilters.statut=this.value;refresh()">
      <option value="">Tous les statuts</option>${ATT_STATUTS.map((s) => `<option ${f.statut === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <input class="input" type="search" placeholder="Rechercher un employé…" value="${esc(f.search)}" onchange="presenceFilters.search=this.value;refresh()">
  </div>`;

  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weekStart = isoDate(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
  const prevMon = new Date(monday); prevMon.setDate(prevMon.getDate() - 7);
  const prevStart = isoDate(prevMon.getFullYear(), prevMon.getMonth() + 1, prevMon.getDate());
  rows = rows.filter((r) => {
    if (f.employe && r.a.userId !== f.employe) return false;
    if (f.poste && r.a.poste !== f.poste) return false;
    if (f.statut && r.att.statut !== f.statut) return false;
    if (f.search && !userLabel(r.a.userId).toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.periode === 'today' && r.ev.date !== todayISO()) return false;
    if (f.periode === 'week' && r.ev.date < weekStart) return false;
    if (f.periode === 'past' && (r.ev.date < prevStart || r.ev.date >= weekStart)) return false;
    return true;
  }).sort((a, b) => b.ev.date.localeCompare(a.ev.date));

  if (!rows.length) return html + emptyState('✅', 'Aucune présence à afficher', 'Aucun employé attribué ne correspond à ces filtres.');
  html += `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr>
    <th>Date</th><th>Soirée</th><th>Employé</th><th>Poste</th><th>Arr. prévue</th><th>Arr. réelle</th><th>Dép. prévu</th><th>Dép. réel</th><th>Durée</th><th>Statut</th><th>Validation</th>
  </tr></thead><tbody>`;
  rows.forEach((r) => {
    const canValidate = isMgmt() && r.att.statut === 'À valider';
    let cell = '—';
    if (r.att.statut === 'Validé') cell = `<span class="badge good nodot">${esc(userLabel(r.att.valideParId))} · ${esc(r.att.dateValidation)}</span>`;
    else if (canValidate) cell = `<button class="btn btn-xs btn-sun" type="button" onclick="validateAttendance('${r.att.id}')">Valider</button>`;
    else if (isDirection()) cell = `<button class="btn btn-xs" type="button" onclick="openManualEditModal('${r.att.id}')">${icon('edit', 'sm')}Modifier</button>`;
    html += `<tr><td>${fmtDateShort(r.ev.date)}</td><td class="strong">${esc(r.ev.nom)}</td><td>${esc(userLabel(r.a.userId))}</td><td>${esc(r.a.poste)}</td>
      <td>${esc(r.a.heureArriveePrevue || r.ev.heureDebut || '—')}</td><td>${esc(r.att.heureArrivee || '—')}</td><td>${esc(r.a.heureDepartPrevue || '—')}</td><td>${esc(r.att.heureDepart || '—')}</td>
      <td>${fmtDuration(r.att.heureArrivee, r.att.heureDepart)}</td><td>${statusBadge(r.att.statut)}</td><td>${cell}</td></tr>`;
  });
  return html + '</tbody></table></div></div>';
}
function validateAttendance(attId) {
  const a = DB.attendances.find((x) => x.id === attId);
  a.statut = 'Validé'; a.valideParId = CURRENT_USER.id; a.dateValidation = fmtDateShort(todayISO()) + ' ' + nowHM();
  logActivity('Présence validée', userLabel(a.userId));
  toast('Présence validée.', 'success'); refresh();
}
function openManualEditModal(attId) {
  const a = DB.attendances.find((x) => x.id === attId);
  openModal('Modification manuelle', `
    <div class="grid-2">
      <div class="field"><label for="mArr">Heure d'arrivée</label><input class="input" id="mArr" type="time" value="${esc(a.heureArrivee || '')}"></div>
      <div class="field"><label for="mDep">Heure de départ</label><input class="input" id="mDep" type="time" value="${esc(a.heureDepart || '')}"></div>
    </div>
    <p class="field-hint">Toute modification manuelle est tracée avec votre nom et l'heure de la correction.</p>
    ${a.modifications && a.modifications.length ? `<div class="sub-h">Historique des corrections</div>${a.modifications.map((m) => `<div class="line-item"><span>${esc(m.champ)} : ${esc(m.ancienne)} → ${esc(m.nouvelle)}</span><span class="muted">${esc(m.par)} · ${esc(m.date)}</span></div>`).join('')}` : ''}`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveManualEdit('${attId}')">Enregistrer</button>`);
}
function saveManualEdit(attId) {
  const a = DB.attendances.find((x) => x.id === attId);
  const newArr = document.getElementById('mArr').value;
  const newDep = document.getElementById('mDep').value;
  const stamp = fmtDateShort(todayISO()) + ' ' + nowHM();
  const by = userLabel(CURRENT_USER.id);
  a.modifications = a.modifications || [];
  if (newArr !== a.heureArrivee) { a.modifications.push({ par: by, date: stamp, champ: 'Arrivée', ancienne: a.heureArrivee || '—', nouvelle: newArr }); a.heureArrivee = newArr; }
  if (newDep !== a.heureDepart) { a.modifications.push({ par: by, date: stamp, champ: 'Départ', ancienne: a.heureDepart || '—', nouvelle: newDep }); a.heureDepart = newDep; }
  if (a.heureArrivee && a.heureDepart) {
    a.duree = fmtDuration(a.heureArrivee, a.heureDepart);
    if (a.statut === 'Arrivé' || a.statut === 'Présent' || a.statut === 'À confirmer') a.statut = 'À valider';
  }
  logActivity('Présence modifiée manuellement', `${userLabel(a.userId)} — par ${by} — ${nowHM()}`);
  toast('Modification enregistrée.', 'success'); closeModal(); refresh();
}

/* ================= CALENDRIER ================= */
function buildMonthGrid(year, month) {
  const startWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}
function shiftCalMonth(delta) {
  CAL_MONTH += delta;
  if (CAL_MONTH < 1) { CAL_MONTH = 12; CAL_YEAR--; }
  if (CAL_MONTH > 12) { CAL_MONTH = 1; CAL_YEAR++; }
  autoClassicSoirees(CAL_YEAR, CAL_MONTH);               // un mois à venir s'affiche déjà rempli
  renderPage(false, true);
}
/* Soirées classiques ajoutées d'office (direction, comptabilité) : chaque soir à partir d'aujourd'hui,
   pour le mois en cours et les 2 suivants, plus le mois affiché s'il est dans l'année à venir */
function autoClassicSoirees(year, month) {
  if (!CURRENT_USER || !DB || !canManageEvents() || !DB.postes.length) return 0;
  const now = new Date();
  const months = [0, 1, 2].map((i) => { const m = new Date(now.getFullYear(), now.getMonth() + i, 1); return [m.getFullYear(), m.getMonth() + 1]; });
  const ahead = year ? (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth()) : -1;
  if (ahead > 2 && ahead <= 12) months.push([year, month]);
  const today = todayISO();
  const created = [];
  months.forEach(([y, m]) => created.push(...buildClassicEvents(y, m, DB.events.concat(created), DB.postes, today)));
  if (!created.length) return 0;
  DB.events.push(...created);
  logActivity('Soirées classiques ajoutées automatiquement', `${created.length} soirée(s)`);
  saveSoon();
  return created.length;
}
function calToday() { const d = new Date(); CAL_YEAR = d.getFullYear(); CAL_MONTH = d.getMonth() + 1; renderPage(false, true); }
function renderMonthCalendar(year, month, perspective) {
  const today = todayISO();
  const cells = buildMonthGrid(year, month);
  let html = `<div class="card cal"><div class="cal-head">
    <div class="cal-nav">
      <button class="icon-btn sm" type="button" onclick="shiftCalMonth(-1)" aria-label="Mois précédent">${icon('left')}</button>
      <div class="cal-month">${MONTHS_FR[month - 1]} ${year}</div>
      <button class="icon-btn sm" type="button" onclick="shiftCalMonth(1)" aria-label="Mois suivant">${icon('right')}</button>
      <button class="btn btn-xs" type="button" onclick="calToday()">Aujourd'hui</button>
    </div>
    <div class="legend">${EVENT_CATS.map((c) => `<span><i style="background:${catColor(c.id)}"></i>${c.label}</span>`).join('')}<span><i class="dot-mine"></i>Mon poste</span></div>
    ${canManageEvents() && perspective === 'all' ? `<div class="cal-tools"><button class="btn btn-sm" type="button" onclick="openColorsModal()">${icon('palette', 'sm')}Couleurs</button><button class="btn btn-sm btn-dark" type="button" onclick="generateMonthSchedule()">${icon('bolt', 'sm')}Générer les soirées du mois</button></div>` : ''}
  </div><div class="cal-scroll"><div class="cal-grid">
    ${DAY_LABELS.map((l) => `<div class="cal-dow">${l}</div>`).join('')}
    ${cells.map((d, i) => {
      if (!d) return '<div class="cal-cell empty"></div>';
      const date = isoDate(year, month, d);
      const evs = DB.events.filter((e) => e.date === date);
      const chip = (label, cat, mine) => { const c = catColor(cat); return `<span class="chip cat${mine ? ' is-mine' : ''}" style="--cc:${c};--ci:${inkOn(c)}">${esc(label)}</span>`; };
      // Toutes les soirées en couleur, mes postes en premier (marqués d'un point)
      let chips = '';
      evs.map((ev) => ({ ev, mine: ev.assignments.some((x) => x.userId === CURRENT_USER.id) }))
        .sort((a, b) => b.mine - a.mine)
        .forEach(({ ev, mine }) => { chips += chip(ev.nom, eventCat(ev), mine); });
      rdvOn(date).forEach((r) => { chips += chip('RDV · ' + r.nom, 'rdv', false); });
      return `<button class="cal-cell ${date === today ? 'today' : ''} ${date < today ? 'past' : ''}" type="button" style="--c:${i}" onclick="openDayModal('${date}')" aria-label="${fmtDate(date)}"><span class="cal-num">${d}</span>${chips}</button>`;
    }).join('')}
  </div></div></div>`;
  return html;
}
function generateMonthSchedule() {
  const created = buildClassicEvents(CAL_YEAR, CAL_MONTH, DB.events, DB.postes);
  if (!created.length) { toast('Toutes les soirées de ce mois sont déjà programmées.', 'success'); return; }
  DB.events.push(...created);
  logActivity('Planning généré', `${created.length} soirée(s) classique(s) — ${MONTHS_FR[CAL_MONTH - 1]} ${CAL_YEAR}`);
  toast(created.length + ' soirée(s) ajoutée(s) au planning.', 'success');
  renderPage(false, true);
}
/* Direction, comptabilité et managers : les personnes inscrites à une soirée (nom, poste, heure d'arrivée) */
function signupNames(ev) { return ev.assignments.filter((a) => a.userId).map((a) => userLabel(a.userId)); }
function signupList(ev) {
  const inscrits = ev.assignments.filter((a) => a.userId);
  const open = isOpenEvent(ev);
  const libres = open ? 0 : ev.assignments.length - inscrits.length;
  const n = inscrits.length;
  const head = `<div class="signups-h"><b>${n ? `${n} inscrit${n > 1 ? 's' : ''}` : "Personne n'est encore inscrit"}</b>${libres ? `<span>${libres} poste${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}</span>` : ''}</div>`;
  if (!n) return `<div class="signups">${head}</div>`;
  return `<div class="signups">${head}<ul>${inscrits.map((a) => {
    const att = attendanceFor(ev.id, a.userId);
    const arr = (att && att.heureArrivee) || a.heureArriveePrevue;
    const meta = [open ? '' : a.poste, arr ? 'arrivée ' + arr : ''].filter(Boolean).join(' · ');
    return `<li class="${a.userId === CURRENT_USER.id ? 'is-me' : ''}"><span class="su-name">${esc(userLabel(a.userId))}${a.userId === CURRENT_USER.id ? ' <small>(moi)</small>' : ''}</span>${meta ? `<span class="su-meta">${esc(meta)}</span>` : ''}</li>`;
  }).join('')}</ul></div>`;
}
function openDayModal(date) {
  const evs = DB.events.filter((e) => e.date === date);
  const rdvs = rdvOn(date);
  const see = canSeeSignups();
  let body = `<div data-day-modal="${date}"></div>`;
  if (!evs.length && !rdvs.length) body += '<p class="confirm-text muted">Aucune soirée programmée ce jour.</p>';
  evs.forEach((ev) => {
    const mine = ev.assignments.find((a) => a.userId === CURRENT_USER.id);
    const manageBtn = canManageEvents() ? `<button class="btn btn-xs" type="button" onclick="openEventDetail('${ev.id}')">${icon('users', 'sm')}${isOpenEvent(ev) ? 'Gérer' : "Gérer l'équipe et la soirée"}</button>` : '';
    if (mine) {
      body += renderServiceCard(ev, mine, CURRENT_USER.id).replace('svc card lift', 'svc card inner day-ev');
      // inscrit soi-même : la direction, la comptabilité et les managers voient aussi le reste de l'équipe
      if (see) body += `<div class="card inner day-ev day-team" style="--cc:${catColor(eventCat(ev))}"><span class="svc-date">Équipe de la soirée</span>${signupList(ev)}${manageBtn}</div>`;
      return;
    }
    const open = ev.assignments.map((a, i) => ({ a, i })).filter((x) => !x.a.userId);
    const inscrits = ev.assignments.filter((a) => a.userId);
    const claim = open.length ? `<p class="field-hint">Postes disponibles — cliquez pour prendre un poste :</p>${open.map(({ a, i }) => `<div class="slot"><span>${esc(a.poste)}</span><button class="btn btn-xs btn-sun" type="button" onclick="claimPoste('${ev.id}',${i})">Prendre ce poste</button></div>`).join('')}` : '';
    let inner;
    if (isOpenEvent(ev)) {
      inner = `${see ? signupList(ev) : `<p class="field-hint">${inscrits.length ? `${inscrits.length} inscrit${inscrits.length > 1 ? 's' : ''} : ${inscrits.map((a) => esc(userLabel(a.userId))).join(', ')}` : 'Personne n\'est encore inscrit.'}</p>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-xs btn-sun" type="button" onclick="claimPoste('${ev.id}',-1)">${icon('plus', 'sm')}S'inscrire</button>${manageBtn}</div>`;
    } else if (canManageEvents()) {
      inner = signupList(ev) + manageBtn;
    } else if (see) {
      // manager : l'équipe inscrite, puis les postes encore libres
      inner = signupList(ev) + (claim || `<button class="btn btn-xs btn-ghost" type="button" onclick="openEventDetail('${ev.id}')">Voir le détail</button>`);
    } else if (open.length) {
      inner = claim;
    } else {
      inner = `<p class="field-hint">Tous les postes sont attribués. <button class="btn btn-xs btn-ghost" type="button" onclick="openEventDetail('${ev.id}')">Voir le détail</button></p>`;
    }
    body += `<div class="card inner day-ev" style="--cc:${catColor(eventCat(ev))}">
      <span class="svc-date">${esc(ev.heureDebut || 'Heure à définir')} · ${catBadge(eventCat(ev))}</span>
      <h4>${esc(ev.nom)}</h4>
      ${inner}
    </div>`;
  });
  rdvs.forEach((r) => {
    body += `<div class="card inner day-ev" style="--cc:${catColor('rdv')}">
      <span class="svc-date">${esc(r.heure || 'Heure à définir')} · ${catBadge('rdv')}</span>
      <h4>Privatisation — ${esc(r.nom)}</h4>
      <p class="field-hint">${esc(r.typeEvent || 'Privatisation')} · ${r.personnes || '?'} invité(s) · ${esc(r.statut)}</p>
      <button class="btn btn-xs" type="button" onclick="openRdv('${r.id}')">${icon('phone', 'sm')}Ouvrir la demande</button>
    </div>`;
  });
  const footer = canManageEvents()
    ? `<button class="btn btn-sm" type="button" onclick="openCreateEventModal('${date}')">${icon('plus', 'sm')}Créer une soirée ce jour</button><button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>`
    : `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>`;
  openModal(fmtDate(date), body, footer);
}

/* ================= PROGRAMME ================= */
function renderProgramme() {
  const actions = canManageEvents() ? `<button class="btn btn-sun" type="button" onclick="openCreateEventModal()" data-magnetic="0.2">${icon('plus', 'sm')}Créer une soirée</button>` : '';
  let html = pageHead('Programme', 'Calendrier des soirées', canManageEvents() ?"Créez les soirées, attribuez les postes et générez les soirées classiques du mois." : 'Cliquez sur un jour pour voir les soirées et prendre un poste disponible.', actions);
  html += `<section class="section">${renderMonthCalendar(CAL_YEAR, CAL_MONTH, 'all')}</section>`;
  const upcoming = [...DB.events].filter((e) => e.date >= todayISO()).sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
  html += `<section class="section">${sectionHead('Soirées à venir', upcoming.length)}`;
  html += upcoming.length ? `<div class="grid-cards stagger">${upcoming.slice(0, 12).map(renderEventCard).join('')}</div>`
    : emptyState('🎪', 'Aucune soirée à venir', canManageEvents() ?'Cliquez sur « Générer les soirées du mois » pour préremplir le calendrier, ou créez une soirée.' : 'Aucun événement enregistré pour le moment.');
  return html + '</section>';
}
function renderEventCard(ev) {
  const assigned = ev.assignments.filter((a) => a.userId).length;
  const total = ev.assignments.length || 1;
  const mine = ev.assignments.find((a) => a.userId === CURRENT_USER.id);
  const hasOpen = ev.assignments.some((a) => !a.userId);
  const cat = eventCat(ev);
  const dt = new Date(ev.date + 'T00:00:00');
  const day = `<small>${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][dt.getDay()]} ${MONTHS_FR[dt.getMonth()]}</small>`;
  const src = posterSrc(ev);
  return `<article class="evc card lift" style="--cc:${catColor(cat)}" onclick="openEventDetail('${ev.id}')" tabindex="0" onkeydown="if(event.key==='Enter')openEventDetail('${ev.id}')">
    ${src ? `<div class="evc-poster"><img src="${esc(src)}" alt="Affiche : ${esc(ev.nom)}" loading="lazy">${day}<b>${dt.getDate()}</b></div>`
      : `<div class="viz viz-type" style="--hue:${catHue(cat)}">${day}<span>${dt.getDate()}</span></div>`}
    <div class="evc-body">
      <span class="evc-date">${fmtDate(ev.date)}</span>
      <h3>${esc(ev.nom)}</h3>
      <div class="evc-meta"><span>${icon('clock', 'sm')}${esc(ev.heureDebut || '—')}</span><span>${icon('users', 'sm')}${isOpenEvent(ev) ? `${assigned} inscrit${assigned > 1 ? 's' : ''}` : `${assigned}/${ev.assignments.length}`}</span></div>
      ${isOpenEvent(ev) ? '' : `<div class="meter"><i style="--w:${Math.round((assigned / total) * 100)}%"></i></div>`}
      ${canSeeSignups() ? (() => {
    const names = signupNames(ev);
    return names.length
      ? `<p class="evc-team" title="${esc(names.join(', '))}">${icon('users', 'sm')}<span>${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ` +${names.length - 4}` : ''}</span></p>`
      : `<p class="evc-team muted">${icon('users', 'sm')}<span>Aucun inscrit</span></p>`;
  })() : ''}
      <div class="evc-foot">${catBadge(cat)}${statusBadge(ev.statut)}${isPublicEvent(ev) && ev.statut !== 'Annulée' ? `<span class="badge nodot">${icon('globe', 'sm')}Accueil</span>` : ''}${mine ? `<span class="badge sun">${isOpenEvent(ev) ? 'Inscrit' : 'Mon poste : ' + esc(mine.poste)}</span>` : (isOpenEvent(ev) ? '<span class="badge warn">Inscription libre</span>' : (hasOpen && !canManageEvents() ? '<span class="badge warn">Postes libres</span>' : ''))}</div>
    </div>
  </article>`;
}
function openEventDetail(eventId) {
  const ev = DB.events.find((e) => e.id === eventId);
  if (!ev) return;
  if (isOpenEvent(ev)) { openOpenEventDetail(ev); return; }
  const rows = ev.assignments.map((a, i) => {
    const att = a.userId ? ensureAttendance(ev.id, a.userId, a.poste) : null;
    let emp;
    if (canManageEvents()) {
      emp = `<select class="cell-in" onchange="assignEmployee('${ev.id}',${i},this.value)"><option value="">— Non attribué —</option>
        ${DB.users.map((u) => `<option value="${u.id}" ${a.userId === u.id ? 'selected' : ''}>${esc(fullName(u))}</option>`).join('')}</select>`;
    } else if (a.userId === CURRENT_USER.id) {
      emp = `${esc(userLabel(a.userId))} <button class="btn btn-xs btn-ghost" type="button" onclick="releasePoste('${ev.id}',${i},function(){openEventDetail('${ev.id}')})">Se retirer</button>`;
    } else if (!a.userId) {
      emp = `<span class="muted">Non attribué</span> <button class="btn btn-xs btn-sun" type="button" onclick="claimPoste('${ev.id}',${i})">Prendre ce poste</button>`;
    } else emp = esc(userLabel(a.userId));
    return `<tr><td class="strong">${esc(a.poste)}</td><td>${emp}</td><td>${att ? statusBadge(att.statut) : '—'}</td><td>${esc((att && att.heureArrivee) || '—')}</td><td>${esc((att && att.heureDepart) || '—')}</td><td class="num">${att ? fmtDuration(att.heureArrivee, att.heureDepart) : '—'}</td></tr>`;
  }).join('');
  const src = posterSrc(ev);
  openModal(esc(ev.nom), `
    ${src ? `<a class="ev-poster" href="${esc(src)}" target="_blank" rel="noopener" title="Voir l'affiche en grand"><img src="${esc(src)}" alt="Affiche : ${esc(ev.nom)}"></a>` : ''}
    <p class="confirm-text" style="margin-bottom:14px">${fmtDate(ev.date)} · ${esc(ev.heureDebut || 'Heure à définir')}${ev.heureFin ? ' → ' + esc(ev.heureFin) : ''} · ${catBadge(eventCat(ev))} ${statusBadge(ev.statut)} ${isPublicEvent(ev) ? `<span class="badge nodot">${icon('globe', 'sm')}Affichée sur l'accueil</span>` : '<span class="badge nodot">Interne</span>'}</p>
    ${ev.descPublic ? `<p class="field-hint" style="margin-bottom:10px">Texte public : ${esc(ev.descPublic)}</p>` : ''}
    ${ev.description ? `<p class="field-hint" style="margin-bottom:14px">${esc(ev.description)}</p>` : ''}
    <div class="card inner table-card"><div class="table-scroll"><table class="tbl compact"><thead><tr><th>Poste</th><th>Employé</th><th>Statut</th><th>Arrivée</th><th>Départ</th><th class="num">Heures</th></tr></thead><tbody>${rows}</tbody></table></div></div>`,
    (canManageEvents() ? `<button class="btn btn-sm btn-danger" type="button" onclick="deleteEvent('${ev.id}')">${icon('trash', 'sm')}Supprimer</button><button class="btn btn-sm" type="button" onclick="openEditEventModal('${ev.id}')">${icon('edit', 'sm')}Modifier la soirée</button>` : '')
    + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>', { size: 'lg' });
}
/* Réunion / rendez-vous : liste des inscrits au lieu des postes */
function openOpenEventDetail(ev) {
  const manage = canManageEvents();
  const mine = ev.assignments.some((a) => a.userId === CURRENT_USER.id);
  const rows = ev.assignments.map((a, i) => {
    if (!a.userId) return '';
    const att = ensureAttendance(ev.id, a.userId, a.poste);
    const canRm = manage || a.userId === CURRENT_USER.id;
    return `<tr><td class="strong">${esc(userLabel(a.userId))}</td><td>${statusBadge(att.statut)}</td><td>${esc(att.heureArrivee || '—')}</td><td>${esc(att.heureDepart || '—')}</td><td class="num">${fmtDuration(att.heureArrivee, att.heureDepart)}</td>
      <td>${canRm ? `<button class="btn btn-xs btn-ghost" type="button" onclick="releasePoste('${ev.id}',${i},function(){openEventDetail('${ev.id}')})">${a.userId === CURRENT_USER.id ? 'Me désinscrire' : 'Retirer'}</button>` : ''}</td></tr>`;
  }).join('');
  const others = DB.users.filter((u) => u.statut === 'Actif' && !ev.assignments.some((a) => a.userId === u.id));
  const n = ev.assignments.filter((a) => a.userId).length;
  openModal(esc(ev.nom), `
    <p class="confirm-text" style="margin-bottom:10px">${fmtDate(ev.date)} · ${esc(ev.heureDebut || 'Heure à définir')}${ev.heureFin ? ' → ' + esc(ev.heureFin) : ''} · ${catBadge(eventCat(ev))} ${statusBadge(ev.statut)}</p>
    ${ev.description ? `<p class="field-hint" style="margin-bottom:12px">${esc(ev.description)}</p>` : ''}
    <div class="open-head"><b>${n} inscrit${n > 1 ? 's' : ''}</b><span class="muted">Inscription libre : pas de poste, chacun note son arrivée et son départ.</span>
      ${mine ? '' : `<button class="btn btn-sm btn-sun" type="button" onclick="claimPoste('${ev.id}',-1)">${icon('plus', 'sm')}S'inscrire</button>`}</div>
    ${n ? `<div class="card inner table-card"><div class="table-scroll"><table class="tbl compact"><thead><tr><th>Employé</th><th>Statut</th><th>Arrivée</th><th>Départ</th><th class="num">Heures</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>` : '<p class="muted" style="font-size:13.5px">Personne n\'est encore inscrit.</p>'}
    ${manage && others.length ? `<div class="field" style="margin-top:14px"><label for="addPart">Inscrire quelqu'un</label><select class="input" id="addPart" onchange="addParticipant('${ev.id}',this.value)"><option value="">— Choisir un membre —</option>${others.map((u) => `<option value="${u.id}">${esc(fullName(u))}</option>`).join('')}</select></div>` : ''}`,
    (manage ? `<button class="btn btn-sm btn-danger" type="button" onclick="deleteEvent('${ev.id}')">${icon('trash', 'sm')}Supprimer</button><button class="btn btn-sm" type="button" onclick="openEditEventModal('${ev.id}')">${icon('edit', 'sm')}Modifier</button>` : '')
    + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>', { size: 'lg' });
}
function assignEmployee(eventId, idx, userId) {
  const ev = DB.events.find((e) => e.id === eventId);
  ev.assignments[idx].userId = userId || null;
  if (userId) ensureAttendance(eventId, userId, ev.assignments[idx].poste);
  logActivity('Employé attribué', `${ev.assignments[idx].poste} → ${userLabel(userId)} (${ev.nom})`);
  toast('Attribution enregistrée.', 'success');
  refresh(); openEventDetail(eventId);
}
/* Prendre un poste (soirée) ou s'inscrire (réunion, rendez-vous : idx = -1) en indiquant son heure d'arrivée */
function claimPoste(eventId, idx) {
  const ev = DB.events.find((e) => e.id === eventId);
  if (!ev) return;
  const open = isOpenEvent(ev);
  if (open && ev.assignments.some((a) => a.userId === CURRENT_USER.id)) { toast('Vous êtes déjà inscrit.', 'error'); return; }
  if (!open && ev.assignments[idx].userId) { toast("Ce poste vient d'être pris par quelqu'un d'autre.", 'error'); return; }
  openModal(open ? "S'inscrire" : 'Prendre ce poste', `
    <p class="confirm-text" style="margin-bottom:12px"><b>${esc(ev.nom)}</b> · ${fmtDate(ev.date)}${open ? '' : ` · poste <b>${esc(ev.assignments[idx].poste)}</b>`}</p>
    <div class="field"><label for="suArr">Heure d'arrivée</label><input class="input" id="suArr" type="time" value="${esc(ev.heureDebut || '23:00')}"></div>
    <p class="field-hint">En fin de soirée, notez votre heure de départ sur votre carte dans « Mon planning » : vos heures sont comptées automatiquement (60 min = 1,00 h).</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="confirmSignup('${eventId}',${open ? -1 : idx})">${icon('check', 'sm')}Je m'inscris</button>`);
}
function confirmSignup(eventId, idx) {
  const ev = DB.events.find((e) => e.id === eventId);
  const arr = document.getElementById('suArr').value;
  if (!ev) return;
  if (!arr) { toast("Indiquez votre heure d'arrivée.", 'error'); return; }
  let a;
  if (idx < 0) {
    if (ev.assignments.some((x) => x.userId === CURRENT_USER.id)) { closeModal(); return; }
    a = { poste: 'Participant', userId: CURRENT_USER.id, heureArriveePrevue: arr, heureDepartPrevue: '' };
    ev.assignments.push(a);
  } else {
    a = ev.assignments[idx];
    if (a.userId) { toast("Ce poste vient d'être pris par quelqu'un d'autre.", 'error'); closeModal(); return; }
    a.userId = CURRENT_USER.id;
    a.heureArriveePrevue = arr;
  }
  const att = ensureAttendance(ev.id, CURRENT_USER.id, a.poste);
  Object.assign(att, { poste: a.poste, heureArrivee: arr, confirmation: true, statut: 'Présent' });
  logActivity(idx < 0 ? 'Inscription' : 'Poste pris', `${a.poste} — ${ev.nom} (arrivée ${arr})`);
  toast(`Inscription enregistrée : arrivée à ${arr}.`, 'success'); closeModal(); refresh();
}
/* Direction / comptabilité : inscrire quelqu'un à une réunion ou un rendez-vous */
function addParticipant(eventId, userId) {
  const ev = DB.events.find((e) => e.id === eventId);
  if (!ev || !userId || ev.assignments.some((a) => a.userId === userId)) return;
  ev.assignments.push({ poste: 'Participant', userId, heureArriveePrevue: ev.heureDebut || '', heureDepartPrevue: '' });
  ensureAttendance(eventId, userId, 'Participant');
  logActivity('Participant ajouté', `${userLabel(userId)} — ${ev.nom}`);
  toast('Participant ajouté.', 'success');
  refresh(); openEventDetail(eventId);
}
function releasePoste(eventId, idx, after) {
  const ev = DB.events.find((e) => e.id === eventId);
  const a = ev && ev.assignments[idx];
  if (!a || (a.userId !== CURRENT_USER.id && !canManageEvents())) return;
  const open = isOpenEvent(ev);
  confirmAction(open ? (a.userId === CURRENT_USER.id ? 'Voulez-vous vous désinscrire ?' : `Retirer ${esc(userLabel(a.userId))} de la liste ?`) : 'Voulez-vous vous retirer de ce poste ?', () => {
    const who = a.userId;
    if (open) ev.assignments.splice(idx, 1);
    else { a.userId = null; a.heureArriveePrevue = ''; }
    // le pointage non terminé part avec l'inscription (il ne compterait pas d'heures)
    DB.attendances = DB.attendances.filter((x) => !(x.eventId === ev.id && x.userId === who && !['À valider', 'Validé'].includes(x.statut)));
    logActivity(open ? 'Désinscription' : 'Poste libéré', `${a.poste} — ${ev.nom}`);
    toast(open ? 'Inscription retirée.' : 'Poste libéré.', 'success');
    refresh();
    if (after) after();
  }, open ? 'Retirer' : 'Me retirer');
}
function openCreateEventModal(prefillDate) {
  openModal('Créer un événement', `
    <div class="field"><label for="nEvNom">Nom</label><input class="input" id="nEvNom" placeholder="ex : Méfiez-vous des apparences, Réunion staff…"></div>
    <div class="grid-2">
      ${catField('grand')}
      <div class="field"><label for="nEvDate">Date</label><input class="input" id="nEvDate" type="date" value="${esc(prefillDate || '')}"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="nEvDebut">Heure de début</label><input class="input" id="nEvDebut" type="time" value="23:00"></div>
      <div class="field"><label for="nEvFin">Heure prévue de fin</label><input class="input" id="nEvFin" type="time"></div>
    </div>
    <div class="field"><label for="nEvDesc">Description interne</label><textarea class="input" id="nEvDesc"></textarea></div>
    ${posterField(null)}
    ${publicFields(true, '')}
    <p class="field-hint" id="evSlotsHint">${slotsHint('grand')}</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="createSoiree(this)">Créer</button>`);
}
/* Ne pas nommer « createEvent » : dans un onclick, ce nom désigne document.createEvent */
async function createSoiree(btn) {
  if (!requireFields(['nEvNom', 'nEvDate'], 'Indiquez le nom et la date.')) return;
  const nom = document.getElementById('nEvNom').value.trim();
  const ev = {
    id: uid('ev'), nom, date: document.getElementById('nEvDate').value, categorie: document.getElementById('evCat').value,
    heureDebut: document.getElementById('nEvDebut').value, heureFin: document.getElementById('nEvFin').value,
    description: document.getElementById('nEvDesc').value.trim(), statut: 'À venir',
    public: document.getElementById('evPublic').checked, descPublic: document.getElementById('evDescPublic').value.trim(),
    assignments: [],
  };
  if (!isOpenEvent(ev)) ev.assignments = defaultSlots();
  busyBtn(btn, 'Enregistrement…');
  await savePoster(ev);
  DB.events.push(ev);
  logActivity('Événement créé', `${nom} (${catLabel(ev.categorie)})`);
  toast('Événement créé.', 'success'); closeModal(); refresh();
}
function openEditEventModal(eventId) {
  const ev = DB.events.find((e) => e.id === eventId);
  openModal('Modifier l\'événement', `
    <div class="field"><label for="eEvNom">Nom</label><input class="input" id="eEvNom" value="${esc(ev.nom)}"></div>
    <div class="grid-2">
      ${catField(eventCat(ev))}
      <div class="field"><label for="eEvDate">Date</label><input class="input" id="eEvDate" type="date" value="${esc(ev.date)}"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="eEvDebut">Heure de début</label><input class="input" id="eEvDebut" type="time" value="${esc(ev.heureDebut)}"></div>
      <div class="field"><label for="eEvStatut">Statut</label><select class="input" id="eEvStatut">${['À venir', 'Terminée', 'Annulée'].map((s) => `<option ${ev.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="eEvDesc">Description interne</label><textarea class="input" id="eEvDesc">${esc(ev.description || '')}</textarea></div>
    ${posterField(ev)}
    ${publicFields(isPublicEvent(ev), ev.descPublic || '')}`,
    `<button class="btn btn-sm btn-ghost" type="button" onclick="openEventDetail('${eventId}')">Retour</button><button class="btn btn-sm btn-sun" type="button" onclick="saveEditEvent('${eventId}',this)">Enregistrer</button>`);
}
async function saveEditEvent(eventId, btn) {
  const ev = DB.events.find((e) => e.id === eventId);
  if (!requireFields(['eEvNom', 'eEvDate'], 'Indiquez le nom et la date.')) return;
  ev.nom = document.getElementById('eEvNom').value.trim();
  ev.date = document.getElementById('eEvDate').value;
  ev.categorie = document.getElementById('evCat').value;
  // Réunion / rendez-vous : on garde les personnes déjà inscrites, sans postes vides ; soirée : postes standards si aucun
  if (isOpenEvent(ev)) ev.assignments = ev.assignments.filter((a) => a.userId);
  else if (!ev.assignments.length) ev.assignments = defaultSlots();
  ev.heureDebut = document.getElementById('eEvDebut').value;
  ev.statut = document.getElementById('eEvStatut').value;
  ev.description = document.getElementById('eEvDesc').value.trim();
  ev.public = document.getElementById('evPublic').checked;
  ev.descPublic = document.getElementById('evDescPublic').value.trim();
  busyBtn(btn, 'Enregistrement…');
  await savePoster(ev);
  logActivity('Événement modifié', ev.nom);
  toast('Événement modifié.', 'success'); closeModal(); refresh();
}
function deleteEvent(eventId) {
  const ev = DB.events.find((e) => e.id === eventId);
  confirmAction(`Supprimer la soirée « ${esc(ev ? ev.nom : '')} » du ${fmtDate(ev ? ev.date : '')} ?`, () => {
    DB.events = DB.events.filter((e) => e.id !== eventId);
    DB.attendances = DB.attendances.filter((a) => a.eventId !== eventId);
    logActivity('Soirée supprimée', ev ? ev.nom : '');
    toast('Soirée supprimée.', 'success'); refresh();
  }, 'Supprimer');
}
