/* =====================================================================
   DÉVELOPPEMENT UNIQUEMENT — fait tourner la vraie fonction Netlify
   (netlify/functions/api.mjs) dans le navigateur pour tester la base
   partagée sans la mettre en ligne.
   Activation : localStorage.setItem('pacific:mock', '1') puis recharger.
   ===================================================================== */
import handler from '../netlify/functions/api.mjs';

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.pathname.startsWith('/api/')) {
    await new Promise((r) => setTimeout(r, 40));
    return handler(new Request(url, init));
  }
  return realFetch(input, init);
};
// Images servies par la fonction (affiches) : le navigateur ne passe pas par fetch, on les charge à la main
const fixImg = (img) => {
  const src = img.getAttribute('src') || '';
  if (!src.includes('/api/') || img.dataset.mock === src) return;
  img.dataset.mock = src;
  window.fetch(src).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) img.src = URL.createObjectURL(b); });
};
new MutationObserver((list) => list.forEach((m) => {
  if (m.type === 'attributes') { fixImg(m.target); return; }
  m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.tagName === 'IMG') fixImg(n);
    n.querySelectorAll('img').forEach(fixImg);
  });
})).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
document.querySelectorAll('img').forEach(fixImg);
if (window.__pacificMockResolve) window.__pacificMockResolve();
console.info('[pacific] Simulateur de base partagée actif');
