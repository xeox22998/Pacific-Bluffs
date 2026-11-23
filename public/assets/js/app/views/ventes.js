/* =====================================================================
   PACIFIC BLUFFS — Ventes : fiches de ventes des employés + dossier salaires
   - Chaque employé note ses ventes sur trois fiches : la carte, l'hospitalité
     (entrées en soirée, cocons paradisiaques pour 2 avec les deux noms) et
     les cartes VIP. Chaque vente est enregistrée tout de suite.
   - Journée de service de 6h à 6h (heure de Paris). À 6h du matin, les ventes
     de la soirée passent automatiquement dans la comptabilité (Bar & boissons,
     Entrées soirées, Hébergements, Cartes membres) et dans le dossier salaires.
   - Salaire : une part de chaque vente selon le vendeur (35 % managers,
     comptabilité et direction ; employés selon leur grade : 35 % qualifié,
     25 % non qualifié et recrue — ROLE_RATES et GRADES dans data.js),
     gardée sur la vente (taux), calculé du lundi 6h au lundi 6h suivant
     (soirées du lundi au dimanche), versé en fin de semaine. Salaire maximum
     par semaine (plafond gardé sur la vente) : 14 000 $ managers et comptabilité,
     12 000 $ qualifiés, 10 000 $ non qualifiés et recrues, direction sans
     maximum ; le surplus n'est pas versé et reste dans la compta.
   - Fiche « Export » (tout le staff) : on note le montant de chaque export.
     Pas de commission : 1/3 du montant va au salaire de la semaine (compté
     dans le salaire maximum), le montant entier dans la ligne « Export » de
     la comptabilité.
   - Fiche « Récompenses » (après les fiches de ventes, managers, comptabilité et
     direction seulement) : ce qu'un client a gagné gratuitement (carte VIP
     1 mois ou 1 semaine, escapade enchantée, séjour paradisiaque, bon de
     réduction de 25 %, soirée privée). Ni commission, ni recette : rien en
     comptabilité. Chaque récompense va dans le Topo (DB.avantages, topo.js).
   Droits (revérifiés par le serveur) : chacun n'ajoute et ne retire que SES
   ventes de la soirée en cours ; un employé ne voit que ses ventes et son
   salaire (pas la comptabilité) ; manager et gouvernement lisent toutes les
   fiches ; direction et comptabilité corrigent tout (une semaine validée :
   direction seulement).
   ===================================================================== */
let VENTE_DAY = null;          // journée de service affichée
let VENTE_TYPE = 'carte';      // fiche affichée ('recompense' : fiche Récompenses)
let VENTE_SELLER = null;       // 'me', 'all' ou l'identifiant d'un compte
let DOSSIER_WEEK = null;       // lundi de la semaine affichée dans le dossier salaires
const VENTE_LAST = { carte: '', hospKind: 'Entrée', hospLabel: {}, hospPrix: {}, cocon: '', tier: 'Green', reward: 'vip-mois', rewardTier: 'Green' };
let VENTE_CLOCK_DAY = null;

function canSeeAllSales() { return [ROLES.DIRECTION, ROLES.SECRETAIRE, ROLES.MANAGER, ROLES.GOUVERNEMENT].includes(CURRENT_USER.role); }
function canCorrectSales() { return canEditFinance(); }
function weekForDate(date) { return DB.accountingWeeks.find((w) => w.dateDebut && w.dateFin && date >= w.dateDebut && date <= w.dateFin); }
function dayLockedByValidation(date) { const w = date && weekForDate(date); return !!(w && w.statutValidation === 'Validé' && !isDirection()); }
function canAddSaleOn(date) {
  if (!canFillFinance()) return false;
  if (canCorrectSales()) return date <= serviceDay() && !dayLockedByValidation(date);
  return date === serviceDay();
}
function canRemoveSale(s) {
  if (!canFillFinance()) return false;
  if (canCorrectSales()) return !dayLockedByValidation(s.date);
  return s.userId === CURRENT_USER.id && s.date === serviceDay();
}
/* Ventes visibles selon le filtre « Mes ventes / Tout le staff / un employé » */
function scopeSales(list) {
  if (!canSeeAllSales() || VENTE_SELLER === 'me') return list.filter((s) => s.userId === CURRENT_USER.id);
  if (VENTE_SELLER === 'all') return list;
  return list.filter((s) => s.userId === VENTE_SELLER);
}
function transferIn() {
  const m = minutesToTransfer();
  const h = Math.floor(m / 60), mn = m % 60;
  return h ? `${h} h ${pad2(mn)}` : `${mn} min`;
}
function saleDayLabel(date) {
  const today = serviceDay();
  if (date === today) return 'Ce soir';
  if (date === shiftISO(today, -1)) return 'Hier soir';
  return fmtDate(date);
}
function saleTypeInfo(id) { return SALE_TYPES.find((t) => t.id === id) || SALE_TYPES[0]; }
function scopeLabel() {
  if (!canSeeAllSales() || VENTE_SELLER === 'me') return 'me';
  return VENTE_SELLER === 'all' ? 'all' : 'one';
}

/* ================= PAGE ================= */
let VENTE_USER = null;         // compte pour lequel l'état ci-dessus a été choisi
function renderVentes() {
  const today = serviceDay();
  if (VENTE_USER !== CURRENT_USER.id) {
    VENTE_USER = CURRENT_USER.id; VENTE_DAY = null; VENTE_SELLER = null; DOSSIER_WEEK = null; VENTE_TYPE = 'carte';
    Object.assign(VENTE_LAST, { carte: '', hospKind: 'Entrée', hospLabel: {}, hospPrix: {}, cocon: '', tier: 'Green', reward: 'vip-mois', rewardTier: 'Green' });
  }
  if (VENTE_TYPE === 'recompense' && !canEditTopo()) VENTE_TYPE = 'carte';
  if (!VENTE_DAY || VENTE_DAY > today) VENTE_DAY = today;
  if (VENTE_SELLER === null || !canSeeAllSales()) VENTE_SELLER = canSeeAllSales() ? 'all' : 'me';
  VENTE_CLOCK_DAY = today;
  const scope = scopeLabel();
  const mine = scope === 'me';
  const who = scope === 'one' ? userLabel(VENTE_SELLER) : '';
  const myRate = sellerRate(CURRENT_USER), myCap = sellerCap(CURRENT_USER);
  const capTxt = (c) => (c ? `${fmtMoney(c)} maximum par semaine` : 'sans maximum');
  const scopeRate = scope === 'all' ? allRatesRange() : userRate(mine ? CURRENT_USER.id : VENTE_SELLER); // taux affiché quand il n'y a pas encore de vente

  const actions = canCorrectSales() ? `<button class="btn btn-sm" type="button" onclick="exportDossierCSV()">${icon('download', 'sm')}Export du dossier</button>` : '';
  let html = pageHead('Ventes', mine ? 'Mes fiches de ventes' : (who ? `Ventes de ${esc(who)}` : 'Fiches de ventes'),
    `Notez chaque vente au moment où vous la faites : elle est enregistrée tout de suite, soirée par soirée. À <b>6h du matin</b>, les ventes de la soirée passent automatiquement ${navAllowed('comptabilite') ? 'dans la comptabilité et ' : ''}dans le dossier salaires. ${canSeeAllSales()
      ? `Chaque vendeur touche une part de ses ventes (<b>${commissionRule()}</b>) : c'est son salaire de la semaine, calculé <b>du lundi 6h au lundi 6h</b>. Pour les <b>exports</b>, pas de commission : <b>${EXPORT_SHARE} du montant</b> va au salaire. Salaire maximum par semaine : <b>${capRule()}</b> ; ${SURPLUS_RULE}.${canFillFinance() ? ` Votre part : <b>${pctOf(myRate)}</b>, ${capTxt(myCap)}.` : ''}`
      : `Vous touchez <b>${pctOf(myRate)}</b> de vos ventes${gradeOf(CURRENT_USER) ? ` (grade ${esc(gradeOf(CURRENT_USER).toLowerCase())})` : ''} et <b>${EXPORT_SHARE} de vos exports</b> : c'est votre salaire de la semaine, calculé <b>du lundi 6h au lundi 6h</b>, ${myCap ? `<b>${fmtMoney(myCap)} maximum</b> par semaine ; ${SURPLUS_RULE}` : 'sans maximum'}.`}`, actions);

  if (!canFillFinance()) html += `<div class="hint">${icon('eye', 'sm')}<span>Consultation en lecture seule, à titre de contrôle fiscal.</span></div>`;

  // Soirée en cours et compte à rebours du transfert
  html += `<div class="sale-clock card"><span class="sc-dot" aria-hidden="true"></span><div><b>Soirée du ${esc(fmtDate(today).toLowerCase())} en cours</b>
    <small>Passage automatique ${navAllowed('comptabilite') ? 'en comptabilité' : 'dans le dossier salaires'} dans <span id="saleClock">${transferIn()}</span> (à 6h).</small></div></div>`;

  // Chiffres : ce soir et la semaine en cours
  const mon = mondayOf(today);
  const tonight = scopeSales(allSales().filter((s) => s.date === today));
  const week = scopeSales(salesInRange(mon, shiftISO(mon, 6)));
  const weekDone = week.filter(isSaleTransferred);
  const tonightTotal = sumSales(tonight);
  // salaires plafonnés : chaque vendeur a son maximum de la semaine, le surplus reste à la compta
  const pay = payOfSales(weekDone, week.filter((s) => !isSaleTransferred(s)));
  const maxFoot = pay.surplus > 0 ? ` · max atteint : ${fmtMoney(pay.surplus)} restent à la compta` : '';
  html += `<div class="stats-row stagger">
    ${statTile(mine ? 'Mes ventes ce soir' : 'Ventes ce soir', 'receipt', tonightTotal, { money: true, foot: `${tonight.length} vente${tonight.length > 1 ? 's' : ''}` })}
    ${statTile(mine ? 'Ma part ce soir' : 'Part des vendeurs ce soir', 'coins', pay.pending, { money: true, foot: `${shareText(tonight, scopeRate)}${pay.surplus > pay.surplusDone ? ' · max de la semaine atteint' : ''}` })}
    ${statTile(mine ? 'Mes ventes de la semaine' : 'Ventes de la semaine', 'trend', sumSales(week), { money: true, foot: salaryWeekLabel(mon) })}
    ${statTile(mine ? 'Mon salaire de la semaine' : 'Salaires de la semaine', 'wallet', pay.done, { money: true, cls: 'dark', foot: (pay.pending ? `+ ${fmtMoney(pay.pending)} à 6h` : 'versé en fin de semaine') + (mine && myCap ? ` · max ${fmtMoney(myCap)}` : '') + maxFoot })}
  </div>`;

  // Filtre vendeur (encadrement)
  if (canSeeAllSales()) {
    const sellers = DB.users.filter((u) => u.statut === 'Actif' || allSales().some((s) => s.userId === u.id)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
    html += `<div class="sale-filter"><label for="svScope">Afficher</label><select class="input" id="svScope" onchange="setVenteSeller(this.value)">
      <option value="all" ${VENTE_SELLER === 'all' ? 'selected' : ''}>Tout le staff</option>
      <option value="me" ${VENTE_SELLER === 'me' ? 'selected' : ''}>Mes ventes</option>
      ${sellers.filter((u) => u.id !== CURRENT_USER.id).map((u) => `<option value="${u.id}" ${VENTE_SELLER === u.id ? 'selected' : ''}>${esc(fullName(u))}</option>`).join('')}
    </select></div>`;
  }

  // Choix de la soirée : ce soir + les 6 précédentes (la comptabilité peut remonter plus loin)
  const days = Array.from({ length: 7 }, (_, i) => shiftISO(today, -i));
  if (!days.includes(VENTE_DAY)) days.push(VENTE_DAY);
  html += `<div class="sale-days"><div class="bs-tabs">${days.map((d) => {
    const t = sumSales(scopeSales(allSales().filter((s) => s.date === d)));
    const dt = new Date(d + 'T00:00:00');
    return `<button class="bs-tab ${d === VENTE_DAY ? 'is-active' : ''}" type="button" onclick="selectVenteDay('${d}')"><b>${d === today ? 'Ce soir' : DAY_LABELS[(dt.getDay() + 6) % 7] + ' ' + dt.getDate()}</b><small>${t ? fmtMoney(t) : '—'}</small></button>`;
  }).join('')}</div>${canCorrectSales() ? `<input class="cell-in sale-date" type="date" max="${today}" value="${VENTE_DAY}" onchange="selectVenteDay(this.value)" aria-label="Choisir une autre soirée">` : ''}</div>`;

  // Les fiches de ventes : carte, hospitalité, cartes VIP, export (+ Récompenses pour l'encadrement)
  const daySales = scopeSales(allSales().filter((s) => s.date === VENTE_DAY));
  const rewards = canEditTopo() ? dayRewards(VENTE_DAY) : null;
  html += `<div class="sale-tabs has-${SALE_TYPES.length + (rewards ? 1 : 0)}" role="tablist" aria-label="Fiches de ventes">${SALE_TYPES.map((t) => {
    const list = daySales.filter((s) => saleType(s) === t.id);
    return `<button class="sale-tab ${t.id === VENTE_TYPE ? 'is-active' : ''}" type="button" role="tab" aria-selected="${t.id === VENTE_TYPE}" onclick="selectVenteType('${t.id}')">
      <span class="st-ic" aria-hidden="true">${t.emoji}</span><span><b>${t.label}</b><small>${list.length ? `${fmtMoney(sumSales(list))} · ${list.length} ${t.id === 'export' ? 'export' : 'vente'}${list.length > 1 ? 's' : ''}` : t.id === 'export' ? 'Aucun export' : 'Aucune vente'}</small></span></button>`;
  }).join('')}${rewards ? `<button class="sale-tab ${VENTE_TYPE === 'recompense' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${VENTE_TYPE === 'recompense'}" onclick="selectVenteType('recompense')">
      <span class="st-ic" aria-hidden="true">🎁</span><span><b>Récompenses</b><small>${rewards.length ? `${rewards.length} offerte${rewards.length > 1 ? 's' : ''}` : 'Aucune récompense'}</small></span></button>` : ''}</div>`;
  html += VENTE_TYPE === 'recompense' ? renderRewardSheet(rewards) : renderSaleSheet(daySales.filter((s) => saleType(s) === VENTE_TYPE));

  // Dossier salaires
  html += renderDossier();
  return html;
}

/* ---------- Une fiche (carte, hospitalité ou cartes VIP) pour la soirée choisie ---------- */
function renderSaleSheet(list) {
  const t = saleTypeInfo(VENTE_TYPE);
  const today = serviceDay();
  const open = VENTE_DAY === today;
  const total = sumSales(list);
  const showSeller = scopeLabel() !== 'me';
  const isCard = VENTE_TYPE === 'carteVip', isHosp = VENTE_TYPE === 'hospitalite', isExp = VENTE_TYPE === 'export';
  const showClient = isCard || isHosp;
  const next = shiftISO(VENTE_DAY, 1);
  const noWeek = !open && !weekForDate(VENTE_DAY);
  const compta = navAllowed('comptabilite');
  let status = !compta
    ? (open ? 'En cours · passe dans votre dossier salaires à 6h' : `Enregistrée · passée dans votre dossier salaires le ${fmtDate(next).toLowerCase()} à 6h`)
    : open
    ? `En cours · passe en comptabilité (« ${t.compta} ») à 6h`
    : `Transférée en comptabilité (« ${t.compta} ») le ${fmtDate(next).toLowerCase()} à 6h${noWeek ? ' — la semaine comptable n\'existe pas encore : les ventes y apparaîtront dès sa création' : ''}`;
  if (isHosp && list.length) {
    const by = (k) => sumSales(list.filter((s) => hospKind(s) === k));
    const heb = by('Hébergement'); // anciennes ventes seulement
    status += ` · entrées ${fmtMoney(by('Entrée'))}, cocons ${fmtMoney(by('Cocon'))}${heb ? `, hébergements ${fmtMoney(heb)}` : ''}`;
  }
  const rows = list.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  // part de chaque vente : un seul taux → dans l'en-tête, des taux différents (grades) → sur chaque ligne
  const fallback = scopeLabel() === 'all' ? allRatesRange() : userRate(scopeLabel() === 'me' ? CURRENT_USER.id : VENTE_SELLER);
  const mixed = new Set(rows.map(saleRate)).size > 1;
  // vendeurs de cette fiche qui dépassent leur salaire maximum de la semaine (le surplus reste à la compta)
  const sellers = [...new Set(rows.map((s) => s.userId))];
  const wk = weekSalesOf(VENTE_DAY, sellers);
  const capped = rows.length && payOfSales(wk.filter(isSaleTransferred), wk.filter((s) => !isSaleTransferred(s))).surplus > 0;

  let form = '';
  if (canAddSaleOn(VENTE_DAY)) form = saleForm();
  else if (canFillFinance()) form = `<div class="sale-lock">${icon('shield', 'sm')}<span>${dayLockedByValidation(VENTE_DAY) ? 'Semaine validée par la direction : la fiche est verrouillée.' : 'Soirée passée à 6h : la fiche est verrouillée. Une erreur ? Prévenez la comptabilité, qui peut la corriger.'}</span></div>`;

  // export : pas de commission, 1/3 du montant au salaire (pas de quantité ni de prix unitaire)
  const partTxt = isExp ? `${EXPORT_SHARE} au salaire` : `part ${ratesText(rows, fallback)}`;
  const qtyCols = isExp ? '' : '<th class="num">Qté</th><th class="num">Prix</th>';
  return `<div class="card sale-sheet">
    <div class="bs-head"><div><b>${t.emoji} ${t.long} — ${esc(saleDayLabel(VENTE_DAY).toLowerCase())}</b><small>${esc(status)}${isExp ? ` · pas de commission : ${EXPORT_SHARE} du montant de chaque export va au salaire de la semaine` : ''}</small></div>
      <div class="bs-total">${fmtMoney(total)}<small>${partTxt} : ${fmtMoney(commissionOfSales(rows))}${capped ? ' · salaire max de la semaine atteint : le surplus reste à la compta' : ''}</small></div></div>
    ${form}
    ${rows.length ? `<div class="table-scroll"><table class="tbl compact bs-tbl"><thead><tr><th>Heure</th>${showSeller ? '<th>Vendeur</th>' : ''}<th>${isCard ? 'Carte' : isHosp ? 'Prestation' : isExp ? 'Export' : 'Article'}</th>${showClient ? '<th>Client</th>' : ''}${qtyCols}<th class="num">${isExp ? 'Montant' : 'Total'}</th><th class="num">${isExp ? `Salaire (${EXPORT_SHARE})` : `Part${mixed ? '' : ' ' + ratesText(rows)}`}</th><th></th></tr></thead><tbody>
      ${rows.map((s) => `<tr><td>${esc(s.heure || '—')}</td>${showSeller ? `<td>${esc(userLabel(s.userId))}</td>` : ''}<td class="strong">${isHosp ? `<span class="hosp-tag ${({ 'Hébergement': 'heb', 'Cocon': 'coc' })[hospKind(s)] || ''}">${HOSP_TAGS[hospKind(s)]}</span>` : ''}${esc(s.nom)}</td>${showClient ? `<td>${esc(saleClients(s) || '—')}</td>` : ''}
        ${isExp ? '' : `<td class="num">${Number(s.qty) || 0}</td><td class="num">${fmtMoney(Number(s.prix) || 0)}</td>`}<td class="num strong">${fmtMoney(saleTotal(s))}</td><td class="num">${fmtMoney(saleCommission(s))}${mixed && !isExp ? ` <small class="muted">${rateLabel(s)}</small>` : ''}</td>
        <td>${canRemoveSale(s) ? `<button class="icon-btn xs" type="button" onclick="removeVente('${s.id}')" aria-label="Retirer ${isExp ? 'cet export' : 'cette vente'}">${icon('x', 'sm')}</button>` : ''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="${(showSeller ? 2 : 1) + 1 + (showClient ? 1 : 0) + (isExp ? 0 : 2)}" class="strong">Total</td><td class="num strong">${fmtMoney(total)}</td><td class="num strong">${fmtMoney(commissionOfSales(rows))}</td><td></td></tr></tfoot></table></div>`
    : `<p class="muted bs-empty">${open && canFillFinance() ? (isExp ? 'Aucun export noté pour l\'instant. Indiquez le montant de l\'export puis « Ajouter » : c\'est enregistré tout de suite.' : 'Aucune vente notée pour l\'instant. Remplissez la ligne ci-dessus puis « Ajouter » : c\'est enregistré tout de suite.') : (isExp ? 'Aucun export sur cette fiche.' : 'Aucune vente sur cette fiche.')}</p>`}
  </div>`;
}
function saleForm() {
  const add = `<button class="btn btn-sun" type="button" onclick="addVente()">${icon('plus', 'sm')}Ajouter</button>`;
  const enter = `onkeydown="if(event.key==='Enter')addVente()"`;
  const qty = `<input class="input bs-qty" id="svQty" type="number" min="1" max="999" step="1" value="1" aria-label="Quantité" ${enter}>`;
  // La comptabilité peut noter une vente pour un employé qui a oublié
  let seller = '';
  if (canCorrectSales()) {
    const def = VENTE_SELLER && !['all', 'me'].includes(VENTE_SELLER) ? VENTE_SELLER : CURRENT_USER.id;
    seller = `<select class="input bs-seller" id="svSeller" aria-label="Vendeur">${DB.users.filter((u) => u.statut === 'Actif').sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .map((u) => `<option value="${u.id}" ${u.id === def ? 'selected' : ''}>${esc(fullName(u))}${u.id === CURRENT_USER.id ? ' (moi)' : ''}</option>`).join('')}</select>`;
  }
  if (VENTE_TYPE === 'hospitalite') {
    // Entrée en soirée ou cocon paradisiaque (chambre pour 2, deux noms de clients)
    const kind = HOSP_CHOICES.includes(VENTE_LAST.hospKind) ? VENTE_LAST.hospKind : 'Entrée';
    const sugg = ((CLUB.HOSPITALITE || {})[kind] || []);
    const segLabels = { 'Entrée': '🎟️ Entrée soirée', 'Cocon': '🌺 Cocon paradisiaque' };
    const seg = `<div class="seg" role="radiogroup" aria-label="Type de prestation">${HOSP_CHOICES.map((k) => `<button class="seg-btn ${k === kind ? 'is-on' : ''}" type="button" role="radio" aria-checked="${k === kind}" onclick="setHospKind('${k}')">${segLabels[k]}</button>`).join('')}</div>`;
    if (kind === 'Cocon') {
      // Prix fixe de la liste des cocons (modifiable par la direction dans « La carte »), deux noms de clients
      const list = coconsList().filter((c) => c && c.dispo !== false);
      return `<div class="bs-add">${seller}${seg}
        <select class="input bs-label" id="svCocon" aria-label="Cocon vendu">${list.length
          ? list.map((c) => `<option value="${esc(c.id)}" ${c.id === VENTE_LAST.cocon ? 'selected' : ''}>${esc(c.nom)}${c.desc ? ' · ' + esc(c.desc) : ''} — ${fmtMoney(c.prix)}</option>`).join('')
          : '<option value="">Aucun cocon disponible</option>'}</select>
        <input class="input bs-client" id="svClient" maxlength="60" placeholder="Nom du client 1" aria-label="Nom du premier client" ${enter}>
        <input class="input bs-client" id="svClient2" maxlength="60" placeholder="Nom du client 2" aria-label="Nom du deuxième client" ${enter}>
        <input class="input bs-qty" id="svQty" type="number" min="1" max="999" step="1" value="1" aria-label="Quantité" title="Quantité" ${enter}>
        ${add}</div>`;
    }
    return `<div class="bs-add">${seller}
      ${seg}
      <input class="input bs-label" id="svLabel" list="svHospList" maxlength="80" placeholder="Entrée (ex : entrée soirée à thème)" value="${esc(VENTE_LAST.hospLabel[kind] || sugg[0] || '')}" aria-label="Prestation" ${enter}>
      <datalist id="svHospList">${sugg.map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>
      <input class="input bs-price" id="svPrice" type="number" min="1" step="1" placeholder="Prix ($)" value="${esc(VENTE_LAST.hospPrix[kind] || '')}" aria-label="Prix unitaire en dollars" ${enter}>
      <input class="input bs-qty" id="svQty" type="number" min="1" max="999" step="1" value="1" aria-label="Nombre d'entrées" title="Nombre d'entrées" ${enter}>
      ${add}</div>`;
  }
  if (VENTE_TYPE === 'export') {
    // Export : seulement le montant (et un détail facultatif)
    return `<div class="bs-add">${seller}
      <input class="input bs-amount" id="svExport" type="number" min="1" step="1" placeholder="Montant de l'export ($)" aria-label="Montant de l'export en dollars" ${enter}>
      <input class="input bs-label" id="svLabel" maxlength="60" placeholder="Détail (facultatif)" aria-label="Détail de l'export (facultatif)" ${enter}>
      ${add}</div>`;
  }
  if (VENTE_TYPE === 'carteVip') {
    return `<div class="bs-add">${seller}
      <select class="input bs-tier" id="svTier" aria-label="Carte vendue">${membershipTiers().map((t) => `<option value="${t.key}" ${t.key === VENTE_LAST.tier ? 'selected' : ''}>Carte ${esc(t.nom)} · ${fmtMoney(t.prix)}</option>`).join('')}</select>
      <input class="input bs-label" id="svClient" maxlength="60" placeholder="Nom du client (carte nominative)" aria-label="Nom du client" ${enter}>
      ${add}</div>`;
  }
  const items = menuItems().filter((m) => m.dispo !== false);
  return `<div class="bs-add">${seller}
    <select class="input" id="svItem" aria-label="Produit vendu"><option value="">— Produit vendu —</option>${MENU_CATEGORIES.map((cat) => {
      const list = items.filter((m) => m.categorie === cat);
      return list.length ? `<optgroup label="${esc(cat)}">${list.map((m) => `<option value="${esc(m.id)}" ${m.id === VENTE_LAST.carte ? 'selected' : ''}>${esc(m.nom)} — ${fmtMoney(m.prix)}</option>`).join('')}</optgroup>` : '';
    }).join('')}</select>
    ${qty}${add}</div>`;
}

/* ---------- Fiche Récompenses (encadrement) : offertes, sans commission ni recette ---------- */
function dayRewards(date) {
  return (DB.avantages || []).filter((a) => a && a.origine === 'recompense' && a.date === date)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}
function avHeure(a) { const d = new Date(a.createdAt || ''); return isNaN(d) ? '—' : pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function renderRewardSheet(rows) {
  const choice = REWARD_CHOICES.find((c) => c.id === VENTE_LAST.reward) || REWARD_CHOICES[0];
  const enter = `onkeydown="if(event.key==='Enter')addReward()"`;
  const dated = ['escapade', 'sejour', 'soiree'].includes(choice.type);
  const form = `<div class="bs-add">
    <select class="input bs-reward" id="rwKind" aria-label="Récompense offerte" onchange="setRewardKind(this.value)">${REWARD_CHOICES.map((c) => `<option value="${c.id}" ${c.id === choice.id ? 'selected' : ''}>${avType(c.type).emoji} ${esc(c.label)}</option>`).join('')}</select>
    ${choice.type === 'vip' ? `<select class="input bs-tier" id="rwTier" aria-label="Carte offerte">${membershipTiers().map((t) => `<option value="${t.key}" ${t.key === VENTE_LAST.rewardTier ? 'selected' : ''}>Carte ${esc(t.nom)}</option>`).join('')}</select>` : ''}
    <input class="input bs-client" id="rwClient" maxlength="60" placeholder="Nom du gagnant" aria-label="Nom du gagnant" ${enter}>
    ${avDuo(choice.type) ? `<input class="input bs-client" id="rwClient2" maxlength="60" placeholder="2e personne (facultatif)" aria-label="Nom de la deuxième personne (chambre pour 2)" ${enter}>` : ''}
    ${dated ? `<label class="bs-field"><span>Date prévue (facultatif)</span><input class="input" id="rwDate" type="date" min="${VENTE_DAY}"></label>` : ''}
    ${choice.type === 'bon' ? `<label class="bs-field"><span>Valable jusqu'au (facultatif)</span><input class="input" id="rwFin" type="date" min="${VENTE_DAY}"></label>` : ''}
    <input class="input bs-label" id="rwMotif" maxlength="80" placeholder="Occasion (ex : tirage au sort, concours)" aria-label="Occasion" ${enter}>
    <button class="btn btn-sun" type="button" onclick="addReward()">${icon('plus', 'sm')}Ajouter</button></div>`;
  return `<div class="card sale-sheet">
    <div class="bs-head"><div><b>🎁 Fiche des récompenses — ${esc(saleDayLabel(VENTE_DAY).toLowerCase())}</b><small>Récompenses gagnées gratuitement : ni commission, ni recette (rien en comptabilité). Chacune apparaît tout de suite dans le Topo.</small></div>
      <div class="bs-total">${rows.length}<small>récompense${rows.length > 1 ? 's' : ''} offerte${rows.length > 1 ? 's' : ''}</small></div></div>
    ${form}
    ${rows.length ? `<div class="table-scroll"><table class="tbl compact bs-tbl"><thead><tr><th>Heure</th><th>Noté par</th><th>Récompense</th><th>Gagnant</th><th>Validité</th><th>Occasion</th><th></th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td>${esc(avHeure(a))}</td><td>${esc(userLabel(a.par))}</td>
        <td class="strong">${avType(a.type).emoji} ${esc(avLabel(a))}</td><td>${esc(avNames(a))}</td><td>${esc(avWhen(a))}</td><td>${esc(a.motif || '—')}</td>
        <td><button class="icon-btn xs" type="button" onclick="removeAvantage('${a.id}')" aria-label="Retirer cette récompense">${icon('x', 'sm')}</button></td></tr>`).join('')}
      </tbody></table></div>`
    : '<p class="muted bs-empty">Aucune récompense notée pour cette soirée. Choisissez la récompense, le nom du gagnant puis « Ajouter » : elle part tout de suite dans le Topo.</p>'}
  </div>`;
}
function setRewardKind(id) {
  VENTE_LAST.reward = REWARD_CHOICES.some((c) => c.id === id) ? id : 'vip-mois';
  const keep = (document.getElementById('rwClient') || {}).value || '';
  renderPage(false);
  setTimeout(() => { const el = document.getElementById('rwClient'); if (el) { el.value = keep; el.focus(); } }, 60);
}
function addReward() {
  if (!canEditTopo()) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const choice = REWARD_CHOICES.find((c) => c.id === val('rwKind')) || REWARD_CHOICES[0];
  const client = val('rwClient').trim().slice(0, 60);
  if (!client) { toast('Indiquez le nom de la personne qui a gagné.', 'error'); const el = document.getElementById('rwClient'); if (el) el.focus(); return; }
  const date = VENTE_DAY || serviceDay();
  const a = { id: uid('av'), type: choice.type, origine: 'recompense', beneficiaire: client, date, dateDebut: '', dateFin: '',
    motif: val('rwMotif').trim().slice(0, 80), note: '', utilise: false, par: CURRENT_USER.id, createdAt: new Date().toISOString() };
  if (choice.type === 'vip') {
    const tier = membershipTiers().find((t) => t.key === val('rwTier')) || membershipTiers()[0];
    Object.assign(a, { carte: tier.key, duree: choice.duree, dateDebut: date, dateFin: vipEnd(date, choice.duree) });
    VENTE_LAST.rewardTier = tier.key;
  }
  const client2 = val('rwClient2').trim().slice(0, 60);
  if (avDuo(choice.type) && client2) a.beneficiaire2 = client2;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val('rwDate'))) a.dateDebut = val('rwDate');
  if (choice.type === 'bon' && /^\d{4}-\d{2}-\d{2}$/.test(val('rwFin'))) a.dateFin = val('rwFin');
  VENTE_LAST.reward = choice.id;
  DB.avantages.push(a);
  logActivity('Récompense offerte', `${avLabel(a)} — ${avNames(a)}${a.motif ? ' (' + a.motif + ')' : ''}`);
  toast(`${avLabel(a)} offert à ${avNames(a)} : visible dans le Topo.`, 'success');
  refresh();
  setTimeout(() => { const el = document.getElementById('rwClient'); if (el) el.focus(); }, 60);
}

/* ---------- Actions ---------- */
function selectVenteDay(d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return; VENTE_DAY = d > serviceDay() ? serviceDay() : d; DOSSIER_WEEK = mondayOf(VENTE_DAY); renderPage(false); }
function selectVenteType(t) { VENTE_TYPE = t === 'recompense' && canEditTopo() ? 'recompense' : saleTypeInfo(t).id; renderPage(false); }
function setVenteSeller(v) { VENTE_SELLER = v || 'all'; renderPage(false); }
function setHospKind(k) { VENTE_LAST.hospKind = HOSP_CHOICES.includes(k) ? k : 'Entrée'; renderPage(false); setTimeout(() => { const el = document.getElementById(k === 'Cocon' ? 'svClient' : 'svPrice'); if (el) el.focus(); }, 60); }
/* Depuis la comptabilité : ouvrir la fiche d'un jour */
function openVentesDay(date, type) {
  if (date) { VENTE_DAY = date; DOSSIER_WEEK = mondayOf(date); }
  if (type) VENTE_TYPE = saleTypeInfo(type).id;
  VENTE_SELLER = canSeeAllSales() ? 'all' : 'me';
  goPage('ventes');
}
function addVente() {
  const date = VENTE_DAY;
  if (!canAddSaleOn(date)) { toast('Cette soirée est déjà passée (6h) : la fiche est verrouillée.', 'error'); renderPage(false); return; }
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const sellerId = canCorrectSales() && val('svSeller') ? val('svSeller') : CURRENT_USER.id;
  const type = VENTE_TYPE;
  let rec, focus;
  if (type === 'carte') {
    const item = menuItems().find((m) => m.id === val('svItem'));
    const qty = Math.round(Number(val('svQty')));
    if (!item) { toast('Choisissez le produit vendu.', 'error'); return; }
    if (!(qty >= 1 && qty <= 999)) { toast('Indiquez une quantité (1 à 999).', 'error'); return; }
    rec = { itemId: item.id, nom: item.nom, categorie: item.categorie, prix: Number(item.prix) || 0, qty };
    VENTE_LAST.carte = item.id; focus = 'svItem';
  } else if (type === 'hospitalite' && VENTE_LAST.hospKind === 'Cocon') {
    // Cocon paradisiaque : prix de la liste, deux noms de clients
    const c = coconsList().find((x) => x && x.id === val('svCocon') && x.dispo !== false);
    const qty = Math.round(Number(val('svQty')));
    const client = val('svClient').trim().slice(0, 60), client2 = val('svClient2').trim().slice(0, 60);
    if (!c) { toast('Choisissez le cocon vendu.', 'error'); return; }
    if (!client) { toast('Indiquez le nom du client (et celui du deuxième client : chambre pour 2).', 'error'); return; }
    if (!(qty >= 1 && qty <= 999)) { toast('Indiquez une quantité (1 à 999).', 'error'); return; }
    rec = { itemId: c.id, nom: c.nom, categorie: 'Cocon', prix: Number(c.prix) || 0, qty, client };
    if (client2) rec.client2 = client2;
    VENTE_LAST.cocon = c.id; focus = 'svClient';
  } else if (type === 'hospitalite') {
    // Entrée en soirée (seul autre choix de la fiche hospitalité)
    const label = val('svLabel').trim().slice(0, 80) || 'Entrée soirée';
    const prix = Math.round(Number(val('svPrice')) * 100) / 100;
    const qty = Math.round(Number(val('svQty')));
    if (!(prix > 0 && prix <= 1000000)) { toast("Indiquez le prix de l'entrée (en $).", 'error'); return; }
    if (!(qty >= 1 && qty <= 999)) { toast("Indiquez le nombre d'entrées (1 à 999).", 'error'); return; }
    rec = { nom: label, categorie: 'Entrée', prix, qty };
    VENTE_LAST.hospLabel['Entrée'] = label; VENTE_LAST.hospPrix['Entrée'] = String(prix); focus = 'svPrice';
  } else if (type === 'export') {
    // Export : le montant seulement, 1/3 au salaire (pas de commission)
    const prix = Math.round(Number(val('svExport')) * 100) / 100;
    if (!(prix > 0 && prix <= 1000000)) { toast("Indiquez le montant de l'export (en $).", 'error'); const el = document.getElementById('svExport'); if (el) el.focus(); return; }
    const detail = val('svLabel').trim().slice(0, 60);
    rec = { nom: detail ? 'Export — ' + detail : 'Export', categorie: 'Export', prix, qty: 1 };
    focus = 'svExport';
  } else {
    const tier = membershipTiers().find((t) => t.key === val('svTier'));
    const client = val('svClient').trim().slice(0, 60);
    if (!tier) { toast('Choisissez la carte vendue.', 'error'); return; }
    if (!client) { toast('Indiquez le nom du client : les cartes sont nominatives.', 'error'); return; }
    rec = { nom: 'Carte ' + tier.nom, categorie: tier.key, client, prix: Number(tier.prix) || 0, qty: 1 };
    VENTE_LAST.tier = tier.key; focus = 'svClient';
  }
  // taux et salaire maximum : rôle / grade du vendeur au moment de la vente (revérifiés et fixés par le serveur en base partagée)
  const sale = { id: uid('vt'), type, date, day: dayKeyOf(date), userId: sellerId, ...rec, taux: type === 'export' ? EXPORT_RATE : userRate(sellerId), plafond: userCap(sellerId), heure: nowHM(), createdAt: new Date().toISOString() };
  DB.barSales.push(sale);
  // carte VIP vendue → le client apparaît dans le Topo (en base partagée, c'est le serveur qui l'ajoute pour tout le monde)
  if (type === 'carteVip' && !isShared()) DB.avantages.push(vipAvantageOf(sale));
  const wk = weekSalesOf(date, [sellerId]);
  const over = sellerPay(wk.filter(isSaleTransferred), wk.filter((s) => !isSaleTransferred(s))).surplus > 0;
  toast(`${type === 'export' ? `${rec.nom} enregistré (${fmtMoney(saleTotal(sale))}) — ${EXPORT_SHARE} au salaire` : `${rec.qty} × ${rec.nom} enregistré (${fmtMoney(saleTotal(sale))}) — part ${pctOf(sale.taux)}`} : ${fmtMoney(saleCommission(sale))}${over ? ` (salaire max de la semaine atteint : le surplus reste à la compta)` : ''}${type === 'carteVip' ? ` · ${rec.client} ajouté au Topo` : ''}.`, 'success');
  refresh();
  setTimeout(() => { const el = document.getElementById(focus); if (el) el.focus(); }, 60);
}
function removeVente(id) {
  const s = allSales().find((x) => x.id === id);
  if (!s || !canRemoveSale(s)) return;
  confirmAction(isExportSale(s) ? `Retirer l'export « ${esc(s.nom)} » (${fmtMoney(saleTotal(s))}) ?` : `Retirer la vente « ${Number(s.qty) || 0} × ${esc(s.nom)} » (${fmtMoney(saleTotal(s))}) ?`, () => {
    DB.barSales = DB.barSales.filter((x) => x.id !== id);
    // la carte VIP part aussi du Topo (en base partagée : le serveur s'en charge)
    if (s.type === 'carteVip' && !isShared()) DB.avantages = DB.avantages.filter((a) => !(a.id === 'av_' + id && a.origine === 'vente'));
    logActivity('Vente retirée', `${s.qty} × ${s.nom} — ${userLabel(s.userId)}, soirée du ${fmtDateShort(s.date)}`);
    toast('Vente retirée.', 'success'); refresh();
  }, 'Retirer');
}

/* ================= DOSSIER SALAIRES (du lundi 6h au lundi 6h) ================= */
function renderDossier() {
  const today = serviceDay();
  const curMon = mondayOf(today);
  if (!DOSSIER_WEEK) DOSSIER_WEEK = curMon;
  const scoped = scopeSales(allSales().filter((s) => s.date));
  const mondays = [...new Set([curMon, DOSSIER_WEEK, ...scoped.map((s) => mondayOf(s.date))])].filter((m) => m <= curMon).sort().reverse().slice(0, 12);
  const from = DOSSIER_WEEK, to = shiftISO(from, 6);
  const sales = scoped.filter((s) => s.date >= from && s.date <= to);
  const done = sales.filter(isSaleTransferred);
  const pending = sales.filter((s) => !isSaleTransferred(s));
  const acc = weekForDate(from) || weekForDate(to);
  const pay = (acc && acc.commissionPay) || {};
  const all = scopeLabel() === 'all';
  const uid0 = scopeLabel() === 'me' ? CURRENT_USER.id : VENTE_SELLER;
  const rateTxt = all ? commissionRuleShort() : ratesText(sales, userRate(uid0));

  let html = `<section class="section">${sectionHead('Dossier salaires', null, `<span class="badge nodot">${rateTxt}${all ? '' : ' de chaque vente'}</span>`)}
    <p class="field-hint" style="margin:-6px 0 12px">Les fiches s'enregistrent chaque soirée et remplissent le dossier à 6h. Salaire de la semaine = ${all ? `la part de chaque vente (${commissionRule()}) + ${EXPORT_SHARE} des exports (pas de commission)` : `${rateTxt} des ventes + ${EXPORT_SHARE} des exports`} <b>du lundi 6h au lundi 6h</b> suivant (${salaryWeekLabel(from)}), versé en fin de semaine${acc && navAllowed('comptabilite') ? ` (comptabilité semaine ${acc.numero})` : ''}. Salaire maximum par semaine : ${all ? capRule() : (userCap(uid0) ? fmtMoney(userCap(uid0)) : 'aucun')} ; ${SURPLUS_RULE}.</p>
    <div class="pill-row" role="tablist" aria-label="Semaines du dossier">${mondays.map((m) => `<button class="pill plain ${m === DOSSIER_WEEK ? 'is-active' : ''}" type="button" role="tab" aria-selected="${m === DOSSIER_WEEK}" onclick="selectDossierWeek('${m}')">${m === curMon ? 'Cette semaine' : 'Sem. du ' + fmtDateShort(m).slice(0, 5)}</button>`).join('')}</div>`;

  if (all) {
    // salaires plafonnés : salaire (ventes passées à 6h) + en attente (ce soir) ≤ maximum de la semaine
    const rows = salesBySeller(done, pending);
    const tot = rows.reduce((a, x) => ({ carte: a.carte + x.carte, hospitalite: a.hospitalite + x.hospitalite, carteVip: a.carteVip + x.carteVip, export: a.export + x.export, total: a.total + x.total, commission: a.commission + x.pay.done, pending: a.pending + x.pay.pending, surplus: a.surplus + x.pay.surplus }), { carte: 0, hospitalite: 0, carteVip: 0, export: 0, total: 0, commission: 0, pending: 0, surplus: 0 });
    html += rows.length ? `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Employé</th><th class="num">Carte</th><th class="num">Hospitalité</th><th class="num">Cartes VIP</th><th class="num">Export</th><th class="num">Total ventes</th><th class="num">Salaire</th><th class="num">En attente (6h)</th><th class="num">Au-delà du max</th><th>Versement</th></tr></thead><tbody>
      ${rows.map((x) => {
        const pv = pay[x.userId] || {};
        const seller = DB.users.find((u) => u.id === x.userId);
        // taux de la semaine (celui des ventes), grade actuel de l'employé et salaire maximum
        const tag = [x.taux, gradeOf(seller), x.plafond ? 'max ' + fmtMoney(x.plafond) : 'sans max'].filter(Boolean).join(' · ');
        return `<tr><td><button class="link-btn" type="button" onclick="setVenteSeller('${x.userId}')">${esc(userLabel(x.userId))}</button><small class="muted seller-rate">${esc(tag)}</small></td><td class="num">${x.carte ? fmtMoney(x.carte) : '—'}</td><td class="num">${x.hospitalite ? fmtMoney(x.hospitalite) : '—'}</td><td class="num">${x.carteVip ? fmtMoney(x.carteVip) : '—'}</td><td class="num">${x.export ? fmtMoney(x.export) : '—'}</td>
          <td class="num">${fmtMoney(x.total)}</td><td class="num strong">${fmtMoney(x.pay.done)}</td><td class="num">${x.pay.pending ? '+ ' + fmtMoney(x.pay.pending) : '—'}</td>
          <td class="num">${x.pay.surplus ? `<span title="Reste dans la compta, sans commission">${fmtMoney(x.pay.surplus)}</span>` : '—'}</td>
          <td>${pv.valide ? `<span class="badge good">Versé${pv.dateVersement ? ' le ' + fmtDateShort(pv.dateVersement) : ''}</span>` : statusBadge('À valider')}</td></tr>`;
      }).join('')}
      <tr class="total"><td>Total</td><td class="num">${fmtMoney(tot.carte)}</td><td class="num">${fmtMoney(tot.hospitalite)}</td><td class="num">${fmtMoney(tot.carteVip)}</td><td class="num">${fmtMoney(tot.export)}</td><td class="num">${fmtMoney(tot.total)}</td><td class="num">${fmtMoney(tot.commission)}</td><td class="num">${tot.pending ? '+ ' + fmtMoney(tot.pending) : '—'}</td><td class="num">${tot.surplus ? fmtMoney(tot.surplus) : '—'}</td><td></td></tr>
    </tbody></table></div></div>
    <p class="field-hint" style="margin-top:10px">Les salaires de ce dossier sont repris automatiquement dans la comptabilité (« Salaires versés » et charge « Salaires staff »). La direction et la comptabilité y cochent le versement.${tot.surplus ? ` « Au-delà du max » : commission non versée, qui reste dans la compta (bénéfice), sans commission.` : ''}</p>`
    : emptyState('🧾', 'Aucune vente cette semaine', 'Les ventes notées sur les fiches apparaîtront ici dès 6h le lendemain matin.');
    return html + '</section>';
  }

  // Dossier d'une personne : le détail jour par jour
  const days = Array.from({ length: 7 }, (_, i) => shiftISO(from, i));
  const per = days.map((d) => {
    const list = sales.filter((s) => s.date === d);
    const by = (t) => sumSales(list.filter((s) => saleType(s) === t));
    return { d, carte: by('carte'), hospitalite: by('hospitalite'), carteVip: by('carteVip'), export: by('export'), total: sumSales(list), part: commissionOfSales(list), open: !isDayTransferred(d), n: list.length };
  });
  const doneTotal = sumSales(done), pendTotal = sumSales(pending);
  // part des ventes passées à 6h : « 35 % de 5 000 $ de ventes + 1/3 de 3 000 $ d'export »
  const doneEx = done.filter(isExportSale), doneSales = done.filter((s) => !isExportSale(s));
  const doneTxt = `${ratesText(doneSales, userRate(uid0))} de ${fmtMoney(sumSales(doneSales))} de ventes${doneEx.length ? ` + ${EXPORT_SHARE} de ${fmtMoney(sumSales(doneEx))} d'export` : ''}`;
  const pv = pay[uid0] || {};
  const g0 = gradeOf(DB.users.find((u) => u.id === uid0));
  // salaire plafonné au maximum de la semaine (le surplus reste à la compta)
  const sp = sellerPay(done, pending);
  const cap0 = sp.cap || (sales.length ? 0 : userCap(uid0));
  html += `<div class="dossier">
    <div class="card dossier-sum"><span class="lbl">${scopeLabel() === 'me' ? 'Mon salaire de la semaine' : 'Salaire de la semaine'}</span><span class="v">${fmtMoney(sp.done)}</span>
      <small>${doneTxt}${sp.pending ? ` · + ${fmtMoney(sp.pending)} ce soir, ajoutés à 6h` : ''}${g0 ? ` · grade ${esc(g0.toLowerCase())}` : ''} · ${cap0 ? `max ${fmtMoney(cap0)} par semaine` : 'sans maximum'}${sp.surplus ? `<br><b>Max atteint</b> : ${fmtMoney(sp.surplus)} de commission au-delà restent dans la compta` : ''}<br>${salaryWeekLabel(from)}</small>
      <span>${pv.valide ? `<span class="badge good">Versé${pv.dateVersement ? ' le ' + fmtDateShort(pv.dateVersement) : ''}</span>` : statusBadge('À valider')}</span></div>
    <div class="card table-card"><div class="table-scroll"><table class="tbl compact"><thead><tr><th>Soirée</th><th class="num">Carte</th><th class="num">Hospitalité</th><th class="num">Cartes VIP</th><th class="num">Export</th><th class="num">Total</th><th class="num">Part ${rateTxt}${doneEx.length || pending.some(isExportSale) ? ` · ${EXPORT_SHARE} export` : ''}</th><th>État</th></tr></thead><tbody>
      ${per.map((x) => `<tr${x.n ? '' : ' class="muted-row"'}><td><button class="link-btn" type="button" onclick="selectVenteDay('${x.d}')">${esc(fmtDate(x.d))}</button></td><td class="num">${x.carte ? fmtMoney(x.carte) : '—'}</td><td class="num">${x.hospitalite ? fmtMoney(x.hospitalite) : '—'}</td><td class="num">${x.carteVip ? fmtMoney(x.carteVip) : '—'}</td><td class="num">${x.export ? fmtMoney(x.export) : '—'}</td>
        <td class="num strong">${x.total ? fmtMoney(x.total) : '—'}</td><td class="num">${x.total ? fmtMoney(x.part) : '—'}</td>
        <td>${x.d > today ? '<span class="muted">À venir</span>' : x.open ? '<span class="badge warn">En cours · 6h</span>' : (x.n ? '<span class="badge good">Transféré</span>' : '<span class="muted">—</span>')}</td></tr>`).join('')}
      <tr class="total"><td>Total de la semaine</td><td class="num">${fmtMoney(per.reduce((a, x) => a + x.carte, 0))}</td><td class="num">${fmtMoney(per.reduce((a, x) => a + x.hospitalite, 0))}</td><td class="num">${fmtMoney(per.reduce((a, x) => a + x.carteVip, 0))}</td><td class="num">${fmtMoney(per.reduce((a, x) => a + x.export, 0))}</td><td class="num">${fmtMoney(doneTotal + pendTotal)}</td><td class="num">${fmtMoney(sp.brut)}</td><td></td></tr>
      ${sp.surplus ? `<tr><td colspan="6">Au-delà du salaire maximum (${fmtMoney(sp.cap)}) : reste dans la compta</td><td class="num">− ${fmtMoney(sp.surplus)}</td><td></td></tr>
      <tr class="total"><td colspan="6">Salaire de la semaine</td><td class="num">${fmtMoney(sp.salaire)}</td><td></td></tr>` : ''}
    </tbody></table></div></div>
  </div>`;
  return html + '</section>';
}
function selectDossierWeek(m) { DOSSIER_WEEK = m; renderPage(false); }

/* Export CSV du dossier de la semaine affichée (direction et comptabilité) */
function exportDossierCSV() {
  if (!canCorrectSales()) return;
  const from = DOSSIER_WEEK || mondayOf(serviceDay()), to = shiftISO(from, 6);
  const sales = salesInRange(from, to).sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')));
  const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [[q(`Pacific Bluffs — Dossier salaires`), q(`du lundi ${from} 6h au lundi ${shiftISO(from, 7)} 6h`), q(`Commission ${commissionRule()}`)].join(';'), ''];
  lines.push([q(`Salaire maximum par semaine : ${capRule()} ; ${SURPLUS_RULE}`)].join(';'), [q(EXPORT_RULE)].join(';'), '');
  lines.push(['Employé', 'Grade', 'Taux', 'Ventes carte', 'Hospitalité', 'Cartes VIP', 'Export', 'Total ventes', 'Commission', 'Salaire max', 'Salaire', 'Dont en attente (6h)', 'Au-delà du max (reste à la compta)'].map(q).join(';'));
  const rowsAll = salesBySeller(sales.filter(isSaleTransferred), sales.filter((s) => !isSaleTransferred(s)));
  // total des ventes de la semaine (passées à 6h et en cours) pour chaque vendeur
  rowsAll.forEach((x) => {
    const mine = sales.filter((s) => s.userId === x.userId);
    const by = (t) => sumSales(mine.filter((s) => saleType(s) === t));
    lines.push([q(userLabel(x.userId)), q(gradeOf(DB.users.find((u) => u.id === x.userId))), q(x.taux), by('carte'), by('hospitalite'), by('carteVip'), by('export'), sumSales(mine), x.pay.brut, x.plafond ? x.plafond : q('sans max'), x.pay.salaire, x.pay.pending, x.pay.surplus].join(';'));
  });
  lines.push('');
  lines.push(['Soirée', 'Heure', 'Vendeur', 'Fiche', 'Article', 'Client', 'Quantité', 'Prix', 'Total', 'Taux', 'Part', 'État'].map(q).join(';'));
  sales.forEach((s) => lines.push([q(s.date), q(s.heure), q(userLabel(s.userId)), q(saleTypeInfo(saleType(s)).label + (saleType(s) === 'hospitalite' ? ' — ' + hospKind(s) : '')), q(s.nom), q(saleClients(s)), Number(s.qty) || 0, Number(s.prix) || 0, saleTotal(s), q(rateLabel(s)), saleCommission(s), q(isSaleTransferred(s) ? 'Transféré' : 'En cours')].join(';')));
  downloadFile(`pacific-bluffs-dossier-salaires-${from}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  logActivity('Export du dossier salaires', `Semaine du ${fmtDateShort(from)}`);
}

/* ================= 6h DU MATIN : TRANSFERT AUTOMATIQUE =================
   Rien à lancer : une soirée compte en comptabilité dès que sa journée de service
   est terminée. Si l'espace est ouvert à 6h, la page se met à jour toute seule. */
setInterval(() => {
  const el = document.getElementById('saleClock');
  if (el) el.textContent = transferIn();
  if (!CURRENT_USER || !DB) return;
  const d = serviceDay();
  if (!VENTE_CLOCK_DAY) { VENTE_CLOCK_DAY = d; return; }
  if (d === VENTE_CLOCK_DAY) return;
  const old = VENTE_CLOCK_DAY;
  VENTE_CLOCK_DAY = d;
  if (VENTE_DAY === old) VENTE_DAY = d;
  if (allSales().some((s) => s.date === old)) toast(`6h : les ventes de la soirée sont passées ${navAllowed('comptabilite') ? 'en comptabilité et ' : ''}dans le dossier salaires.`, 'success');
  if (['ventes', 'comptabilite', 'dashboard'].includes(CURRENT_PAGE) && !userIsBusy()) renderPage(false);
}, 30000);
