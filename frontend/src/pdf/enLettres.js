export const QUATRE_VINGTS_AVEC_S_AVANT_MILLE = true;

const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

const dixA19 = (m) => (m < 17 ? U[m] : 'dix-' + U[m - 10]);

function sous100(n, s80) {
  if (n < 17) return U[n];
  if (n < 20) return dixA19(n);
  if (n < 70) {
    const d = DIZAINES[Math.floor(n / 10)];
    const u = n % 10;
    return u === 0 ? d : u === 1 ? `${d} et un` : `${d}-${U[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${dixA19(n - 60)}`;
  if (n === 80) return s80 ? 'quatre-vingts' : 'quatre-vingt';
  return n < 90 ? `quatre-vingt-${U[n - 80]}` : `quatre-vingt-${dixA19(n - 80)}`;
}

function sous1000(n, s100, s80) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return sous100(r, s80);
  const cent = c === 1 ? 'cent' : `${U[c]} cent${r === 0 && s100 ? 's' : ''}`;
  return r === 0 ? cent : `${cent} ${sous100(r, s80)}`;
}

function entier(n) {
  if (n === 0) return 'zéro';
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1000);
  const reste = n % 1000;
  const parts = [];
  if (milliards) parts.push(`${sous1000(milliards, true, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${sous1000(millions, true, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers) {
    parts.push(milliers === 1 ? 'mille' : `${sous1000(milliers, false, QUATRE_VINGTS_AVEC_S_AVANT_MILLE)} mille`);
  }
  if (reste) parts.push(sous1000(reste, true, true));
  return parts.join(' ');
}

export function montantEnLettres(centimes) {
  const a = Math.abs(Math.round(centimes));
  const ar = Math.floor(a / 100);
  const c = a % 100;
  return `${entier(ar)} ariary` + (c ? ` ${sous100(c, true)}` : '');
}
