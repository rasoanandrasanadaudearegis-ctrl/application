export const EVENT_TOAST = 'rcc-toast';

export function notifier(type, texte) {
  window.dispatchEvent(new CustomEvent(EVENT_TOAST, { detail: { type, texte: String(texte) } }));
}
