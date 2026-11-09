/* =====================================================================
   PACIFIC BLUFFS — Espace staff : stockage, utilitaires, interface commune
   Deux modes (voir api.js) :
   - « shared » : base partagée en ligne (fonction Netlify). Chaque
     modification est envoyée au serveur ; les autres postes la reçoivent.
   - « local »  : secours, données dans ce navigateur (clé « pacific:data »).
   ===================================================================== */

const STORAGE_KEY = 'pacific:data';
const SESSION_KEY = 'pacific:session';
let DB = null;
let CURRENT_USER = null;
let CURRENT_PAGE = 'dashboard';
const isShared = () => ClubApi.mode === 'shared';

/* ---------------- Stockage local ---------------- */
function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }

function normalizeDB() {
  ['users', 'postes', 'events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales', 'notifications'].forEach((k) => {
    if (!Array.isArray(DB[k])) DB[k] = [];
  });
  if (!Array.isArray(DB.menu) || !DB.menu.length) DB.menu = null;
  if (!Array.isArray(DB.couleurs) || !DB.couleurs.length) DB.couleurs = null;
}
function loadDB() {
  const raw = storageGet(STORAGE_KEY);
  if (raw) {
    try {
      DB = JSON.parse(raw);
      const seed = seedData();
      Object.keys(seed).forEach((k) => { if (!(k in DB)) DB[k] = seed[k]; });
      normalizeDB();
      return;
    } catch (e) { /* données illisibles : on repart du jeu initial */ }
  }
  DB = seedData();
  normalizeDB();
  saveDB();
}
function saveDB() {
  if (isShared()) { syncNow(); return; }
  if (!storageSet(STORAGE_KEY, JSON.stringify(DB))) toast('Erreur de sauvegarde des données (stockage plein ou bloqué).', 'error');
}
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  if (isShared()) { setSyncState('pending'); saveTimer = setTimeout(syncNow, 350); return; }
  saveTimer = setTimeout(saveDB, 250);
}

/* ---------------- Base partagée : synchronisation ---------------- */
const SYNC_COLS = ['users', 'events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales'];
const SYNC_WHOLE = ['postes', 'menu', 'couleurs'];
let SNAP = null;
let SERVER_VERSION = 0;
let syncing = false;
let syncAgain = false;

/* Photo de l'état connu du serveur : sert à n'envoyer que ce qui a changé */
function takeSnapshot() {
  SNAP = {};
  SYNC_COLS.forEach((c) => { SNAP[c] = new Map((DB[c] || []).map((r) => [r && r.id, JSON.stringify(r)])); });
  SYNC_WHOLE.forEach((c) => { SNAP[c] = JSON.stringify(DB[c] === undefined ? null : DB[c]); });
}
function computeChanges() {
  if (!SNAP || !DB) return null;
  const changes = {};
  let n = 0;
  SYNC_COLS.forEach((c) => {
    const prev = SNAP[c] || new Map();
    const upsert = [];
    const seen = new Set();
    (DB[c] || []).forEach((r) => {
      if (!r || !r.id) return;
      seen.add(r.id);
      if (prev.get(r.id) !== JSON.stringify(r)) upsert.push(r);
    });
    const remove = c === 'activityLogs' ? [] : [...prev.keys()].filter((id) => id && !seen.has(id));
    if (upsert.length || remove.length) { changes[c] = { upsert, remove }; n++; }
  });
  SYNC_WHOLE.forEach((c) => {
    const now = DB[c] === undefined ? null : DB[c];
    if (JSON.stringify(now) !== SNAP[c] && Array.isArray(now)) { changes[c] = { value: now }; n++; }
  });
  return n ? changes : null;
}
async function syncNow() {
  if (!isShared() || !CURRENT_USER) return;
  if (syncing) { syncAgain = true; return; }
  const changes = computeChanges();
  if (!changes) { setSyncState('ok'); return; }
  syncing = true;
  setSyncState('saving');
  const before = SNAP;
  takeSnapshot();
  try {
    const r = await ClubApi.req('sync', { body: { changes } });
    SERVER_VERSION = r.version;
    if (r.denied && r.denied.length) {
      toast("Certaines modifications ont été refusées : vos droits ne le permettent pas.", 'error');
      await loadRemote();
      if (typeof renderPage === 'function') renderPage(false);
    }
    setSyncState('ok');
  } catch (e) {
    SNAP = before; // les modifications seront renvoyées
    if (e.status === 401) { toast('Session expirée : reconnectez-vous.', 'error'); doLogout(true); }
    else { setSyncState('error'); setTimeout(syncNow, 6000); }
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}
async function loadRemote() {
  const r = await ClubApi.req('data');
  DB = r.db;
  normalizeDB();
  SERVER_VERSION = r.version;
  takeSnapshot();
  if (CURRENT_USER) CURRENT_USER = DB.users.find((u) => u.id === CURRENT_USER.id) || CURRENT_USER;
  return r;
}
function hasPendingChanges() { return isShared() && (syncing || !!computeChanges()); }

/* Pastille d'état dans la barre du haut */
function setSyncState(state) {
  const el = document.getElementById('syncPill');
  if (!el) return;
  const map = {
    ok: ['ok', 'Synchronisé'], pending: ['busy', 'Modification…'], saving: ['busy', 'Enregistrement…'],
    error: ['err', 'Hors connexion — nouvel essai'], local: ['local', 'Mode local'],
  };
  const [cls, label] = map[state] || map.ok;
  el.className = 'sync-pill ' + cls;
  el.querySelector('span').textContent = label;
}

/* ---------------- Utilitaires ---------------- */
const NUM_FR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return 'Non renseigné';
  return NUM_FR.format(n) + ' $';
}
function fmtCompact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e3) return (n / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 }) + ' k';
  return NUM_FR.format(n);
}
function pad2(n) { return String(n).padStart(2, '0'); }
function todayISO() { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function nowHM() { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtDate(d) {
  if (!d) return 'Non renseigné';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return esc(d);
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return `${days[dt.getDay()]} ${dt.getDate()} ${MONTHS_FR[dt.getMonth()]}`;
}
function fmtDateShort(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? esc(d) : dt.toLocaleDateString('fr-FR');
}
function durationMinutes(hIn, hOut) {
  if (!hIn || !hOut) return null;
  const [h1, m1] = hIn.split(':').map(Number);
  const [h2, m2] = hOut.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins;
}
/* Heures en centièmes, comme pour la paie : 60 min = 1,00 h (1 h 45 = 1,75 h) */
function hoursDec(mins) { return Math.round(((mins || 0) / 60) * 100) / 100; }
function fmtHours(mins) { return mins === null || mins === undefined ? '—' : hoursDec(mins).toFixed(2).replace('.', ',') + ' h'; }
function fmtDuration(hIn, hOut) { return fmtHours(durationMinutes(hIn, hOut)); }
function findUser(id) { return DB.users.find((u) => u.id === id); }
function fullName(u) { return (u.prenom + ' ' + (u.nom && u.nom !== '/' ? u.nom : '')).trim(); }
function userLabel(id) {
  if (!id) return 'Système';
  const u = findUser(id);
  return u ? fullName(u) : 'Ancien compte';
}
function initials(u) { return ((u.prenom || '?')[0] + (u.nom && u.nom !== '/' ? u.nom[0] : '')).toUpperCase(); }
function hueFor(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

function logActivity(action, objet) {
  DB.activityLogs.unshift({ id: uid('log'), userId: CURRENT_USER ? CURRENT_USER.id : null, action, objet, date: todayISO(), heure: nowHM() });
  if (DB.activityLogs.length > 500) DB.activityLogs.length = 500;
  saveSoon();
}

/* ---------------- Permissions (identiques à l'ancien espace) ---------------- */
function can(roles) { return roles === '*' || roles.includes(CURRENT_USER.role); }
function isMgmt() { return CURRENT_USER.role === ROLES.MANAGER || CURRENT_USER.role === ROLES.DIRECTION; }
function isDirection() { return CURRENT_USER.role === ROLES.DIRECTION; }
function canSeeFinance() { return [ROLES.SECRETAIRE, ROLES.DIRECTION, ROLES.GOUVERNEMENT].includes(CURRENT_USER.role); }
function canEditFinance() { return [ROLES.SECRETAIRE, ROLES.DIRECTION].includes(CURRENT_USER.role); }
function canFillFinance() { return CURRENT_USER.role !== ROLES.GOUVERNEMENT; }
/* Créer / modifier / supprimer des soirées et attribuer les postes : Direction + Comptabilité */
function canManageEvents() { return [ROLES.DIRECTION, ROLES.SECRETAIRE].includes(CURRENT_USER.role); }

/* ---------------- Icônes ---------------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="4"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  wallet: '<rect x="2" y="6" width="20" height="15" rx="4"/><path d="M2 11h20M16 16h2M6 6l9-3.5L17 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  palm: '<path d="M12.5 21c.4-4 .2-7.6-1-10.5"/><path d="M11.5 10.5C9.6 7.6 6.4 6.8 3.5 8.2c2.6-.2 4.8.7 6.4 2.6"/><path d="M11.5 10.5c.6-3.3 3.2-5.3 6.6-5.2-2.3.9-3.9 2.6-4.6 4.9"/><path d="M11.5 10.5c3-.9 6 .2 7.6 2.9-2.2-1.3-4.7-1.6-7-.8"/><path d="M11.5 10.5C9.4 9.2 9 6.6 10.2 4.2c-.1 2.4.4 4.4 1.7 6"/><path d="M8 21h9"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  home: '<path d="M3 11 12 3l9 8M5 9.5V20h14V9.5"/>',
  glass: '<path d="M6 3h12l-1 7a5 5 0 0 1-10 0zM12 15v6M8 21h8"/>',
  party: '<path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.2 5.8L21 11l-5.8 2.2L13 19l-2.2-5.8L5 11l5.8-2.2z"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  userCheck: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
};
function icon(name, cls) { return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`; }

/* ---------------- Affiches des soirées ---------------- */
/* Adresse de l'affiche : servie par la base partagée, ou gardée dans ce navigateur en mode local */
function posterSrc(ev) {
  if (!ev) return '';
  if (ev.affiche) return '/api/poster/' + encodeURIComponent(ev.id) + '?v=' + encodeURIComponent(ev.affiche);
  return ev.afficheData || '';
}
/* Réduit l'image choisie (1200 px max, JPEG) pour qu'elle reste légère à envoyer et à afficher */
function readPosterFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choisissez une image (JPG, PNG ou WebP).')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#0d0a22';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.86, data = c.toDataURL('image/jpeg', q);
      while (data.length > 900000 && q > 0.5) { q -= 0.08; data = c.toDataURL('image/jpeg', q); }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cette image n'a pas pu être lue.")); };
    img.src = url;
  });
}

/* ---------------- Notifications ---------------- */
function toast(msg, type) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="t-ic">${icon(type === 'error' ? 'x' : type === 'success' ? 'check' : 'palm', 'sm')}</span><span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 380); }, 3400);
}

/* ---------------- Fenêtres modales ---------------- */
let modalReturnFocus = null;
function openModal(title, bodyHtml, footerHtml, opts) {
  opts = opts || {};
  const root = document.getElementById('modalRoot');
  if (!root.innerHTML) modalReturnFocus = document.activeElement;
  root.innerHTML = `<div class="modal-wrap" data-modal-bg>
    <div class="modal ${opts.size || ''}" role="dialog" aria-modal="true" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}">
      <div class="modal-h"><h3>${title}</h3><button class="icon-btn sm" type="button" data-close-modal aria-label="Fermer">${icon('x')}</button></div>
      <div class="modal-b">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-f">${footerHtml}</div>` : ''}
    </div></div>`;
  const first = root.querySelector('.modal-b input:not([type=hidden]),.modal-b select,.modal-b textarea');
  setTimeout(() => (first || root.querySelector('[data-close-modal]')).focus({ preventScroll: true }), 60);
  if (window.Motion) Motion.scan(root);
}
function closeModal(instant) {
  const root = document.getElementById('modalRoot');
  const wrap = root.firstElementChild;
  if (!wrap) return;
  const done = () => {
    if (root.firstElementChild !== wrap) return; // une autre fenêtre a été ouverte entre-temps
    root.innerHTML = '';
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus({ preventScroll: true });
  };
  if (instant || Motion.RM) { done(); return; }
  wrap.classList.add('is-out');
  setTimeout(done, 230);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-modal]') || e.target.hasAttribute('data-modal-bg')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('modalRoot').innerHTML) closeModal();
});
function confirmAction(text, onConfirm, label) {
  openModal('Confirmation requise',
    `<p class="confirm-text">${text}</p><p class="confirm-text muted" style="margin-top:8px">Cette action peut être irréversible.</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button>
     <button class="btn btn-sm btn-dark" type="button" id="confirmBtn">${label || 'Confirmer'}</button>`);
  document.getElementById('confirmBtn').onclick = () => { closeModal(true); onConfirm(); };
}

/* Champs obligatoires vides : entourés en rouge, le premier reçoit le focus */
function requireFields(ids, message) {
  const empty = ids.map((id) => document.getElementById(id)).filter((el) => el && !String(el.value).trim());
  ids.forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove('invalid'); });
  if (!empty.length) return true;
  empty.forEach((el) => {
    el.classList.add('invalid');
    el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
  });
  empty[0].focus();
  empty[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast(message, 'error');
  return false;
}

/* ---------------- Petits composants ---------------- */
function statusBadge(status) {
  const map = {
    'À confirmer': '', 'Présent': 'sun', 'Arrivé': 'warn', 'Terminé': '', 'Absent': 'bad',
    'À valider': 'warn', 'Validé': 'good', 'À venir': 'sun', 'Terminée': '', 'Annulée': 'bad',
  };
  return `<span class="badge ${map[status] || ''}">${esc(status)}</span>`;
}
function emptyState(emoji, title, text) {
  return `<div class="empty card"><div class="e-ic">${emoji}</div><h3>${title}</h3><p>${text}</p></div>`;
}
function avatarHtml(u, size) {
  const name = u ? fullName(u) : '?';
  return `<span class="av ${size || ''}" style="--hue:${hueFor(name)}">${esc(u ? initials(u) : '?')}</span>`;
}
function moneyInput(value, onchange, cls) {
  return `<input class="cell-in money ${cls || ''}" type="number" step="0.01" value="${Number(value) || 0}" onchange="${onchange}" onfocus="this.select()" inputmode="decimal">`;
}
function textInput(value, onchange, width) {
  return `<input class="cell-in" type="text" value="${esc(value)}" style="width:${width || 150}px" onchange="${onchange}">`;
}

/* ---------------- Mot de passe (empreinte SHA-256, jamais stocké en clair) ---------------- */
async function hashPassword(username, password) {
  const data = new TextEncoder().encode('pacific|' + username.toLowerCase() + '|' + password);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Repli (contexte non sécurisé) : empreinte FNV-1a, moins robuste
  let h = 0x811c9dc5;
  for (const b of data) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv-' + h.toString(16);
}
async function checkPassword(user, password) {
  if (user.passHash) return user.passHash === await hashPassword(user.username, password);
  if (user.password !== undefined && user.password === password) {
    // Compte importé de l'ancien espace : on remplace le mot de passe en clair par son empreinte
    user.passHash = await hashPassword(user.username, password);
    delete user.password;
    saveDB();
    return true;
  }
  return false;
}
