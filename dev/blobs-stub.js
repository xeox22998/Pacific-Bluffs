/* =====================================================================
   DÉVELOPPEMENT UNIQUEMENT — imitation de @netlify/blobs dans le navigateur
   Les données sont gardées dans localStorage (« pacific:mock-blobs »).
   ===================================================================== */
const KEY = 'pacific:mock-blobs';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

export function getStore() {
  return {
    async get(key, opts) {
      const d = load();
      if (!(key in d)) return null;
      return opts && opts.type === 'json' ? JSON.parse(d[key]) : d[key];
    },
    async setJSON(key, value) { const d = load(); d[key] = JSON.stringify(value); save(d); },
    async set(key, value) { const d = load(); d[key] = String(value); save(d); },
    async delete(key) { const d = load(); delete d[key]; save(d); },
  };
}
