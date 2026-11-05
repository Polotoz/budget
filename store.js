'use strict';

/*
 * Couche d'accès aux données.
 * Tout le stockage passe par ici : pour passer à Supabase plus tard,
 * seul ce fichier change (mêmes fonctions, même forme de données).
 */
const Store = (() => {
  const KEY = 'budget-v1';
  const FREQS = ['monthly', 'quarterly', 'yearly'];
  const TYPES = ['income', 'expense'];

  const empty = () => ({
    version: 1,
    recurring: [],
    transactions: [],
    settings: { savings: 0, lastExport: null },
  });

  let state = empty();

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const num = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  // Valide et nettoie des données (chargement local ou import d'un fichier).
  function normalize(raw) {
    const d = empty();
    if (!raw || typeof raw !== 'object') return d;

    if (Array.isArray(raw.recurring)) {
      d.recurring = raw.recurring
        .filter((r) => r && TYPES.includes(r.type) && FREQS.includes(r.freq) && num(r.amount) > 0)
        .map((r) => ({
          id: String(r.id || uid()),
          type: r.type,
          label: String(r.label || '').slice(0, 80),
          amount: num(r.amount),
          freq: r.freq,
          day: Math.min(31, Math.max(1, Math.round(num(r.day, 1)))),
        }));
    }

    if (Array.isArray(raw.transactions)) {
      d.transactions = raw.transactions
        .filter((t) => t && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && num(t.amount) > 0)
        .map((t) => ({
          id: String(t.id || uid()),
          date: t.date,
          label: String(t.label || '').slice(0, 80),
          category: String(t.category || 'Autre').slice(0, 40),
          amount: num(t.amount),
        }));
    }

    if (raw.settings && typeof raw.settings === 'object') {
      d.settings.savings = Math.max(0, num(raw.settings.savings));
      d.settings.lastExport = typeof raw.settings.lastExport === 'string' ? raw.settings.lastExport : null;
    }
    return d;
  }

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  return {
    empty,
    normalize,

    async load() {
      try {
        state = normalize(JSON.parse(localStorage.getItem(KEY) || 'null'));
      } catch {
        state = empty();
      }
      return state;
    },

    async addTransaction(t) {
      state.transactions.push({ ...t, id: uid() });
      persist();
      return state;
    },

    async removeTransaction(id) {
      state.transactions = state.transactions.filter((t) => t.id !== id);
      persist();
      return state;
    },

    async addRecurring(r) {
      state.recurring.push({ ...r, id: uid() });
      persist();
      return state;
    },

    async removeRecurring(id) {
      state.recurring = state.recurring.filter((r) => r.id !== id);
      persist();
      return state;
    },

    async updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      persist();
      return state;
    },

    async replaceAll(raw) {
      state = normalize(raw);
      persist();
      return state;
    },

    async clear() {
      state = empty();
      persist();
      return state;
    },

    // Demande au navigateur de ne pas effacer les données de lui-même
    // (manque de place, inactivité). N'empêche pas un effacement manuel.
    async requestPersistence() {
      if (!navigator.storage || !navigator.storage.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return navigator.storage.persist();
    },
  };
})();
