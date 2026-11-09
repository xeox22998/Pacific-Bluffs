/* =====================================================================
   PACIFIC BLUFFS — Accès à la base partagée (fonction Netlify « /api/… »)
   Si la fonction n'est pas disponible (aperçu local, dépôt par glisser-
   déposer), le site passe en « mode local » : données dans le navigateur.
   ===================================================================== */
window.ClubApi = (function () {
  let mode = null;
  let token = null;
  let detecting = null;
  try { token = localStorage.getItem('pacific:token'); } catch (e) { /* navigation privée */ }

  async function req(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch('/api/' + path, {
        method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      const err = new Error('Connexion au serveur impossible.');
      err.status = 0;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse non JSON */ }
    if (!res.ok || data === null) {
      const err = new Error((data && data.error) || ('Erreur ' + res.status));
      err.status = res.ok ? 502 : res.status;
      throw err;
    }
    return data;
  }

  function detect() {
    if (detecting) return detecting;
    detecting = (async () => {
      // Simulateur de développement (dev/mock-api.js) : on attend qu'il soit prêt
      if (window.__pacificMock) await Promise.race([window.__pacificMock, new Promise((r) => setTimeout(r, 2500))]);
      try {
        const h = await req('health');
        mode = h && h.mode === 'shared' ? 'shared' : 'local';
      } catch (e) {
        mode = 'local';
      }
      return mode;
    })();
    return detecting;
  }

  function setToken(t) {
    token = t || null;
    try { if (t) localStorage.setItem('pacific:token', t); else localStorage.removeItem('pacific:token'); } catch (e) { /* navigation privée */ }
  }

  return { detect, req, setToken, get mode() { return mode; }, get token() { return token; } };
})();
