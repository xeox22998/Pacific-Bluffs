/* =====================================================================
   PACIFIC BLUFFS — La carte (modifiable par la direction, affichée sur l'accueil)
   Rubriques : articles par catégorie, cartes membres (tarif, accès, avantages)
   et cocons paradisiaques (chambres pour 2 vendues sur la fiche hospitalité).
   ===================================================================== */

let carteCat = 'Plats';

function canEditCarte() { return isDirection(); }
function ownMenu() {
  if (!Array.isArray(DB.menu) || !DB.menu.length) DB.menu = JSON.parse(JSON.stringify(CLUB.MENU));
  return DB.menu;
}

function renderCarte() {
  const items = menuItems();
  const edit = canEditCarte();
  const pill = (id, emoji, label) => `<button class="pill ${carteCat === id ? 'is-active' : ''}" type="button" role="tab" aria-selected="${carteCat === id}" onclick="carteCat='${id}';renderPage(false)"><span class="pi">${emoji}</span>${label}</button>`;
  let actions = '', sub;
  if (carteCat === 'Membres') {
    if (edit) actions = `<button class="btn btn-sm" type="button" onclick="resetCartes()">${icon('refresh', 'sm')}Cartes d'origine</button>`;
    sub = edit ? "Modifiez le nom, le tarif, l'accès et les avantages de chaque carte : l'accueil du site et la fiche « Cartes VIP » se mettent à jour automatiquement."
      : 'Cartes membres et tarifs en vigueur.';
  } else if (carteCat === 'Cocons') {
    if (edit) actions = `<button class="btn btn-sm" type="button" onclick="resetCocons()">${icon('refresh', 'sm')}Cocons d'origine</button><button class="btn btn-sm btn-sun" type="button" onclick="openCoconModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter un cocon</button>`;
    sub = edit ? 'Chambres pour 2 que tout le staff vend sur la fiche hospitalité (onglet Ventes). Le prix noté sur la fiche est celui choisi ici.'
      : 'Cocons paradisiaques et prix en vigueur.';
  } else {
    if (edit) actions = `<button class="btn btn-sm" type="button" onclick="resetCarte()">${icon('refresh', 'sm')}Carte d'origine</button><button class="btn btn-sm btn-sun" type="button" onclick="openItemModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter un article</button>`;
    sub = edit ? "Modifiez les articles, les prix et la composition des menus : l'accueil du site affiche automatiquement la carte à jour (articles disponibles uniquement)."
      : 'Carte et prix en vigueur au bar.';
  }
  let html = pageHead('La carte', 'La carte du Pacific Bluffs', sub, actions);

  html += `<div class="pill-row" role="tablist" aria-label="Catégories">${MENU_CATEGORIES.map((c) => pill(c, CLUB.MENU_ICONS[c], `${c} · ${items.filter((m) => m.categorie === c).length}`)).join('')}${pill('Membres', '🌴', 'Cartes membres')}${pill('Cocons', '🌺', `Cocons paradisiaques · ${coconsList().length}`)}</div>`;

  if (carteCat === 'Membres') {
    html += `<div class="tiers-grid stagger">${membershipTiers().map((t) => `
      <article class="tier-neon ${t.cls}"><div class="tn-in">
        <div class="tn-head"><div class="tn-name">${esc(t.nom.toUpperCase())}</div><div class="tn-price">${fmtMoney(t.prix)} <small>/ semaine</small></div><div class="tn-sub">${esc(t.acces)}</div></div>
        <ul class="tn-list">${t.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        ${edit ? `<div class="mn-actions"><button class="btn btn-xs" type="button" onclick="openTierModal('${t.key}')">${icon('edit', 'sm')}Modifier</button></div>` : ''}
      </div></article>`).join('')}</div>
      <p class="tiers-note">Avantages affichés sur l'accueil du site. Le tarif est celui de la fiche « Cartes VIP » et de la comptabilité ; les cartes déjà vendues gardent leur prix.</p>`;
    return html;
  }

  if (carteCat === 'Cocons') {
    const list = coconsList();
    if (!list.length) return html + emptyState('🌺', 'Aucun cocon', edit ? 'Ajoutez une formule de cocon paradisiaque.' : 'Aucun cocon paradisiaque pour le moment.');
    html += `<div class="carte-grid stagger">${list.map((c) => `
      <article class="carte-item card lift ${c.dispo === false ? 'off' : ''}">
        <div class="viz viz-emoji" style="--hue:${hueFor(c.nom)}"><span class="em" aria-hidden="true">🌺</span>${c.dispo === false ? '<span class="ci-off">Indisponible</span>' : ''}</div>
        <div class="ci-body">
          <div class="ci-top"><b>${esc(c.nom)}</b><span class="price-tag">${fmtMoney(c.prix)}</span></div>
          <p>${esc(c.desc || 'Chambre pour 2')}</p>
          ${edit ? `<div class="ci-actions"><button class="btn btn-xs" type="button" onclick="openCoconModal('${c.id}')">${icon('edit', 'sm')}Modifier</button>
            <button class="btn btn-xs" type="button" onclick="toggleCocon('${c.id}')">${c.dispo === false ? 'Remettre en vente' : 'Indisponible'}</button>
            <button class="icon-btn xs" type="button" onclick="deleteCocon('${c.id}')" aria-label="Supprimer">${icon('trash', 'sm')}</button></div>` : ''}
        </div>
      </article>`).join('')}</div>
      <p class="tiers-note">Notés sur la fiche hospitalité avec les noms des deux clients ; ils comptent dans « Hébergements » en comptabilité.</p>`;
    return html;
  }

  const list = items.filter((m) => m.categorie === carteCat);
  if (!list.length) return html + emptyState(CLUB.MENU_ICONS[carteCat] || '🍽️', 'Aucun article', edit ? 'Ajoutez un article dans cette catégorie.' : 'Aucun article dans cette catégorie.');

  if (carteCat === 'Menus') {
    html += `<div class="menus-grid stagger">${list.map((m) => `
      <article class="menu-neon ${m.dispo === false ? 'off' : ''}">
        <div class="mn-in">
          <h3>${esc(m.nom)}</h3>
          <div class="mn-price">${fmtMoney(m.prix)}</div>
          ${m.desc ? `<p class="mn-desc">${esc(m.desc)}</p>` : ''}
          ${(m.compo || []).map((c) => `<div class="mn-line"><span>${esc(c.label)}</span><b>${esc(c.value)}</b></div>`).join('')}
          ${m.dispo === false ? '<span class="badge bad">Indisponible</span>' : ''}
          ${edit ? `<div class="mn-actions">${itemActions(m)}</div>` : ''}
        </div>
      </article>`).join('')}</div>`;
    return html;
  }

  html += `<div class="carte-grid stagger">${list.map((m) => `
    <article class="carte-item card lift ${m.dispo === false ? 'off' : ''}">
      <div class="viz viz-emoji" style="--hue:${Number(m.hue) || hueFor(m.nom)}"><span class="em" aria-hidden="true">${esc(m.emoji || '🍽️')}</span>${m.dispo === false ? '<span class="ci-off">Indisponible</span>' : ''}</div>
      <div class="ci-body">
        <div class="ci-top"><b>${esc(m.nom)}${m.drapeau ? ` <span class="flag" role="img" aria-label="Origine">${esc(m.drapeau)}</span>` : ''}</b><span class="price-tag">${fmtMoney(m.prix)}</span></div>
        ${m.desc ? `<p>${esc(m.desc)}</p>` : ''}
        ${edit ? `<div class="ci-actions">${itemActions(m)}</div>` : ''}
      </div>
    </article>`).join('')}</div>`;
  return html;
}
function itemActions(m) {
  return `<button class="btn btn-xs" type="button" onclick="openItemModal('${m.id}')">${icon('edit', 'sm')}Modifier</button>
    <button class="btn btn-xs" type="button" onclick="toggleDispo('${m.id}')">${m.dispo === false ? 'Remettre en vente' : 'Indisponible'}</button>
    <button class="icon-btn xs" type="button" onclick="deleteItem('${m.id}')" aria-label="Supprimer">${icon('trash', 'sm')}</button>`;
}

function openItemModal(id) {
  const m = id ? menuItems().find((x) => x.id === id) : { categorie: carteCat, nom: '', prix: 0, emoji: CLUB.MENU_ICONS[carteCat] || '', desc: '', compo: [] };
  if (!m) return;
  const compoTxt = (m.compo || []).map((c) => `${c.label} : ${c.value}`).join('\n');
  openModal(id ? "Modifier l'article" : 'Ajouter un article', `
    <div class="grid-2">
      <div class="field"><label for="miNom">Nom</label><input class="input" id="miNom" value="${esc(m.nom)}"></div>
      <div class="field"><label for="miPrix">Prix ($)</label><input class="input" id="miPrix" type="number" min="0" step="1" value="${Number(m.prix) || 0}"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="miCat">Catégorie</label><select class="input" id="miCat" onchange="document.getElementById('miCompoWrap').hidden=this.value!=='Menus'">${MENU_CATEGORIES.map((c) => `<option ${m.categorie === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="miEmoji">Émoji (visuel)</label><input class="input" id="miEmoji" value="${esc(m.emoji || '')}" maxlength="4"></div>
    </div>
    <div class="field"><label for="miFlag">Drapeau à côté du nom (facultatif)</label><input class="input flag-in" id="miFlag" value="${esc(m.drapeau || '')}" maxlength="20" placeholder="ex : 🇮🇹"></div>
    <div class="field"><label for="miDesc">${m.categorie === 'Menus' ? 'Phrase de présentation' : 'Description (facultatif)'}</label><textarea class="input" id="miDesc" style="min-height:80px">${esc(m.desc || '')}</textarea></div>
    <div class="field" id="miCompoWrap" ${m.categorie === 'Menus' ? '' : 'hidden'}><label for="miCompo">Composition du menu (une ligne par élément, « Libellé : valeur »)</label><textarea class="input" id="miCompo" style="min-height:100px" placeholder="Mocktails : 3 au choix">${esc(compoTxt)}</textarea></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveItem('${id || ''}')">Enregistrer</button>`);
}
function saveItem(id) {
  const nom = document.getElementById('miNom').value.trim();
  if (!nom) { toast("Donnez un nom à l'article.", 'error'); return; }
  const categorie = document.getElementById('miCat').value;
  const data = {
    nom, categorie, prix: Math.max(0, Number(document.getElementById('miPrix').value) || 0),
    emoji: document.getElementById('miEmoji').value.trim() || CLUB.MENU_ICONS[categorie] || '',
    drapeau: document.getElementById('miFlag').value.trim(),
    desc: document.getElementById('miDesc').value.trim(),
  };
  if (categorie === 'Menus') {
    data.compo = document.getElementById('miCompo').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return i > -1 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: '' };
    });
  }
  const menu = ownMenu();
  if (id) {
    const m = menu.find((x) => x.id === id);
    if (m) Object.assign(m, data);
    if (m && categorie !== 'Menus') delete m.compo;
  } else {
    menu.push(Object.assign({ id: uid('m'), hue: hueFor(nom), dispo: true }, data));
  }
  carteCat = categorie;
  logActivity(id ? 'Carte modifiée' : 'Article ajouté à la carte', `${nom} — ${fmtMoney(data.prix)}`);
  toast('Carte enregistrée.', 'success'); closeModal(); refresh();
}
function toggleDispo(id) {
  const m = ownMenu().find((x) => x.id === id);
  if (!m) return;
  m.dispo = m.dispo === false;
  logActivity(m.dispo ? 'Article remis en vente' : 'Article indisponible', m.nom);
  refresh();
}
function deleteItem(id) {
  const m = menuItems().find((x) => x.id === id);
  confirmAction(`Retirer « ${esc(m ? m.nom : '')} » de la carte ?`, () => {
    DB.menu = ownMenu().filter((x) => x.id !== id);
    logActivity('Article retiré de la carte', m ? m.nom : '');
    toast('Article retiré.', 'success'); refresh();
  }, 'Retirer');
}
function resetCarte() {
  confirmAction("Remplacer la carte actuelle par la carte d'origine du Pacific Bluffs ?", () => {
    DB.menu = JSON.parse(JSON.stringify(CLUB.MENU));
    logActivity('Carte réinitialisée', "Carte d'origine");
    toast("Carte d'origine rétablie.", 'success'); refresh();
  }, 'Rétablir');
}

/* ---------- Cartes membres (Green, Gold, Platinum) : nom, tarif, accès, avantages ---------- */
const defaultCartes = () => CLUB.MEMBERSHIP.map((t) => ({ key: t.key, nom: t.nom, prix: t.prix, acces: t.acces, perks: t.perks.slice() }));
function ownCartes() {
  if (!Array.isArray(DB.cartes) || !DB.cartes.length) DB.cartes = defaultCartes();
  return DB.cartes;
}
function openTierModal(key) {
  const t = membershipTiers().find((x) => x.key === key);
  if (!t || !canEditCarte()) return;
  openModal(`Carte ${esc(t.nom)}`, `
    <div class="grid-2">
      <div class="field"><label for="tmNom">Nom de la carte</label><input class="input" id="tmNom" maxlength="30" value="${esc(t.nom)}" placeholder="ex : ${esc(t.key)}"></div>
      <div class="field"><label for="tmPrix">Tarif ($ / semaine)</label><input class="input" id="tmPrix" type="number" min="1" step="1" value="${Number(t.prix) || 0}"></div>
    </div>
    <div class="field"><label for="tmAcces">Accès (sous le tarif)</label><input class="input" id="tmAcces" maxlength="80" value="${esc(t.acces || '')}"></div>
    <div class="field"><label for="tmPerks">Avantages (un par ligne)</label><textarea class="input" id="tmPerks" style="min-height:200px">${esc(t.perks.join('\n'))}</textarea></div>
    <p class="field-hint">Le nom et le tarif changent sur l'accueil, la fiche « Cartes VIP » et la comptabilité. La couleur de la carte reste la même ; les ventes déjà notées gardent leur prix.</p>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveTier('${t.key}')">Enregistrer</button>`);
}
function saveTier(key) {
  const nom = document.getElementById('tmNom').value.replace(/\s+/g, ' ').trim().slice(0, 30);
  const prix = Math.round(Number(document.getElementById('tmPrix').value));
  if (!nom) { toast('Donnez un nom à la carte.', 'error'); return; }
  if (membershipTiers().some((t) => t.key !== key && t.nom.toLowerCase() === nom.toLowerCase())) { toast('Une autre carte porte déjà ce nom.', 'error'); return; }
  if (!(prix >= 1 && prix <= 1000000)) { toast('Indiquez le tarif de la carte (en $ par semaine).', 'error'); return; }
  const perks = document.getElementById('tmPerks').value.split('\n').map((l) => l.trim().slice(0, 120)).filter(Boolean).slice(0, 20);
  if (!perks.length) { toast('Indiquez au moins un avantage.', 'error'); return; }
  const list = ownCartes();
  let c = list.find((x) => x && x.key === key);
  if (!c) { c = { key }; list.push(c); }
  const avant = tierName(key);
  Object.assign(c, { nom, prix, acces: document.getElementById('tmAcces').value.trim().slice(0, 80), perks });
  logActivity('Carte membre modifiée', `Carte ${nom}${avant !== nom ? ` (anciennement ${avant})` : ''} — ${fmtMoney(prix)} / semaine`);
  toast(`Carte ${nom} enregistrée.`, 'success'); closeModal(); refresh();
}
function resetCartes() {
  confirmAction("Remettre les tarifs et avantages d'origine des cartes membres ?", () => {
    DB.cartes = defaultCartes();
    logActivity('Cartes membres réinitialisées', "Tarifs et avantages d'origine");
    toast("Cartes membres d'origine rétablies.", 'success'); refresh();
  }, 'Rétablir');
}

/* ---------- Cocons paradisiaques (chambres pour 2, fiche hospitalité) ---------- */
function ownCocons() {
  if (!Array.isArray(DB.cocons)) DB.cocons = JSON.parse(JSON.stringify(CLUB.COCONS));
  return DB.cocons;
}
function openCoconModal(id) {
  if (!canEditCarte()) return;
  const c = id ? coconsList().find((x) => x.id === id) : { nom: 'Cocon paradisiaque', prix: 0, desc: 'Chambre pour 2' };
  if (!c) return;
  openModal(id ? 'Modifier le cocon' : 'Ajouter un cocon', `
    <div class="grid-2">
      <div class="field"><label for="ccNom">Nom</label><input class="input" id="ccNom" maxlength="60" value="${esc(c.nom)}"></div>
      <div class="field"><label for="ccPrix">Prix ($)</label><input class="input" id="ccPrix" type="number" min="1" step="1" value="${Number(c.prix) || ''}"></div>
    </div>
    <div class="field"><label for="ccDesc">Détail (facultatif)</label><input class="input" id="ccDesc" maxlength="80" value="${esc(c.desc || '')}" placeholder="ex : chambre pour 2 · 1 nuit"></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveCocon('${id || ''}')">Enregistrer</button>`);
}
function saveCocon(id) {
  const nom = document.getElementById('ccNom').value.trim().slice(0, 60);
  const prix = Math.round(Number(document.getElementById('ccPrix').value) * 100) / 100;
  if (!nom) { toast('Donnez un nom au cocon.', 'error'); return; }
  if (!(prix > 0 && prix <= 1000000)) { toast('Indiquez le prix du cocon (en $).', 'error'); return; }
  const data = { nom, prix, desc: document.getElementById('ccDesc').value.trim().slice(0, 80) };
  const list = ownCocons();
  const c = id ? list.find((x) => x.id === id) : null;
  if (c) Object.assign(c, data); else list.push(Object.assign({ id: uid('cc'), dispo: true }, data));
  logActivity(c ? 'Cocon modifié' : 'Cocon ajouté', `${nom} — ${fmtMoney(prix)}`);
  toast('Cocon enregistré.', 'success'); closeModal(); refresh();
}
function toggleCocon(id) {
  const c = ownCocons().find((x) => x.id === id);
  if (!c) return;
  c.dispo = c.dispo === false;
  logActivity(c.dispo ? 'Cocon remis en vente' : 'Cocon indisponible', c.nom);
  refresh();
}
function deleteCocon(id) {
  const c = coconsList().find((x) => x.id === id);
  confirmAction(`Retirer « ${esc(c ? c.nom : '')} » des cocons ?`, () => {
    DB.cocons = ownCocons().filter((x) => x.id !== id);
    logActivity('Cocon retiré', c ? c.nom : '');
    toast('Cocon retiré.', 'success'); refresh();
  }, 'Retirer');
}
function resetCocons() {
  confirmAction("Remettre les cocons paradisiaques d'origine (et leurs prix) ?", () => {
    DB.cocons = JSON.parse(JSON.stringify(CLUB.COCONS));
    logActivity('Cocons réinitialisés', "Cocons d'origine");
    toast("Cocons d'origine rétablis.", 'success'); refresh();
  }, 'Rétablir');
}
