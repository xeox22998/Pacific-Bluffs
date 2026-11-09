/* =====================================================================
   PACIFIC BLUFFS — Équipe + Administration (Direction)
   ===================================================================== */

let adminTab = 'utilisateurs';

/* ================= ÉQUIPE ================= */
/* Droits sur les fiches :
   - Direction : toutes les fiches, rôle compris · Comptabilité : toutes les fiches, sauf le rôle
   - Manager, Gouvernement / Fisc : lisent toutes les fiches, modifient la leur
   - Employé : voit seulement sa fiche et ne modifie que ses pièces jointes */
const isEmploye = () => CURRENT_USER.role === ROLES.EMPLOYE;
function canViewProfile(u) { return u.id === CURRENT_USER.id || !isEmploye(); }
function canEditProfile(u) {
  const r = CURRENT_USER.role;
  return r === ROLES.DIRECTION || r === ROLES.SECRETAIRE || ((r === ROLES.MANAGER || r === ROLES.GOUVERNEMENT) && u.id === CURRENT_USER.id);
}
function canEditPieces(u) { return canEditProfile(u) || u.id === CURRENT_USER.id; }
function piecesCount(u) { return PIECES.filter((p) => (u.pieces && u.pieces[p.id]) || (u.piecesData && u.piecesData[p.id])).length; }

function renderEquipe() {
  const staff = DB.users.filter((u) => u.statut !== 'En attente' && canViewProfile(u));
  const mine = isEmploye();
  let html = pageHead('Équipe', mine ? 'Ma fiche' : 'Le personnel du Pacific Bluffs', mine
    ? 'Votre fiche au Pacific Bluffs : ajoutez vos pièces (permis, carte d\'identité, permis port d\'arme). Les fiches des autres membres ne sont visibles que par l\'encadrement.'
    : `${staff.length} compte${staff.length > 1 ? 's' : ''} · cliquez sur une personne pour voir sa fiche et ses pièces jointes.`);
  if (!staff.length) return html + emptyState('👥', 'Aucun compte', 'Les comptes apparaîtront ici dès leur création.');
  const order = [ROLES.DIRECTION, ROLES.SECRETAIRE, ROLES.MANAGER, ROLES.EMPLOYE, ROLES.GOUVERNEMENT];
  const users = [...staff].sort((a, b) => (b.id === CURRENT_USER.id) - (a.id === CURRENT_USER.id) || order.indexOf(a.role) - order.indexOf(b.role) || fullName(a).localeCompare(fullName(b)));
  html += `<div class="grid-cards stagger" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${users.map((u) => {
    const n = DB.attendances.filter((a) => a.userId === u.id).length;
    const k = piecesCount(u);
    return `<article class="emp card lift" tabindex="0" onclick="openEmployeeSheet('${u.id}')" onkeydown="if(event.key==='Enter')openEmployeeSheet('${u.id}')">
      ${avatarHtml(u, 'lg')}<b>${esc(fullName(u))}${u.id === CURRENT_USER.id ? ' <small class="muted">(moi)</small>' : ''}</b>
      <span class="badge ${u.statut === 'Actif' ? 'sun' : 'bad'}">${ROLE_LABEL[u.role]}${u.statut === 'Actif' ? '' : ' · désactivé'}</span>
      <span class="emp-pieces" title="Pièces jointes">${PIECES.map((p) => `<i class="${(u.pieces && u.pieces[p.id]) || (u.piecesData && u.piecesData[p.id]) ? 'on' : ''}" title="${esc(p.label)}">${p.icon}</i>`).join('')}<small>${k}/${PIECES.length}</small></span>
      <small style="margin-top:2px">${n} service${n > 1 ? 's' : ''}</small>
    </article>`;
  }).join('')}</div>`;
  return html;
}

/* ---------- Pièces jointes (images privées, chargées à la demande) ---------- */
const PIECE_CACHE = {};
async function pieceSrc(u, type) {
  if (u.piecesData && u.piecesData[type]) return u.piecesData[type];          // mode local
  const v = u.pieces && u.pieces[type];
  if (!v || !isShared()) return '';
  const key = `${u.id}:${type}:${v}`;
  if (!PIECE_CACHE[key]) {
    const r = await ClubApi.req(`piece/${encodeURIComponent(u.id)}/${type}`);
    PIECE_CACHE[key] = `data:${r.mime};base64,${r.data}`;
  }
  return PIECE_CACHE[key];
}
function piecesHtml(u) {
  const edit = canEditPieces(u);
  return `<div class="sub-h">Pièces jointes</div>
    <div class="pieces">${PIECES.map((p) => {
      const has = (u.pieces && u.pieces[p.id]) || (u.piecesData && u.piecesData[p.id]);
      return `<div class="piece ${has ? 'has' : ''}" data-piece="${p.id}">
        <button class="piece-prev" type="button" ${has ? `onclick="viewPiece('${u.id}','${p.id}')" aria-label="Voir : ${esc(p.label)}"` : 'disabled'}>
          ${has ? '<span class="piece-load">Chargement…</span>' : `<span class="piece-empty"><b>${p.icon}</b>Non fournie</span>`}
        </button>
        <div class="piece-meta"><b>${esc(p.label)}</b>
          ${edit ? `<div class="piece-actions">
            <label class="btn btn-xs">${icon('upload', 'sm')}${has ? 'Remplacer' : 'Ajouter'}<input type="file" accept="image/*" hidden onchange="uploadPiece('${u.id}','${p.id}',this)"></label>
            ${has ? `<button class="btn btn-xs btn-ghost" type="button" onclick="removePiece('${u.id}','${p.id}')">${icon('trash', 'sm')}</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}</div>
    ${edit ? '<p class="field-hint">Photo ou capture d\'écran (JPG, PNG). Visible par la personne concernée et par l\'encadrement (direction, comptabilité, managers, gouvernement).</p>' : ''}`;
}
/* Remplit les vignettes une fois la fiche ouverte */
function fillPieceThumbs(u) {
  PIECES.forEach(async (p) => {
    const box = document.querySelector(`.piece[data-piece="${p.id}"] .piece-prev`);
    if (!box || !box.querySelector('.piece-load')) return;
    try {
      const src = await pieceSrc(u, p.id);
      if (src && document.contains(box)) box.innerHTML = `<img src="${src}" alt="${esc(p.label)}">`;
    } catch (e) { if (document.contains(box)) box.innerHTML = `<span class="piece-empty">${e.status === 403 ? 'Accès réservé' : 'Indisponible'}</span>`; }
  });
}
async function viewPiece(userId, type) {
  const u = findUser(userId);
  const p = PIECES.find((x) => x.id === type);
  let src = '';
  try { src = await pieceSrc(u, type); } catch (e) { toast(e.message, 'error'); return; }
  if (!src) return;
  const box = document.createElement('div');
  box.className = 'piece-view';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', p.label + ' — ' + fullName(u));
  box.innerHTML = `<figure><img src="${src}" alt="${esc(p.label)}"><figcaption>${esc(p.label)} · ${esc(fullName(u))}</figcaption></figure><button class="icon-btn" type="button" aria-label="Fermer">${icon('x')}</button>`;
  const close = () => { box.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  box.addEventListener('click', close);
  addEventListener('keydown', onKey, true);
  document.body.appendChild(box);
}
async function uploadPiece(userId, type, input) {
  const file = input.files && input.files[0];
  input.value = '';
  const u = findUser(userId);
  if (!file || !u || !canEditPieces(u)) return;
  const label = PIECES.find((p) => p.id === type).label;
  let data;
  try { data = await readPosterFile(file); } catch (e) { toast(e.message, 'error'); return; }
  if (isShared()) {
    try {
      const r = await ClubApi.req('piece', { body: { userId, type, data } });
      u.pieces = { ...(u.pieces || {}), [type]: r.v };
      PIECE_CACHE[`${u.id}:${type}:${r.v}`] = data;
    } catch (e) { toast(e.message, 'error'); return; }
  } else {
    u.piecesData = { ...(u.piecesData || {}), [type]: data };
    logActivity('Pièce jointe ajoutée', `${label} — ${fullName(u)}`);
  }
  toast(label + ' enregistré(e).', 'success');
  refresh();
  openEmployeeSheet(userId);
}
function removePiece(userId, type) {
  const u = findUser(userId);
  if (!u || !canEditPieces(u)) return;
  const label = PIECES.find((p) => p.id === type).label;
  confirmAction(`Retirer « ${esc(label)} » de la fiche de ${esc(fullName(u))} ?`, async () => {
    if (isShared()) {
      try { await ClubApi.req('piece', { body: { userId, type, data: null } }); } catch (e) { toast(e.message, 'error'); return; }
      if (u.pieces) delete u.pieces[type];
    } else {
      if (u.piecesData) delete u.piecesData[type];
      logActivity('Pièce jointe retirée', `${label} — ${fullName(u)}`);
    }
    toast('Pièce retirée.', 'success');
    refresh();
    openEmployeeSheet(userId);
  }, 'Retirer');
}

function openEmployeeSheet(userId) {
  const u = findUser(userId);
  if (!u) return;
  if (!canViewProfile(u)) { toast('Vous ne pouvez voir que votre propre fiche.', 'error'); return; }
  const myAtt = DB.attendances.filter((a) => a.userId === userId);
  const upcoming = myUpcomingAssignments(userId, 5);
  const totalMin = myAtt.reduce((s, a) => s + (durationMinutes(a.heureArrivee, a.heureDepart) || 0), 0);
  const canSeeSalary = canSeeFinance() || userId === CURRENT_USER.id;
  const name = fullName(u).toLowerCase();
  const salaries = [];
  if (canSeeSalary) DB.accountingWeeks.forEach((w) => (w.salaries || []).forEach((s) => {
    if (s.nom && s.nom.trim().toLowerCase() === name) salaries.push({ numero: w.numero, montant: s.montant, date: s.dateVersement });
  }));
  salaries.sort((a, b) => a.numero - b.numero);
  openModal(esc(fullName(u)), `
    <div class="sheet-h">${avatarHtml(u, 'lg')}<div><div class="confirm-text"><b>${ROLE_LABEL[u.role]}</b></div><div class="muted" style="font-size:13.5px">${esc(u.statut)}${(isDirection() || CURRENT_USER.role === ROLES.SECRETAIRE || u.id === CURRENT_USER.id) ? ` · identifiant <b>${esc(u.username)}</b>` : ''}${canEditProfile(u) ? '' : ' · lecture seule'}</div></div></div>
    <div class="emp-stats">
      <div><b>${myAtt.length}</b><span>Services</span></div>
      <div><b>${fmtHours(totalMin)}</b><span>Heures</span></div>
      <div><b>${myAtt.filter((a) => a.statut === 'Validé').length}</b><span>Validées</span></div>
    </div>
    ${piecesHtml(u)}
    ${canSeeSalary && salaries.length ? `<div class="sub-h">Salaires versés</div>${salaries.map((s) => `<div class="line-item"><span>Semaine ${s.numero}${s.date ? ' · ' + fmtDateShort(s.date) : ''}</span><b>${fmtMoney(s.montant)}</b></div>`).join('')}` : ''}
    <div class="sub-h">Planning à venir</div>
    ${upcoming.length ? upcoming.map((x) => `<div class="line-item"><span>${fmtDate(x.event.date)} — ${esc(x.event.nom)}</span><span class="muted">${esc(x.assignment.poste)}</span></div>`).join('') : '<p class="muted" style="font-size:13.5px">Aucun service à venir.</p>'}`,
    (canEditProfile(u) ? `<button class="btn btn-sm" type="button" onclick="openEditUserModal('${u.id}')">${icon('edit', 'sm')}Modifier la fiche</button>` : '') + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>');
  fillPieceThumbs(u);
}

/* ================= ADMINISTRATION ================= */
function renderAdministration() {
  if (!isDirection()) return emptyState('🔒', 'Accès restreint', 'Cette section est réservée à la direction.');
  const tabs = [['utilisateurs', 'Utilisateurs', 'users'], ['postes', 'Postes', 'briefcase'], ['permissions', 'Permissions', 'shield'], ['journal', "Journal d'activité", 'list'], ['sauvegarde', 'Sauvegarde', 'database']];
  let html = pageHead('Administration', 'Gestion du système', 'Comptes, postes des soirées, droits, journal et sauvegarde des données.');
  html += `<div class="tabs" id="adminTabs"><span class="tab-ind"></span>${tabs.map(([k, l, ic]) => `<button type="button" class="${adminTab === k ? 'is-active' : ''}" onclick="setAdminTab('${k}')">${icon(ic, 'sm')}${l}</button>`).join('')}</div>`;

  if (adminTab === 'utilisateurs') {
    const pending = DB.users.filter((u) => u.statut === 'En attente');
    const active = DB.users.filter((u) => u.statut !== 'En attente');
    if (pending.length) {
      html += `${sectionHead('Comptes en attente de validation', pending.length)}<div class="grid-cards stagger" style="margin-bottom:30px">${pending.map((u) => `
        <div class="card pending-card">
          <div class="sheet-h">${avatarHtml(u)}<div><b>${esc(fullName(u))}</b><div class="muted" style="font-size:12.5px">${esc(u.username)} · demandé le ${fmtDateShort(u.dateCreation)}</div></div></div>
          <div class="field"><label for="pr_${u.id}">Grade à attribuer (demandé : ${ROLE_LABEL[u.roleDemande || u.role] || '—'})</label><select class="input" id="pr_${u.id}">${roleOptions(u.roleDemande || u.role)}</select></div>
          <div style="display:flex;gap:8px"><button class="btn btn-sm btn-sun" type="button" onclick="approveUser('${u.id}')">${icon('check', 'sm')}Valider</button><button class="btn btn-sm btn-danger" type="button" onclick="deleteUser('${u.id}')">Refuser</button></div>
        </div>`).join('')}</div>`;
    }
    html += `<div class="section-h"><span class="muted">${active.length} compte(s)</span><button class="btn btn-sm btn-sun" type="button" onclick="openCreateUserModal()">${icon('plus', 'sm')}Créer un utilisateur</button></div>`;
    html += active.length ? `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Pièces</th><th>Statut</th><th>Créé le</th><th></th></tr></thead><tbody>
      ${active.map((u) => `<tr>
        <td><span style="display:inline-flex;align-items:center;gap:10px">${avatarHtml(u, 'sm')}<b>${esc(fullName(u))}</b></span></td>
        <td><code>${esc(u.username)}</code></td><td>${ROLE_LABEL[u.role]}</td><td>${piecesCount(u)}/${PIECES.length}</td>
        <td>${u.statut === 'Actif' ? '<span class="badge good">Actif</span>' : '<span class="badge bad">Désactivé</span>'}</td>
        <td>${fmtDateShort(u.dateCreation)}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-xs" type="button" onclick="openEditUserModal('${u.id}')">${icon('edit', 'sm')}Modifier</button>
          <button class="btn btn-xs" type="button" onclick="toggleUserStatus('${u.id}')">${u.statut === 'Actif' ? 'Désactiver' : 'Réactiver'}</button>
          <button class="icon-btn xs" type="button" onclick="deleteUser('${u.id}')" aria-label="Supprimer">${icon('trash', 'sm')}</button>
        </div></td></tr>`).join('')}
    </tbody></table></div></div>` : emptyState('👥', 'Aucun compte', 'Créez un premier utilisateur.');
  } else if (adminTab === 'postes') {
    html += `<div class="section-h"><span class="muted">Postes ajoutés automatiquement à chaque nouvelle soirée</span><button class="btn btn-sm btn-sun" type="button" onclick="openAddPosteModal()">${icon('plus', 'sm')}Ajouter un poste</button></div>`;
    html += `<div class="grid-cards stagger" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${DB.postes.map((p, i) => `<div class="card lift" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 14px 14px 20px">
      <span style="display:flex;align-items:center;gap:10px"><span class="badge nodot">${i + 1}</span><b style="font-weight:500">${esc(p)}</b></span>
      <button class="icon-btn xs" type="button" onclick="removePoste(${i})" aria-label="Supprimer le poste">${icon('trash', 'sm')}</button></div>`).join('')}</div>`;
  } else if (adminTab === 'permissions') {
    const Y = `<span class="yes">${icon('check', 'sm')}</span>`, N = '<span class="no">—</span>';
    const rows = [
      ['Voir son planning', Y, Y, Y, N, Y], ['Déclarer sa présence', Y, Y, Y, N, Y], ['Valider une présence', N, Y, N, N, Y],
      ['Remplir les montants de la compta', Y, Y, Y, N, Y], ['Consulter la comptabilité (tableau de bord)', N, N, Y, 'Lecture', Y],
      ['Modifier la structure de la compta', N, N, Y, N, Y], ['Ajouter des documents', N, Y, Y, Y, Y],
      ['Créer, modifier et supprimer une soirée', N, N, Y, N, Y], ['Accepter ou refuser une privatisation', N, 'Lecture', Y, N, Y],
      ['Modifier la carte (affichée sur l\'accueil)', N, N, N, N, Y], ['Gérer et valider les comptes', N, N, N, N, Y],
      ['Voir les fiches de l\'équipe', 'La sienne', Y, Y, 'Lecture', Y], ['Modifier les fiches (nom, pièces jointes)', 'Ses pièces jointes', 'La sienne', 'Toutes', 'La sienne', 'Toutes'],
      ['Changer le rôle d\'un compte', N, N, N, N, Y],
    ];
    html += `<div class="card table-card"><div class="table-scroll"><table class="tbl perm"><thead><tr><th>Fonctionnalité</th><th>Employé</th><th>Manager</th><th>Comptabilité</th><th>Gouv. / Fisc</th><th>Direction</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${r.map((c, i) => `<td>${i ? c : `<b style="font-weight:500">${c}</b>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  } else if (adminTab === 'journal') {
    html += `<div class="section-h"><span class="muted">${DB.activityLogs.length} entrée(s) — 500 maximum</span></div><div class="card log">${logRows(DB.activityLogs)}</div>`;
  } else if (adminTab === 'sauvegarde') {
    const shared = isShared();
    html += `<div class="hint">${icon(shared ? 'cloud' : 'database', 'sm')}<span>${shared
      ? 'Les données sont enregistrées <b>en ligne, dans la base partagée</b> du site. Exportez de temps en temps une sauvegarde pour la garder en lieu sûr (elle contient les empreintes des mots de passe : ne la partagez pas).'
      : 'Mode local : les données sont enregistrées <b>dans ce navigateur</b>. Exportez régulièrement une sauvegarde ; une fois le site en ligne avec sa base partagée, importez-la pour tout retrouver.'}</span></div>
    <div class="backup stagger">
      <div class="card lift"><span class="b-ic">${icon('download')}</span><h3>Exporter une sauvegarde</h3><p>Télécharge toute la base (comptes, soirées, présences, comptabilité, documents, privatisations, carte) dans un fichier .json.</p><button class="btn btn-sm btn-sun" type="button" onclick="exportBackup()">Télécharger la sauvegarde</button></div>
      <div class="card lift"><span class="b-ic">${icon('upload')}</span><h3>Importer une sauvegarde</h3><p>Remplace ${shared ? 'toute la base partagée' : 'les données de ce navigateur'} par un fichier .json exporté depuis ce site. Votre compte reste actif.</p><label class="btn btn-sm">Choisir un fichier<input type="file" accept=".json,application/json" hidden onchange="importBackup(this)"></label></div>
      <div class="card lift"><span class="b-ic">${icon('refresh')}</span><h3>Réinitialiser</h3><p>Efface toutes les données ${shared ? 'de la base partagée (sauf votre compte)' : 'de ce navigateur'} et recharge le jeu initial (semaine comptable 1, carte, programme).</p><button class="btn btn-sm btn-danger" type="button" onclick="resetData()">Réinitialiser les données</button></div>
    </div>`;
  }
  return html;
}
function setAdminTab(k) { adminTab = k; renderPage(false); }
function placeTabIndicator() {
  const box = document.getElementById('adminTabs');
  if (!box) return;
  const on = box.querySelector('button.is-active');
  const ind = box.querySelector('.tab-ind');
  if (on && ind) { ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px'; }
}

function roleOptions(sel) { return Object.keys(ROLES).map((r) => `<option value="${r}" ${sel === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join(''); }

function openCreateUserModal() {
  openModal('Créer un utilisateur', `
    <div class="grid-2">
      <div class="field"><label for="cuPrenom">Prénom</label><input class="input" id="cuPrenom"></div>
      <div class="field"><label for="cuNom">Nom RP</label><input class="input" id="cuNom" placeholder="/ si inconnu"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="cuUser">Identifiant</label><input class="input" id="cuUser" placeholder="prenom.nom" autocapitalize="off"></div>
      <div class="field"><label for="cuPass">Mot de passe provisoire</label><input class="input" id="cuPass" type="text" placeholder="à communiquer à la personne"></div>
    </div>
    <div class="field"><label for="cuRole">Rôle</label><select class="input" id="cuRole">${roleOptions(ROLES.EMPLOYE)}</select></div>
    <p class="field-hint">Les postes (barman, sécurité…) se choisissent sur chaque soirée, dans le Programme.</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="createUser()">Créer le compte</button>`);
}
async function createUser() {
  const username = document.getElementById('cuUser').value.trim().toLowerCase();
  const prenom = document.getElementById('cuPrenom').value.trim();
  const pass = document.getElementById('cuPass').value;
  if (!prenom || !username) { toast('Le prénom et l\'identifiant sont obligatoires.', 'error'); return; }
  if (!pass) { toast('Choisissez un mot de passe provisoire.', 'error'); return; }
  if (DB.users.some((u) => u.username.toLowerCase() === username)) { toast('Cet identifiant est déjà utilisé.', 'error'); return; }
  if (isShared()) {
    try {
      await syncNow();
      await ClubApi.req('users', { body: { prenom, nom: document.getElementById('cuNom').value.trim(), username, password: pass,
        role: document.getElementById('cuRole').value } });
      await loadRemote();
    } catch (e) { toast(e.message, 'error'); return; }
    toast('Utilisateur créé.', 'success'); closeModal(); renderPage(false);
    return;
  }
  const u = {
    id: uid('u'), username, passHash: await hashPassword(username, pass), prenom, nom: document.getElementById('cuNom').value.trim() || '/',
    role: document.getElementById('cuRole').value, statut: 'Actif', dateCreation: todayISO(),
  };
  DB.users.push(u);
  logActivity('Utilisateur créé', fullName(u));
  toast('Utilisateur créé.', 'success'); closeModal(); refresh();
}
/* Modifier une fiche : nom et prénom (selon les droits), rôle et mot de passe (direction seulement) */
function openEditUserModal(userId) {
  const u = findUser(userId);
  if (!u || !canEditProfile(u)) { toast('Vous ne pouvez pas modifier cette fiche.', 'error'); return; }
  const dir = isDirection();
  openModal(u.id === CURRENT_USER.id ? 'Modifier ma fiche' : 'Modifier la fiche', `
    <div class="grid-2">
      <div class="field"><label for="euPrenom">Prénom</label><input class="input" id="euPrenom" value="${esc(u.prenom)}"></div>
      <div class="field"><label for="euNom">Nom RP</label><input class="input" id="euNom" value="${esc(u.nom)}"></div>
    </div>
    ${dir ? `<div class="field"><label for="euRole">Rôle</label><select class="input" id="euRole">${roleOptions(u.role)}</select></div>
      <div class="field"><label for="euPass">Nouveau mot de passe (laisser vide pour ne pas changer)</label><input class="input" id="euPass" type="text"></div>`
      : `<p class="field-hint">Rôle : <b>${ROLE_LABEL[u.role]}</b> — seule la direction peut le changer. Les pièces jointes se gèrent directement sur la fiche.</p>`}`,
    `<button class="btn btn-sm btn-ghost" type="button" onclick="openEmployeeSheet('${userId}')">Retour</button><button class="btn btn-sm btn-sun" type="button" onclick="saveEditUser('${userId}')">Enregistrer</button>`);
}
async function saveEditUser(userId) {
  const u = findUser(userId);
  if (!u || !canEditProfile(u)) return;
  const prenom = document.getElementById('euPrenom').value.trim();
  if (!prenom) { toast('Le prénom est obligatoire.', 'error'); return; }
  const roleEl = document.getElementById('euRole');
  const newRole = isDirection() && roleEl ? roleEl.value : u.role;
  if (u.id === CURRENT_USER.id && newRole !== ROLES.DIRECTION && u.role === ROLES.DIRECTION && !DB.users.some((x) => x.id !== u.id && x.role === ROLES.DIRECTION && x.statut === 'Actif')) {
    toast('Impossible : vous êtes la seule personne de la direction.', 'error'); return;
  }
  u.prenom = prenom;
  u.nom = document.getElementById('euNom').value.trim() || '/';
  u.role = newRole;
  const passEl = document.getElementById('euPass');
  const np = passEl ? passEl.value : '';
  if (np && isShared()) {
    try { await ClubApi.req('password', { body: { userId: u.id, newPassword: np } }); }
    catch (e) { toast(e.message, 'error'); return; }
  } else if (np) { u.passHash = await hashPassword(u.username, np); delete u.password; }
  logActivity('Utilisateur modifié', fullName(u));
  toast('Utilisateur modifié.', 'success'); closeModal(); renderShell(); refresh();
}
function approveUser(userId) {
  const u = findUser(userId);
  if (!u) return;
  const sel = document.getElementById('pr_' + userId);
  u.role = sel ? sel.value : (u.roleDemande || u.role);
  u.statut = 'Actif';
  logActivity('Compte validé', `${fullName(u)} — ${ROLE_LABEL[u.role]}`);
  toast(`Compte de ${fullName(u)} validé.`, 'success');
  renderShell();
  refresh();
}
function toggleUserStatus(userId) {
  const u = findUser(userId);
  if (u.id === CURRENT_USER.id) { toast('Vous ne pouvez pas désactiver votre propre compte.', 'error'); return; }
  confirmAction(`Voulez-vous ${u.statut === 'Actif' ? 'désactiver' : 'réactiver'} le compte de ${esc(fullName(u))} ?`, () => {
    u.statut = u.statut === 'Actif' ? 'Désactivé' : 'Actif';
    logActivity('Statut utilisateur modifié', fullName(u) + ' → ' + u.statut);
    toast('Statut mis à jour.', 'success'); refresh();
  });
}
function deleteUser(userId) {
  const u = findUser(userId);
  if (!u) return;
  if (u.id === CURRENT_USER.id) { toast('Vous ne pouvez pas supprimer votre propre compte.', 'error'); return; }
  confirmAction(`Supprimer définitivement le compte de ${esc(fullName(u))} ?`, () => {
    DB.events.forEach((ev) => ev.assignments.forEach((a) => { if (a.userId === userId) a.userId = null; }));
    DB.users = DB.users.filter((x) => x.id !== userId);
    logActivity('Utilisateur supprimé', fullName(u));
    toast('Compte supprimé.', 'success'); refresh();
  }, 'Supprimer');
}
function openAddPosteModal() {
  openModal('Ajouter un poste', `<div class="field"><label for="npNom">Nom du poste</label><input class="input" id="npNom" placeholder="ex : Voiturier, DJ, Vestiaire…"></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="addPoste()">Ajouter</button>`);
}
function addPoste() {
  const nom = document.getElementById('npNom').value.trim();
  if (!nom) return;
  if (DB.postes.includes(nom)) { toast('Ce poste existe déjà.', 'error'); return; }
  DB.postes.push(nom);
  logActivity('Poste créé', nom);
  toast('Poste ajouté.', 'success'); closeModal(); refresh();
}
function removePoste(idx) {
  const nom = DB.postes[idx];
  confirmAction(`Supprimer le poste « ${esc(nom)} » ? Il restera visible sur les soirées existantes.`, () => {
    DB.postes.splice(idx, 1);
    logActivity('Poste supprimé', nom);
    toast('Poste supprimé.', 'success'); refresh();
  }, 'Supprimer');
}

/* ---------- Sauvegarde ---------- */
async function exportBackup() {
  let content = DB;
  if (isShared()) {
    try { await syncNow(); content = (await ClubApi.req('export')).data; }
    catch (e) { toast(e.message, 'error'); return; }
  }
  downloadFile(`pacific-bluffs-sauvegarde-${todayISO()}.json`, JSON.stringify(content, null, 2), 'application/json');
  logActivity('Sauvegarde exportée', todayISO());
  toast('Sauvegarde téléchargée.', 'success');
}
function importBackup(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { toast("Ce fichier n'est pas une sauvegarde valide.", 'error'); return; }
    if (data && data.data && Array.isArray(data.data.users)) data = data.data; // export de la base partagée
    if (!data || !Array.isArray(data.users) || !Array.isArray(data.accountingWeeks)) { toast("Ce fichier n'est pas une sauvegarde du Pacific Bluffs.", 'error'); return; }
    confirmAction(`Remplacer ${isShared() ? 'toute la base partagée' : 'les données de ce navigateur'} par la sauvegarde (${data.users.length} compte(s), ${data.accountingWeeks.length} semaine(s) comptable(s)) ?`, async () => {
      if (isShared()) {
        try {
          await ClubApi.req('import', { body: { data } });
          await loadRemote();
        } catch (e) { toast(e.message, 'error'); return; }
        toast('Sauvegarde importée dans la base partagée.', 'success'); renderShell(); renderPage(true);
        return;
      }
      const me = CURRENT_USER && CURRENT_USER.username;
      DB = data;
      const seed = seedData();
      Object.keys(seed).forEach((k) => { if (!(k in DB)) DB[k] = seed[k]; });
      saveDB();
      const again = DB.users.find((u) => u.username === me);
      if (!again) { toast('Sauvegarde importée. Reconnectez-vous avec un compte de cette sauvegarde.', 'success'); doLogout(true); return; }
      CURRENT_USER = again;
      logActivity('Sauvegarde importée', file.name);
      toast('Sauvegarde importée.', 'success'); renderShell(); renderPage(true);
    }, 'Importer');
  };
  reader.readAsText(file);
}
function resetData() {
  confirmAction(`Effacer toutes les données ${isShared() ? 'de la base partagée (votre compte est conservé)' : 'de ce navigateur'} et revenir au jeu initial ? Pensez à exporter une sauvegarde avant.`, async () => {
    if (isShared()) {
      try {
        await ClubApi.req('reset', { body: {} });
        await startShared(null, false);
      } catch (e) { toast(e.message, 'error'); return; }
      toast('Base partagée réinitialisée.', 'success');
      return;
    }
    DB = seedData();
    saveDB();
    toast('Données réinitialisées.', 'success');
    doLogout(true);
  }, 'Tout effacer');
}
