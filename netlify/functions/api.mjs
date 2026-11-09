/* =====================================================================
   PACIFIC BLUFFS — Base partagée (Netlify Function + Netlify Blobs)

   Routes (toutes sous /api/) :
   - publiques  : GET health · GET public · GET poster/<id> · GET photo/<article>
                  POST login · POST register
     (les privatisations ne viennent plus de l'accueil : le staff les note, collection « rdv »)
   - connectées : GET data · GET version · POST sync · POST poster · POST photo · POST logout
                  POST password · POST users · POST bootstrap · GET export
                  POST import · POST reset · POST piece · GET piece/<compte>/<type>

   Stockage : un document par collection (clé « col:<nom> »), plus « meta »
   (version, initialisation), « sessions », une clé par affiche de soirée
   (« poster:<id> ») et une par photo d'article de la carte (« photo:<id> »),
   gardées à part pour ne pas alourdir la synchro. Les mots de passe sont
   stockés sous forme d'empreinte PBKDF2-SHA256 salée.
   ===================================================================== */
import { getStore } from '@netlify/blobs';
import { webcrypto } from 'node:crypto';

export const config = { path: '/api/*' };

const crypto = globalThis.crypto || webcrypto;

const ROLES = ['EMPLOYE', 'MANAGER', 'SECRETAIRE', 'DIRECTION', 'GOUVERNEMENT'];
// Sous-rôles attribués par la direction seulement (même liste que SUB_ROLES dans public/assets/js/app/data.js)
const SUB_ROLES = {
  MANAGER: ['Sécurité', 'Bar', 'Hospitalité / Loisirs'],
  EMPLOYE: ['Agent de sécurité', 'Barman / Barmaid', "Animateur / Agent d'accueil", 'Agent polyvalent'],
};
const validSubRole = (role, v) => ((SUB_ROLES[role] || []).includes(v) ? v : '');
const COLS = ['users', 'events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales'];
// listes enregistrées d'un bloc : carte, cartes membres (tarifs, avantages) et cocons paradisiaques modifiés par la direction
const WHOLE = ['postes', 'menu', 'couleurs', 'cartes', 'cocons'];
const POSTER_MAX = 3000000; // affiche compressée par le navigateur : ~2 Mo maximum
const PHOTO_MAX = 1500000;  // photo d'un article de la carte, réduite par le navigateur : ~1 Mo maximum
const IMG_DATA = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
/* Carte enregistrée : la photo d'un article est une version courte (« photo ») qui renvoie à la clé
   « photo:<id> » ; l'image elle-même ne voyage jamais dans la liste (photoData = mode local seulement) */
function cleanMenu(list) {
  return list.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const out = { ...m };
    delete out.photoData;
    if (!(typeof out.photo === 'string' && /^[a-z0-9]{1,20}$/.test(out.photo))) delete out.photo;
    return out;
  });
}
/* Photos des articles qui ne sont plus sur la carte (ou dont la photo a été retirée) : effacées */
async function dropPhotos(store, before, after) {
  if (!Array.isArray(before)) return;
  const kept = new Set((Array.isArray(after) ? after : []).filter((m) => m && m.photo).map((m) => m.id));
  for (const m of before) if (m && m.photo && typeof m.id === 'string' && !kept.has(m.id)) await store.delete('photo:' + m.id);
}
// Pièces jointes des fiches de l'équipe (privées : jamais servies au public)
const PIECES = ['permis', 'identite', 'arme'];
const PIECE_READERS = ['DIRECTION', 'SECRETAIRE', 'MANAGER', 'GOUVERNEMENT']; // lisent toutes les fiches (l'employé : la sienne)
const PIECE_WRITERS = ['DIRECTION', 'SECRETAIRE'];                             // modifient toutes les fiches (les autres : la leur)
const SESSION_MS = 14 * 24 * 3600 * 1000;
const PBKDF2_ITER = 100000;
const enc = new TextEncoder();

/* ---------------- Outils ---------------- */
const json = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
});
const fail = (status, error) => json({ error }, status);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
const clean = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const fullName = (u) => (u.prenom + ' ' + (u.nom && u.nom !== '/' ? u.nom : '')).trim();
const todayParis = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nowParis = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
async function readBody(req) { try { return (await req.json()) || {}; } catch (e) { return {}; } }

/* ---------------- Fiches de ventes (onglet Ventes) ----------------
   Journée de service de 6h à 6h, heure de Paris : à 6h elle passe en comptabilité
   et se ferme pour les employés (10 min de battement pour une vente notée à 5h59). */
const SALE_TYPES = ['carte', 'hospitalite', 'carteVip'];
// fiche hospitalité : entrées en soirée et cocons paradisiaques (pour 2) ; « Hébergement » n'est plus
// proposé par l'espace staff mais reste accepté pour les ventes déjà notées (corrections de la compta)
const HOSP_KINDS = ['Entrée', 'Hébergement', 'Cocon'];
const CARD_PRICES = { Green: 1000, Gold: 2000, Platinum: 4000 }; // tarifs d'origine, identiques à CLUB.MEMBERSHIP_PRICES (public/assets/js/club-data.js)
const capPrice = (v) => Math.min(1000000, Math.max(0, Math.round((Number(v) || 0) * 100) / 100));
/* Tarif d'une carte membre : celui choisi par la direction (collection « cartes »), sinon celui d'origine */
function cardPrice(cartes, key) {
  if (!CARD_PRICES[key]) return 0;
  const s = Array.isArray(cartes) ? cartes.find((x) => x && x.key === key) : null;
  const p = s ? capPrice(s.prix) : 0;
  return p > 0 ? p : CARD_PRICES[key];
}
const parisClock = () => {
  const p = {};
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};
const shiftISO = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function openSaleDays() {
  const c = parisClock();
  if (c.min < 360) return [shiftISO(c.date, -1)];
  return c.min < 370 ? [c.date, shiftISO(c.date, -1)] : [c.date];
}
/* Prix revérifiés : carte = prix de la carte en vigueur, carte VIP = tarif de la carte en vigueur,
   cocon = prix de la liste des cocons, entrée / hébergement = prix noté (plafonné) */
function normalizeSale(r, lists) {
  const { menu, cartes, cocons } = lists || {};
  const type = SALE_TYPES.includes(r.type) ? r.type : 'carte';
  const out = { ...r, type, qty: Math.min(999, Math.max(1, Math.round(Number(r.qty) || 1))), nom: clean(r.nom, 80) };
  if (r.client !== undefined) out.client = clean(r.client, 60);
  if (r.client2 !== undefined) out.client2 = clean(r.client2, 60);
  if (type === 'carte') {
    const it = Array.isArray(menu) ? menu.find((m) => m && m.id === r.itemId) : null;
    out.prix = it ? Number(it.prix) || 0 : capPrice(r.prix);
  } else if (type === 'carteVip') {
    out.prix = cardPrice(cartes, r.categorie);
    out.qty = 1;
    if (!out.prix) return null;
  } else {
    out.categorie = HOSP_KINDS.includes(r.categorie) ? r.categorie : 'Entrée';
    // cocons d'origine (liste jamais modifiée) : le prix noté par l'espace staff, plafonné
    const cc = out.categorie === 'Cocon' && Array.isArray(cocons) ? cocons.find((c) => c && c.id === r.itemId) : null;
    out.prix = cc ? capPrice(cc.prix) : capPrice(r.prix);
  }
  return out;
}

/* ---------------- Stockage ---------------- */
async function readJSON(store, key, fallback) {
  const v = await store.get(key, { type: 'json' });
  return v === null || v === undefined ? fallback : v;
}
const col = (store, name) => readJSON(store, 'col:' + name, []);
const putCol = (store, name, value) => store.setJSON('col:' + name, value);
const readMeta = (store) => readJSON(store, 'meta', { initialized: false, version: 0 });
async function bump(store, patch) {
  const meta = await readMeta(store);
  Object.assign(meta, patch || {});
  meta.version = (meta.version || 0) + 1;
  await store.setJSON('meta', meta);
  return meta;
}
async function addLog(store, userId, action, objet) {
  const logs = await col(store, 'activityLogs');
  logs.unshift({ id: 'log_' + randomHex(6), userId, action, objet, date: todayParis(), heure: nowParis() });
  await putCol(store, 'activityLogs', logs.slice(0, 500));
}
async function loadAll(store) {
  const [users, events, attendances, accountingWeeks, documents, activityLogs, rdv, barSales, postes, menu, couleurs, cartes, cocons, meta] = await Promise.all([
    col(store, 'users'), col(store, 'events'), col(store, 'attendances'), col(store, 'accountingWeeks'), col(store, 'documents'),
    col(store, 'activityLogs'), col(store, 'rdv'), col(store, 'barSales'), readJSON(store, 'col:postes', null), readJSON(store, 'col:menu', null),
    readJSON(store, 'col:couleurs', null), readJSON(store, 'col:cartes', null), readJSON(store, 'col:cocons', null), readMeta(store),
  ]);
  return { users, events, attendances, accountingWeeks, documents, activityLogs, rdv, barSales, postes, menu, couleurs, cartes, cocons, meta };
}
/* Type d'une soirée (Grand événement par défaut, sauf les soirées classiques) */
const eventCat = (e) => e.categorie || (e.nom === 'Soirée classique' ? 'classique' : 'grand');
const b64ToBytes = (b64) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64');
  const s = atob(b64); const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
};

/* ---------------- Mots de passe ---------------- */
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
async function setPassword(user, password) {
  user.pwSalt = randomHex(16);
  user.pwHash = await pbkdf2(password, user.pwSalt);
  delete user.passHash;
  delete user.password;
}
async function checkPassword(user, password) {
  if (user.pwHash && user.pwSalt) return (await pbkdf2(password, user.pwSalt)) === user.pwHash;
  // Formats importés : empreinte de l'espace local, ou mot de passe en clair de l'ancien site
  if (user.passHash) return hex(await crypto.subtle.digest('SHA-256', enc.encode('pacific|' + user.username.toLowerCase() + '|' + password))) === user.passHash;
  if (typeof user.password === 'string') return user.password === password;
  return false;
}
const publicUser = (u) => { const { pwHash, pwSalt, passHash, password, ...rest } = u; return rest; };

function validateAccount(b, users) {
  const prenom = clean(b.prenom, 40);
  const nom = clean(b.nom, 40) || '/';
  const username = clean(b.username, 40).toLowerCase();
  const password = String(b.password || '');
  if (!prenom || !username || !password) return { error: "Le prénom, l'identifiant et le mot de passe sont obligatoires." };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: 'Identifiant invalide : lettres sans accent, chiffres, point ou tiret (ex : prenom.nom).' };
  if (password.length < 4 || password.length > 200) return { error: "Choisissez un mot de passe d'au moins 4 caractères." };
  if (users.some((u) => String(u.username).toLowerCase() === username)) return { error: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.' };
  return { prenom, nom, username, password };
}

/* ---------------- Sessions ---------------- */
async function getSessions(store) {
  const s = await readJSON(store, 'sessions', {});
  const now = Date.now();
  Object.keys(s).forEach((k) => { if (!s[k] || s[k].exp < now) delete s[k]; });
  return s;
}
async function authenticate(req, store) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const sessions = await readJSON(store, 'sessions', {});
  const s = sessions[token];
  if (!s || s.exp < Date.now()) return null;
  const users = await col(store, 'users');
  const user = users.find((u) => u.id === s.userId);
  if (!user || user.statut !== 'Actif') return null;
  return { user, users, token };
}

/* =====================================================================
   ROUTES PUBLIQUES
   ===================================================================== */
async function routeHealth(store) {
  const [meta, users] = await Promise.all([readMeta(store), col(store, 'users')]);
  return json({ ok: true, mode: 'shared', initialized: !!meta.initialized, hasUsers: users.length > 0 });
}

/* Ce que voit le public : événements à venir publiés + carte disponible + cartes membres */
async function routePublic(store) {
  const [events, menu, cartes] = await Promise.all([col(store, 'events'), readJSON(store, 'col:menu', null), readJSON(store, 'col:cartes', null)]);
  const t = todayParis();
  const list = events
    .filter((e) => e && e.date >= t && e.statut !== 'Annulée' && (e.public === true || (e.public === undefined && eventCat(e) === 'grand')))
    .sort((a, b) => (a.date + (a.heureDebut || '')).localeCompare(b.date + (b.heureDebut || '')))
    .slice(0, 12)
    .map((e) => ({
      id: e.id, nom: e.nom, date: e.date, heureDebut: e.heureDebut || '', heureFin: e.heureFin || '', texte: e.descPublic || '', categorie: eventCat(e),
      affiche: e.affiche ? '/api/poster/' + encodeURIComponent(e.id) + '?v=' + encodeURIComponent(e.affiche) : '',
    }));
  return json({
    today: t, events: list, menu: Array.isArray(menu) ? menu.filter((m) => m && m.dispo !== false) : null,
    cartes: Array.isArray(cartes) ? cartes.map((c) => ({ key: c && c.key, nom: c && c.nom, prix: c && c.prix, acces: c && c.acces, perks: c && c.perks })) : null,
  }, 200, 'public, max-age=30');
}

/* Affiche d'une soirée (image) : l'adresse change à chaque nouvelle affiche, on peut donc la garder en cache */
async function routePosterGet(store, id) {
  const p = await readJSON(store, 'poster:' + id, null);
  if (!p || !p.data) return fail(404, 'Affiche introuvable.');
  return new Response(b64ToBytes(p.data), {
    status: 200, headers: { 'content-type': p.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
/* Photo d'un article de la carte : même principe (l'adresse change avec la photo) */
async function routePhotoGet(store, id) {
  const p = await readJSON(store, 'photo:' + id, null);
  if (!p || !p.data) return fail(404, 'Photo introuvable.');
  return new Response(b64ToBytes(p.data), {
    status: 200, headers: { 'content-type': p.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}


async function routeLogin(req, store) {
  const b = await readBody(req);
  const username = clean(b.username, 40).toLowerCase();
  const password = String(b.password || '');
  const users = await col(store, 'users');
  const user = users.find((u) => String(u.username).toLowerCase() === username);
  if (!user) return fail(401, 'Identifiant introuvable. Créez votre compte ci-dessous.');
  if (!(await checkPassword(user, password))) return fail(401, 'Mot de passe incorrect.');
  if (user.statut === 'En attente') return fail(403, 'Votre compte attend la validation de la direction.');
  if (user.statut === 'Désactivé') return fail(403, 'Ce compte a été désactivé. Contactez la direction.');
  if (!(user.pwHash && user.pwSalt)) { await setPassword(user, password); await putCol(store, 'users', users); }
  const sessions = await getSessions(store);
  const token = randomHex(32);
  sessions[token] = { userId: user.id, exp: Date.now() + SESSION_MS };
  await store.setJSON('sessions', sessions);
  await addLog(store, user.id, 'Connexion', fullName(user));
  await bump(store);
  return json({ token, user: publicUser(user) });
}

/* Inscription : le tout premier compte devient Direction, les suivants attendent la validation */
async function routeRegister(req, store) {
  const b = await readBody(req);
  const users = await col(store, 'users');
  const v = validateAccount(b, users);
  if (v.error) return fail(400, v.error);
  const role = ROLES.includes(b.role) ? b.role : 'EMPLOYE';
  const first = users.length === 0;
  const user = {
    id: 'u_' + randomHex(6), username: v.username, prenom: v.prenom, nom: v.nom,
    role: first ? 'DIRECTION' : role, roleDemande: role, poste: 'Non renseigné',
    statut: first ? 'Actif' : 'En attente', dateCreation: todayParis(),
  };
  await setPassword(user, v.password);
  users.push(user);
  await putCol(store, 'users', users);
  await addLog(store, user.id, first ? 'Premier compte créé (Direction)' : 'Demande de compte', fullName(user));
  await bump(store);
  return json({ ok: true, first, statut: user.statut });
}

/* =====================================================================
   ROUTES CONNECTÉES
   ===================================================================== */
/* Un employé n'a pas accès à la comptabilité : il ne reçoit des semaines que les dates, la validation
   (fiche verrouillée) et ce qui le concerne (versement de son salaire, ses lignes de salaire) */
function weekForEmploye(w, u) {
  const name = fullName(u).toLowerCase();
  const pay = w.commissionPay && w.commissionPay[u.id];
  return {
    id: w.id, numero: w.numero, dateDebut: w.dateDebut, dateFin: w.dateFin, statutValidation: w.statutValidation,
    commissionPay: pay ? { [u.id]: pay } : {},
    salaries: (w.salaries || []).filter((s) => s && String(s.nom || '').trim().toLowerCase() === name)
      .map((s) => ({ id: s.id, nom: s.nom, montant: s.montant, dateVersement: s.dateVersement, valide: s.valide })),
    revenues: [], expenses: [], members: [], menuSales: {}, resume: true,
  };
}

async function routeData(store, a) {
  const all = await loadAll(store);
  const role = a.user.role;
  const finance = ['SECRETAIRE', 'DIRECTION', 'GOUVERNEMENT'].includes(role);
  const employe = role === 'EMPLOYE';
  const db = {
    users: all.users.filter((u) => role === 'DIRECTION' || u.statut !== 'En attente').map(publicUser),
    postes: all.postes || [],
    events: all.events,
    attendances: all.attendances,
    accountingWeeks: employe ? all.accountingWeeks.map((w) => weekForEmploye(w, a.user)) : all.accountingWeeks,
    documents: finance ? all.documents : all.documents.filter((d) => d.visibilite !== 'Direction & Comptabilité'),
    activityLogs: all.activityLogs,
    rdv: ['DIRECTION', 'SECRETAIRE', 'MANAGER'].includes(role) ? all.rdv : [],
    barSales: employe ? all.barSales.filter((s) => s && s.userId === a.user.id) : all.barSales, // l'employé : ses ventes seulement
    menu: all.menu,
    couleurs: all.couleurs,
    cartes: all.cartes,
    cocons: all.cocons,
    notifications: [],
  };
  return json({ db, version: all.meta.version || 0, initialized: !!all.meta.initialized, me: publicUser(a.user) });
}

/* Applique les modifications envoyées par l'espace staff (fusion enregistrement par enregistrement) */
async function routeSync(req, store, a) {
  const b = await readBody(req);
  const changes = b.changes && typeof b.changes === 'object' ? b.changes : {};
  const role = a.user.role;
  const D = role === 'DIRECTION', S = role === 'SECRETAIRE', M = role === 'MANAGER', G = role === 'GOUVERNEMENT';
  const perms = { // [ajout / modification, suppression] — les fiches (users) sont filtrées champ par champ plus bas
    // comptabilité : pas d'accès pour les employés (ils n'en reçoivent qu'un résumé)
    users: [true, D], events: [!G, D || S], attendances: [!G, D || M || S], accountingWeeks: [D || S || M, D || S],
    documents: [D || S || M || G, D], activityLogs: [true, false], rdv: [D || S, D], barSales: [!G, !G],
  };
  const wholePerms = { postes: D, menu: D, couleurs: D || S, cartes: D, cocons: D };
  const denied = [];
  for (const [name, c] of Object.entries(changes)) {
    if (COLS.includes(name)) {
      let ups = Array.isArray(c && c.upsert) ? c.upsert.slice(0, 5000) : [];
      let rms = Array.isArray(c && c.remove) ? c.remove.slice(0, 5000) : [];
      const [canUp, canRm] = perms[name];
      if ((ups.length && !canUp) || (rms.length && !canRm)) { denied.push(name); continue; }
      let list = await col(store, name);
      const index = new Map(list.map((r, i) => [r && r.id, i]));
      if (name === 'barSales') {
        const asked = ups.length + rms.length;
        if (!(D || S)) {
          // fiches de ventes : chacun n'ajoute et ne retire que SES ventes, et seulement pour la soirée
          // en cours (après 6h elle est passée en comptabilité : seules direction et comptabilité corrigent)
          const open = openSaleDays();
          const isOpen = (r) => !!r && open.includes(r.date);
          const own = (id) => { const i = index.get(id); return i === undefined || (list[i] && list[i].userId === a.user.id); };
          const curOpen = (id) => { const i = index.get(id); return i === undefined || isOpen(list[i]); };
          ups = ups.filter((r) => r && r.userId === a.user.id && own(r.id) && isOpen(r) && curOpen(r.id));
          rms = rms.filter((id) => index.has(id) && own(id) && curOpen(id));
        }
        const [menu, cartes, cocons] = ups.length
          ? await Promise.all(['menu', 'cartes', 'cocons'].map((n) => readJSON(store, 'col:' + n, null))) : [null, null, null];
        ups = ups.map((r) => (r && typeof r === 'object' ? normalizeSale(r, { menu, cartes, cocons }) : null)).filter(Boolean);
        if (ups.length + rms.length < asked) denied.push(name); // l'espace staff recharge alors les vraies données
      }
      for (const rec of ups) {
        if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string') continue;
        const i = index.get(rec.id);
        if (name === 'users') {
          if (i === undefined) continue; // création de compte : route dédiée
          const cur = list[i];
          const self = cur.id === a.user.id;
          // Nom et prénom : direction et comptabilité pour tous, manager et gouvernement pour leur propre fiche, employé jamais
          if (!(D || S || ((M || G) && self))) continue;
          list[i] = { ...cur, prenom: clean(rec.prenom, 40) || cur.prenom, nom: clean(rec.nom, 40) || '/' };
          if (D) { // rôle, sous-rôle et statut : direction seulement
            list[i].role = ROLES.includes(rec.role) ? rec.role : cur.role;
            list[i].statut = ['Actif', 'Désactivé', 'En attente'].includes(rec.statut) ? rec.statut : cur.statut;
          }
          if (self) { list[i].role = cur.role; list[i].statut = 'Actif'; } // pas d'auto-rétrogradation
          // sous-rôle : choisi par la direction, effacé s'il ne correspond pas au rôle
          list[i].sousRole = validSubRole(list[i].role, D && rec.sousRole !== undefined ? rec.sousRole : cur.sousRole);
          continue;
        }
        if (name === 'activityLogs') { if (i === undefined) { list.push(rec); index.set(rec.id, list.length - 1); } continue; }
        if (i === undefined) { list.push(rec); index.set(rec.id, list.length - 1); } else list[i] = rec;
      }
      if (rms.length) {
        const rm = new Set(rms);
        if (name === 'users') rm.delete(a.user.id);
        if (name === 'events') {
          for (const r of list) if (r && rm.has(r.id) && r.affiche) await store.delete('poster:' + r.id); // l'affiche part avec la soirée
        }
        if (name === 'users') {
          for (const r of list) if (r && rm.has(r.id) && r.pieces) for (const t of Object.keys(r.pieces)) await store.delete(`piece:${r.id}:${t}`);
        }
        list = list.filter((r) => !rm.has(r && r.id));
      }
      if (name === 'activityLogs') {
        list.sort((x, y) => ((y.date || '') + (y.heure || '')).localeCompare((x.date || '') + (x.heure || '')));
        list = list.slice(0, 500);
      }
      await putCol(store, name, list);
    } else if (WHOLE.includes(name)) {
      if (!wholePerms[name]) { denied.push(name); continue; }
      if (!(c && Array.isArray(c.value))) continue;
      if (name === 'menu') {
        const value = cleanMenu(c.value);
        await dropPhotos(store, await readJSON(store, 'col:menu', null), value);
        await putCol(store, name, value);
      } else await putCol(store, name, c.value);
    }
  }
  const meta = await bump(store);
  return json({ ok: true, denied, version: meta.version });
}

/* Envoi (ou retrait si data est vide) de l'affiche d'une soirée — direction et comptabilité */
async function routePosterSet(req, store, a) {
  if (!['DIRECTION', 'SECRETAIRE'].includes(a.user.role)) return fail(403, 'Réservé à la direction et à la comptabilité.');
  const b = await readBody(req);
  const id = clean(b.eventId, 60);
  if (!/^[\w-]{1,60}$/.test(id)) return fail(400, 'Soirée inconnue.');
  let v = '';
  if (b.data) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data));
    if (!m) return fail(400, 'Image non reconnue : choisissez un fichier JPG, PNG ou WebP.');
    if (m[2].length > POSTER_MAX) return fail(413, 'Affiche trop lourde, choisissez une image plus petite.');
    v = Date.now().toString(36);
    await store.setJSON('poster:' + id, { type: m[1], data: m[2], v });
  } else {
    await store.delete('poster:' + id);
  }
  const events = await col(store, 'events');
  const ev = events.find((e) => e && e.id === id);
  if (ev) {
    if (v) ev.affiche = v; else delete ev.affiche;
    await putCol(store, 'events', events);
  }
  await addLog(store, a.user.id, v ? 'Affiche ajoutée' : 'Affiche retirée', ev ? ev.nom : id);
  const meta = await bump(store);
  return json({ ok: true, v, version: meta.version });
}

/* Envoi (ou retrait si data est vide) de la photo d'un article de la carte — direction seulement.
   L'espace staff note ensuite la version renvoyée (« photo ») sur l'article et enregistre la carte. */
async function routePhotoSet(req, store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const b = await readBody(req);
  const id = clean(b.itemId, 60);
  if (!/^[\w-]{1,60}$/.test(id)) return fail(400, 'Article inconnu.');
  let v = '';
  if (b.data) {
    const m = IMG_DATA.exec(String(b.data));
    if (!m) return fail(400, 'Image non reconnue : choisissez une photo JPEG ou PNG.');
    if (m[2].length > PHOTO_MAX) return fail(413, 'Photo trop lourde, choisissez une image plus petite.');
    v = Date.now().toString(36);
    await store.setJSON('photo:' + id, { type: m[1], data: m[2], v });
  } else {
    await store.delete('photo:' + id);
  }
  const menu = await readJSON(store, 'col:menu', null);
  const it = Array.isArray(menu) ? menu.find((x) => x && x.id === id) : null;
  if (it) {
    if (v) it.photo = v; else delete it.photo;
    await putCol(store, 'menu', menu);
  }
  await addLog(store, a.user.id, v ? 'Photo de la carte ajoutée' : 'Photo de la carte retirée', it ? it.nom : clean(b.nom, 80) || id);
  const meta = await bump(store);
  return json({ ok: true, v, version: meta.version });
}

/* Pièces jointes d'une fiche (permis de conduire, carte d'identité, permis port d'arme) */
async function routePieceSet(req, store, a) {
  const b = await readBody(req);
  const uid = clean(b.userId, 60);
  const type = clean(b.type, 20);
  if (!PIECES.includes(type)) return fail(400, 'Type de pièce inconnu.');
  if (uid !== a.user.id && !PIECE_WRITERS.includes(a.user.role)) return fail(403, 'Vous ne pouvez modifier que vos propres pièces jointes.');
  const target = a.users.find((u) => u.id === uid);
  if (!target) return fail(404, 'Compte introuvable.');
  let v = '';
  if (b.data) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data));
    if (!m) return fail(400, 'Image non reconnue : choisissez un fichier JPG, PNG ou WebP.');
    if (m[2].length > POSTER_MAX) return fail(413, 'Image trop lourde, choisissez une image plus petite.');
    v = Date.now().toString(36);
    await store.setJSON(`piece:${uid}:${type}`, { type: m[1], data: m[2], v });
    target.pieces = { ...(target.pieces || {}), [type]: v };
  } else {
    await store.delete(`piece:${uid}:${type}`);
    if (target.pieces) delete target.pieces[type];
  }
  await putCol(store, 'users', a.users);
  const label = { permis: 'Permis de conduire', identite: "Carte d'identité", arme: "Permis port d'arme" }[type];
  await addLog(store, a.user.id, v ? 'Pièce jointe ajoutée' : 'Pièce jointe retirée', `${label} — ${fullName(target)}`);
  const meta = await bump(store);
  return json({ ok: true, v, version: meta.version });
}
async function routePieceGet(store, a, uid, type) {
  if (!PIECES.includes(type)) return fail(404, 'Pièce introuvable.');
  if (uid !== a.user.id && !PIECE_READERS.includes(a.user.role)) return fail(403, 'Vous ne pouvez voir que votre propre fiche.');
  const p = await readJSON(store, `piece:${uid}:${type}`, null);
  if (!p || !p.data) return fail(404, 'Pièce introuvable.');
  return json({ mime: p.type, data: p.data, v: p.v });
}

async function routeLogout(store, a) {
  const sessions = await getSessions(store);
  delete sessions[a.token];
  await store.setJSON('sessions', sessions);
  return json({ ok: true });
}

/* Changer son mot de passe, ou (direction) réinitialiser celui d'un compte */
async function routePassword(req, store, a) {
  const b = await readBody(req);
  const targetId = b.userId && b.userId !== a.user.id ? b.userId : a.user.id;
  const self = targetId === a.user.id;
  if (!self && a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const target = a.users.find((u) => u.id === targetId);
  if (!target) return fail(404, 'Compte introuvable.');
  const np = String(b.newPassword || '');
  if (np.length < 4) return fail(400, 'Le nouveau mot de passe doit faire au moins 4 caractères.');
  if (self && !(await checkPassword(target, String(b.oldPassword || '')))) return fail(400, 'Mot de passe actuel incorrect.');
  await setPassword(target, np);
  await putCol(store, 'users', a.users);
  if (!self) {
    const sessions = await getSessions(store);
    Object.keys(sessions).forEach((k) => { if (sessions[k].userId === target.id) delete sessions[k]; });
    await store.setJSON('sessions', sessions);
  }
  await addLog(store, a.user.id, self ? 'Mot de passe modifié' : 'Mot de passe réinitialisé', fullName(target));
  const meta = await bump(store);
  return json({ ok: true, version: meta.version });
}

async function routeCreateUser(req, store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const b = await readBody(req);
  const v = validateAccount(b, a.users);
  if (v.error) return fail(400, v.error);
  const role = ROLES.includes(b.role) ? b.role : 'EMPLOYE';
  const user = {
    id: 'u_' + randomHex(6), username: v.username, prenom: v.prenom, nom: v.nom,
    role, sousRole: validSubRole(role, b.sousRole), poste: clean(b.poste, 60) || 'Non renseigné', statut: 'Actif', dateCreation: todayParis(),
  };
  await setPassword(user, v.password);
  a.users.push(user);
  await putCol(store, 'users', a.users);
  await addLog(store, a.user.id, 'Utilisateur créé', fullName(user));
  const meta = await bump(store);
  return json({ ok: true, user: publicUser(user), version: meta.version });
}

/* Premier lancement : la direction envoie le jeu initial (compta importée, soirées, postes, carte) */
async function routeBootstrap(req, store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const meta = await readMeta(store);
  if (meta.initialized) return json({ ok: true, already: true, version: meta.version });
  const b = await readBody(req);
  for (const name of ['events', 'accountingWeeks']) {
    if (Array.isArray(b[name]) && !(await col(store, name)).length) await putCol(store, name, b[name]);
  }
  for (const name of WHOLE) {
    if (Array.isArray(b[name]) && (await readJSON(store, 'col:' + name, null)) === null) await putCol(store, name, name === 'menu' ? cleanMenu(b[name]) : b[name]);
  }
  await addLog(store, a.user.id, 'Initialisation de la base', 'Pacific Bluffs — Espace staff');
  const m = await bump(store, { initialized: true });
  return json({ ok: true, version: m.version });
}

async function routeExport(store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const all = await loadAll(store);
  delete all.meta;
  return json({ pacific: 'sauvegarde', exportedAt: new Date().toISOString(), data: all });
}

async function routeImport(req, store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  const b = await readBody(req);
  const d = b.data && typeof b.data === 'object' ? b.data : b;
  if (!Array.isArray(d.users) || !Array.isArray(d.accountingWeeks)) return fail(400, "Ce fichier n'est pas une sauvegarde du Pacific Bluffs.");
  const users = d.users.filter((u) => u && u.id && u.username).map((u) => ({
    ...u, username: String(u.username).toLowerCase(), role: ROLES.includes(u.role) ? u.role : 'EMPLOYE', statut: u.statut || 'Actif',
  }));
  let me = users.find((u) => u.username === a.user.username.toLowerCase());
  if (!me) { users.push(a.user); me = a.user; } // ne jamais enfermer dehors la personne qui importe
  me.statut = 'Actif';
  me.role = 'DIRECTION';
  for (const name of ['events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales']) {
    await putCol(store, name, Array.isArray(d[name]) ? d[name] : []);
  }
  await putCol(store, 'users', users);
  for (const name of WHOLE) {
    if (!Array.isArray(d[name])) continue;
    if (name !== 'menu') { await putCol(store, name, d[name]); continue; }
    // les photos de la carte ne sont pas dans la sauvegarde : on ne garde que celles encore en ligne ici
    const menu = cleanMenu(d.menu);
    for (const m of menu) if (m && m.photo && !(await readJSON(store, 'photo:' + m.id, null))) delete m.photo;
    await dropPhotos(store, await readJSON(store, 'col:menu', null), menu);
    await putCol(store, 'menu', menu);
  }
  await store.setJSON('sessions', { [a.token]: { userId: me.id, exp: Date.now() + SESSION_MS } });
  await addLog(store, me.id, 'Sauvegarde importée', `${users.length} compte(s), ${d.accountingWeeks.length} semaine(s)`);
  const meta = await bump(store, { initialized: true });
  return json({ ok: true, version: meta.version });
}

async function routeReset(store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  for (const name of ['events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales']) await putCol(store, name, []);
  await putCol(store, 'users', [a.user]);
  await dropPhotos(store, await readJSON(store, 'col:menu', null), []);
  await store.delete('col:postes');
  await store.delete('col:menu');
  await store.delete('col:couleurs');
  await store.delete('col:cartes');
  await store.delete('col:cocons');
  await store.setJSON('sessions', { [a.token]: { userId: a.user.id, exp: Date.now() + SESSION_MS } });
  const meta = await bump(store, { initialized: false });
  return json({ ok: true, version: meta.version });
}

/* =====================================================================
   AIGUILLAGE
   ===================================================================== */
export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/api\/?/, '').replace(/\/+$/, '');
  const method = req.method.toUpperCase();
  try {
    const store = getStore({ name: 'pacific-bluffs', consistency: 'strong' });
    if (route === 'health') return await routeHealth(store);
    if (route === 'public' && method === 'GET') return await routePublic(store);
    const pm = /^poster\/([\w-]{1,60})$/.exec(route);
    if (pm && method === 'GET') return await routePosterGet(store, pm[1]);
    const ph = /^photo\/([\w-]{1,60})$/.exec(route);
    if (ph && method === 'GET') return await routePhotoGet(store, ph[1]);
    if (route === 'login' && method === 'POST') return await routeLogin(req, store);
    if (route === 'register' && method === 'POST') return await routeRegister(req, store);

    const a = await authenticate(req, store);
    if (!a) return fail(401, 'Session expirée : reconnectez-vous.');
    if (route === 'data' && method === 'GET') return await routeData(store, a);
    if (route === 'version' && method === 'GET') return json({ version: (await readMeta(store)).version || 0 });
    if (route === 'sync' && method === 'POST') return await routeSync(req, store, a);
    if (route === 'poster' && method === 'POST') return await routePosterSet(req, store, a);
    if (route === 'photo' && method === 'POST') return await routePhotoSet(req, store, a);
    if (route === 'piece' && method === 'POST') return await routePieceSet(req, store, a);
    const pc = /^piece\/([\w-]{1,60})\/(\w{1,20})$/.exec(route);
    if (pc && method === 'GET') return await routePieceGet(store, a, pc[1], pc[2]);
    if (route === 'logout' && method === 'POST') return await routeLogout(store, a);
    if (route === 'password' && method === 'POST') return await routePassword(req, store, a);
    if (route === 'users' && method === 'POST') return await routeCreateUser(req, store, a);
    if (route === 'bootstrap' && method === 'POST') return await routeBootstrap(req, store, a);
    if (route === 'export' && method === 'GET') return await routeExport(store, a);
    if (route === 'import' && method === 'POST') return await routeImport(req, store, a);
    if (route === 'reset' && method === 'POST') return await routeReset(store, a);
    return fail(404, 'Route inconnue.');
  } catch (e) {
    console.error('[pacific]', e);
    return fail(500, 'Erreur du serveur, réessayez dans un instant.');
  }
};
