/* =====================================================================
   PACIFIC BLUFFS — Documents internes
   Le site ne stocke pas de fichiers : chaque document garde ses
   informations et, si besoin, un lien (Google Drive, Imgur, Docs…).
   ===================================================================== */

let currentDocCategory = null;

function canAddDocs() { return isMgmt() || canSeeFinance(); }
function visibleDocs() {
  // « Direction & Comptabilité » : masqué aux employés et managers
  return DB.documents.filter((d) => d.visibilite !== 'Direction & Comptabilité' || canSeeFinance() || isDirection());
}

function renderDocuments() {
  const docs = visibleDocs();
  const actions = canAddDocs() ? `<button class="btn btn-sun" type="button" onclick="openAddDocModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter un document</button>` : '';
  let html = pageHead('Documents', currentDocCategory ? esc(currentDocCategory.charAt(0) + currentDocCategory.slice(1).toLowerCase()) : 'Bibliothèque', 'Comptabilités, programmes, contrats et documents administratifs du Pacific Bluffs.', actions);
  if (!currentDocCategory) {
    html += `<div class="folders stagger">${DOC_CATEGORIES.map((c) => {
      const n = docs.filter((d) => d.categorie === c).length;
      const v = DOC_VISUALS[c];
      return `<button class="folder card lift" type="button" onclick="openDocFolder('${c}')">
        <div class="viz viz-emoji" style="--hue:${v.hue}"><span class="em" aria-hidden="true">${v.emoji}</span></div>
        <div class="folder-meta"><b>${esc(c.charAt(0) + c.slice(1).toLowerCase())}</b><span>${n} document${n > 1 ? 's' : ''}</span></div>
      </button>`;
    }).join('')}</div>`;
    html += `<section class="section">${sectionHead('Tous les documents', docs.length)}${renderDocList(docs)}</section>`;
  } else {
    html += `<button class="btn btn-sm" type="button" style="margin-bottom:16px" onclick="openDocFolder(null)">${icon('left', 'sm')}Toutes les catégories</button>`;
    html += `<section class="section">${renderDocList(docs.filter((d) => d.categorie === currentDocCategory))}</section>`;
  }
  return html;
}
function openDocFolder(c) { currentDocCategory = c; renderPage(true); }
function renderDocList(docs) {
  if (!docs.length) return emptyState('📭', 'Aucun document', canAddDocs() ? 'Ajoutez un document avec le bouton « Ajouter un document ».' : "Aucun document n'a encore été ajouté dans cette catégorie.");
  return `<div class="card doc-list stagger">${docs.map((d) => `
    <div class="doc-row">
      <span class="doc-ic" aria-hidden="true">${(DOC_VISUALS[d.categorie] || DOC_VISUALS.AUTRES).emoji}</span>
      <div class="doc-info"><b>${esc(d.nom)}</b><small>${esc(d.categorie)} · ${fmtDateShort(d.date)} · ${esc(d.auteur)}${d.semaineLiee ? ' · Semaine ' + esc(d.semaineLiee) : ''}${d.visibilite === 'Direction & Comptabilité' ? ' · 🔒 Direction & Comptabilité' : ''}</small></div>
      <div class="doc-actions">
        ${d.lien ? `<a class="icon-btn sm" href="${esc(d.lien)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le lien">${icon('link', 'sm')}</a>` : ''}
        <button class="btn btn-xs" type="button" onclick="openDocViewer('${d.id}')">${icon('eye', 'sm')}Consulter</button>
        ${isDirection() ? `<button class="icon-btn sm" type="button" onclick="deleteDoc('${d.id}')" aria-label="Supprimer">${icon('trash', 'sm')}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}
function openDocViewer(docId) {
  const d = DB.documents.find((x) => x.id === docId);
  if (!d) return;
  openModal(esc(d.nom), `
    <p class="confirm-text muted" style="margin-bottom:14px">${esc(d.categorie)} · ajouté par ${esc(d.auteur)} le ${fmtDateShort(d.date)}${d.semaineLiee ? ' · Semaine ' + esc(d.semaineLiee) : ''} · visibilité : ${esc(d.visibilite || "Toute l'équipe")}</p>
    <div class="doc-preview">${esc(d.description) || '<span class="muted">Aucune description pour ce document.</span>'}</div>`,
    (d.lien ? `<a class="btn btn-sm btn-sun" href="${esc(d.lien)}" target="_blank" rel="noopener noreferrer">${icon('link', 'sm')}Ouvrir le fichier</a>` : '') + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>');
}
function openAddDocModal() {
  openModal('Ajouter un document', `
    <div class="field"><label for="dNom">Nom du document</label><input class="input" id="dNom" placeholder="ex : Comptabilité — Semaine 14"></div>
    <div class="grid-2">
      <div class="field"><label for="dCat">Catégorie</label><select class="input" id="dCat">${DOC_CATEGORIES.map((c) => `<option ${c === currentDocCategory ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="dSem">Semaine concernée (optionnel)</label><input class="input" id="dSem" type="number" min="1"></div>
    </div>
    <div class="field"><label for="dLien">Lien vers le fichier (optionnel)</label><input class="input" id="dLien" type="url" placeholder="https://drive.google.com/…"></div>
    <div class="field"><label for="dDesc">Description / contenu</label><textarea class="input" id="dDesc"></textarea></div>
    <div class="field"><label for="dVis">Visibilité</label><select class="input" id="dVis"><option>Toute l'équipe</option><option>Direction &amp; Comptabilité</option></select></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveDoc()">Ajouter</button>`);
}
function saveDoc() {
  const nom = document.getElementById('dNom').value.trim();
  if (!nom) { toast('Donnez un nom au document.', 'error'); return; }
  const lien = document.getElementById('dLien').value.trim();
  if (lien && !/^https?:\/\//i.test(lien)) { toast('Le lien doit commencer par https://', 'error'); return; }
  DB.documents.unshift({
    id: uid('doc'), nom, categorie: document.getElementById('dCat').value, date: todayISO(), auteur: userLabel(CURRENT_USER.id),
    taille: '—', statut: 'Actif', semaineLiee: document.getElementById('dSem').value, visibilite: document.getElementById('dVis').value,
    description: document.getElementById('dDesc').value.trim(), lien,
  });
  logActivity('Document ajouté', nom);
  toast('Document ajouté.', 'success'); closeModal(); refresh();
}
function deleteDoc(docId) {
  const d = DB.documents.find((x) => x.id === docId);
  confirmAction(`Supprimer le document « ${esc(d ? d.nom : '')} » ?`, () => {
    DB.documents = DB.documents.filter((x) => x.id !== docId);
    logActivity('Document supprimé', d ? d.nom : '');
    toast('Document supprimé.', 'success'); refresh();
  }, 'Supprimer');
}
