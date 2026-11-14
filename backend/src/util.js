import { config } from './config.js';

export class ApiError extends Error {
  constructor(status, message, motif = null) { super(message); this.status = status; this.motif = motif; }
}
export const fail = (code, msg, motif = null) => { throw new ApiError(code, msg, motif); };

export const lg = (s) => Array.from(String(s)).length;
export const sous = (s, max) => Array.from(String(s)).slice(0, max).join('');

export function normNom(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function simSomme(a, b) {
  if (!a.length || !b.length) return 0;
  let max = 0, pa = 0, pb = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > max) { max = k; pa = i; pb = j; }
    }
  }
  if (!max) return 0;
  return max + simSomme(a.slice(0, pa), b.slice(0, pb)) + simSomme(a.slice(pa + max), b.slice(pb + max));
}
export function similarPct(a, b) {
  if (!a.length && !b.length) return 0;
  return (simSomme(a, b) * 2 * 100) / (a.length + b.length);
}

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return ymd(d) === s ? d : null;
}
export const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());

export function estNumerique(v) {
  return typeof v === 'number' ? Number.isFinite(v)
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}
export const serialExcelVersYmd = (n) => ymd(new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(n)) * 86400000));

export function valeurModele(s) {
  if (s === null || s === undefined || s === '') return null;
  s = String(s);
  return (/^\d+$/.test(s) && (s === '0' || s[0] !== '0') && s.length <= 15) ? Number(s) : s;
}

export const MOIS_FR = ['', 'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
export const MOIS_FR_ACC = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export function libelleDate(s, majuscules = true) {
  const d = parseYmd(s);
  return `${d.getUTCDate()} ${(majuscules ? MOIS_FR : MOIS_FR_ACC)[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}
