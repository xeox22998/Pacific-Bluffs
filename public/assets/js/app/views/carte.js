/* =====================================================================
   PACIFIC BLUFFS — La carte (modifiable par la direction, affichée sur l'accueil)
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
  const actions = edit ? `<button class="btn btn-sm" type="button" onclick="resetCarte()">${icon('refresh', 'sm')}Carte d'origine</button><button class="btn btn-sm btn-sun" type="button" onclick="openItemModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter un article</button>` : '';
  let html = pageHead('La carte', 'La carte du Pacific Bluffs',
    edit ? "Modifiez les articles, les prix et la composition des menus : l'accueil du site affiche automatiquement la carte à jour (articles disponibles uniquement)."
      : 'Carte et prix en vigueur au bar.', actions);

  html += `<div class="pill-row" role="tablist" aria-label="Catégories">${MENU_CATEGORIES.map((c) => {
    const n = items.filter((m) => m.categorie === c).length;
    return `<button class="pill ${carteCat === c ? 'is-active' : ''}" type="button" role="tab" aria-selected="${carteCat === c}" onclick="carteCat='${c}';renderPage(false)"><span class="pi">${CLUB.MENU_ICONS[c]}</span>${c} · ${n}</button>`;
  }).join('')}<button class="pill ${carteCat === 'Membres' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${carteCat === 'Membres'}" onclick="carteCat='Membres';renderPage(false)"><span class="pi">🌴</span>Cartes membres</button></div>`;

  if (carteCat === 'Membres') {
    html += `<div class="tiers-grid stagger">${CLUB.MEMBERSHIP.map((t) => `
      <article class="tier-neon ${t.cls}"><div class="tn-in">
        <div class="tn-head"><div class="tn-name">${esc(t.key.toUpperCase())}</div><div class="tn-price">${fmtMoney(t.prix)} <small>/ semaine</small></div><div class="tn-sub">${esc(t.acces)}</div></div>
        <ul class="tn-list">${t.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </div></article>`).join('')}</div>
      <p class="tiers-note">Avantages affichés sur l'accueil du site. Les tarifs servent aussi de référence dans la comptabilité.</p>`;
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
        <div class="ci-top"><b>${esc(m.nom)}</b><span class="price-tag">${fmtMoney(m.prix)}</span></div>
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
    <div class="field"><label for="miDesc">${m.categorie === 'Menus' ? 'Phrase de présentation' : 'Ingrédients / description'}</label><textarea class="input" id="miDesc" style="min-height:80px">${esc(m.desc || '')}</textarea></div>
    <div class="field" id="miCompoWrap" ${m.categorie === 'Menus' ? '' : 'hidden'}><label for="miCompo">Composition du menu (une ligne par élément, « Libellé : valeur »)</label><textarea class="input" id="miCompo" style="min-height:100px" placeholder="Softs : 3 au choix">${esc(compoTxt)}</textarea></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveItem('${id || ''}')">Enregistrer</button>`);
}
function saveItem(id) {
  const nom = document.getElementById('miNom').value.trim();
  if (!nom) { toast("Donnez un nom à l'article.", 'error'); return; }
  const categorie = document.getElementById('miCat').value;
  const data = {
    nom, categorie, prix: Math.max(0, Number(document.getElementById('miPrix').value) || 0),
    emoji: document.getElementById('miEmoji').value.trim() || CLUB.MENU_ICONS[categorie] || '',
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
