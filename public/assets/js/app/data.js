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
  MANAGER: "Gérer les présences et le planning de l'équipe.",
  SECRETAIRE: 'Gérer la comptabilité et les documents administratifs.',
  DIRECTION: 'Accès complet à la gestion du Pacific Bluffs.',
  GOUVERNEMENT: 'Consultation de la comptabilité à titre de contrôle fiscal.',
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

const NAV_ITEMS = [
  { key: 'dashboard',      label: 'Tableau de bord', icon: 'grid',        roles: '*' },
  { key: 'planning',       label: 'Mon planning',    icon: 'calendar',    roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'ventes',         label: 'Ventes',          icon: 'receipt',     roles: '*' },
  { key: 'presences',      label: 'Présences',       icon: 'checkCircle', roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'programme',      label: 'Programme',       icon: 'mic',         roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'privatisations', label: 'Privatisations',  icon: 'party',       roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'comptabilite',   label: 'Comptabilité',    icon: 'wallet',      roles: [ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION, ROLES.GOUVERNEMENT] },
  { key: 'carte',          label: 'La carte',        icon: 'glass',       roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION] },
  { key: 'documents',      label: 'Documents',       icon: 'folder',      roles: '*' },
  { key: 'equipe',         label: 'Équipe',          icon: 'users',       roles: [ROLES.EMPLOYE, ROLES.MANAGER, ROLES.SECRETAIRE, ROLES.DIRECTION, ROLES.GOUVERNEMENT] },
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
   Chaque vendeur touche COMMISSION_RATE (25 %) de chaque vente : c'est son salaire de la semaine,
   du lundi 6h au lundi 6h suivant (= les journées de service du lundi au dimanche).
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
function commissionOf(amount) { return Math.round(amount * COMMISSION_RATE * 100) / 100; }
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
    const x = map.get(s.userId) || { userId: s.userId, carte: 0, hospitalite: 0, carteVip: 0, total: 0, count: 0 };
    const t = saleTotal(s);
    x[saleType(s)] = (x[saleType(s)] || 0) + t; x.total += t; x.count += 1;
    map.set(s.userId, x);
  });
  return [...map.values()].map((x) => ({ ...x, commission: commissionOf(x.total) })).sort((a, b) => b.total - a.total);
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
    menu: JSON.parse(JSON.stringify(CLUB.MENU)),
  };
}
