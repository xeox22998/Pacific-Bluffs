/* =====================================================================
   PACIFIC BLUFFS — Comptabilité hebdomadaire
   Droits :
   - Direction + Comptabilité : structure (lignes, semaines, salaires, membres)
   - Managers : saisie des montants
   - Gouvernement / Fisc : lecture seule (contrôle fiscal)
   - Employés : pas d'accès (ils voient leurs ventes et leur salaire dans l'onglet Ventes ;
     le serveur ne leur envoie qu'un résumé des semaines, sans les montants)
   ===================================================================== */

let currentWeekId = null;
function weekById(id) { return DB.accountingWeeks.find((w) => w.id === id); }

function renderComptabilite() {
  const weeks = [...DB.accountingWeeks].sort((a, b) => a.numero - b.numero);
  if (!currentWeekId || !weekById(currentWeekId)) currentWeekId = weeks.length ? weeks[weeks.length - 1].id : null;
  const week = weekById(currentWeekId);
  const editStruct = canEditFinance();
  const canFill = canFillFinance();
  // Ligne « Hébergements » (fiche hospitalité) ajoutée aux semaines créées avant elle, juste sous « Entrées soirées »
  if (week && editStruct && !hasRevenueKind(week, 'hebergement')) {
    const at = week.revenues.findIndex((r) => revenueKind(r) === 'entrees');
    week.revenues.splice(at + 1, 0, { categorie: 'Hébergements', lun: 0, mar: 0, mer: 0, jeu: 0, ven: 0, sam: 0, dim: 0, autre: 0 });
    saveSoon();
  }

  let actions = '';
  if (week && canSeeFinance()) actions += `<button class="btn btn-sm" type="button" onclick="exportWeekCSV('${week.id}')">${icon('download', 'sm')}Export CSV</button><button class="btn btn-sm" type="button" onclick="window.print()">${icon('printer', 'sm')}Imprimer</button>`;
  if (isDirection()) actions += `<button class="btn btn-sm btn-sun" type="button" onclick="openCreateWeekModal()" data-magnetic="0.2">${icon('plus', 'sm')}Nouvelle semaine</button>`;

  let html = pageHead('Comptabilité', week ? `Semaine ${week.numero}` : 'Comptabilité',
    week ? `Du ${fmtDateShort(week.dateDebut)} au ${fmtDateShort(week.dateFin)} · remplissez les cases, les totaux se calculent automatiquement — comme sur le fichier Excel.` : '', actions);

  html += `<div class="pill-row" role="tablist" aria-label="Semaines comptables">${weeks.map((w) => `<button class="pill plain ${w.id === currentWeekId ? 'is-active' : ''}" type="button" role="tab" aria-selected="${w.id === currentWeekId}" onclick="selectWeek('${w.id}')">S${w.numero}${w.statutValidation === 'Validé' ? '' : ' •'}</button>`).join('')}</div>`;
  if (!week) return html + emptyState('📊', 'Aucune semaine comptable', 'Créez une première semaine comptable pour commencer.');

  if (!editStruct && canFill) html += `<div class="hint">${icon('sun', 'sm')}<span>Vous pouvez remplir les montants. L'ajout de lignes, la validation et la création d'une semaine restent réservés à la direction et à la comptabilité.</span></div>`;
  if (!canFill) html += `<div class="hint">${icon('eye', 'sm')}<span>Consultation en lecture seule, à titre de contrôle fiscal.</span></div>`;

  const t = weekTotals(week);
  html += `<div class="stats-row stagger">
    ${statTile('Total recettes', 'trend', t.recettes, { money: true })}
    ${statTile('Total charges', 'coins', t.charges, { money: true })}
    ${statTile('Bénéfice net', 'sun', t.benefice, { money: true, tone: t.benefice >= 0 ? 'pos' : 'neg' })}
    ${statTile('Solde du coffre', 'wallet', t.nouveauSolde, { money: true, cls: 'dark', foot: `précédent : ${fmtMoney(Number(week.soldePrecedent) || 0)}` })}
  </div>`;

  // Graphiques de la semaine
  const perDay = DAY_KEYS.map((d) => week.revenues.reduce((s, r) => s + revCell(week, r, d), 0));
  const autre = week.revenues.reduce((s, r) => s + (Number(r.autre) || 0), 0);
  const dayLabels = autre ? DAY_LABELS.concat('Autre') : DAY_LABELS;
  const dayVals = autre ? perDay.concat(autre) : perDay;
  const bySource = week.revenues.map((r) => ({ l: r.categorie, v: revenueRowTotal(r, week) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  html += `<div class="grid-2c even stagger">
    <div class="card chart-card"><div class="chart-h"><div><h3>Recettes par jour</h3><p>Toutes sources confondues</p></div></div>
      <div class="chart" id="chDays"></div>${Charts.dataTable(dayLabels, [{ name: 'Recettes', values: dayVals }])}</div>
    <div class="card chart-card"><div class="chart-h"><div><h3>Recettes par source</h3><p>Classées de la plus forte à la plus faible</p></div></div>
      <div id="chSources">${bySource.length ? '' : '<p class="sr-empty">Aucune recette saisie pour cette semaine.</p>'}</div></div>
  </div>`;
  Charts.add((a) => Charts.columns(document.getElementById('chDays'), { labels: dayLabels, series: [{ name: 'Recettes', cls: 's1', values: dayVals }], label: 'Recettes par jour', height: 230 }, a));
  if (bySource.length) Charts.add((a) => Charts.hbars(document.getElementById('chSources'), { labels: bySource.map((x) => x.l), values: bySource.map((x) => x.v) }, a));

  // Revenus (les fiches de ventes de l'onglet Ventes arrivent toutes seules à 6h)
  const tonight = serviceDay();
  const live = tonight >= (week.dateDebut || '') && tonight <= (week.dateFin || '') ? allSales().filter((s) => s.date === tonight) : [];
  html += `<section class="section">${sectionHead('Revenus hebdomadaires', null, `<button class="btn btn-xs" type="button" onclick="openVentesDay(null,null)">${icon('receipt', 'sm')}Fiches de ventes</button>${editStruct ? `<button class="btn btn-xs" type="button" onclick="addRevenueRow('${week.id}')">${icon('plus', 'sm')}Ligne</button>` : ''}`)}
    <p class="field-hint" style="margin:-6px 0 12px">Les cases marquées ${icon('receipt', 'sm')} se remplissent toutes seules avec les fiches de ventes de l'onglet Ventes, chaque matin à 6h.${live.length ? ` Ce soir : <b>${fmtMoney(sumSales(live))}</b> de ventes en cours, ajoutées à 6h.` : ''}</p>
    ${renderRevenueTable(week, editStruct, canFill)}</section>`;
  // Charges
  html += `<section class="section">${sectionHead('Charges &amp; dépenses', null, editStruct ? `<button class="btn btn-xs" type="button" onclick="addExpenseRow('${week.id}')">${icon('plus', 'sm')}Ligne</button>` : '')}${renderExpenseTable(week, editStruct, canFill)}</section>`;
  // Coffre
  html += `<section class="section">${sectionHead('Coffre')}<div class="coffre stagger">
    <div class="card"><span class="lbl">Solde précédent</span>${editStruct ? `<input class="cell-in" type="number" step="0.01" value="${Number(week.soldePrecedent) || 0}" onchange="updateSoldePrecedent('${week.id}',this.value)" onfocus="this.select()">` : `<span class="v">${fmtMoney(Number(week.soldePrecedent) || 0)}</span>`}</div>
    <div class="card"><span class="lbl">+ Recettes</span><span class="v">${fmtMoney(t.recettes)}</span></div>
    <div class="card"><span class="lbl">− Charges</span><span class="v">${fmtMoney(t.charges)}</span></div>
    <div class="card"><span class="lbl">= Nouveau solde</span><span class="v" style="color:var(--sun-text)">${fmtMoney(t.nouveauSolde)}</span></div>
  </div></section>`;
  // Salaires : commissions des fiches de ventes + lignes saisies à la main
  html += `<section class="section">${sectionHead('Salaires versés', weekCommissionRows(week).length + (week.salaries || []).length, editStruct ? `<button class="btn btn-xs" type="button" onclick="addSalaryRow('${week.id}')">${icon('plus', 'sm')}Ligne</button>` : '')}
    <p class="field-hint" style="margin:-6px 0 12px">Chaque vendeur touche ${COMMISSION_PCT} % de ses ventes (dossier salaires de l'onglet Ventes) : ces lignes sont calculées toutes seules et comptées dans la charge « Salaires staff ». Ajoutez une ligne pour une prime ou un autre salaire.</p>
    ${renderSalaryTable(week, editStruct)}</section>`;
  // Ventes de la carte
  html += `<section class="section">${sectionHead('Ventes de la carte — récap de la semaine', null, `<span class="badge nodot">${comptaSales(week, 'carte').length ? 'calculé' : 'informatif'}</span>`)}${renderMenuSales(week, canFill)}</section>`;
  // Cartes membres
  const autoMembers = comptaSales(week, 'carteVip').length;
  html += `<section class="section">${sectionHead('Cartes membres actives', autoMembers + (week.members || []).length, editStruct ? `<button class="btn btn-xs" type="button" onclick="addMemberRow('${week.id}')">${icon('plus', 'sm')}Ligne</button>` : '')}
    <p class="field-hint" style="margin:-4px 0 12px">Tarifs en vigueur : ${membershipTiers().map((t) => `${esc(t.nom.toUpperCase())} ${fmtMoney(t.prix)}/semaine`).join(' · ')}. Les cartes vendues sur la fiche « Cartes VIP » s'ajoutent toutes seules.</p>
    ${renderMemberTable(week, editStruct)}</section>`;
  // Observations
  html += `<section class="section">${sectionHead('Observations', null, isDirection() ? `<button class="btn btn-xs" type="button" onclick="editObservations('${week.id}')">${icon('edit', 'sm')}Modifier</button>` : '')}
    <div class="card obs">${esc(week.observations) || '<span class="muted">Aucune observation.</span>'}
      ${week.documentSource ? `<div class="obs-src">${icon('file', 'sm')}Document source : <b>${esc(week.documentSource)}</b><button class="btn btn-xs" type="button" onclick="goPage('documents')">Documents</button></div>` : ''}
    </div></section>`;
  // Validation
  html += `<section class="section">${sectionHead('Validation')}<div class="card obs">
    ${week.statutValidation === 'Validé'
      ? `<span class="badge good">Validé par la direction</span> <span class="muted">— ${esc(week.valideParId ? userLabel(week.valideParId) : (week.valideParNom || 'Direction'))} · ${fmtDateShort(week.dateValidation)}</span>`
      : `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Statut : ${statusBadge('À valider')}${isDirection() ? `<button class="btn btn-sm btn-sun" type="button" onclick="validateWeek('${week.id}')">${icon('check', 'sm')}Valider la comptabilité</button>` : ''}</div>`}
  </div></section>`;
  return html;
}
function selectWeek(id) { currentWeekId = id; renderPage(true); }

/* ---------- Tableaux ---------- */
function renderRevenueTable(week, editStruct, canFill) {
  let grand = 0;
  const colTotals = DAY_KEYS.map(() => 0);
  let autreTotal = 0;
  const rows = week.revenues.map((r, i) => {
    const rowTotal = revenueRowTotal(r, week);
    grand += rowTotal;
    DAY_KEYS.forEach((d, k) => { colTotals[k] += revCell(week, r, d); });
    autreTotal += Number(r.autre) || 0;
    const kind = autoKind(week, r);
    const sheet = kind && SALE_TYPES.find((t) => t.id === bucketType(kind));
    // Les jours qui ont des ventes transférées (6h) : montant calculé, non modifiable à la main
    const cell = (d) => {
      const list = kind ? bucketSales(week, kind, d) : [];
      if (list.length) return `<button class="bar-auto" type="button" onclick="openVentesDay('${list[0].date || ''}','${bucketType(kind)}')" title="Total des fiches de ventes, transféré à 6h">${fmtMoney(sumSales(list))}</button>`;
      return canFill ? moneyInput(r[d], `updateRevenueCell('${week.id}',${i},'${d}',this.value)`) : (r[d] ? fmtMoney(r[d]) : '—');
    };
    return `<tr${kind ? ' class="bar-row"' : ''}>
      <td>${editStruct ? textInput(r.categorie, `updateRevenueCell('${week.id}',${i},'categorie',this.value)`, 160) : `<span class="strong">${esc(r.categorie)}</span>`}
        ${sheet ? `<span class="auto-tag" title="Rempli par la ${esc(sheet.long.toLowerCase())}">${icon('receipt', 'sm')}Fiche ${esc(sheet.label)}${kind === 'entrees' ? ' · entrées' : kind === 'hebergement' ? ' · hébergements' : ''}</span>` : ''}</td>
      ${DAY_KEYS.map((d) => `<td class="num">${cell(d)}</td>`).join('')}
      <td class="num">${canFill ? moneyInput(r.autre, `updateRevenueCell('${week.id}',${i},'autre',this.value)`) : (r.autre ? fmtMoney(r.autre) : '—')}</td>
      <td class="num strong">${fmtMoney(rowTotal)}</td>
      ${editStruct ? `<td><button class="icon-btn xs" type="button" onclick="removeRevenueRow('${week.id}',${i})" aria-label="Supprimer la ligne">${icon('x', 'sm')}</button></td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="card table-card"><div class="table-scroll rev-scroll"><table class="tbl"><thead><tr><th>Source</th>${DAY_LABELS.map((l) => `<th class="num">${l}</th>`).join('')}<th class="num">Autre</th><th class="num">Total</th>${editStruct ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows}
    <tr class="total"><td>Total recettes</td>${colTotals.map((v) => `<td class="num">${v ? fmtMoney(v) : '—'}</td>`).join('')}<td class="num">${autreTotal ? fmtMoney(autreTotal) : '—'}</td><td class="num">${fmtMoney(grand)}</td>${editStruct ? '<td></td>' : ''}</tr>
  </tbody></table></div></div>`;
}
function renderExpenseTable(week, editStruct, canFill) {
  let total = 0;
  const rows = week.expenses.map((e, i) => {
    total += expenseValue(week, e);
    // « Salaires staff » : la saisie (primes, autres salaires) + les commissions des fiches de ventes
    const comm = isSalaryExpense(week, e) ? weekCommissionTotal(week) : 0;
    const manual = canFill ? moneyInput(e.montant, `updateExpenseCell('${week.id}',${i},'montant',this.value)`) : fmtMoney(Number(e.montant) || 0);
    return `<tr${comm ? ' class="bar-row"' : ''}>
      <td>${editStruct ? textInput(e.categorie, `updateExpenseCell('${week.id}',${i},'categorie',this.value)`, 190) : `<span class="strong">${esc(e.categorie)}</span>`}${comm ? `<span class="auto-tag">${icon('receipt', 'sm')}+ commissions ${COMMISSION_PCT} %</span>` : ''}</td>
      <td class="num">${comm ? `<span class="auto-sum">${manual}<button class="bar-auto" type="button" onclick="openVentesDay(null,null)" title="Commissions ${COMMISSION_PCT} % des fiches de ventes">+ ${fmtMoney(comm)}</button></span>` : manual}</td>
      <td class="wrap-cell">${canFill ? `<input class="cell-in wide" type="text" value="${esc(e.observations || '')}" onchange="updateExpenseCell('${week.id}',${i},'observations',this.value)">` : esc(e.observations || '—')}</td>
      ${editStruct ? `<td><button class="icon-btn xs" type="button" onclick="removeExpenseRow('${week.id}',${i})" aria-label="Supprimer la ligne">${icon('x', 'sm')}</button></td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Poste de dépense</th><th class="num">Montant</th><th>Observations</th>${editStruct ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows}<tr class="total"><td>Total charges</td><td class="num">${fmtMoney(total)}</td><td></td>${editStruct ? '<td></td>' : ''}</tr>
  </tbody></table></div></div>`;
}
function renderSalaryTable(week, editStruct) {
  const list = week.salaries || [];
  const comm = weekCommissionRows(week);
  const pay = week.commissionPay || {};
  const total = list.reduce((s, x) => s + (Number(x.montant) || 0), 0) + comm.reduce((s, x) => s + x.commission, 0);
  // Commissions calculées depuis les fiches de ventes (seuls le versement et la validation se modifient)
  const autoRows = comm.map((x) => {
    const p = pay[x.userId] || {};
    return `<tr class="bar-row">
    <td><span class="strong">${esc(userLabel(x.userId))}</span></td>
    <td>Commission ${COMMISSION_PCT} % · ${fmtMoney(x.total)} de ventes<span class="auto-tag">${icon('receipt', 'sm')}Fiches de ventes</span></td>
    <td class="num strong">${fmtMoney(x.commission)}</td>
    <td>${editStruct ? `<input class="cell-in" type="date" value="${esc(p.dateVersement || '')}" onchange="updateCommissionPay('${week.id}','${x.userId}','dateVersement',this.value)">` : (p.dateVersement ? fmtDateShort(p.dateVersement) : 'Non renseigné')}</td>
    <td>${editStruct ? `<input class="tick" type="checkbox" ${p.valide ? 'checked' : ''} onchange="updateCommissionPay('${week.id}','${x.userId}','valide',this.checked)" aria-label="Salaire validé">` : statusBadge(p.valide ? 'Validé' : 'À valider')}</td>
    ${editStruct ? '<td></td>' : ''}
  </tr>`;
  }).join('');
  const rows = autoRows + list.map((s, i) => `<tr>
    <td>${editStruct ? textInput(s.nom, `updateSalaryCell('${week.id}',${i},'nom',this.value)`, 170) : `<span class="strong">${esc(s.nom)}</span>`}</td>
    <td>${editStruct ? textInput(s.poste, `updateSalaryCell('${week.id}',${i},'poste',this.value)`, 170) : esc(s.poste)}</td>
    <td class="num">${editStruct ? moneyInput(s.montant, `updateSalaryCell('${week.id}',${i},'montant',this.value)`) : fmtMoney(s.montant)}</td>
    <td>${editStruct ? `<input class="cell-in" type="date" value="${esc(s.dateVersement || '')}" onchange="updateSalaryCell('${week.id}',${i},'dateVersement',this.value)">` : (s.dateVersement ? fmtDateShort(s.dateVersement) : 'Non renseigné')}</td>
    <td>${editStruct ? `<input class="tick" type="checkbox" ${s.valide ? 'checked' : ''} onchange="updateSalaryCell('${week.id}',${i},'valide',this.checked)" aria-label="Salaire validé">` : statusBadge(s.valide ? 'Validé' : 'À valider')}</td>
    ${editStruct ? `<td><button class="icon-btn xs" type="button" onclick="removeSalaryRow('${week.id}',${i})" aria-label="Supprimer la ligne">${icon('x', 'sm')}</button></td>` : ''}
  </tr>`).join('');
  return `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Nom</th><th>Poste</th><th class="num">Salaire</th><th>Date de versement</th><th>Validé</th>${editStruct ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows || `<tr><td colspan="6" class="muted">Aucun salaire enregistré cette semaine.</td></tr>`}
    <tr class="total"><td>Total salaires</td><td></td><td class="num">${fmtMoney(total)}</td><td></td><td></td>${editStruct ? '<td></td>' : ''}</tr>
  </tbody></table></div></div>`;
}
function renderMenuSales(week, editable) {
  // Semaine avec fiches de ventes : récapitulatif calculé à partir des ventes transférées
  const fiche = comptaSales(week, 'carte');
  if (fiche.length) {
    let grand = 0;
    // catégories de la carte + celles d'anciennes ventes (ex : « Softs » de l'ancienne carte)
    const cats = MENU_CATEGORIES.concat([...new Set(fiche.map((s) => s.categorie).filter((c) => c && !MENU_CATEGORIES.includes(c)))]);
    const cards = cats.map((cat) => {
      const per = new Map();
      fiche.filter((s) => s.categorie === cat).forEach((s) => {
        const it = per.get(s.nom) || { nom: s.nom, prix: s.prix, qty: 0, total: 0 };
        it.qty += Number(s.qty) || 0; it.total += saleTotal(s); per.set(s.nom, it);
      });
      if (!per.size) return '';
      const list = [...per.values()].sort((a, b) => b.qty - a.qty);
      const sub = list.reduce((t, x) => t + x.total, 0);
      grand += sub;
      return `<div class="card ms-card"><div class="ms-head"><b>${CLUB.MENU_ICONS[cat] || ''} ${esc(cat)}</b><span>${fmtMoney(sub)}</span></div>
        ${list.map((x) => `<div class="ms-row"><span>${esc(x.nom)}<small>${fmtMoney(x.prix)}</small></span><span class="tnum">× ${x.qty}</span><span class="ms-sub">${fmtMoney(x.total)}</span></div>`).join('')}</div>`;
    }).join('');
    return `<div class="menu-sales stagger">${cards}</div>
      <p class="field-hint" style="margin-top:12px">Total de la semaine d'après les fiches de ventes de la carte : <b>${fmtMoney(grand)}</b> (déjà reporté jour par jour dans « Bar &amp; boissons »).</p>`;
  }
  if (!week.menuSales) week.menuSales = {};
  let grand = 0;
  const cards = MENU_CATEGORIES.map((cat) => {
    const items = menuItems().filter((m) => m.categorie === cat);
    if (!items.length) return '';
    let sub = 0;
    const rows = items.map((it) => {
      const qty = Number(week.menuSales[it.id]) || 0;
      sub += qty * it.prix;
      return `<div class="ms-row"><span>${esc(it.nom)}<small>${fmtMoney(it.prix)}</small></span>
        ${editable ? `<input class="cell-in qty" type="number" min="0" step="1" value="${qty}" onchange="updateMenuSale('${week.id}','${it.id}',this.value)" onfocus="this.select()" aria-label="Quantité vendue — ${esc(it.nom)}">` : `<span class="tnum">× ${qty}</span>`}
        <span class="ms-sub">${fmtMoney(qty * it.prix)}</span></div>`;
    }).join('');
    grand += sub;
    return `<div class="card ms-card"><div class="ms-head"><b>${CLUB.MENU_ICONS[cat] || ''} ${esc(cat)}</b><span>${fmtMoney(sub)}</span></div>${rows}</div>`;
  }).join('');
  return `<div class="menu-sales stagger">${cards}</div>
    <p class="field-hint" style="margin-top:12px">Chiffre d'affaires implicite du menu détaillé : <b>${fmtMoney(grand)}</b>. Pour que les montants se calculent et se reportent tout seuls, notez plutôt les ventes sur la <b>fiche des ventes de la carte</b> (onglet Ventes) : elles arrivent ici chaque matin à 6h.</p>`;
}
function renderMemberTable(week, editStruct) {
  const list = week.members || [];
  // Cartes vendues sur la fiche « Cartes VIP » (transférées à 6h) : lignes calculées
  const autoRows = comptaSales(week, 'carteVip').sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((s) => `<tr class="bar-row">
    <td><span class="strong">${esc(s.client || '—')}</span></td>
    <td><span class="badge sun nodot">${esc(tierName(s.categorie))}</span></td>
    <td>${fmtDateShort(s.date)}</td>
    <td>${s.date ? fmtDateShort(shiftISO(s.date, 6)) : '—'}</td>
    <td>${fmtMoney(saleTotal(s))} · vendue par ${esc(userLabel(s.userId))}<span class="auto-tag">${icon('receipt', 'sm')}Fiche Cartes VIP</span></td>
    ${editStruct ? '<td></td>' : ''}
  </tr>`).join('');
  const rows = autoRows + list.map((m, i) => `<tr>
    <td>${editStruct ? textInput(m.nom, `updateMemberCell('${week.id}',${i},'nom',this.value)`, 170) : `<span class="strong">${esc(m.nom)}</span>`}</td>
    <td>${editStruct ? `<select class="cell-in" onchange="updateMemberCell('${week.id}',${i},'type',this.value)">${membershipTiers().map((t) => `<option value="${t.key}" ${String(m.type || '').toLowerCase().startsWith(t.key.toLowerCase().slice(0, 4)) ? 'selected' : ''}>${esc(t.nom)}</option>`).join('')}</select>` : `<span class="badge sun nodot">${esc(tierName(m.type))}</span>`}</td>
    <td>${editStruct ? `<input class="cell-in" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(m.dateDebut || '') ? esc(m.dateDebut) : ''}" onchange="updateMemberCell('${week.id}',${i},'dateDebut',this.value)">` : fmtDateShort(m.dateDebut)}</td>
    <td>${editStruct ? `<input class="cell-in" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(m.dateFin || '') ? esc(m.dateFin) : ''}" onchange="updateMemberCell('${week.id}',${i},'dateFin',this.value)">` : fmtDateShort(m.dateFin)}</td>
    <td>${editStruct ? textInput(m.paiement || '', `updateMemberCell('${week.id}',${i},'paiement',this.value)`, 130) : esc(m.paiement || '—')}</td>
    ${editStruct ? `<td><button class="icon-btn xs" type="button" onclick="removeMemberRow('${week.id}',${i})" aria-label="Supprimer la ligne">${icon('x', 'sm')}</button></td>` : ''}
  </tr>`).join('');
  return `<div class="card table-card"><div class="table-scroll"><table class="tbl"><thead><tr><th>Nom</th><th>Type</th><th>Début</th><th>Fin</th><th>Paiement</th>${editStruct ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows || `<tr><td colspan="6" class="muted">Aucun membre enregistré cette semaine.</td></tr>`}
  </tbody></table></div></div>`;
}

/* ---------- Mises à jour ---------- */
function updateRevenueCell(weekId, idx, field, value) {
  const w = weekById(weekId);
  w.revenues[idx][field] = field === 'categorie' ? value : (Number(value) || 0);
  logActivity('Comptabilité modifiée', `Recette « ${w.revenues[idx].categorie} » — Semaine ${w.numero}`);
  refresh();
}
function updateExpenseCell(weekId, idx, field, value) {
  const w = weekById(weekId);
  w.expenses[idx][field] = field === 'montant' ? (Number(value) || 0) : value;
  logActivity('Comptabilité modifiée', `Charge « ${w.expenses[idx].categorie} » — Semaine ${w.numero}`);
  refresh();
}
function updateSoldePrecedent(weekId, value) {
  const w = weekById(weekId);
  w.soldePrecedent = Number(value) || 0;
  logActivity('Solde précédent modifié', 'Semaine ' + w.numero);
  refresh();
}
function updateMenuSale(weekId, itemId, value) {
  const w = weekById(weekId);
  if (!w.menuSales) w.menuSales = {};
  w.menuSales[itemId] = Math.max(0, Number(value) || 0);
  saveSoon(); refresh();
}
function updateSalaryCell(weekId, idx, field, value) {
  const w = weekById(weekId);
  w.salaries[idx][field] = field === 'montant' ? (Number(value) || 0) : value;
  logActivity('Salaire modifié', `${w.salaries[idx].nom} — Semaine ${w.numero}`);
  refresh();
}
/* Versement d'une commission (calculée depuis les fiches de ventes) : date et validation */
function updateCommissionPay(weekId, userId, field, value) {
  const w = weekById(weekId);
  if (!w || !canEditFinance()) return;
  w.commissionPay = w.commissionPay || {};
  w.commissionPay[userId] = { ...(w.commissionPay[userId] || {}), [field]: field === 'valide' ? !!value : value };
  logActivity('Salaire modifié', `${userLabel(userId)} (commission) — Semaine ${w.numero}`);
  refresh();
}
function updateMemberCell(weekId, idx, field, value) {
  const w = weekById(weekId);
  w.members[idx][field] = value;
  logActivity('Membre modifié', `${w.members[idx].nom} — Semaine ${w.numero}`);
  refresh();
}
function addRevenueRow(weekId) { weekById(weekId).revenues.push({ categorie: 'Nouvelle catégorie', lun: 0, mar: 0, mer: 0, jeu: 0, ven: 0, sam: 0, dim: 0, autre: 0 }); saveSoon(); refresh(); }
function addExpenseRow(weekId) { weekById(weekId).expenses.push({ categorie: 'Nouveau poste', montant: 0, observations: '' }); saveSoon(); refresh(); }
function addSalaryRow(weekId) { const w = weekById(weekId); (w.salaries = w.salaries || []).push({ id: uid('sal'), nom: '', poste: '', montant: 0, dateVersement: '', valide: false }); saveSoon(); refresh(); }
function addMemberRow(weekId) { const w = weekById(weekId); (w.members = w.members || []).push({ id: uid('mem'), nom: '', type: 'Green', dateDebut: '', dateFin: '', paiement: '' }); saveSoon(); refresh(); }
function removeRow(weekId, key, idx, label) {
  confirmAction(`Supprimer cette ligne (${label}) ?`, () => {
    weekById(weekId)[key].splice(idx, 1);
    saveSoon(); toast('Ligne supprimée.', 'success'); refresh();
  }, 'Supprimer');
}
function removeRevenueRow(w, i) { removeRow(w, 'revenues', i, 'revenu'); }
function removeExpenseRow(w, i) { removeRow(w, 'expenses', i, 'dépense'); }
function removeSalaryRow(w, i) { removeRow(w, 'salaries', i, 'salaire'); }
function removeMemberRow(w, i) { removeRow(w, 'members', i, 'membre'); }

function openCreateWeekModal() {
  const weeks = [...DB.accountingWeeks].sort((a, b) => a.numero - b.numero);
  const last = weeks[weeks.length - 1];
  const nextNum = Math.max(0, ...DB.accountingWeeks.map((w) => w.numero)) + 1;
  const prev = last ? weekTotals(last).nouveauSolde : 0;
  let start = '', end = '';
  if (last && last.dateFin) {
    const s = new Date(last.dateFin + 'T00:00:00'); s.setDate(s.getDate() + 1);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    start = isoDate(s.getFullYear(), s.getMonth() + 1, s.getDate());
    end = isoDate(e.getFullYear(), e.getMonth() + 1, e.getDate());
  }
  openModal('Nouvelle semaine comptable', `
    <div class="field"><label for="nWkNum">Numéro de semaine</label><input class="input" id="nWkNum" type="number" value="${nextNum}"></div>
    <div class="grid-2">
      <div class="field"><label for="nWkStart">Date de début</label><input class="input" id="nWkStart" type="date" value="${start}"></div>
      <div class="field"><label for="nWkEnd">Date de fin</label><input class="input" id="nWkEnd" type="date" value="${end}"></div>
    </div>
    <div class="field"><label for="nWkPrev">Solde précédent du coffre ($)</label><input class="input" id="nWkPrev" type="number" value="${prev}"></div>
    <p class="field-hint">Les catégories habituelles de revenus et de charges seront pré-remplies à 0 : il ne restera plus qu'à remplir les cases.</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="createWeek()">Créer la semaine</button>`);
}
function createWeek() {
  const numero = Number(document.getElementById('nWkNum').value);
  if (!numero) { toast('Indiquez un numéro de semaine.', 'error'); return; }
  if (DB.accountingWeeks.some((w) => w.numero === numero)) { toast(`La semaine ${numero} existe déjà.`, 'error'); return; }
  const w = {
    id: uid('wk'), numero, dateDebut: document.getElementById('nWkStart').value, dateFin: document.getElementById('nWkEnd').value,
    soldePrecedent: Number(document.getElementById('nWkPrev').value) || 0, statutValidation: 'À valider', valideParId: null, dateValidation: '',
    revenues: defaultRevenueRows(), expenses: defaultExpenseRows(), salaries: [], members: [], menuSales: {}, observations: '', documentSource: '',
  };
  DB.accountingWeeks.push(w);
  currentWeekId = w.id;
  logActivity('Comptabilité créée', 'Semaine ' + numero);
  toast('Semaine comptable créée. Remplissez les cases.', 'success'); closeModal(); renderPage(true);
}
function editObservations(weekId) {
  const w = weekById(weekId);
  openModal('Modifier les observations', `<div class="field"><textarea class="input" id="obsTxt" style="min-height:180px" aria-label="Observations">${esc(w.observations)}</textarea></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveObservations('${weekId}')">Enregistrer</button>`);
}
function saveObservations(weekId) {
  const w = weekById(weekId);
  w.observations = document.getElementById('obsTxt').value;
  logActivity('Comptabilité modifiée', 'Observations — Semaine ' + w.numero);
  toast('Observations enregistrées.', 'success'); closeModal(); refresh();
}
function validateWeek(weekId) {
  confirmAction('Valider la comptabilité de cette semaine ?', () => {
    const w = weekById(weekId);
    w.statutValidation = 'Validé'; w.valideParId = CURRENT_USER.id; w.dateValidation = todayISO();
    logActivity('Comptabilité validée', 'Semaine ' + w.numero);
    toast('Comptabilité validée.', 'success'); refresh();
  }, 'Valider');
}

/* ---------- Export CSV (ouvrable dans Excel / Google Sheets) ---------- */
function exportWeekCSV(weekId) {
  const w = weekById(weekId);
  const t = weekTotals(w);
  const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [];
  lines.push([q(`Pacific Bluffs — Comptabilité semaine ${w.numero}`), q(`${w.dateDebut} → ${w.dateFin}`)].join(';'));
  lines.push('');
  lines.push(['Source', ...DAY_LABELS, 'Autre', 'Total'].map(q).join(';'));
  w.revenues.forEach((r) => lines.push([q(r.categorie), ...DAY_KEYS.map((d) => revCell(w, r, d)), Number(r.autre) || 0, revenueRowTotal(r, w)].join(';')));
  lines.push([q('TOTAL RECETTES'), '', '', '', '', '', '', '', '', t.recettes].join(';'));
  lines.push('');
  lines.push(['Poste de dépense', 'Montant', 'Observations'].map(q).join(';'));
  w.expenses.forEach((e) => lines.push([q(e.categorie), expenseValue(w, e), q((isSalaryExpense(w, e) && weekCommissionTotal(w) ? `dont ${weekCommissionTotal(w)} $ de commissions ${COMMISSION_PCT} %. ` : '') + (e.observations || ''))].join(';')));
  lines.push([q('TOTAL CHARGES'), t.charges].join(';'));
  lines.push('');
  lines.push([q('Solde précédent'), Number(w.soldePrecedent) || 0].join(';'));
  lines.push([q('Bénéfice net'), t.benefice].join(';'));
  lines.push([q('Nouveau solde'), t.nouveauSolde].join(';'));
  lines.push('');
  lines.push(['Salarié', 'Poste', 'Salaire', 'Date de versement', 'Validé'].map(q).join(';'));
  const pay = w.commissionPay || {};
  weekCommissionRows(w).forEach((x) => { const p = pay[x.userId] || {}; lines.push([q(userLabel(x.userId)), q(`Commission ${COMMISSION_PCT} % sur ${x.total} $ de ventes`), x.commission, q(p.dateVersement), q(p.valide ? 'Oui' : 'Non')].join(';')); });
  (w.salaries || []).forEach((s) => lines.push([q(s.nom), q(s.poste), Number(s.montant) || 0, q(s.dateVersement), q(s.valide ? 'Oui' : 'Non')].join(';')));
  lines.push('');
  lines.push(['Membre', 'Type', 'Début', 'Fin', 'Paiement'].map(q).join(';'));
  comptaSales(w, 'carteVip').forEach((s) => lines.push([q(s.client), q(tierName(s.categorie)), q(s.date), q(s.date ? shiftISO(s.date, 6) : ''), q(`Fiche Cartes VIP — ${userLabel(s.userId)}`)].join(';')));
  (w.members || []).forEach((m) => lines.push([q(m.nom), q(tierName(m.type)), q(m.dateDebut), q(m.dateFin), q(m.paiement)].join(';')));
  const fiche = comptaSales(w).sort((a, b) => ((a.date || '') + (a.createdAt || '')).localeCompare((b.date || '') + (b.createdAt || '')));
  if (fiche.length) {
    lines.push('');
    lines.push(['Fiches de ventes — soirée', 'Heure', 'Vendeur', 'Fiche', 'Article', 'Client', 'Quantité', 'Prix', 'Total', `Part ${COMMISSION_PCT} %`].map(q).join(';'));
    fiche.forEach((s) => lines.push([q(s.date || DAY_LABELS[DAY_KEYS.indexOf(s.day)]), q(s.heure), q(userLabel(s.userId)), q((SALE_TYPES.find((t) => t.id === saleType(s)) || SALE_TYPES[0]).label + (saleType(s) === 'hospitalite' ? ' — ' + hospKind(s) : '')), q(s.nom), q(saleClients(s)), Number(s.qty) || 0, Number(s.prix) || 0, saleTotal(s), commissionOf(saleTotal(s))].join(';')));
  }
  downloadFile(`pacific-bluffs-compta-semaine-${w.numero}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  logActivity('Export CSV', 'Semaine ' + w.numero);
}
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
