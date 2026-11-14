/* =====================================================================
   PACIFIC BLUFFS — Espace staff : connexion, navigation, recherche, démarrage
   ===================================================================== */

const PAGES = {
  dashboard: () => renderDashboard(), planning: () => renderPlanning(), ventes: () => renderVentes(), presences: () => renderPresences(),
  programme: () => renderProgramme(), privatisations: () => renderPrivatisations(), comptabilite: () => renderComptabilite(),
  carte: () => renderCarte(), documents: () => renderDocuments(), equipe: () => renderEquipe(), administration: () => renderAdministration(),
};
const $id = (id) => document.getElementById(id);

/* ================= CONNEXION ================= */
let REG_ROLE = null;

function showMsg(boxId, text, ok) {
  $id(boxId).innerHTML = text ? `<div class="msg ${ok ? 'ok' : 'err'}">${icon(ok ? 'check' : 'x', 'sm')}<span>${text}</span></div>` : '';
}
function shakeCard() {
  const c = $id('loginCard');
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
}
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Patientez…'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

async function doLogin(e) {
  if (e) e.preventDefault();
  const username = $id('loginUser').value.trim().toLowerCase();
  const pass = $id('loginPass').value;
  showMsg('loginMsg', '');
  if (!username || !pass) { showMsg('loginMsg', 'Indiquez votre identifiant et votre mot de passe.'); shakeCard(); return; }
  const btn = document.querySelector('#loginForm button[type=submit]');

  if (isShared()) {
    setBusy(btn, true, 'Connexion…');
    try {
      const r = await ClubApi.req('login', { body: { username, password: pass } });
      ClubApi.setToken(r.token);
      await startShared(r.user, true);
    } catch (err) {
      showMsg('loginMsg', esc(err.message));
      shakeCard();
    } finally { setBusy(btn, false); }
    return;
  }

  const user = DB.users.find((x) => x.username.toLowerCase() === username);
  if (!user) { showMsg('loginMsg', 'Identifiant introuvable. Créez votre compte ci-dessous.'); shakeCard(); return; }
  if (!(await checkPassword(user, pass))) { showMsg('loginMsg', 'Mot de passe incorrect.'); shakeCard(); return; }
  if (user.statut === 'Désactivé') { showMsg('loginMsg', 'Ce compte a été désactivé. Contactez la direction.'); shakeCard(); return; }
  CURRENT_USER = user;
  try { sessionStorage.setItem(SESSION_KEY, user.id); } catch (err) { /* navigation privée */ }
  logActivity('Connexion', fullName(user));
  enterApp(true);
}

/* Base partagée : charge les données, initialise la base au tout premier lancement */
async function startShared(me, animated) {
  let r = await loadRemote();
  if (!r.initialized && r.me.role === ROLES.DIRECTION) {
    const s = seedData();
    await ClubApi.req('bootstrap', { body: { events: s.events, accountingWeeks: s.accountingWeeks, postes: s.postes, menu: s.menu } });
    r = await loadRemote();
  }
  CURRENT_USER = DB.users.find((u) => u.id === r.me.id);
  if (!CURRENT_USER) { CURRENT_USER = r.me; DB.users.push(r.me); takeSnapshot(); }
  setSyncState('ok');
  enterApp(animated);
}

function renderRoleGrid() {
  $id('roleGrid').innerHTML = ROLE_ORDER.map((r) => `<button type="button" class="role-opt ${REG_ROLE === r ? 'is-on' : ''}" onclick="selectRegRole('${r}')" aria-pressed="${REG_ROLE === r}"><b>${ROLE_LABEL[r]}</b><span>${ROLE_DESC[r]}</span></button>`).join('');
}
function selectRegRole(r) { REG_ROLE = r; renderRoleGrid(); }
function toggleRegister() {
  const p = $id('registerPanel');
  const open = !p.classList.contains('is-open');
  p.classList.toggle('is-open', open);
  $id('toggleRegister').textContent = open ? 'Annuler' : 'Créer mon compte';
  if (open) { renderRoleGrid(); setTimeout(() => $id('regPrenom').focus(), 250); }
}
async function doRegister() {
  showMsg('registerMsg', '');
  const prenom = $id('regPrenom').value.trim();
  const nom = $id('regNom').value.trim() || '/';
  const username = $id('regUser').value.trim().toLowerCase();
  const pass = $id('regPass').value;
  if (!prenom || !username || !pass) { showMsg('registerMsg', "Le prénom, l'identifiant et le mot de passe sont obligatoires."); return; }
  if (/\s/.test(username)) { showMsg('registerMsg', "L'identifiant ne doit pas contenir d'espace (ex : prenom.nom)."); return; }
  if (pass.length < 4) { showMsg('registerMsg', "Choisissez un mot de passe d'au moins 4 caractères."); return; }
  if (!REG_ROLE) { showMsg('registerMsg', 'Choisissez votre grade en cliquant dessus.'); return; }
  const btn = $id('registerBtn');
  let okMsg;

  if (isShared()) {
    setBusy(btn, true, 'Création…');
    try {
      const r = await ClubApi.req('register', { body: { prenom, nom, username, password: pass, role: REG_ROLE } });
      okMsg = r.first
        ? `Premier compte créé avec l'accès <b>Direction</b>. Connectez-vous avec « ${esc(username)} ».`
        : `Demande envoyée ! La direction doit valider votre compte « ${esc(username)} » avant votre première connexion.`;
    } catch (err) {
      showMsg('registerMsg', esc(err.message));
      return;
    } finally { setBusy(btn, false); }
  } else {
    if (DB.users.some((u) => u.username.toLowerCase() === username)) { showMsg('registerMsg', 'Cet identifiant est déjà utilisé. Choisissez-en un autre.'); return; }
    const user = { id: uid('u'), username, passHash: await hashPassword(username, pass), prenom, nom, role: REG_ROLE, statut: 'Actif', dateCreation: todayISO() };
    DB.users.push(user);
    CURRENT_USER = user;
    logActivity('Compte créé', fullName(user));
    CURRENT_USER = null;
    saveDB();
    okMsg = `Compte créé. Connectez-vous avec « ${esc(username)} » et votre mot de passe.`;
  }
  ['regPrenom', 'regNom', 'regUser', 'regPass'].forEach((id) => { $id(id).value = ''; });
  REG_ROLE = null;
  toggleRegister();
  $id('loginUser').value = username;
  $id('loginPass').value = '';
  $id('loginPass').focus();
  showMsg('loginMsg', okMsg, true);
}
function doLogout(silent) {
  if (isShared()) {
    if (ClubApi.token && !silent) ClubApi.req('logout', { body: {} }).catch(() => {});
    ClubApi.setToken(null);
  } else if (CURRENT_USER && !silent) logActivity('Déconnexion', fullName(CURRENT_USER));
  CURRENT_USER = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* navigation privée */ }
  if (isShared()) { DB = null; SNAP = null; }
  closeModal(true);
  $id('app').hidden = true;
  const login = $id('login');
  login.hidden = false;
  login.classList.remove('is-leaving');
  $id('loginUser').value = '';
  $id('loginPass').value = '';
  showMsg('loginMsg', '');
  scrollTo(0, 0);
}

/* ================= COQUE ================= */
function enterApp(animated) {
  const login = $id('login');
  const go = () => {
    login.hidden = true;
    const app = $id('app');
    app.hidden = false;
    app.classList.toggle('is-entering', !!animated);
    // tout le monde arrive sur le premier onglet, le tableau de bord (connexion comme actualisation)
    CURRENT_PAGE = 'dashboard';
    try { sessionStorage.removeItem('pacific:page'); } catch (e) { /* ancienne page mémorisée */ }
    upgradePostes();                                         // plus de danseuses : agent d'accueil / animateur
    autoClassicSoirees();                                    // les prochains mois sont toujours remplis
    upgradeCarte();                                          // nouvelle carte : remplace l'ancienne enregistrée
    upgradeTaux();                                           // encadrement à 35 % + salaires max (mode local ; le serveur le fait en base partagée)
    syncAllRdv();                                            // privatisations datées → soirées privées au planning
    renderShell();
    renderPage(true);
    startClock();
  };
  if (animated && !Motion.RM) { login.classList.add('is-leaving'); setTimeout(go, 520); } else go();
}
function navAllowed(key) { const n = NAV_ITEMS.find((x) => x.key === key); return !!n && can(n.roles); }
function badgeFor(key) {
  if (!CURRENT_USER || !DB) return 0;
  if (key === 'presences' && isMgmt()) return DB.attendances.filter((a) => a.statut === 'À valider').length;
  if (key === 'planning') return myUpcomingAssignments(CURRENT_USER.id).filter(({ event }) => {
    const a = attendanceFor(event.id, CURRENT_USER.id);
    // heure d'arrivée à indiquer, ou départ oublié après la soirée
    return !a || a.statut === 'À confirmer' || !a.heureArrivee || (event.date < todayISO() && ['Présent', 'Arrivé'].includes(a.statut));
  }).length;
  if (key === 'privatisations' && canHandleRdv()) return DB.rdv.filter((r) => r.statut === 'Nouvelle').length;
  if (key === 'administration' && isDirection()) return DB.users.filter((u) => u.statut === 'En attente').length;
  return 0;
}
const TAB_SHORT = { 'Tableau de bord': 'Accueil', 'Mon planning': 'Planning', 'Administration': 'Admin', 'Comptabilité': 'Compta', 'Privatisations': 'Privés' };
function renderShell() {
  const items = NAV_ITEMS.filter((it) => can(it.roles));
  $id('railNav').innerHTML = '<span class="rail-ind" id="railInd"></span>' + items.map((it) => {
    const b = badgeFor(it.key);
    return `<button class="rail-item ${CURRENT_PAGE === it.key ? 'is-active' : ''}" type="button" data-page="${it.key}" onclick="goPage('${it.key}')" aria-label="${it.label}">
      <span class="rail-ic">${icon(it.icon)}${b ? `<span class="rail-badge">${b}</span>` : ''}</span><span class="rail-lbl">${it.label}</span></button>`;
  }).join('');
  $id('tabbar').innerHTML = items.map((it) => {
    const b = badgeFor(it.key);
    return `<button type="button" class="${CURRENT_PAGE === it.key ? 'is-active' : ''}" data-page="${it.key}" onclick="goPage('${it.key}')">${icon(it.icon)}<span>${TAB_SHORT[it.label] || it.label}</span>${b ? `<span class="rail-badge">${b}</span>` : ''}</button>`;
  }).join('');
  const u = CURRENT_USER;
  $id('userChip').innerHTML = `${avatarHtml(u)}<span class="uc-txt"><b>${esc(fullName(u))}</b><small>${esc(roleLabel(u))}</small></span>`;
  setSyncState(isShared() ? (hasPendingChanges() ? 'saving' : 'ok') : 'local');
  requestAnimationFrame(placeRailIndicator);
}
function placeRailIndicator() {
  const nav = $id('railNav');
  const ind = $id('railInd');
  const on = nav && nav.querySelector('.rail-item.is-active');
  if (!ind) return;
  if (!on) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.transform = `translateY(${on.offsetTop}px)`;
}
function goPage(key) {
  if (!navAllowed(key)) key = 'dashboard';
  closeModal(true);
  hideSearch();
  CURRENT_PAGE = key;
  document.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('is-active', b.dataset.page === key));
  placeRailIndicator();
  const tb = document.querySelector('.tabbar button.is-active');
  if (tb) tb.scrollIntoView({ inline: 'center', block: 'nearest', behavior: Motion.RM ? 'auto' : 'smooth' });
  renderPage(true);
}

/* ================= RENDU ================= */
/* animate : transition de page complète · calAnim : seules les cases du calendrier s'animent */
function renderPage(animate, calAnim) {
  const page = $id('page');
  if (!CURRENT_USER || !DB) return;
  if (!navAllowed(CURRENT_PAGE)) CURRENT_PAGE = 'dashboard';
  Charts.hideTip();
  const draw = () => {
    const y = scrollY;
    page.innerHTML = (PAGES[CURRENT_PAGE] || PAGES.dashboard)();
    page.classList.toggle('page-enter', !!animate);
    [...page.children].forEach((c, i) => c.style.setProperty('--i', i));
    page.querySelectorAll('.stagger').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', i)));
    if (!animate) page.querySelectorAll('[data-count]').forEach((el) => { el.dataset.counted = '1'; });
    if (calAnim && !Motion.RM) {
      const grid = page.querySelector('.cal-grid');
      if (grid) grid.querySelectorAll('.cal-cell').forEach((c) => { c.style.animation = `cellIn .45s var(--ease-out) both ${(Number(c.style.getPropertyValue('--c')) || 0) * 10}ms`; });
    }
    Motion.scan(page);
    Charts.flush(!!animate);
    placeTabIndicator();
    if (animate) scrollTo({ top: 0, behavior: 'auto' }); else scrollTo(0, y);
    updateBadges();
  };
  if (animate && !Motion.RM && page.innerHTML) {
    page.classList.add('is-leaving');
    setTimeout(() => { page.classList.remove('is-leaving'); draw(); }, 170);
  } else draw();
}
function refresh() { saveSoon(); renderPage(false); }
function updateBadges() {
  document.querySelectorAll('[data-page]').forEach((b) => {
    const n = badgeFor(b.dataset.page);
    const host = b.querySelector('.rail-ic') || b;
    let el = host.querySelector('.rail-badge');
    if (n && !el) { el = document.createElement('span'); el.className = 'rail-badge'; host.appendChild(el); }
    if (el) { if (n) el.textContent = n; else el.remove(); }
  });
}

/* ================= ACTUALISATION ENTRE POSTES (base partagée) ================= */
function userIsBusy() {
  const a = document.activeElement;
  return !!document.getElementById('modalRoot').innerHTML || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#page'));
}
async function pollRemote() {
  if (!isShared() || !CURRENT_USER || document.hidden || hasPendingChanges()) return;
  try {
    const r = await ClubApi.req('version');
    if (r.version === SERVER_VERSION || userIsBusy()) return;
    const me = CURRENT_USER.id;
    await loadRemote();
    const still = DB.users.find((u) => u.id === me);
    if (!still || still.statut !== 'Actif') { toast('Votre accès a été modifié par la direction.', 'error'); doLogout(true); return; }
    CURRENT_USER = still;
    renderShell();
    renderPage(false);
  } catch (e) {
    if (e.status === 401) { toast('Session expirée : reconnectez-vous.', 'error'); doLogout(true); }
  }
}

/* ================= RECHERCHE GLOBALE ================= */
function hideSearch() { $id('searchPanel').classList.remove('is-open'); }
function runSearch() {
  const q = $id('globalSearch').value.trim().toLowerCase();
  const panel = $id('searchPanel');
  if (!q || !DB) { hideSearch(); return; }
  const emp = navAllowed('equipe') ? DB.users.filter((u) => canViewProfile(u) && (fullName(u) + ' ' + roleLabel(u)).toLowerCase().includes(q)).slice(0, 6) : [];
  const evs = navAllowed('programme') ? DB.events.filter((e) => e.nom.toLowerCase().includes(q) || e.date.includes(q) || fmtDate(e.date).toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6) : [];
  const rdvs = navAllowed('privatisations') ? DB.rdv.filter((r) => (r.nom + ' ' + r.ref + ' ' + (r.typeEvent || '')).toLowerCase().includes(q)).slice(0, 4) : [];
  const docs = navAllowed('documents') ? visibleDocs().filter((d) => d.nom.toLowerCase().includes(q)).slice(0, 6) : [];
  const weeks = navAllowed('comptabilite') ? DB.accountingWeeks.filter((w) => ('semaine ' + w.numero).includes(q) || ('s' + w.numero) === q).slice(0, 4) : [];
  const items = navAllowed('carte') ? menuItems().filter((m) => m.nom.toLowerCase().includes(q)).slice(0, 4) : [];
  let html = '';
  if (emp.length) html += `<div class="sr-group"><h6>Employés</h6>${emp.map((u) => `<button class="sr-item" type="button" onclick="hideSearch();goPage('equipe');setTimeout(()=>openEmployeeSheet('${u.id}'),260)">${avatarHtml(u, 'sm')}<span>${esc(fullName(u))}<small>${esc(roleLabel(u))}</small></span></button>`).join('')}</div>`;
  if (evs.length) html += `<div class="sr-group"><h6>Soirées</h6>${evs.map((e) => `<button class="sr-item" type="button" onclick="hideSearch();goPage('programme');setTimeout(()=>openEventDetail('${e.id}'),260)">${icon('mic', 'sm')}<span>${esc(e.nom)}<small>${fmtDate(e.date)}</small></span></button>`).join('')}</div>`;
  if (rdvs.length) html += `<div class="sr-group"><h6>Privatisations</h6>${rdvs.map((r) => `<button class="sr-item" type="button" onclick="hideSearch();goPage('privatisations');setTimeout(()=>openRdv('${r.id}'),260)">${icon('party', 'sm')}<span>${esc(r.nom)}<small>${esc(r.ref)} · ${esc(r.statut)}</small></span></button>`).join('')}</div>`;
  if (weeks.length) html += `<div class="sr-group"><h6>Comptabilité</h6>${weeks.map((w) => `<button class="sr-item" type="button" onclick="hideSearch();currentWeekId='${w.id}';goPage('comptabilite')">${icon('wallet', 'sm')}<span>Semaine ${w.numero}<small>${fmtDateShort(w.dateDebut)} → ${fmtDateShort(w.dateFin)}</small></span></button>`).join('')}</div>`;
  if (items.length) html += `<div class="sr-group"><h6>La carte</h6>${items.map((m) => `<button class="sr-item" type="button" onclick="hideSearch();goPage('carte')"><span class="doc-ic" style="width:30px;height:30px;font-size:15px">${m.emoji || '•'}</span><span>${esc(m.nom)}<small>${esc(m.categorie)} · ${fmtMoney(m.prix)}</small></span></button>`).join('')}</div>`;
  if (docs.length) html += `<div class="sr-group"><h6>Documents</h6>${docs.map((d) => `<button class="sr-item" type="button" onclick="hideSearch();goPage('documents');setTimeout(()=>openDocViewer('${d.id}'),260)">${icon('file', 'sm')}<span>${esc(d.nom)}<small>${esc(d.categorie)}</small></span></button>`).join('')}</div>`;
  panel.innerHTML = html || '<p class="sr-empty">Aucun résultat.</p>';
  panel.classList.add('is-open');
}

/* ================= PROFIL ================= */
function openProfile() {
  const u = CURRENT_USER;
  openModal('Mon profil', `
    <div class="sheet-h">${avatarHtml(u, 'lg')}<div><div class="confirm-text"><b>${esc(fullName(u))}</b></div><div class="muted" style="font-size:13.5px">${esc(roleLabelFull(u))} · identifiant <b>${esc(u.username)}</b></div></div></div>
    <button class="btn btn-sm" type="button" style="margin-top:12px" onclick="openEmployeeSheet('${u.id}')">${icon('file', 'sm')}Ma fiche et mes pièces jointes</button>
    <div class="sub-h">Changer mon mot de passe</div>
    <div class="field"><label for="pfOld">Mot de passe actuel</label><input class="input" id="pfOld" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="pfNew">Nouveau mot de passe</label><input class="input" id="pfNew" type="password" autocomplete="new-password"></div>`,
    `<button class="btn btn-sm btn-danger" type="button" onclick="doLogout()">${icon('logout', 'sm')}Se déconnecter</button><button class="btn btn-sm btn-sun" type="button" id="pfSave" onclick="changeMyPassword()">Enregistrer</button>`);
}
async function changeMyPassword() {
  const oldP = $id('pfOld').value, newP = $id('pfNew').value;
  if (newP.length < 4) { toast('Le nouveau mot de passe doit faire au moins 4 caractères.', 'error'); return; }
  if (isShared()) {
    try { await ClubApi.req('password', { body: { oldPassword: oldP, newPassword: newP } }); }
    catch (e) { toast(e.message, 'error'); return; }
    toast('Mot de passe modifié.', 'success'); closeModal();
    return;
  }
  if (!(await checkPassword(CURRENT_USER, oldP))) { toast('Mot de passe actuel incorrect.', 'error'); return; }
  CURRENT_USER.passHash = await hashPassword(CURRENT_USER.username, newP);
  delete CURRENT_USER.password;
  logActivity('Mot de passe modifié', fullName(CURRENT_USER));
  saveDB();
  toast('Mot de passe modifié.', 'success'); closeModal();
}
function openSyncInfo() {
  const shared = isShared();
  openModal(shared ? 'Base partagée' : 'Mode local', shared
    ? `<p class="confirm-text">Les données sont enregistrées en ligne : tout le staff voit les mêmes comptes, soirées, présences, comptabilité et demandes de privatisation. Les modifications des autres apparaissent automatiquement (vérification toutes les 15 secondes).</p>`
    : `<p class="confirm-text">La base partagée n'est pas joignable : les données sont enregistrées <b>uniquement dans ce navigateur</b>. C'est normal en aperçu local ou si le site a été déposé sans sa partie serveur (voir le guide de mise en ligne).</p>`,
    '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>');
}

/* ================= HORLOGE ================= */
let clockTimer = null;
function startClock() {
  const tick = () => {
    const n = new Date();
    $id('clock').innerHTML = `${icon('clock', 'sm')}${n.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · <b>${nowHM()}</b>`;
  };
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 20000);
}

/* ================= DÉMARRAGE ================= */
(async function init() {
  Motion.init();
  document.querySelectorAll('.pw-eye').forEach((b) => {
    b.innerHTML = icon('eye', 'sm');
    b.addEventListener('click', () => {
      const inp = $id(b.dataset.pw);
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = icon(show ? 'eyeOff' : 'eye', 'sm');
      b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
  $id('loginForm').addEventListener('submit', doLogin);
  $id('toggleRegister').addEventListener('click', toggleRegister);
  $id('registerBtn').addEventListener('click', doRegister);
  $id('regPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
  $id('logoutBtn').addEventListener('click', () => doLogout());
  $id('userChip').addEventListener('click', openProfile);
  $id('syncPill').addEventListener('click', openSyncInfo);

  const search = $id('globalSearch');
  let st = null;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(runSearch, 120); });
  search.addEventListener('focus', () => { if (search.value.trim()) runSearch(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; hideSearch(); search.blur(); }
    if (e.key === 'Enter') { const first = $id('searchPanel').querySelector('.sr-item'); if (first) first.click(); }
  });
  $id('searchGo').addEventListener('click', () => { runSearch(); search.focus(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#searchBox')) hideSearch(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !$id('app').hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); }
  });
  addEventListener('resize', () => { placeRailIndicator(); placeTabIndicator(); });

  const mode = await ClubApi.detect();
  $id('modeBadge').innerHTML = mode === 'shared'
    ? `<span class="badge good">${icon('cloud', 'sm')}Base partagée en ligne</span>`
    : `<span class="badge warn">${icon('database', 'sm')}Mode local — données dans ce navigateur</span>`;
  $id('loginHelp').innerHTML = mode === 'shared'
    ? `<b>Comment se connecter</b>Cliquez sur « Créer mon compte », indiquez votre nom, choisissez un mot de passe et votre grade : la direction valide ensuite votre compte. Le tout premier compte créé reçoit automatiquement l'accès Direction. Choisissez un mot de passe propre à ce site.`
    : `<b>Comment se connecter</b>Cliquez sur « Créer mon compte », indiquez votre nom, choisissez un mot de passe et sélectionnez votre grade. Vous pourrez ensuite vous reconnecter avec votre identifiant et ce mot de passe. Choisissez un mot de passe propre à ce site.`;

  if (mode === 'shared') {
    setInterval(pollRemote, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollRemote(); });
    addEventListener('beforeunload', (e) => { if (hasPendingChanges()) { e.preventDefault(); e.returnValue = ''; } });
    if (ClubApi.token) {
      try { await startShared(null, false); } catch (e) { ClubApi.setToken(null); }
    }
    return;
  }

  loadDB();
  // Autre onglet ouvert sur l'espace : on recharge les données modifiées
  addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try { DB = JSON.parse(e.newValue); normalizeDB(); } catch (err) { return; }
    if (!CURRENT_USER) return;
    const me = DB.users.find((u) => u.id === CURRENT_USER.id);
    if (!me || me.statut === 'Désactivé') { doLogout(true); return; }
    CURRENT_USER = me;
    if (!document.getElementById('modalRoot').innerHTML) { renderShell(); renderPage(false); }
  });
  let sid = null;
  try { sid = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* navigation privée */ }
  const u = sid && DB.users.find((x) => x.id === sid && x.statut !== 'Désactivé');
  if (u) { CURRENT_USER = u; enterApp(false); }
})();
