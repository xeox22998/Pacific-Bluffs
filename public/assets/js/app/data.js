/* =====================================================================
   PACIFIC BLUFFS — Espace interne : référentiels et jeu initial
   La comptabilité démarre à la semaine 1 (semaine en cours au premier
   lancement) ; les suivantes se créent depuis l'onglet Comptabilité.
   ===================================================================== */

function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

const ROLES = { EMPLOYE: 'EMPLOYE', MANAGER: 'MANAGER', SECRETAIRE: 'SECRETAIRE', DIRECTION: 'DIRECTION', GOUVERNEMENT: 'GOUVERNEMENT' };
const ROLE_LABEL = { EMPLOYE: 'Employé', MANAGER: 'Manager', SECRETAIRE: 'Comptabilité', DIRECTION: 'Direction', GOUVERNEMENT: 'Gouvernement / Fisc' };
const ROLE_DESC = {
  EMPLOYE: 'Voir mon planning, déclarer mes présences, noter mes ventes.',
  MANAGER: "Gérer les présences et le planning de l'équipe, consulter les documents.",
  SECRETAIRE: 'Gérer la comptabilité, le planning des soirées et les privatisations.',
  DIRECTION: 'Accès complet à la gestion du Pacific Bluffs.',
  GOUVERNEMENT: 'Contrôle fiscal : consulter la comptabilité, ajouter et consulter les documents.',
};
const ROLE_ORDER = [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.GOUVERNEMENT, ROLES.DIRECTION];
/* Sous-rôles (spécialité dans l'équipe) : attribués par la direction seulement.
   Même liste dans netlify/functions/api.mjs (SUB_ROLES), revérifiée par le serveur. */
const SUB_ROLES = {
  MANAGER: ['Sécurité', 'Bar', 'Hospitalité / Loisirs'],
  EMPLOYE: ['Agent de sécurité', 'Barman / Barmaid', "Animateur / Agent d'accueil", 'Agent polyvalent'],
};
function subRolesOf(role) { return SUB_ROLES[role] || []; }
function subRoleOf(u) { return u && subRolesOf(u.role).includes(u.sousRole) ? u.sousRole : ''; }
/* Rôle affiché : « Manager · Bar », « Employé · Barman / Barmaid »… */
function roleLabel(u) { const s = subRoleOf(u); return (ROLE_LABEL[u.role] || '') + (s ? ' · ' + s : ''); }
/* Grades des employés (à côté du sous-rôle, attribués par la direction seulement) : ils fixent la
   commission sur les ventes ; un employé sans grade touche COMMISSION_RATE. Managers, comptabilité et
   direction ont un taux fixe (ROLE_RATES). Mêmes listes dans netlify/functions/api.mjs (GRADES,
   ROLE_RATES), revérifiées par le serveur. */
const ROLE_RATES = { [ROLES.MANAGER]: 0.45, [ROLES.SECRETAIRE]: 0.45, [ROLES.DIRECTION]: 0.45 };
const ROLE_RATE_NAMES = { [ROLES.MANAGER]: 'les managers', [ROLES.SECRETAIRE]: 'la comptabilité', [ROLES.DIRECTION]: 'la direction' };
function roleRate(role) { return Object.prototype.hasOwnProperty.call(ROLE_RATES, role) ? ROLE_RATES[role] : 0; }
const GRADES = [
  { id: 'Recrue', taux: 0.25 },
  { id: 'Non qualifié', taux: 0.25 },
  { id: 'Qualifié', taux: 0.35 },
];
const DEFAULT_GRADE = 'Recrue'; // proposé à la création et à la validation d'un compte employé
function hasGrades(role) { return role === ROLES.EMPLOYE; }
function gradeOf(u) { return u && hasGrades(u.role) && GRADES.some((g) => g.id === u.grade) ? u.grade : ''; }
/* Rôle complet : « Employé · Barman / Barmaid · Qualifié » */
function roleLabelFull(u) { const g = gradeOf(u); return roleLabel(u) + (g ? ' · ' + g : ''); }

/* Ordre des onglets (demandé le 10/11/2026) : tableau de bord, mon planning, programme (+ présences),
   ventes, privatisations, comptabilité, la carte, équipe, documents, administration */
const NAV_ITEMS = [
  { key: 'dashboard',      label: 'Tableau de bord', icon: 'grid',        roles: '*' },
  { key: 'planning',       label: 'Mon planning',    icon: 'calendar',    roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'programme',      label: 'Programme',       icon: 'mic',         roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'presences',      label: 'Présences',       icon: 'checkCircle', roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'ventes',         label: 'Ventes',          icon: 'receipt',     roles: '*' },
  { key: 'privatisations', label: 'Privatisations',  icon: 'party',       roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'comptabilite',   label: 'Comptabilité',    icon: 'wallet',      roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION, ROLES.GOUVERNEMENT] },
  { key: 'carte',          label: 'La carte',        icon: 'glass',       roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'equipe',         label: 'Équipe',          icon: 'users',       roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION, ROLES.GOUVERNEMENT] },
  // documents : manager en lecture seule, fisc et direction ajoutent et consultent (personne d'autre)
  { key: 'documents',      label: 'Documents',       icon: 'folder',      roles: [ROLES.MANAGER, ROLES.GOUVERNEMENT, ROLES.DIRECTION] },
  { key: 'administration', label: 'Administration',  icon: 'settings',    roles: [ROLES.DIRECTION] },
];

const REVENUE_CATS = ['Entrées soirées', 'Hébergements', 'Bar & boissons', 'Service bouteille', 'Cartes membres', 'Événements privés', 'Contrats', 'Gouvernement', 'Export'];
const EXPENSE_CATS = ['Salaires staff', 'Approvisionnement bar', 'Entretien & maintenance', 'Autres dépenses'];
const ACCUEIL_POSTE = "Agent d'accueil / Animateur"; // remplace les danseuses (09/11/2026)
const DEFAULT_POSTES = [ACCUEIL_POSTE, ACCUEIL_POSTE + ' 2', 'Barman', 'Barman 2', 'Agent sécurité', 'Agent sécurité 2', 'Agent sécurité 3'];
const DOC_CATEGORIES = ['COMPTABILITÉ', 'PROGRAMMES', 'ADMINISTRATION', 'CONTRATS', 'AUTRES'];
const DOC_VISUALS = {
  'COMPTABILITÉ':   { emoji: '💰', hue: 160 },
  'PROGRAMMES':     { emoji: '🎤', hue: 330 },
  'ADMINISTRATION': { emoji: '🗂️', hue: 190 },
  'CONTRATS':       { emoji: '✍️', hue: 280 },
  'AUTRES':         { emoji: '📦', hue: 25 },
};
const ATT_STATUTS = ['À confirmer', 'Présent', 'Arrivé', 'Terminé', 'Absent', 'À valider', 'Validé'];
const DAY_KEYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const MENU_CATEGORIES = CLUB.MENU_CATEGORIES;
const RDV_STATUTS = ['Nouvelle', 'En cours', 'Acceptée', 'Refusée', 'Terminée'];
/* Pièces jointes des fiches de l'équipe */
const PIECES = [
  { id: 'permis', label: 'Permis de conduire', icon: '🚗' },
  { id: 'identite', label: "Carte d'identité", icon: '🪪' },
  { id: 'arme', label: "Permis port d'arme", icon: '🔫' },
];
/* Types d'événements du planning et leur couleur par défaut (modifiables : DB.couleurs) */
const EVENT_CATS = [
  { id: 'grand', label: 'Grand événement', color: '#ff4f8b' },
  { id: 'classique', label: 'Soirée classique', color: '#8b84a6' },
  { id: 'reunion', label: 'Réunion', color: '#1fb5c1' },
  { id: 'rdv', label: 'Rendez-vous', color: '#ff8a3d' },
];
function eventCat(ev) { return (ev && ev.categorie) || (ev && ev.nom === 'Soirée classique' ? 'classique' : 'grand'); }
function catLabel(id) { return (EVENT_CATS.find((c) => c.id === id) || EVENT_CATS[0]).label; }
function catColor(id) {
  const custom = DB && Array.isArray(DB.couleurs) ? DB.couleurs.find((c) => c && c.id === id) : null;
  if (custom && /^#[0-9a-f]{6}$/i.test(custom.color)) return custom.color;
  return (EVENT_CATS.find((c) => c.id === id) || EVENT_CATS[0]).color;
}
/* Texte noir ou blanc selon la couleur de fond */
function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1c0b26' : '#ffffff';
}
/* Carte en vigueur : celle modifiée par la direction, sinon la carte par défaut */
function menuItems() { return (DB && Array.isArray(DB.menu) && DB.menu.length) ? CLUB.upgradeMenu(DB.menu) : CLUB.MENU; }
/* Nouvelle carte (club-data.js) : la carte enregistrée est remplacée une fois, à la connexion de la direction
   (en mode local, par n'importe quel compte : les données sont dans le navigateur) */
function upgradeCarte() {
  if (!DB || !Array.isArray(DB.menu) || !DB.menu.length) return;
  const up = CLUB.upgradeMenu(DB.menu);
  if (up === DB.menu || (isShared() && !isDirection())) return;
  DB.menu = up;
  logActivity('Carte mise à jour', 'Nouvelle carte du Pacific Bluffs');
  saveSoon();
}
/* Plus de danseuses : les postes « Danseuse » (« Danseuse 2 »…) deviennent « Agent d'accueil / Animateur »
   dans la liste des postes et dans les soirées à venir ; les soirées passées gardent leur historique.
   Enregistré à la connexion de la direction (en mode local, de n'importe quel compte), comme upgradeCarte. */
function renamedPoste(p) {
  const m = /^Danseuses?( \d+)?$/i.exec(String(p || '').trim());
  return m ? ACCUEIL_POSTE + (m[1] || '') : p;
}
function upgradePostes() {
  if (!DB || !Array.isArray(DB.postes) || (isShared() && !isDirection())) return;
  let n = 0;
  const postes = [];
  DB.postes.forEach((p) => { const q = renamedPoste(p); if (q !== p) n++; if (!postes.includes(q)) postes.push(q); });
  const today = todayISO();
  const futurs = new Set();
  DB.events.forEach((ev) => {
    if (!ev || !(ev.date >= today) || !Array.isArray(ev.assignments)) return;
    ev.assignments.forEach((a) => { const q = renamedPoste(a && a.poste); if (a && q !== a.poste) { a.poste = q; n++; futurs.add(ev.id); } });
  });
  DB.attendances.forEach((a) => {
    const q = a && futurs.has(a.eventId) ? renamedPoste(a.poste) : null;
    if (q && q !== a.poste) { a.poste = q; n++; }
  });
  if (!n) return;
  DB.postes = postes;
  logActivity('Postes mis à jour', `Danseuse → ${ACCUEIL_POSTE}`);
  saveSoon();
}
/* Cartes membres en vigueur (tarifs et avantages modifiables par la direction dans « La carte ») */
function membershipTiers() { return CLUB.membershipTiers(DB && DB.cartes); }
function cardPrice(key) { const t = membershipTiers().find((x) => x.key === key); return t ? Number(t.prix) || 0 : 0; }
/* Nom affiché d'une carte (clé Green / Gold / Platinum, ou ancien texte libre de la comptabilité) */
function tierName(key) {
  const k = String(key || '').toLowerCase();
  const t = membershipTiers().find((x) => x.key.toLowerCase() === k || (k.length >= 4 && x.key.toLowerCase().startsWith(k.slice(0, 4))));
  return t ? t.nom : String(key || '');
}
/* Cocons paradisiaques en vigueur (chambres pour 2 vendues sur la fiche hospitalité) */
function coconsList() { return (DB && Array.isArray(DB.cocons)) ? DB.cocons : CLUB.COCONS; }


function defaultRevenueRows() { return REVENUE_CATS.map((c) => ({ categorie: c, lun: 0, mar: 0, mer: 0, jeu: 0, ven: 0, sam: 0, dim: 0, autre: 0 })); }
function defaultExpenseRows() { return EXPENSE_CATS.map((c) => ({ categorie: c, montant: 0, observations: '' })); }

/* =====================================================================
   FICHES DE VENTES (onglet « Ventes », voir views/ventes.js)
   Une vente = un enregistrement de DB.barSales (nom de collection gardé pour la base) :
   { id, type: 'carte' | 'hospitalite' | 'carteVip', date: journée de service (AAAA-MM-JJ), day, userId,
     itemId, nom, categorie, prix, qty, client (carte VIP, hébergement, cocon), client2 (cocon), heure, createdAt }
   Hospitalité : categorie = 'Entrée' (entrées en soirée) ou 'Cocon' (cocon paradisiaque : chambre
   pour 2, prix de la liste DB.cocons, deux noms de clients) ; 'Hébergement' : anciennes ventes seulement.
   Journée de service : de 6h à 6h le lendemain, heure de Paris (comme le serveur). À 6h la
   journée se ferme : ses ventes passent toutes seules dans la comptabilité (cases « Bar &
   boissons », « Entrées soirées », « Hébergements », « Cartes membres ») et dans le dossier salaires.
   Chaque vendeur touche une part de chaque vente : c'est son salaire de la semaine, du lundi 6h au
   lundi 6h suivant (= les journées de service du lundi au dimanche). Part = 45 % pour les managers,
   la comptabilité et la direction (ROLE_RATES), sinon le taux du grade de l'employé (GRADES : 35 %
   qualifié, 25 % non qualifié et recrue), COMMISSION_RATE (25 %) pour un employé sans grade.
   Le taux est gardé sur la vente (champ taux, fixé par le serveur) : un changement de grade ou de rôle
   compte pour les ventes notées ensuite ; les anciennes ventes sans taux restent à COMMISSION_RATE.
   Exception (14/11/2026) : le passage à 45 % a été appliqué aussi aux ventes déjà notées par les
   managers, la comptabilité et la direction, une seule fois (upgradeTaux ici en mode local,
   upgradeRates dans api.mjs en base partagée).
   ===================================================================== */
const SALE_TYPES = [
  { id: 'carte', label: 'Carte', long: 'Fiche des ventes de la carte', emoji: '🍹', compta: 'Bar & boissons' },
  { id: 'hospitalite', label: 'Hospitalité', long: 'Fiche hospitalité', emoji: '🛎️', compta: 'Entrées soirées / Hébergements (cocons)' },
  { id: 'carteVip', label: 'Cartes VIP', long: 'Fiche des ventes de cartes VIP', emoji: '💳', compta: 'Cartes membres' },
];
const COMMISSION_RATE = Number(CLUB.COMMISSION_VENTES) || 0.25;
const COMMISSION_PCT = Math.round(COMMISSION_RATE * 100);
const SERVICE_START_HOUR = 6;
const PARIS_FMT = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function shiftISO(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function parisNow(d) {
  const p = {};
  PARIS_FMT.formatToParts(d || new Date()).forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour) % 24, m: Number(p.minute) };
}
/* Journée de service en cours (avant 6h, c'est encore la soirée de la veille) */
function serviceDay(d) { const p = parisNow(d); return p.h < SERVICE_START_HOUR ? shiftISO(p.date, -1) : p.date; }
/* Minutes avant le prochain transfert de 6h */
function minutesToTransfer() {
  const p = parisNow();
  const now = p.h * 60 + p.m, t = SERVICE_START_HOUR * 60;
  return now < t ? t - now : 24 * 60 - now + t;
}
function dayKeyOf(iso) { return DAY_KEYS[(new Date(iso + 'T00:00:00').getDay() + 6) % 7]; }
function mondayOf(iso) { const d = new Date(iso + 'T00:00:00'); return shiftISO(iso, -((d.getDay() + 6) % 7)); }
/* Semaine de salaire : du lundi 6h au lundi 6h suivant (ex : « lun. 09/11 6h → lun. 16/11 6h ») */
function salaryWeekLabel(mon) { const f = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7); return `lun. ${f(mon)} 6h → lun. ${f(shiftISO(mon, 7))} 6h`; }
function saleType(s) { return (s && s.type) || 'carte'; }
function saleDayKey(s) { return s.date ? dayKeyOf(s.date) : s.day; }
function saleTotal(s) { return (Number(s.prix) || 0) * (Number(s.qty) || 0); }
function sumSales(list) { return list.reduce((t, s) => t + saleTotal(s), 0); }
/* Commissions : taux du grade du vendeur, gardé sur chaque vente */
const round2 = (n) => Math.round(n * 100) / 100;
function pctOf(rate) { return Math.round(rate * 100) + ' %'; }
/* Taux d'un vendeur aujourd'hui : rôle (45 % managers, comptabilité, direction), sinon grade de l'employé */
function sellerRate(u) {
  const r = u ? roleRate(u.role) : 0;
  if (r) return r;
  const g = GRADES.find((x) => x.id === gradeOf(u));
  return g ? g.taux : COMMISSION_RATE;
}
function userRate(userId) { return sellerRate((DB && DB.users || []).find((u) => u.id === userId)); }
function saleRate(s) { const t = Number(s && s.taux); return t > 0 && t < 1 ? t : COMMISSION_RATE; }
function saleCommission(s) { return round2(saleTotal(s) * saleRate(s)); }
function commissionOfSales(list) { return round2(list.reduce((t, s) => t + saleTotal(s) * saleRate(s), 0)); }
/* Taux d'une liste de ventes : « 35 % », « 25 à 35 % » (taux mélangés), ou le taux par défaut si elle est vide */
function ratesText(list, fallback) {
  const r = [...new Set(list.map(saleRate))].sort((a, b) => a - b);
  if (!r.length) return typeof fallback === 'string' ? fallback : pctOf(fallback === undefined ? COMMISSION_RATE : fallback);
  return r.length === 1 ? pctOf(r[0]) : `${Math.round(r[0] * 100)} à ${pctOf(r[r.length - 1])}`;
}
/* Fourchette de tous les taux possibles : « 25 à 45 % » (tout le staff, avant la première vente) */
function allRatesRange() { const t = rateGroups().map((x) => x.taux); return `${Math.round(Math.min(...t) * 100)} à ${pctOf(Math.max(...t))}`; }
const joinFr = (list, last) => (list.length > 1 ? list.slice(0, -1).join(', ') + last + list[list.length - 1] : list[0] || '');
/* Taux groupés du plus haut au plus bas : [{ taux, roles: [...], grades: [...] }] */
function rateGroups() {
  const by = new Map();
  const add = (taux, k, v) => { if (!by.has(taux)) by.set(taux, { taux, roles: [], grades: [] }); by.get(taux)[k].push(v); };
  Object.keys(ROLE_RATES).forEach((r) => add(ROLE_RATES[r], 'roles', r));
  GRADES.forEach((g) => add(g.taux, 'grades', g.id));
  const last = (a, b) => (a === 'Recrue') - (b === 'Recrue'); // « non qualifié ou recrue »
  return [...by.values()].map((x) => ({ ...x, grades: x.grades.sort(last) })).sort((a, b) => b.taux - a.taux);
}
/* Règle complète : « 45 % pour les managers, la comptabilité et la direction ; 35 % pour un employé qualifié ;
   25 % pour un employé non qualifié ou une recrue » */
function commissionRule() {
  return rateGroups().map((x) => {
    const who = [joinFr(x.roles.map((r) => ROLE_RATE_NAMES[r]), ' et '),
      joinFr(x.grades.map((g) => (g === 'Recrue' ? 'une recrue' : 'un employé ' + g.toLowerCase())), ' ou ')].filter(Boolean).join(', ');
    return `${pctOf(x.taux)} pour ${who}`;
  }).join(' ; ');
}
/* Version courte (badges) : « 45 % encadrement · 35 % qualifié · 25 % non qualifié / recrue » */
function commissionRuleShort() {
  return rateGroups().map((x) => `${pctOf(x.taux)} ${[x.roles.length ? 'encadrement' : '', x.grades.map((g) => g.toLowerCase()).join(' / ')].filter(Boolean).join(', ')}`).join(' · ');
}
/* Managers, comptabilité et direction passent à 45 % (14/11/2026) : leurs ventes déjà notées aussi, une seule fois.
   Mode local seulement : en base partagée, c'est le serveur (upgradeRates dans api.mjs). */
const TAUX_VERSION = 2;
function upgradeTaux() {
  if (!DB || isShared() || (Number(DB.tauxV) || 0) >= TAUX_VERSION) return;
  const roleOf = new Map((DB.users || []).map((u) => [u && u.id, u && u.role]));
  let n = 0;
  (DB.barSales || []).forEach((s) => { const r = s ? roleRate(roleOf.get(s.userId)) : 0; if (r && s.taux !== r) { s.taux = r; n++; } });
  DB.tauxV = TAUX_VERSION;
  if (n) logActivity('Commissions mises à jour', `${n} vente(s) de l'encadrement passée(s) à ${pctOf(ROLE_RATES[ROLES.DIRECTION])}`);
  saveSoon();
}
/* Une journée est transférée en comptabilité dès 6h le lendemain (les anciennes ventes sans date le sont) */
function isDayTransferred(date) { return !date || date < serviceDay(); }
function isSaleTransferred(s) { return isDayTransferred(s.date); }
function allSales() { return (DB && DB.barSales) || []; }
function salesInRange(from, to) { return allSales().filter((s) => s.date && s.date >= from && s.date <= to); }
function saleInWeek(s, week) { return s.date ? !!(week.dateDebut && week.dateFin && s.date >= week.dateDebut && s.date <= week.dateFin) : s.weekId === week.id; }
/* Ventes passées en comptabilité pour une semaine (option : type de fiche, jour) */
function comptaSales(week, type, day) {
  return allSales().filter((s) => saleInWeek(s, week) && isSaleTransferred(s) && (!type || saleType(s) === type) && (!day || saleDayKey(s) === day));
}
/* Fiche hospitalité : une entrée en soirée ou un cocon paradisiaque (HOSP_CHOICES, ce qu'on peut noter).
   « Hébergement » n'est plus proposé (09/11/2026) mais reste connu pour les ventes déjà notées. */
const HOSP_KINDS = ['Entrée', 'Hébergement', 'Cocon'];
const HOSP_CHOICES = ['Entrée', 'Cocon'];
const HOSP_TAGS = { 'Entrée': '🎟️ Entrée', 'Hébergement': '🏨 Hébergement', 'Cocon': '🌺 Cocon' };
function hospKind(s) { return s && HOSP_KINDS.includes(s.categorie) ? s.categorie : 'Entrée'; }
/* Noms des clients d'une vente (un cocon en a deux) */
function saleClients(s) { return [s && s.client, s && s.client2].filter(Boolean).join(' & '); }
/* Ligne de revenus alimentée par une fiche (la première ligne de chaque sorte seulement) :
   « Bar & boissons » ← carte · « Entrées soirées » et « Hébergements » ← hospitalité · « Cartes membres » ← cartes VIP */
function revenueKind(r) {
  const c = String((r && r.categorie) || '').toLowerCase();
  if (/bar/.test(c) && /boisson/.test(c)) return 'carte';
  if (/h[ée]bergement/.test(c)) return 'hebergement';
  if (/entr[ée]e/.test(c)) return 'entrees';
  if (/carte/.test(c) && /membre/.test(c)) return 'carteVip';
  return null;
}
function autoKind(week, r) {
  const k = revenueKind(r);
  return k && (week.revenues || []).find((x) => revenueKind(x) === k) === r ? k : null;
}
function hasRevenueKind(week, k) { return (week.revenues || []).some((x) => revenueKind(x) === k); }
/* Case où va une vente : hébergements et cocons → « Hébergements » (ou « Entrées soirées » si la semaine
   n'a pas de ligne « Hébergements ») */
function saleBucket(s, week) {
  const t = saleType(s);
  if (t === 'hospitalite') return hospKind(s) !== 'Entrée' && (!week || hasRevenueKind(week, 'hebergement')) ? 'hebergement' : 'entrees';
  return t;
}
function bucketSales(week, bucket, day) { return comptaSales(week, null, day).filter((s) => saleBucket(s, week) === bucket); }
function bucketType(bucket) { return bucket === 'entrees' || bucket === 'hebergement' ? 'hospitalite' : bucket; }
function revCell(week, r, d) {
  const kind = week && autoKind(week, r);
  if (kind) { const list = bucketSales(week, kind, d); if (list.length) return sumSales(list); }
  return Number(r[d]) || 0;
}
function revenueRowTotal(r, week) { return DAY_KEYS.reduce((a, d) => a + revCell(week, r, d), 0) + (Number(r.autre) || 0); }
/* Salaires : commission de chaque vendeur sur les ventes transférées de la semaine */
function salesBySeller(list) {
  const map = new Map();
  list.forEach((s) => {
    const x = map.get(s.userId) || { userId: s.userId, carte: 0, hospitalite: 0, carteVip: 0, total: 0, count: 0, raw: 0, list: [] };
    const t = saleTotal(s);
    x[saleType(s)] = (x[saleType(s)] || 0) + t; x.total += t; x.count += 1;
    x.raw += t * saleRate(s); x.list.push(s);
    map.set(s.userId, x);
  });
  // commission : part de chaque vente au taux du vendeur ; taux : « 45 % » (ou « 25 à 35 % » après un changement de grade ou de rôle)
  return [...map.values()].map(({ raw, list, ...x }) => ({ ...x, commission: round2(raw), taux: ratesText(list) })).sort((a, b) => b.total - a.total);
}
function weekCommissionRows(week) { return salesBySeller(comptaSales(week)); }
function weekCommissionTotal(week) { return weekCommissionRows(week).reduce((t, x) => t + x.commission, 0); }
/* Charge « Salaires staff » : saisie manuelle + commissions calculées */
function isSalaryExpense(week, e) { return (week.expenses || []).find((x) => /salaire/i.test(x.categorie || '')) === e; }
function expenseValue(week, e) { return (Number(e.montant) || 0) + (isSalaryExpense(week, e) ? weekCommissionTotal(week) : 0); }
function weekTotals(week) {
  const recettes = (week.revenues || []).reduce((s, r) => s + revenueRowTotal(r, week), 0);
  const charges = (week.expenses || []).reduce((s, e) => s + expenseValue(week, e), 0);
  const benefice = recettes - charges;
  const nouveauSolde = (Number(week.soldePrecedent) || 0) + benefice;
  return { recettes, charges, benefice, nouveauSolde };
}
function menuSalesTotal(week) {
  const sales = week.menuSales || {};
  return Object.keys(sales).reduce((sum, id) => {
    const item = menuItems().find((m) => m.id === id);
    return sum + (item ? (Number(sales[id]) || 0) * item.prix : 0);
  }, 0);
}

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function isoDate(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
/* Une soirée classique par jour sans soirée (une réunion ou un rendez-vous n'empêche pas la soirée) ; fromDate : pas avant ce jour */
function buildClassicEvents(year, month, existingEvents, postesList, fromDate) {
  const created = [];
  const isSoiree = (e, date) => e.date === date && !['reunion', 'rdv'].includes(eventCat(e));
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const date = isoDate(year, month, d);
    if (fromDate && date < fromDate) continue;
    if (existingEvents.some((e) => isSoiree(e, date)) || created.some((e) => e.date === date)) continue;
    created.push({
      id: uid('ev'), nom: 'Soirée classique', categorie: 'classique', date, heureDebut: '23:00', heureFin: '',
      description: 'Soirée classique — générée automatiquement, à modifier ou renommer si besoin.', statut: 'À venir',
      assignments: postesList.map((p) => ({ poste: p, userId: null, heureArriveePrevue: '', heureDepartPrevue: '' })),
    });
  }
  return created;
}

/* Semaine comptable 1 : du lundi au dimanche de la semaine en cours, coffre à 0 */
function firstAccountingWeek(now) {
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return {
    id: 'wk1', numero: 1, dateDebut: isoDate(mon.getFullYear(), mon.getMonth() + 1, mon.getDate()), dateFin: isoDate(sun.getFullYear(), sun.getMonth() + 1, sun.getDate()),
    soldePrecedent: 0, statutValidation: 'À valider', valideParId: null, dateValidation: '',
    revenues: defaultRevenueRows(), expenses: defaultExpenseRows(), salaries: [], members: [], menuSales: {}, observations: '', documentSource: '',
  };
}

function seedData() {
  const now = new Date();
  const postes = DEFAULT_POSTES.slice();
  const events = [];
  // Soirées classiques du mois en cours (les mois suivants se remplissent à la connexion de la direction)
  events.push(...buildClassicEvents(now.getFullYear(), now.getMonth() + 1, events, postes, todayISO()));

  return {
    users: [],
    postes,
    events,
    attendances: [],
    accountingWeeks: [firstAccountingWeek(now)],
    documents: [],
    activityLogs: [{ id: 'log1', userId: null, action: 'Création du système', objet: 'Pacific Bluffs — Espace interne', date: todayISO(), heure: nowHM() }],
    notifications: [],
    rdv: [],
    barSales: [],
    joursSansSoiree: [], // jours dont la soirée a été retirée à la main
    menu: JSON.parse(JSON.stringify(CLUB.MENU)),
  };
}
