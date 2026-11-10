/* =====================================================================
   PACIFIC BLUFFS — Documents internes
   Chaque document garde ses informations et, au choix, un fichier importé
   depuis l'ordinateur ou le téléphone (JPEG, PNG ou PDF) et/ou un lien
   (Google Drive, Docs…). En ligne, le fichier est gardé à part dans la base
   partagée (« docfile:<id> ») et chargé seulement à l'ouverture du document ;
   en mode local, il reste dans ce navigateur (fichierData).
   ===================================================================== */

let currentDocCategory = null;
const DOC_ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';
const DOC_TYPES_OK = ['image/jpeg', 'image/png', 'application/pdf'];
const DOC_EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
let DOC_FILE = null; // fichier choisi dans la fenêtre d'ajout : { data, type, nom, taille }

/* Accès (10/11/2026) : direction et gouvernement / fisc ajoutent et consultent ; managers consultent
   seulement ; employés et comptabilité n'ont pas l'onglet (le serveur ne leur envoie aucun document). */
function canAddDocs() { return isDirection() || CURRENT_USER.role === ROLES.GOUVERNEMENT; }
/* Visibilité « Direction & Fisc » (anciennement « Direction & Comptabilité ») : cachée aux managers */
const DOC_PRIVATE = 'Direction & Fisc';
function isPrivateDoc(d) { return d.visibilite === DOC_PRIVATE || d.visibilite === 'Direction & Comptabilité'; }
function visibleDocs() {
  if (!navAllowed('documents')) return [];
  return DB.documents.filter((d) => !isPrivateDoc(d) || canAddDocs());
}
/* Taille maximale d'un fichier : 4 Mo en ligne (limite d'envoi des fonctions Netlify), 1,5 Mo en mode local (place du navigateur) */
function docFileLimit() { return isShared() ? 4000000 : 1500000; }
function fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1000) return n + ' o';
  if (n < 1000000) return Math.round(n / 1000) + ' Ko';
  return (n / 1000000).toFixed(1).replace('.', ',').replace(',0', '') + ' Mo';
}
function isPdf(f) { return !!f && f.type === 'application/pdf'; }
function docKindLabel(f) { return isPdf(f) ? 'PDF' : f && f.type === 'image/png' ? 'PNG' : 'JPEG'; }

function renderDocuments() {
  const docs = visibleDocs();
  const actions = canAddDocs() ? `<button class="btn btn-sun" type="button" onclick="openAddDocModal()" data-magnetic="0.2">${icon('plus', 'sm')}Ajouter un document</button>` : '';
  let html = pageHead('Documents', currentDocCategory ? esc(currentDocCategory.charAt(0) + currentDocCategory.slice(1).toLowerCase()) : 'Bibliothèque', 'Comptabilités, programmes, contrats et documents administratifs du Pacific Bluffs.', actions);
  if (!canAddDocs()) html += `<div class="hint">${icon('eye', 'sm')}<span>Consultation seulement : la direction et le fisc ajoutent les documents.</span></div>`;
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
      <div class="doc-info"><b>${esc(d.nom)}</b><small>${d.fichier ? `<span class="doc-tag${isPdf(d.fichier) ? ' pdf' : ''}">${docKindLabel(d.fichier)}</span>` : ''}${esc(d.categorie)} · ${fmtDateShort(d.date)} · ${esc(d.auteur)}${d.semaineLiee ? ' · Semaine ' + esc(d.semaineLiee) : ''}${d.fichier ? ' · ' + fmtSize(d.fichier.taille) : ''}${isPrivateDoc(d) ? ' · 🔒 ' + DOC_PRIVATE : ''}</small></div>
      <div class="doc-actions">
        ${d.lien ? `<a class="icon-btn sm" href="${esc(d.lien)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le lien">${icon('link', 'sm')}</a>` : ''}
        <button class="btn btn-xs" type="button" onclick="openDocViewer('${d.id}')">${icon(d.fichier ? 'file' : 'eye', 'sm')}${d.fichier ? 'Ouvrir' : 'Consulter'}</button>
        ${isDirection() ? `<button class="icon-btn sm" type="button" onclick="deleteDoc('${d.id}')" aria-label="Supprimer">${icon('trash', 'sm')}</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

/* ---------- Fichier d'un document : chargé à la demande, puis gardé (adresse « blob: ») ---------- */
const DOC_URLS = {};
async function docFileUrl(d) {
  const f = d && d.fichier;
  if (!f) return '';
  const key = d.id + ':' + (f.v || 'local');
  if (DOC_URLS[key]) return DOC_URLS[key];
  let mime = f.type, b64;
  if (d.fichierData) b64 = d.fichierData.slice(d.fichierData.indexOf(',') + 1);            // mode local
  else if (isShared() && f.v) { const r = await ClubApi.req('docfile/' + encodeURIComponent(d.id)); mime = r.mime || mime; b64 = r.data; }
  else throw new Error("Ce fichier n'est pas disponible dans ce navigateur.");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  DOC_URLS[key] = URL.createObjectURL(new Blob([bytes], { type: mime }));
  return DOC_URLS[key];
}
function openDocViewer(docId) {
  const d = DB.documents.find((x) => x.id === docId);
  if (!d) return;
  const f = d.fichier;
  const desc = d.description ? `<div class="doc-preview">${esc(d.description)}</div>` : (f ? '' : '<div class="doc-preview"><span class="muted">Aucune description pour ce document.</span></div>');
  openModal(esc(d.nom), `
    <p class="confirm-text muted" style="margin-bottom:14px">${esc(d.categorie)} · ajouté par ${esc(d.auteur)} le ${fmtDateShort(d.date)}${d.semaineLiee ? ' · Semaine ' + esc(d.semaineLiee) : ''} · visibilité : ${isPrivateDoc(d) ? DOC_PRIVATE : 'Direction, fisc et managers'}</p>
    ${f ? `<div class="doc-file${isPdf(f) ? ' is-pdf' : ''}" id="docFileView"><span class="doc-file-load">${icon('file')}Chargement du fichier…</span></div>
      <p class="doc-file-name">${icon('file', 'sm')}<span>${esc(f.nom)}</span><small>${docKindLabel(f)} · ${fmtSize(f.taille)}</small></p>` : ''}
    ${desc}`,
    `<span class="doc-file-acts" id="docFileActs"></span>`
    + (d.lien ? `<a class="btn btn-sm${f ? '' : ' btn-sun'}" href="${esc(d.lien)}" target="_blank" rel="noopener noreferrer">${icon('link', 'sm')}Ouvrir le lien</a>` : '')
    + '<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Fermer</button>', f ? { size: 'lg' } : undefined);
  if (!f) return;
  docFileUrl(d).then((url) => {
    const view = document.getElementById('docFileView');
    const acts = document.getElementById('docFileActs');
    if (!view || !view.isConnected) return; // fenêtre fermée entre-temps
    view.innerHTML = isPdf(f)
      ? `<iframe src="${url}" title="${esc(f.nom)}"></iframe>`
      : `<a href="${url}" target="_blank" rel="noopener" title="Voir en grand"><img src="${url}" alt="${esc(d.nom)}"></a>`;
    if (acts) acts.innerHTML = `<a class="btn btn-sm btn-sun" href="${url}" target="_blank" rel="noopener">${icon('eye', 'sm')}Ouvrir dans un onglet</a>
      <a class="btn btn-sm" href="${url}" download="${esc(f.nom)}">${icon('download', 'sm')}Télécharger</a>`;
  }).catch((e) => {
    const view = document.getElementById('docFileView');
    if (view) view.innerHTML = `<span class="doc-file-load bad">${icon('x')}Le fichier n'a pas pu être chargé : ${esc(e.message)}</span>`;
  });
}

/* ---------- Ajouter un document (fichier importé et/ou lien) ---------- */
/* Lit le fichier choisi. Un PDF ou une image assez légère est gardé tel quel ; une photo trop lourde est réduite (JPEG). */
function readDocFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Aucun fichier choisi.')); return; }
    const nom = file.name || 'fichier';
    const ext = ((/\.([a-z0-9]+)$/i.exec(nom) || [])[1] || '').toLowerCase();
    let type = file.type === 'image/pjpeg' ? 'image/jpeg' : file.type;
    if (!DOC_TYPES_OK.includes(type)) type = DOC_EXT_MIME[ext] || '';
    if (!type) { reject(new Error('Choisissez un fichier JPEG, PNG ou PDF.')); return; }
    const limit = docFileLimit();
    if (type !== 'application/pdf' && file.size > limit) {
      shrinkDocImage(file, limit).then((data) => resolve({ data, type: 'image/jpeg', nom: nom.replace(/\.(png|jpe?g)$/i, '') + '.jpg', taille: Math.round((data.length - 23) * 0.75) })).catch(reject);
      return;
    }
    if (file.size > limit) { reject(new Error(`PDF trop lourd (${fmtSize(file.size)}) : ${fmtSize(limit)} maximum. Compressez-le ou ajoutez plutôt un lien.`)); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      const b64 = s.slice(s.indexOf(',') + 1);
      if (type === 'application/pdf' && !b64.startsWith('JVBER')) { reject(new Error("Ce fichier n'est pas un vrai PDF.")); return; } // « %PDF »
      resolve({ data: `data:${type};base64,${b64}`, type, nom, taille: file.size });
    };
    fr.onerror = () => reject(new Error("Ce fichier n'a pas pu être lu."));
    fr.readAsDataURL(file);
  });
}
function shrinkDocImage(file, limit) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const big = Math.max(img.naturalWidth, img.naturalHeight) || 1;
      const max = Math.floor((limit * 4) / 3); // longueur en base64
      let side = Math.min(2400, big);
      for (let t = 0; t < 6; t++, side = Math.round(side * 0.75)) {
        const k = side / big;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff'; // document scanné : fond blanc sous les parties transparentes
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        for (let q = 0.88; q >= 0.6; q -= 0.07) {
          const d = c.toDataURL('image/jpeg', q);
          if (d.length <= max) { resolve(d); return; }
        }
      }
      reject(new Error('Image trop lourde, choisissez une image plus petite.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cette image n'a pas pu être lue.")); };
    img.src = url;
  });
}
function docFileField() {
  return `<div class="field"><label>Fichier (JPEG, PNG ou PDF)</label>
    <div class="docfile-pick" id="docPick" ondragover="event.preventDefault();this.classList.add('is-over')" ondragleave="this.classList.remove('is-over')" ondrop="dropDocFile(event)">
      <div class="docfile-prev" id="docPrev"><span>${icon('upload')}Aucun fichier</span></div>
      <div class="poster-side">
        <label class="btn btn-sm">${icon('upload', 'sm')}Importer un fichier<input type="file" accept="${DOC_ACCEPT}" hidden onchange="pickDocFile(this)"></label>
        <button class="btn btn-sm btn-ghost" type="button" id="docRm" onclick="clearDocFile()" hidden>${icon('trash', 'sm')}Retirer</button>
        <p class="field-hint" id="docPickHint">Depuis l'ordinateur ou le téléphone, sans lien (ou glissez le fichier ici). ${fmtSize(docFileLimit())} maximum ; une photo plus lourde est réduite automatiquement.</p>
      </div>
    </div></div>`;
}
async function useDocFile(file) {
  const hint = document.getElementById('docPickHint');
  try {
    if (hint) hint.textContent = 'Lecture du fichier…';
    const f = await readDocFile(file);
    DOC_FILE = f;
    const prev = document.getElementById('docPrev');
    if (!prev) return;
    prev.innerHTML = isPdf(f) ? `<span class="docfile-pdf"><b>PDF</b></span>` : `<img src="${f.data}" alt="Aperçu">`;
    document.getElementById('docRm').hidden = false;
    if (hint) hint.innerHTML = `<b>${esc(f.nom)}</b> · ${docKindLabel(f)} · ${fmtSize(f.taille)}`;
    const nom = document.getElementById('dNom');
    if (nom && !nom.value.trim()) nom.value = f.nom.replace(/\.[a-z0-9]+$/i, '');
  } catch (e) {
    toast(e.message, 'error');
    if (hint) hint.textContent = e.message;
  }
}
function pickDocFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (file) useDocFile(file);
}
function dropDocFile(e) {
  e.preventDefault();
  const zone = document.getElementById('docPick');
  if (zone) zone.classList.remove('is-over');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) useDocFile(file);
}
function clearDocFile() {
  DOC_FILE = null;
  document.getElementById('docPrev').innerHTML = `<span>${icon('upload')}Aucun fichier</span>`;
  document.getElementById('docRm').hidden = true;
  document.getElementById('docPickHint').textContent = `Depuis l'ordinateur ou le téléphone, sans lien (ou glissez le fichier ici). ${fmtSize(docFileLimit())} maximum ; une photo plus lourde est réduite automatiquement.`;
}
function openAddDocModal() {
  DOC_FILE = null;
  openModal('Ajouter un document', `
    <div class="field"><label for="dNom">Nom du document</label><input class="input" id="dNom" placeholder="ex : Comptabilité — Semaine 14"></div>
    <div class="grid-2">
      <div class="field"><label for="dCat">Catégorie</label><select class="input" id="dCat">${DOC_CATEGORIES.map((c) => `<option ${c === currentDocCategory ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="dSem">Semaine concernée (optionnel)</label><input class="input" id="dSem" type="number" min="1"></div>
    </div>
    ${docFileField()}
    <div class="field"><label for="dLien">Ou un lien vers le fichier (optionnel)</label><input class="input" id="dLien" type="url" placeholder="https://drive.google.com/…"></div>
    <div class="field"><label for="dDesc">Description / contenu</label><textarea class="input" id="dDesc"></textarea></div>
    <div class="field"><label for="dVis">Visibilité</label><select class="input" id="dVis"><option value="Toute l'équipe">Direction, fisc et managers</option><option value="${DOC_PRIVATE}">${esc(DOC_PRIVATE)} (caché aux managers)</option></select>
      <p class="field-hint">Les employés et la comptabilité n'ont pas accès aux documents.</p></div>`,
    `<button class="btn btn-sm btn-ghost" type="button" data-close-modal>Annuler</button><button class="btn btn-sm btn-sun" type="button" onclick="saveDoc(this)">Ajouter</button>`);
}
async function saveDoc(btn) {
  const nom = document.getElementById('dNom').value.trim();
  if (!nom) { toast('Donnez un nom au document.', 'error'); return; }
  const lien = document.getElementById('dLien').value.trim();
  if (lien && !/^https?:\/\//i.test(lien)) { toast('Le lien doit commencer par https://', 'error'); return; }
  const f = DOC_FILE;
  const d = {
    id: uid('doc'), nom, categorie: document.getElementById('dCat').value, date: todayISO(), auteur: userLabel(CURRENT_USER.id),
    taille: f ? fmtSize(f.taille) : '—', statut: 'Actif', semaineLiee: document.getElementById('dSem').value, visibilite: document.getElementById('dVis').value,
    description: document.getElementById('dDesc').value.trim(), lien,
  };
  const idle = () => { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Ajouter'; } };
  if (f) {
    if (isShared()) {
      // le fichier part d'abord, à part ; le document (avec la fiche du fichier) suit par la synchro
      busyBtn(btn, 'Envoi du fichier…');
      try {
        const r = await ClubApi.req('docfile', { body: { docId: d.id, data: f.data, nom: f.nom } });
        d.fichier = r.fichier;
      } catch (e) { toast("Le fichier n'a pas pu être envoyé : " + e.message, 'error'); idle(); return; }
    } else {
      d.fichier = { type: f.type, nom: f.nom, taille: f.taille };
      d.fichierData = f.data;
    }
  }
  DB.documents.unshift(d);
  if (d.fichierData && !storageSet(STORAGE_KEY, JSON.stringify(DB))) {
    DB.documents = DB.documents.filter((x) => x.id !== d.id);
    toast('Plus de place dans ce navigateur pour ce fichier (mode local) : choisissez un fichier plus léger ou ajoutez plutôt un lien.', 'error');
    idle(); return;
  }
  DOC_FILE = null;
  logActivity('Document ajouté', nom + (f ? ` (${f.nom})` : ''));
  toast(f ? 'Document et fichier ajoutés.' : 'Document ajouté.', 'success'); closeModal(); refresh();
}
function deleteDoc(docId) {
  const d = DB.documents.find((x) => x.id === docId);
  confirmAction(`Supprimer le document « ${esc(d ? d.nom : '')} »${d && d.fichier ? ' et son fichier' : ''} ?`, () => {
    DB.documents = DB.documents.filter((x) => x.id !== docId);
    logActivity('Document supprimé', d ? d.nom : '');
    toast('Document supprimé.', 'success'); refresh();
  }, 'Supprimer');
}
