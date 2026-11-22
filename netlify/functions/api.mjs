/* =====================================================================
   PACIFIC BLUFFS — Base partagée (Netlify Function + Netlify Blobs)

   Routes (toutes sous /api/) :
   - publiques  : GET health · GET public · GET poster/<id> · GET photo/<article>
                  POST login · POST register
     (les privatisations ne viennent plus de l'accueil : le staff les note, collection « rdv »)
   - connectées : GET data · GET version · POST sync · POST poster · POST photo · POST logout
                  POST password · POST users · POST bootstrap · GET export
                  POST import · POST reset · POST piece · GET piece/<compte>/<type>
                  POST docfile · GET docfile/<document>

   Stockage : un document par collection (clé « col:<nom> »), plus « meta »
   (version, initialisation), « sessions », une clé par affiche de soirée
   (« poster:<id> »), une par photo d'article de la carte (« photo:<id> ») et
   une par fichier de l'onglet Documents (« docfile:<id> »), gardées à part
   pour ne pas alourdir la synchro. Les mots de passe sont
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
// Grades des employés, attribués par la direction seulement (même liste que GRADES dans public/assets/js/app/data.js) :
// taux de commission sur les ventes et salaire maximum de la semaine (GRADE_CAPS). ROLE_RATES / ROLE_CAPS : managers,
// comptabilité et direction, fixes (direction : sans maximum). BASE_RATE / BASE_CAP : employé sans grade
// (= COMMISSION_VENTES de club-data.js). Mêmes valeurs que dans public/assets/js/app/data.js.
const GRADES = { 'Recrue': 0.25, 'Non qualifié': 0.25, 'Qualifié': 0.35 };
const GRADE_CAPS = { 'Recrue': 10000, 'Non qualifié': 10000, 'Qualifié': 12000 };
const ROLE_RATES = { MANAGER: 0.35, SECRETAIRE: 0.35, DIRECTION: 0.35 };
const ROLE_CAPS = { MANAGER: 14000, SECRETAIRE: 14000 };
const BASE_RATE = 0.25;
const BASE_CAP = 10000;
const validGrade = (role, v) => (role === 'EMPLOYE' && typeof v === 'string' && Object.hasOwn(GRADES, v) ? v : '');
const roleRate = (role) => (typeof role === 'string' && Object.hasOwn(ROLE_RATES, role) ? ROLE_RATES[role] : 0);
const rateOf = (u) => {
  if (u && roleRate(u.role)) return roleRate(u.role);
  const g = u && validGrade(u.role, u.grade);
  return g ? GRADES[g] : BASE_RATE;
};
// salaire maximum de la semaine du vendeur (0 = sans maximum : direction)
const capOf = (u) => {
  if (!u) return 0;
  if (u.role === 'EMPLOYE') { const g = validGrade(u.role, u.grade); return g ? GRADE_CAPS[g] : BASE_CAP; }
  return typeof u.role === 'string' && Object.hasOwn(ROLE_CAPS, u.role) ? ROLE_CAPS[u.role] : 0;
};
// Ventes déjà notées mises à jour une seule fois (meta.tauxV), « même ce qui est déjà marqué » :
// v2 (14/11/2026) encadrement à 45 % ; v3 (14/11/2026) encadrement ramené à 35 % et plafond posé sur les ventes
// qui n'en ont pas. Ensuite, chaque vente garde son taux et son plafond.
const RATES_VERSION = 3;
// joursSansSoiree : jours dont la soirée a été retirée à la main (le planning n'y remet pas de soirée classique)
// avantages : onglet Topo — récompenses offertes et cartes VIP des clients (voir cleanAvantage)
const COLS = ['users', 'events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales', 'joursSansSoiree', 'avantages'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
/* Fichier joint à un document (onglet Documents) : JPEG, PNG ou PDF, clé « docfile:<id> ».
   ~4 Mo maximum : l'envoi passe par la fonction Netlify, limitée à 6 Mo (le base64 ajoute un tiers). */
const DOC_MAX = 5400000;
const DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const DOC_DATA = /^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;
/* Onglet Documents : direction et gouvernement / fisc ajoutent et consultent, managers consultent seulement
   (sauf « Direction & Fisc »), employés et comptabilité n'y ont pas accès. */
const DOC_WRITERS = ['DIRECTION', 'GOUVERNEMENT'];
const DOC_READERS = ['DIRECTION', 'GOUVERNEMENT', 'MANAGER'];
const isPrivateDoc = (d) => !!d && (d.visibilite === 'Direction & Fisc' || d.visibilite === 'Direction & Comptabilité'); // ancien nom gardé
function docsFor(role, docs) {
  if (DOC_WRITERS.includes(role)) return docs;
  return role === 'MANAGER' ? docs.filter((d) => !isPrivateDoc(d)) : [];
}
/* Un document enregistré ne garde que la fiche du fichier (version, type, nom, taille), jamais le fichier lui-même */
function cleanDoc(r) {
  if (!r || typeof r !== 'object') return r;
  const out = { ...r };
  delete out.fichierData; // mode local seulement
  const f = out.fichier;
  if (f && typeof f === 'object' && /^[a-z0-9]{1,20}$/.test(String(f.v)) && DOC_TYPES.includes(f.type)) {
    out.fichier = { v: f.v, type: f.type, nom: clean(f.nom, 120) || 'fichier', taille: Math.max(0, Number(f.taille) || 0) };
  } else delete out.fichier;
  return out;
}
/* Fichiers des documents supprimés (ou qui n'ont plus de fichier) : effacés */
async function dropDocFiles(store, before, after) {
  if (!Array.isArray(before)) return;
  const kept = new Set((Array.isArray(after) ? after : []).filter((d) => d && d.fichier).map((d) => d.id));
  for (const d of before) if (d && d.fichier && typeof d.id === 'string' && !kept.has(d.id)) await store.delete('docfile:' + d.id);
}
/* Fichier envoyé avant son document : noté « en attente » (clé « docfiles-pending »). Si le document
   n'arrive jamais (onglet fermé pendant l'envoi), le fichier orphelin est effacé au bout de 6 h. */
const PENDING_KEY = 'docfiles-pending';
async function notePendingDocFile(store, id, docs) {
  const pend = await readJSON(store, PENDING_KEY, {});
  const now = Date.now();
  for (const [k, t] of Object.entries(pend)) {
    if (now - t < 6 * 3600000) continue;
    if (!docs.some((d) => d && d.id === k && d.fichier)) await store.delete('docfile:' + k);
    delete pend[k];
  }
  if (id) pend[id] = now;
  await store.setJSON(PENDING_KEY, pend);
}
async function clearPendingDocFiles(store, docs) {
  const pend = await readJSON(store, PENDING_KEY, null);
  if (!pend) return;
  let changed = false;
  for (const d of docs) if (d && d.fichier && pend[d.id]) { delete pend[d.id]; changed = true; }
  if (changed) await store.setJSON(PENDING_KEY, pend);
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

/* ---------------- Avantages des clients (onglet Topo) ----------------
   Le topo sert au staff à savoir quel client a quoi d'activé, pour lui apporter les services adaptés.
   Un avantage = ce qu'un client a gagné ou acheté : carte VIP (1 semaine ou 1 mois), escapade enchantée,
   séjour paradisiaque, bon de réduction de 25 %, soirée privée. Origine : « recompense » (offerte, notée par
   l'encadrement sur la fiche Récompenses : ni commission, ni recette), « vente » (carte VIP vendue sur la fiche
   Cartes VIP, ajoutée par le serveur) ou « compta » (ancien membre noté en comptabilité, repris une fois).
   Tout le staff les voit ; managers, comptabilité et direction les ajoutent, modifient et retirent. */
const AV_TYPES = ['vip', 'escapade', 'sejour', 'bon', 'soiree'];
const AV_ORIGINES = ['recompense', 'vente', 'compta'];
const AV_VERSION = 1; // cartes VIP déjà vendues et membres notés en compta repris dans les avantages (meta.avV)
const optDate = (v) => (DATE_RE.test(String(v || '')) ? String(v) : '');
/* Clé d'une carte membre (Green / Gold / Platinum), anciennes écritures comprises (« GOLD », « Platine »…) */
function tierKey(v) {
  const k = String(v || '').trim().toLowerCase();
  return Object.keys(CARD_PRICES).find((t) => t.toLowerCase() === k || (k.length >= 4 && t.toLowerCase().startsWith(k.slice(0, 4)))) || '';
}
function cleanAvantage(r, userId) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id)) return null;
  const type = AV_TYPES.includes(r.type) ? r.type : null;
  const beneficiaire = clean(r.beneficiaire, 60);
  if (!type || !beneficiaire) return null;
  const out = {
    id: r.id, type, origine: AV_ORIGINES.includes(r.origine) ? r.origine : 'recompense', beneficiaire,
    date: optDate(r.date), dateDebut: optDate(r.dateDebut), dateFin: optDate(r.dateFin),
    motif: clean(r.motif, 80), note: clean(r.note, 200), utilise: !!r.utilise,
    par: typeof r.par === 'string' ? r.par.slice(0, 40) : userId, createdAt: clean(r.createdAt, 40) || new Date().toISOString(),
  };
  const b2 = clean(r.beneficiaire2, 60);
  if (b2 && (type === 'escapade' || type === 'sejour')) out.beneficiaire2 = b2; // chambre pour 2
  if (type === 'vip') { out.carte = tierKey(r.carte) || 'Green'; out.duree = r.duree === 'mois' ? 'mois' : 'semaine'; }
  if (typeof r.saleId === 'string') out.saleId = r.saleId.slice(0, 80);
  if (out.dateFin && out.dateDebut && out.dateFin < out.dateDebut) out.dateFin = out.dateDebut;
  return out;
}
/* Carte VIP vendue sur la fiche Cartes VIP → avantage « vente » (valable 7 jours, comme en compta) */
const vipFromSale = (s) => ({
  id: 'av_' + s.id, type: 'vip', origine: 'vente', saleId: s.id, beneficiaire: clean(s.client, 60) || 'Client', carte: tierKey(s.categorie) || 'Green',
  duree: 'semaine', date: optDate(s.date), dateDebut: optDate(s.date), dateFin: s.date && DATE_RE.test(s.date) ? shiftISO(s.date, 6) : '',
  motif: '', note: '', utilise: false, par: typeof s.userId === 'string' ? s.userId : null, createdAt: clean(s.createdAt, 40) || new Date().toISOString(),
});
/* Ventes de cartes VIP ajoutées, corrigées ou retirées : l'avantage du client suit (un avantage retiré à la main
   dans l'onglet Topo ne revient pas tant que la vente n'est pas recréée). Renvoie ce qui a changé, que l'espace
   staff applique tout de suite (sinon le vendeur ne verrait la carte qu'au prochain changement d'un autre poste). */
async function linkVipAvantages(store, ups, removed, prevOf) {
  const delta = { upsert: [], remove: [] };
  const vipUps = ups.filter((s) => s && s.type === 'carteVip');
  const vipRm = removed.filter((s) => s && s.type === 'carteVip');
  if (!vipUps.length && !vipRm.length) return delta;
  let av = await col(store, 'avantages');
  for (const s of vipUps) {
    const i = av.findIndex((x) => x && x.id === 'av_' + s.id);
    const prev = prevOf(s.id);
    if (i < 0) { if (!prev) { const v = vipFromSale(s); av.push(v); delta.upsert.push(v); } continue; }
    if (prev && (prev.client !== s.client || prev.categorie !== s.categorie || prev.date !== s.date)) {
      const v = vipFromSale(s);
      av[i] = { ...av[i], beneficiaire: v.beneficiaire, carte: v.carte, date: v.date, dateDebut: v.dateDebut, dateFin: v.dateFin };
      delta.upsert.push(av[i]);
    }
  }
  if (vipRm.length) {
    const rm = new Set(vipRm.map((s) => 'av_' + s.id));
    av = av.filter((x) => {
      if (!(x && rm.has(x.id) && x.origine === 'vente')) return true;
      delta.remove.push(x.id);
      return false;
    });
  }
  if (delta.upsert.length || delta.remove.length) await putCol(store, 'avantages', av);
  return delta;
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
/* Ventes déjà notées : encadrement au taux de son rôle (35 %) et plafond posé, une seule fois (voir RATES_VERSION) */
async function upgradeRates(store) {
  const meta = await readMeta(store);
  if ((Number(meta.tauxV) || 0) >= RATES_VERSION) return;
  const [users, sales] = await Promise.all([col(store, 'users'), col(store, 'barSales')]);
  const byId = new Map(users.map((u) => [u && u.id, u]));
  let n = 0, changed = false;
  for (const s of sales) {
    if (!s) continue;
    const u = byId.get(s.userId);
    const r = u ? roleRate(u.role) : 0;
    if (r && s.taux !== r) { s.taux = r; n++; changed = true; }
    if (s.plafond === undefined || s.plafond === null) { s.plafond = capOf(u); changed = true; }
  }
  if (changed) await putCol(store, 'barSales', sales);
  if (n) await addLog(store, null, 'Commissions mises à jour', `${n} vente(s) de l'encadrement passée(s) à ${Math.round(ROLE_RATES.DIRECTION * 100)} %`);
  await bump(store, { tauxV: RATES_VERSION });
}
/* Onglet Topo (15/11/2026) : les cartes VIP déjà vendues et les membres notés en comptabilité deviennent des
   avantages, une seule fois (meta.avV). La liste des membres n'est plus affichée dans la comptabilité. */
async function upgradeAvantages(store) {
  const meta = await readMeta(store);
  if ((Number(meta.avV) || 0) >= AV_VERSION) return;
  const [sales, weeks, av] = await Promise.all([col(store, 'barSales'), col(store, 'accountingWeeks'), col(store, 'avantages')]);
  const have = new Set(av.map((x) => x && x.id));
  let n = 0;
  for (const s of sales) {
    if (!s || s.type !== 'carteVip' || have.has('av_' + s.id)) continue;
    av.push(vipFromSale(s)); have.add('av_' + s.id); n++;
  }
  for (const w of weeks) {
    (Array.isArray(w && w.members) ? w.members : []).forEach((m, i) => {
      const id = 'av_m_' + String((m && m.id) || `${w.id}_${i}`).replace(/[^\w-]/g, '').slice(0, 60);
      if (!m || !clean(m.nom, 60) || have.has(id)) return;
      av.push({
        id, type: 'vip', origine: 'compta', beneficiaire: clean(m.nom, 60), carte: tierKey(m.type) || 'Green', duree: 'semaine',
        date: optDate(m.dateDebut) || optDate(w.dateDebut), dateDebut: optDate(m.dateDebut), dateFin: optDate(m.dateFin),
        motif: '', note: clean(m.paiement, 120) ? 'Paiement : ' + clean(m.paiement, 120) : '', utilise: false, par: null, createdAt: new Date().toISOString(),
      });
      have.add(id); n++;
    });
  }
  if (n) {
    await putCol(store, 'avantages', av);
    await addLog(store, null, 'Onglet Topo', `${n} carte(s) VIP reprise(s) des ventes et de la comptabilité`);
  }
  await bump(store, { avV: AV_VERSION });
}
/* ---------------- Semaines comptables automatiques (22/11/2026) ----------------
   Une semaine comptable = les soirées du lundi au dimanche (journées de service de 6h à 6h, comme les salaires).
   Chaque lundi à 6h (heure de Paris), la semaine suivante s'ouvre toute seule : numéro suivant, mêmes lignes de
   recettes et de charges que la semaine d'avant (montants à 0), solde du coffre reporté automatiquement
   (soldeAuto : l'espace staff reprend le nouveau solde de la semaine d'avant, même si on la modifie encore).
   Les semaines d'avant restent modifiables. Vérifié au chargement des données et à chaque vérification de version
   (toutes les 15 s) ; meta.weeksUntil (fin de la dernière semaine) évite de relire la comptabilité entre-temps. */
const REVENUE_CATS = ['Entrées soirées', 'Hébergements', 'Bar & boissons', 'Service bouteille', 'Cartes membres', 'Événements privés', 'Contrats', 'Gouvernement', 'Export'];
const EXPENSE_CATS = ['Salaires staff', 'Approvisionnement bar', 'Entretien & maintenance', 'Autres dépenses'];
const DAY_KEYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const serviceDayParis = () => { const c = parisClock(); return c.min < 360 ? shiftISO(c.date, -1) : c.date; };
const mondayISO = (iso) => shiftISO(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));
const isDatedWeek = (w) => !!w && DATE_RE.test(w.dateDebut || '') && DATE_RE.test(w.dateFin || '');
/* Semaines à créer pour que la journée `today` ait sa semaine (aucune si elle en a déjà une) */
function weeksToCreate(weeks, today) {
  const dated = weeks.filter(isDatedWeek);
  if (dated.some((w) => w.dateDebut <= today && today <= w.dateFin)) return [];
  const before = dated.filter((w) => w.dateFin < today).sort((a, b) => a.dateFin.localeCompare(b.dateFin));
  const prev = before[before.length - 1] || null;
  let start = prev ? shiftISO(prev.dateFin, 1) : mondayISO(today);
  const floor = shiftISO(mondayISO(today), -7 * 52); // après une très longue pause : un an au plus
  if (start < floor) start = floor;
  const later = dated.map((w) => w.dateDebut).filter((d) => d > today).sort()[0]; // semaine déjà prévue plus tard
  const revRows = prev && Array.isArray(prev.revenues) && prev.revenues.length ? prev.revenues.map((r) => clean(r && r.categorie, 80)).filter(Boolean) : REVENUE_CATS;
  const expRows = prev && Array.isArray(prev.expenses) && prev.expenses.length ? prev.expenses.map((e) => clean(e && e.categorie, 80)).filter(Boolean) : EXPENSE_CATS;
  let num = weeks.reduce((m, w) => Math.max(m, Number(w && w.numero) || 0), 0);
  const out = [];
  while (start <= today && out.length < 60) {
    let end = shiftISO(mondayISO(start), 6); // jusqu'au dimanche
    if (later && end >= later) end = shiftISO(later, -1);
    out.push({
      id: 'wk_' + start, numero: ++num, dateDebut: start, dateFin: end, soldePrecedent: 0, soldeAuto: true, auto: true,
      statutValidation: 'À valider', valideParId: null, dateValidation: '',
      revenues: revRows.map((c) => ({ categorie: c, ...Object.fromEntries(DAY_KEYS.map((k) => [k, 0])), autre: 0 })),
      expenses: expRows.map((c) => ({ categorie: c, montant: 0, observations: '' })),
      salaries: [], members: [], menuSales: {}, observations: '', documentSource: '',
    });
    start = shiftISO(end, 1);
  }
  return out;
}
async function ensureWeeks(store, meta) {
  meta = meta || await readMeta(store);
  const today = serviceDayParis();
  if (!meta.initialized || (meta.weeksUntil && meta.weeksUntil >= today)) return meta;
  const weeks = await col(store, 'accountingWeeks');
  const add = weeksToCreate(weeks, today);
  if (add.length) {
    weeks.push(...add);
    await putCol(store, 'accountingWeeks', weeks);
    await addLog(store, null, 'Nouvelle semaine comptable', add.map((w) => `Semaine ${w.numero} (${w.dateDebut.slice(8)}/${w.dateDebut.slice(5, 7)} → ${w.dateFin.slice(8)}/${w.dateFin.slice(5, 7)})`).join(', ') + (add.length > 1 ? ' — ouvertes' : ' — ouverte') + ' automatiquement (lundi 6h)');
  }
  // fin de la semaine qui contient aujourd'hui : rien à revérifier avant
  const cur = weeks.filter(isDatedWeek).find((w) => w.dateDebut <= today && today <= w.dateFin);
  const weeksUntil = cur ? cur.dateFin : today;
  if (add.length) return bump(store, { weeksUntil });
  const fresh = await readMeta(store); // sans changer la version : personne n'a besoin de recharger
  fresh.weeksUntil = weeksUntil;
  await store.setJSON('meta', fresh);
  return fresh;
}
async function loadAll(store) {
  const [users, events, attendances, accountingWeeks, documents, activityLogs, rdv, barSales, joursSansSoiree, avantages, postes, menu, couleurs, cartes, cocons, meta] = await Promise.all([
    col(store, 'users'), col(store, 'events'), col(store, 'attendances'), col(store, 'accountingWeeks'), col(store, 'documents'),
    col(store, 'activityLogs'), col(store, 'rdv'), col(store, 'barSales'), col(store, 'joursSansSoiree'), col(store, 'avantages'), readJSON(store, 'col:postes', null), readJSON(store, 'col:menu', null),
    readJSON(store, 'col:couleurs', null), readJSON(store, 'col:cartes', null), readJSON(store, 'col:cocons', null), readMeta(store),
  ]);
  return { users, events, attendances, accountingWeeks, documents, activityLogs, rdv, barSales, joursSansSoiree, avantages, postes, menu, couleurs, cartes, cocons, meta };
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
  await upgradeRates(store);
  await upgradeAvantages(store);
  await ensureWeeks(store); // lundi 6h : la nouvelle semaine comptable
  const all = await loadAll(store);
  const role = a.user.role;
  const employe = role === 'EMPLOYE';
  const db = {
    users: all.users.filter((u) => role === 'DIRECTION' || u.statut !== 'En attente').map(publicUser),
    postes: all.postes || [],
    events: all.events,
    attendances: all.attendances,
    accountingWeeks: employe ? all.accountingWeeks.map((w) => weekForEmploye(w, a.user)) : all.accountingWeeks,
    documents: docsFor(role, all.documents),
    activityLogs: all.activityLogs,
    rdv: ['DIRECTION', 'SECRETAIRE', 'MANAGER'].includes(role) ? all.rdv : [],
    barSales: employe ? all.barSales.filter((s) => s && s.userId === a.user.id) : all.barSales, // l'employé : ses ventes seulement
    joursSansSoiree: all.joursSansSoiree,
    avantages: all.avantages, // onglet Topo : visible par tout le staff
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
    // pointages : l'employé ne retire que les siens non validés (imprévu), filtré plus bas
    users: [true, D], events: [!G, D || S], attendances: [!G, !G], accountingWeeks: [D || S || M, D || S],
    documents: [D || G, D], // documents : ajout direction et fisc, suppression direction
    activityLogs: [true, false], rdv: [D || S, D], barSales: [!G, !G],
    joursSansSoiree: [D || S, D || S], // comme la suppression des soirées
    avantages: [D || S || M, D || S || M], // onglet Topo et fiche Récompenses : encadrement seulement
  };
  const wholePerms = { postes: D, menu: D, couleurs: D || S, cartes: D, cocons: D };
  const denied = [];
  const derived = {}; // changements faits par le serveur (avantages des cartes VIP vendues), renvoyés à l'espace staff
  for (const [name, c] of Object.entries(changes)) {
    if (COLS.includes(name)) {
      let ups = Array.isArray(c && c.upsert) ? c.upsert.slice(0, 5000) : [];
      let rms = Array.isArray(c && c.remove) ? c.remove.slice(0, 5000) : [];
      const [canUp, canRm] = perms[name];
      if ((ups.length && !canUp) || (rms.length && !canRm)) { denied.push(name); continue; }
      // un jour vidé = { id: « js_<date> », date } et rien d'autre
      if (name === 'joursSansSoiree') ups = ups.filter((r) => r && DATE_RE.test(r.date)).map((r) => ({ id: 'js_' + r.date, date: r.date }));
      if (name === 'documents') ups = ups.map(cleanDoc);
      if (name === 'avantages') ups = ups.map((r) => cleanAvantage(r, a.user.id)).filter(Boolean);
      let list = await col(store, name);
      const docsBefore = name === 'documents' ? list.slice() : null;
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
        const [menu, cartes, cocons, users] = ups.length
          ? await Promise.all(['menu', 'cartes', 'cocons', 'users'].map((n) => readJSON(store, 'col:' + n, null))) : [null, null, null, null];
        ups = ups.map((r) => {
          const out = r && typeof r === 'object' ? normalizeSale(r, { menu, cartes, cocons }) : null;
          if (!out) return null;
          // commission : taux et salaire maximum du vendeur au moment de la vente (une vente déjà notée garde les siens)
          const i = index.get(r.id);
          const prev = i !== undefined ? list[i] : null;
          const seller = (users || []).find((u) => u && u.id === out.userId);
          const taux = prev ? prev.taux : rateOf(seller);
          if (typeof taux === 'number') out.taux = taux; else delete out.taux;
          out.plafond = prev && typeof prev.plafond === 'number' ? prev.plafond : capOf(seller);
          return out;
        }).filter(Boolean);
        if (ups.length + rms.length < asked) denied.push(name); // l'espace staff recharge alors les vraies données
        // cartes VIP vendues : l'avantage du client (onglet Topo) est ajouté, corrigé ou retiré avec la vente
        const prevOf = (id) => { const i = index.get(id); return i !== undefined ? list[i] : null; };
        const d = await linkVipAvantages(store, ups, rms.map(prevOf), prevOf);
        if (d.upsert.length || d.remove.length) derived.avantages = d;
      }
      if (name === 'attendances' && !(D || M || S) && rms.length) {
        // présence retirée par un employé : la sienne seulement, et pas une fois validée
        const asked = rms.length;
        rms = rms.filter((id) => { const i = index.get(id); return i === undefined || (list[i] && list[i].userId === a.user.id && list[i].statut !== 'Validé'); });
        if (rms.length < asked) denied.push(name);
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
          if (D) { // rôle, sous-rôle, grade et statut : direction seulement
            list[i].role = ROLES.includes(rec.role) ? rec.role : cur.role;
            list[i].statut = ['Actif', 'Désactivé', 'En attente'].includes(rec.statut) ? rec.statut : cur.statut;
          }
          if (self) { list[i].role = cur.role; list[i].statut = 'Actif'; } // pas d'auto-rétrogradation
          // sous-rôle : choisi par la direction, effacé s'il ne correspond pas au rôle
          list[i].sousRole = validSubRole(list[i].role, D && rec.sousRole !== undefined ? rec.sousRole : cur.sousRole);
          // grade (employés seulement, fixe la commission) : choisi par la direction, effacé pour les autres rôles
          list[i].grade = validGrade(list[i].role, D && rec.grade !== undefined ? rec.grade : cur.grade);
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
      if (docsBefore) { // le fichier part avec le document ; un fichier dont le document est arrivé n'est plus en attente
        await dropDocFiles(store, docsBefore, list);
        await clearPendingDocFiles(store, list);
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
  return json({ ok: true, denied, derived, version: meta.version });
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

/* Fichier d'un document (JPEG, PNG ou PDF), envoyé avant d'enregistrer le document :
   l'espace staff note la fiche renvoyée (« fichier ») sur le document puis le synchronise */
async function routeDocFileSet(req, store, a) {
  if (!DOC_WRITERS.includes(a.user.role)) return fail(403, "Vous ne pouvez pas ajouter de document.");
  const b = await readBody(req);
  const id = clean(b.docId, 60);
  if (!/^[\w-]{1,60}$/.test(id)) return fail(400, 'Document inconnu.');
  const m = DOC_DATA.exec(String(b.data || ''));
  if (!m) return fail(400, 'Fichier non reconnu : choisissez un JPEG, un PNG ou un PDF.');
  if (m[2].length > DOC_MAX) return fail(413, 'Fichier trop lourd : 4 Mo maximum.');
  const docs = await col(store, 'documents');
  const doc = docs.find((d) => d && d.id === id);
  const v = Date.now().toString(36);
  const taille = Math.floor((m[2].length * 3) / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0);
  const fichier = { v, type: m[1], nom: clean(b.nom, 120) || 'fichier', taille };
  await store.setJSON('docfile:' + id, { type: m[1], data: m[2], v, nom: fichier.nom });
  let version = (await readMeta(store)).version || 0;
  if (doc) { // document déjà enregistré : on y note le nouveau fichier
    doc.fichier = fichier;
    await putCol(store, 'documents', docs);
    version = (await bump(store)).version;
  } else await notePendingDocFile(store, id, docs);
  return json({ ok: true, fichier, version });
}
/* Lecture d'un fichier : direction, fisc et managers, avec la même visibilité que le document */
async function routeDocFileGet(store, a, id) {
  if (!DOC_READERS.includes(a.user.role)) return fail(403, 'Les documents sont réservés à la direction, au fisc et aux managers.');
  const docs = await col(store, 'documents');
  const doc = docs.find((d) => d && d.id === id);
  if (!doc || !doc.fichier) return fail(404, 'Fichier introuvable.');
  if (!docsFor(a.user.role, [doc]).length) return fail(403, 'Document réservé à la direction et au fisc.');
  const f = await readJSON(store, 'docfile:' + id, null);
  if (!f || !f.data) return fail(404, 'Fichier introuvable.');
  return json({ mime: f.type, data: f.data, nom: f.nom || doc.fichier.nom, v: f.v });
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
    role, sousRole: validSubRole(role, b.sousRole), grade: validGrade(role, b.grade), poste: clean(b.poste, 60) || 'Non renseigné', statut: 'Actif', dateCreation: todayParis(),
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
  await upgradeRates(store);
  await upgradeAvantages(store);
  const all = await loadAll(store);
  const tauxV = Number(all.meta.tauxV) || 0; // la sauvegarde dit si les ventes ont déjà été mises à jour (taux de l'encadrement, plafonds)
  const avV = Number(all.meta.avV) || 0;     // … et si les cartes VIP ont déjà été reprises dans les avantages
  delete all.meta;
  all.tauxV = tauxV;
  all.avV = avV;
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
  // les fichiers des documents ne sont pas dans la sauvegarde : on ne garde que ceux encore en ligne ici
  const docs = (Array.isArray(d.documents) ? d.documents : []).map(cleanDoc);
  for (const doc of docs) if (doc && doc.fichier && !(await readJSON(store, 'docfile:' + doc.id, null))) delete doc.fichier;
  await dropDocFiles(store, await col(store, 'documents'), docs);
  d.documents = docs;
  d.avantages = (Array.isArray(d.avantages) ? d.avantages : []).map((r) => cleanAvantage(r, null)).filter(Boolean);
  for (const name of ['events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales', 'joursSansSoiree', 'avantages']) {
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
  // ancienne sauvegarde (avant l'encadrement à 35 % et les plafonds, avant l'onglet Topo) : ses ventes et ses cartes VIP
  // seront mises à jour au prochain chargement
  // weeksUntil remis à zéro : les semaines manquantes depuis la sauvegarde sont créées au prochain chargement
  const meta = await bump(store, { initialized: true, tauxV: Number(d.tauxV) || 0, avV: Number(d.avV) || 0, weeksUntil: '' });
  return json({ ok: true, version: meta.version });
}

async function routeReset(store, a) {
  if (a.user.role !== 'DIRECTION') return fail(403, 'Réservé à la direction.');
  await dropDocFiles(store, await col(store, 'documents'), []);
  for (const k of Object.keys(await readJSON(store, PENDING_KEY, {}))) await store.delete('docfile:' + k);
  await store.delete(PENDING_KEY);
  for (const name of ['events', 'attendances', 'accountingWeeks', 'documents', 'activityLogs', 'rdv', 'barSales', 'joursSansSoiree', 'avantages']) await putCol(store, name, []);
  await putCol(store, 'users', [a.user]);
  await dropPhotos(store, await readJSON(store, 'col:menu', null), []);
  await store.delete('col:postes');
  await store.delete('col:menu');
  await store.delete('col:couleurs');
  await store.delete('col:cartes');
  await store.delete('col:cocons');
  await store.setJSON('sessions', { [a.token]: { userId: a.user.id, exp: Date.now() + SESSION_MS } });
  const meta = await bump(store, { initialized: false, weeksUntil: '' });
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
    // vérification toutes les 15 s : ouvre aussi la nouvelle semaine comptable le lundi à 6h (sans relire la compta avant)
    if (route === 'version' && method === 'GET') return json({ version: (await ensureWeeks(store)).version || 0 });
    if (route === 'sync' && method === 'POST') return await routeSync(req, store, a);
    if (route === 'poster' && method === 'POST') return await routePosterSet(req, store, a);
    if (route === 'photo' && method === 'POST') return await routePhotoSet(req, store, a);
    if (route === 'piece' && method === 'POST') return await routePieceSet(req, store, a);
    const pc = /^piece\/([\w-]{1,60})\/(\w{1,20})$/.exec(route);
    if (pc && method === 'GET') return await routePieceGet(store, a, pc[1], pc[2]);
    if (route === 'docfile' && method === 'POST') return await routeDocFileSet(req, store, a);
    const dc = /^docfile\/([\w-]{1,60})$/.exec(route);
    if (dc && method === 'GET') return await routeDocFileGet(store, a, dc[1]);
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
