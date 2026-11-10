/* =====================================================================
   PACIFIC BLUFFS — Composants de page + Tableau de bord
   ===================================================================== */

function pageHead(eyebrow, title, sub, actions) {
  return `<div class="page-head">
    <div><span class="eyebrow"><span class="ey-ic"></span>${eyebrow}</span><h1 class="page-title">${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}
function countAttrs(value, money, suffix) {
  const dec = Number.isInteger(value) ? 0 : 2;
  return `data-count="${value}" data-decimals="${dec}" data-suffix="${money ? ' $' : (suffix || '')}"`;
}
function statTile(label, ic, value, o) {
  o = o || {};
  const num = typeof value === 'number';
  const shown = num ? (o.money ? fmtMoney(value) : NUM_FR.format(value) + (o.suffix || '')) : esc(value);
  return `<div class="stat-tile card lift ${o.cls || ''}">
    <div class="lbl">${icon(ic, 'sm')}${label}</div>
    <div class="val ${o.tone || ''}"><span ${num ? countAttrs(value, o.money, o.suffix) : ''}>${shown}</span></div>
    ${o.foot ? `<div class="foot">${o.foot}</div>` : ''}
  </div>`;
}
function deltaBadge(v, label) {
  if (!v) return `<span class="badge nodot">= ${esc(label)}</span>`;
  return `<span class="badge ${v > 0 ? 'good' : 'bad'} nodot">${v > 0 ? '+' : '−'}${fmtMoney(Math.abs(v))} ${esc(label)}</span>`;
}
function sectionHead(title, count, actions) {
  return `<div class="section-h"><h2>${title}${count !== undefined && count !== null ? `<span class="count">${count}</span>` : ''}</h2>${actions || ''}</div>`;
}
function greeting() { const h = new Date().getHours(); return (h >= 18 || h < 5) ? 'Bonsoir' : 'Bonjour'; }

function eventRow(ev) {
  const dt = new Date(ev.date + 'T00:00:00');
  const assigned = ev.assignments.filter((a) => a.userId).length;
  const cat = eventCat(ev);
  const clickable = can(NAV_ITEMS.find((n) => n.key === 'programme').roles);
  const tag = clickable ? 'button' : 'div';
  return `<${tag} class="ev-row" ${clickable ? `type="button" onclick="openEventDetail('${ev.id}')"` : ''}>
    <span class="ev-day" style="--hue:${catHue(cat)}"><b>${dt.getDate()}</b><small>${MONTHS_FR[dt.getMonth()].slice(0, 4)}</small></span>
    <span class="ev-info"><b>${esc(ev.nom)}</b><small>${fmtDate(ev.date)} · ${ev.heureDebut || 'heure à définir'} · équipe ${assigned}/${ev.assignments.length}</small></span>
    ${catBadge(cat)}${statusBadge(ev.statut)}
  </${tag}>`;
}
function logRows(list) {
  if (!list.length) return '<div class="sr-empty">Aucune activité récente.</div>';
  return list.map((l) => {
    const u = l.userId ? findUser(l.userId) : null;
    return `<div class="log-row">${u ? avatarHtml(u, 'sm') : `<span class="av sm" style="--hue:22">PB</span>`}
      <div class="log-txt"><b>${esc(userLabel(l.userId))}</b> — ${esc(l.action)} <span>${esc(l.objet || '')}</span></div>
      <span class="log-time">${fmtDateShort(l.date)} · ${esc(l.heure)}</span></div>`;
  }).join('');
}

/* ================= TABLEAU DE BORD ================= */
function renderDashboard() {
  const u = CURRENT_USER;
  const today = todayISO();
  let html = pageHead(fmtDate(today), `${greeting()}, ${esc(u.prenom)}`, `Connecté en tant que <b>${esc(roleLabelFull(u))}</b>. Voici l'essentiel du Pacific Bluffs.`);

  const pending = isDirection() ? DB.users.filter((x) => x.statut === 'En attente').length : 0;
  if (pending) html += `<button class="hint hint-btn" type="button" onclick="adminTab='utilisateurs';goPage('administration')">${icon('userCheck', 'sm')}<span><b>${pending} compte${pending > 1 ? 's' : ''} en attente de validation.</b> Cliquez pour les valider dans Administration.</span>${icon('arrow', 'sm')}</button>`;
  // Fiches de ventes : ce que j'ai vendu ce soir et ma part
  if (canFillFinance()) {
    const mine = allSales().filter((s) => s.date === serviceDay() && s.userId === u.id);
    const t = sumSales(mine);
    html += `<button class="hint hint-btn" type="button" onclick="openVentesDay(serviceDay(),null)">${icon('receipt', 'sm')}<span><b>${mine.length ? `Ce soir : ${fmtMoney(t)} de ventes, votre part ${ratesText(mine)} : ${fmtMoney(commissionOfSales(mine))}.` : 'Noter une vente'}</b> ${mine.length ? 'Cliquez pour ouvrir vos fiches de ventes.' : `Carte, hospitalité (entrées, cocons) ou carte VIP : notez chaque vente dans l'onglet Ventes, vous touchez ${pctOf(gradeRate(u))}.`}</span>${icon('arrow', 'sm')}</button>`;
  }

  if (isMgmt() || canSeeFinance()) {
    const upcoming = DB.events.filter((e) => e.date >= today).length;
    const toValidate = DB.attendances.filter((a) => a.statut === 'À valider').length;
    const weeks = [...DB.accountingWeeks].sort((a, b) => a.numero - b.numero);
    const latest = weeks[weeks.length - 1];
    const newRdv = navAllowed('privatisations') ? DB.rdv.filter((r) => r.statut === 'Nouvelle').length : null;

    html += '<div class="stats-row stagger">';
    html += statTile('Soirées à venir', 'mic', upcoming, { foot: 'au programme' });
    html += statTile('Présences à valider', 'checkCircle', toValidate, { tone: toValidate ? 'warnv' : '', foot: toValidate ? 'en attente de validation' : 'tout est à jour' });
    if (newRdv !== null) html += statTile('Privatisations', 'party', newRdv, { tone: newRdv ? 'warnv' : '', foot: newRdv ? 'nouvelle(s) demande(s)' : 'aucune nouvelle demande' });
    if (canSeeFinance() && latest) {
      const t = weekTotals(latest);
      html += statTile(`Recettes S${latest.numero}`, 'trend', t.recettes, { money: true });
      html += statTile(`Charges S${latest.numero}`, 'coins', t.charges, { money: true });
      html += statTile('Bénéfice net', 'sun', t.benefice, { money: true, tone: t.benefice >= 0 ? 'pos' : 'neg', foot: `semaine ${latest.numero}` });
    }
    html += '</div>';

    if (canSeeFinance() && weeks.length) {
      const labels = weeks.map((w) => 'S' + w.numero);
      const tips = weeks.map((w) => `Semaine ${w.numero} · ${fmtDateShort(w.dateDebut)} → ${fmtDateShort(w.dateFin)}`);
      const totals = weeks.map(weekTotals);
      const soldes = totals.map((t) => t.nouveauSolde);
      const rec = totals.map((t) => t.recettes);
      const ch = totals.map((t) => t.charges);
      const last = soldes[soldes.length - 1];
      const prev = soldes.length > 1 ? soldes[soldes.length - 2] : null;
      html += `<div class="grid-2c stagger">
        <div class="card chart-card">
          <div class="chart-h"><div><h3>Solde du coffre</h3><p>Nouveau solde à la fin de chaque semaine comptable</p></div>${prev !== null ? deltaBadge(last - prev, 'vs S' + weeks[weeks.length - 2].numero) : ''}</div>
          <div class="hero-num"><span ${countAttrs(last, true)}>${fmtMoney(last)}</span></div>
          <div class="chart" id="chSolde"></div>
          ${Charts.dataTable(tips, [{ name: 'Solde du coffre', values: soldes }])}
        </div>
        <div class="card chart-card">
          <div class="chart-h"><div><h3>Recettes et charges</h3><p>Par semaine comptable</p></div>
            <div class="legend"><span><i class="s1"></i>Recettes</span><span><i class="s2"></i>Charges</span></div></div>
          <div class="chart" id="chRC"></div>
          ${Charts.dataTable(tips, [{ name: 'Recettes', values: rec }, { name: 'Charges', values: ch }])}
        </div>
      </div>`;
      Charts.add((a) => Charts.line(document.getElementById('chSolde'), { labels, tipLabels: tips, values: soldes, name: 'Solde', label: 'Évolution du solde du coffre', height: 210 }, a));
      Charts.add((a) => Charts.columns(document.getElementById('chRC'), { labels, tipLabels: tips, series: [{ name: 'Recettes', cls: 's1', values: rec }, { name: 'Charges', cls: 's2', values: ch }], label: 'Recettes et charges par semaine', height: 300 }, a));
    }

    if (canManageEvents()) {
      const q = (ic, label, action, primary) => `<button class="quick-btn${primary ? ' primary' : ''}" type="button" onclick="${action}"><span class="q-ic">${icon(ic)}</span>${label}</button>`;
      html += sectionHead('Actions rapides');
      html += `<div class="quick stagger">
        ${q('plus', 'Créer une soirée', 'openCreateEventModal()', true)}
        ${q('receipt', 'Fiches de ventes', "goPage('ventes')")}
        ${canHandleRdv() ? q('party', 'Privatisations', "goPage('privatisations')") : ''}
        ${q('wallet', 'Comptabilité', "goPage('comptabilite')")}
        ${isDirection() ? q('glass', 'Modifier la carte', "goPage('carte')") : ''}
        ${canAddDocs() ? q('folder', 'Ajouter un document', "goPage('documents')") : ''}
        ${isDirection() ? q('users', "Gérer l'équipe", "goPage('equipe')") : ''}
        ${isMgmt() ? q('checkCircle', 'Voir les présences', "goPage('presences')") : ''}
      </div>`;
    }
  } else {
    const next = myUpcomingAssignments(u.id, 1)[0];
    const myAtt = DB.attendances.filter((a) => a.userId === u.id);
    const totalMin = myAtt.reduce((s, a) => s + (durationMinutes(a.heureArrivee, a.heureDepart) || 0), 0);
    // Mes ventes et mon salaire de la semaine (du lundi 6h au lundi 6h)
    const mon = mondayOf(serviceDay());
    const myWeek = allSales().filter((s) => s.userId === u.id && s.date >= mon && s.date <= shiftISO(mon, 6));
    const doneList = myWeek.filter(isSaleTransferred), pendList = myWeek.filter((s) => !isSaleTransferred(s));
    const myDone = sumSales(doneList), myPend = sumSales(pendList);
    html += `<div class="grid-2c">
      <section>${sectionHead('Mon prochain service')}${next ? renderServiceCard(next.event, next.assignment, u.id) : emptyState('📭', 'Aucun service prévu', 'Prenez un poste depuis le Programme pour apparaître ici.')}</section>
      <section>${sectionHead('Mes chiffres')}<div class="stats-row stagger" style="grid-template-columns:1fr 1fr">
        ${statTile('Mes ventes de la semaine', 'receipt', myDone + myPend, { money: true, foot: salaryWeekLabel(mon) })}
        ${statTile('Mon salaire de la semaine', 'wallet', commissionOfSales(doneList), { money: true, cls: 'dark', foot: myPend ? `+ ${fmtMoney(commissionOfSales(pendList))} à 6h` : `${pctOf(gradeRate(u))} de mes ventes${gradeOf(u) ? ` (${esc(gradeOf(u).toLowerCase())})` : ''}` })}
        ${statTile('Services', 'calendar', myAtt.length)}
        ${statTile('Heures effectuées', 'clock', hoursDec(totalMin), { suffix: ' h' })}
        ${statTile('Présences validées', 'checkCircle', myAtt.filter((a) => a.statut === 'Validé').length)}
        ${statTile('À venir', 'mic', myUpcomingAssignments(u.id).length)}
      </div></section>
    </div>`;
  }

  const upcomingList = [...DB.events].filter((e) => e.date >= today).sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut)).slice(0, 5);
  html += `<div class="grid-2c even">
    <section>${sectionHead('Prochaines soirées', null, navAllowed('programme') ?`<button class="btn btn-xs" type="button" onclick="goPage('programme')">Programme ${icon('arrow', 'sm')}</button>` : '')}
      <div class="card ev-list">${upcomingList.length ? upcomingList.map(eventRow).join('') : '<div class="sr-empty">Aucune soirée programmée.</div>'}</div></section>
    <section>${sectionHead('Historique récent', DB.activityLogs.length + ' entrées')}
      <div class="card log">${logRows(DB.activityLogs.slice(0, 6))}</div></section>
  </div>`;
  return html;
}
