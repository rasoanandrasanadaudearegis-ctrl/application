export const API_URL = '/api';

export const ROLES = {
  directeur: "Directeur d'agence",
  comptable: 'Comptable',
  conseiller: 'Conseiller clientèle',
};

export const ROLES_SUPPRESSION_IMPORT = ['directeur', 'comptable', 'conseiller'];

export const EVENT_SESSION_EXPIREE = 'rcc-session-expiree';
if (!window.__rccFetchInstalle) {
  window.__rccFetchInstalle = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const r = await original(...args);
    if (r.status === 401) window.dispatchEvent(new Event(EVENT_SESSION_EXPIREE));
    return r;
  };
}

export async function envoyer(corps) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({ error: 'Réponse invalide du serveur' }));
  return { statut: r.status, ...d };
}
