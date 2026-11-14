import { Pdf } from './pdfWriter.js';
import { montantEnLettres } from './enLettres.js';
import { VILLE, DIRECTEUR, SIGNATAIRES, BANQUE, TVA_DIVISEUR } from './config.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre',
  'Novembre', 'Décembre'];

export const fdate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const dateEnLettres = (d) => `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
export const cinqChiffres = (compte) => String(compte || '').trim().slice(-5);

export function fmtAr(c) {
  const a = Math.abs(Math.round(c));
  const ent = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (c < 0 ? '-' : '') + ent + ',' + String(a % 100).padStart(2, '0');
}

const EST_CODE_POSTAL = /^\s*-\s*\d{3}\s*-/;

const assurance = (des) => (/^\s*ASSURANCE/i.test(des) ? des.trim() : `ASSURANCE ${des.trim()}`);

function ajuster(pdf, s, police, taille, largeurMax, min = 6.5) {
  const w = pdf.largeur(s, police, taille);
  return w <= largeurMax ? taille : Math.max(min, (taille * largeurMax) / w);
}

function decouper(pdf, s, maxW, taille, police = 'R') {
  const out = [];
  let cur = '';
  for (const ch of String(s)) {
    if (cur && pdf.largeur(cur + ch, police, taille) > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function couperMots(pdf, s, maxW, taille, police = 'R') {
  const out = [];
  let cur = '';
  for (const m of String(s).trim().split(/\s+/).filter(Boolean)) {
    const essai = cur ? `${cur} ${m}` : m;
    if (pdf.largeur(essai, police, taille) <= maxW) { cur = essai; continue; }
    if (cur) { out.push(cur); cur = ''; }
    if (pdf.largeur(m, police, taille) <= maxW) cur = m;
    else { const morceaux = decouper(pdf, m, maxW, taille, police); cur = morceaux.pop(); out.push(...morceaux); }
  }
  if (cur) out.push(cur);
  return out;
}

function blocClient(pdf, textes, largeur) {
  const out = [];
  for (const t of textes) {
    const souligne = EST_CODE_POSTAL.test(t);
    let cur = '';
    for (const m of String(t).trim().split(/\s+/)) {
      const essai = cur ? `${cur} ${m}` : m;
      if (cur && pdf.largeur(essai, 'B', 11) > largeur) { out.push({ t: cur, souligne }); cur = m; } else cur = essai;
    }
    if (cur) out.push({ t: cur, souligne });
  }
  return out;
}

function envelopper(pdf, segments, largeurMax, taille) {
  const mots = [];
  for (const s of segments) for (const w of s.t.split(' ').filter(Boolean)) mots.push({ t: w, police: s.police || 'R' });
  const sp = pdf.largeur(' ', 'R', taille);
  const lignes = [];
  let cur = [];
  let w = 0;
  for (const m of mots) {
    const mw = pdf.largeur(m.t, m.police, taille);
    if (cur.length && w + sp + mw > largeurMax) { lignes.push(cur); cur = []; w = 0; }
    w += (cur.length ? sp : 0) + mw;
    cur.push(m);
  }
  if (cur.length) lignes.push(cur);
  return lignes;
}

function ecrireLigne(pdf, x, y, mots, taille) {
  const blocs = [];
  for (const m of mots) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && dernier.police === m.police) dernier.t += ` ${m.t}`;
    else blocs.push({ t: m.t, police: m.police });
  }
  let cx = x;
  blocs.forEach((b, i) => {
    const t = i < blocs.length - 1 ? `${b.t} ` : b.t;
    cx += pdf.texte(cx, y, t, { police: b.police, taille });
  });
}

function blocBanque(pdf, x, y0, pas) {
  pdf.texte(x, y0, 'Nos coordonnées bancaires:', { souligne: true });
  let y = y0;
  for (const [mot, suite, valeur] of BANQUE) {
    y += pas;
    const w = pdf.texte(x, y, mot, { souligne: true });
    const w2 = pdf.texte(x + w, y, `${suite} : `);
    pdf.texte(x + w + w2, y, valeur, { police: 'B' });
  }
  return y;
}

function repartir(n, capFinale, capIntermediaire) {
  const pages = [];
  let i = 0;
  for (;;) {
    const p = pages.length;
    if (n - i <= Math.max(0, capFinale(p))) { pages.push([i, n]); return pages; }
    const fin = Math.min(n, i + Math.max(1, capIntermediaire(p)));
    pages.push([i, fin]);
    i = fin;
  }
}

const FA = {
  boxX: 171.0, boxW: 332.9, boxY: 94.0, boxH: 17.3,
  xG: 52.5, xD: 503.9, vG: 53.4, vDiv: 384.1, vD: 503.0, ep: 1.5,
  pas: 15, maxFinal: 810, maxMilieu: 800, topSuite: 90,
  decalageNoms: (k) => 266.8 + 15 * k,
};

export function genererFacture(d) {
  const sig = SIGNATAIRES[d.signataire] || SIGNATAIRES.comptable;
  const date = d.date || new Date();
  const titre = `FACTURE N° ${d.numero} / ${date.getFullYear()} / ${DIRECTEUR.initiales}-${sig.ref}`;
  const c5 = cinqChiffres(d.client.compte);

  const lignes = d.lignes.map((l) => ({ ...l, ttc: l.deb, ht: Math.round(l.deb / TVA_DIVISEUR) }));
  const totalTTC = lignes.reduce((a, l) => a + l.ttc, 0);
  const totalHT = lignes.reduce((a, l) => a + l.ht, 0);
  const tva = totalTTC - totalHT;

  const pdf = new Pdf();
  const bloc = blocClient(pdf, [d.client.nom, ...(d.client.adresse || [])], 300);
  const yCompte = Math.max(228.2, 138 + 15 * (bloc.length - 1) + 30.2);
  const topP1 = yCompte + 18.1;
  const y0P1 = topP1 + 2 * FA.pas;
  const y0Suite = FA.topSuite + FA.pas;

  const phrase = envelopper(pdf, [
    { t: 'Arrêté la présente à la somme de :' },
    { t: `${montantEnLettres(totalTTC)}.`, police: 'B' },
  ], 449, 10);
  const k = phrase.length;
  const decalageNoms = FA.decalageNoms(k);

  const y0 = (p) => (p === 0 ? y0P1 : y0Suite);
  const pages = repartir(
    lignes.length,
    (p) => Math.floor((FA.maxFinal - decalageNoms - 4 * FA.pas - y0(p)) / 30),
    (p) => Math.floor((FA.maxMilieu - FA.pas - y0(p)) / 30),
  );

  let cumulHT = 0;
  pages.forEach(([deb, fin], p) => {
    const derniere = p === pages.length - 1;
    pdf.addPage();
    let top;
    let y;

    if (p === 0) {
      pdf.rect(FA.boxX, FA.boxY, FA.boxW, FA.boxH, FA.ep);
      pdf.texte(FA.boxX + FA.boxW / 2, 107.3, titre, { taille: 14, align: 'center' });
      pdf.texte(232.2, 138, 'DOIT :', { police: 'B', taille: 11, souligne: true });
      bloc.forEach((b, i) => pdf.texte(278.9, 138 + 15 * i, b.t, { police: 'B', taille: 11, souligne: b.souligne }));
      pdf.texte(54.4, yCompte, `Compte Client n° ${c5} / ${d.agence}`, { police: 'B', souligne: true });
      pdf.texte(54.4, yCompte + 15,
        lignes.length > 1 ? "Les primes relatives aux polices d'assurance ci - après :" : "La prime relative à la police d'assurance ci - après :",
        { police: 'B' });
      top = topP1;
      pdf.texte((FA.vG + FA.vDiv) / 2, top + 11.9, 'L  I  B  E  L  L  E', { police: 'B', align: 'center' });
      pdf.texte((FA.vDiv + FA.vD) / 2, top + 11.9, 'MONTANT', { police: 'B', align: 'center' });
      y = y0P1;
    } else {
      top = FA.topSuite;
      pdf.texte((FA.vG + FA.vDiv) / 2, top + 11.9, 'Report :', { police: 'BI', align: 'center' });
      pdf.texte(FA.vD - 0.9, top + 11.9, fmtAr(cumulHT), { police: 'B', align: 'right' });
      y = y0Suite;
    }

    for (let i = deb; i < fin; i++) {
      const l = lignes[i];
      const libelle = `POLICE N° ${l.police} - ${l.designation}`;
      pdf.texte(54.4, y + 11.9, libelle, { police: 'B', souligne: true, taille: ajuster(pdf, libelle, 'B', 10, FA.vDiv - 54.4 - 3) });
      pdf.texte(54.4, y + 26.9,
        `Période  du ${fdate(l.effet)}   au  ${fdate(l.fin)} -  à zéro heure; Quit:${l.quittance && l.quittance !== '-' ? l.quittance : ''}`);
      pdf.texte(FA.vD - 0.9, y + 26.9, fmtAr(l.ht), { align: 'right' });
      cumulHT += l.ht;
      y += 30;
    }

    let bas;
    if (!derniere) {
      pdf.texte((FA.vG + FA.vDiv) / 2, y + 11.9, 'Total à reporter', { police: 'BI', align: 'center' });
      pdf.texte(FA.vD - 0.9, y + 11.9, fmtAr(cumulHT), { police: 'B', align: 'right' });
      bas = y + FA.pas;
    } else {
      y += FA.pas;
      const lib = [['Montant HT', 'R', totalHT], ['TVA 20%', 'R', tva], ['MONTANT TTC', 'B', totalTTC]];
      lib.forEach(([t, f, v], i) => {
        pdf.texte((FA.vG + FA.vDiv) / 2, y + FA.pas * (i + 1) - 3.7, t, { police: f, taille: 11, align: 'center' });
        pdf.texte(FA.vD - 1, y + FA.pas * (i + 1) - 3.7, fmtAr(v), { police: 'B', taille: 11, align: 'right' });
      });
      bas = y + 3 * FA.pas;
    }

    const traits = [top, top + FA.pas];
    if (derniere) traits.push(y, y + FA.pas, y + 2 * FA.pas);
    traits.push(bas);
    if (!derniere) traits.push(y);
    [...new Set(traits.map((t) => Math.round(t * 10) / 10))].forEach((t) => pdf.trait(FA.xG, t, FA.xD, t, FA.ep));
    [FA.vG, FA.vDiv, FA.vD].forEach((x) => pdf.trait(x, top, x, bas, FA.ep));

    if (derniere) {
      phrase.forEach((ln, i) => ecrireLigne(pdf, 54.4, bas + 26.9 + 15 * i, ln, 10));
      const yDate = bas + 26.9 + 15 * k;
      pdf.texte(278.9, yDate, `${VILLE} , le ${dateEnLettres(date)}`);
      const yBanque = blocBanque(pdf, 37.0, yDate + 29.5, 15);
      pdf.texte(53.6, yBanque + 45.5, sig.role);
      pdf.texte(385.1, yBanque + 45.5, DIRECTEUR.role);
      pdf.texte(53.6, yBanque + 120.4, sig.nom);
      pdf.texte(385.1, yBanque + 120.4, DIRECTEUR.nom);
    }
  });

  return pdf.construire();
}

const RE = {
  boxX: 334.8, boxW: 227.8, boxY: 100.7, boxH: 17.0,
  pas: 14.7, ep: 0.75, maxFinal: 810, maxMilieu: 800, topSuite: 80,
  decalageNoms: (k) => 320.2 + 14.7 * (k - 1),
};

export function genererReleve(d) {
  const sig = SIGNATAIRES[d.signataire] || SIGNATAIRES.comptable;
  const date = d.date || new Date();
  const titre = `RELEVE N° ${d.numero} / ${date.getFullYear()} / ${DIRECTEUR.initiales}/${sig.ref}`;
  const c5 = cinqChiffres(d.client.compte);

  const lignes = d.lignes;
  const totalD = lignes.reduce((a, l) => a + l.deb, 0);
  const totalC = lignes.reduce((a, l) => a + l.cre, 0);
  const solde = totalD - totalC;

  const pdf = new Pdf();
  const OW = 105;
  const largeurMax = Math.max(
    ...lignes.flatMap((l) => [l.deb, l.cre]).map((v) => pdf.largeur(fmtAr(v), 'R', 10)),
    pdf.largeur(fmtAr(totalD), 'R', 10),
    pdf.largeur(fmtAr(totalC), 'R', 10),
    pdf.largeur(fmtAr(Math.abs(solde)), 'B', 10),
  );
  const W = Math.max(57.5, Math.ceil(largeurMax + 6));
  const cols = [25.4, 56.5, 103.9, 145.8, 561.7 - OW - 2 * W, 561.7 - OW - W, 561.7 - OW, 561.7];
  const [c0, c1, c2, c3, c4, c5x, c6, c7] = cols;
  const xDebit = c5x - 0.9;
  const xCredit = c6 - 0.9;

  const bloc = [{ t: 'RELEVE DE COMPTE DE PRIME', souligne: false },
    ...blocClient(pdf, [d.client.nom, ...(d.client.adresse || [])], 235)];
  const yMess = 143.9 + RE.pas * (bloc.length - 1) + 29.4;
  const topP1 = yMess + 44.1 + 18.0;

  const phrase = envelopper(pdf, [
    { t: 'Arrêté le présent relevé à la somme de :' },
    { t: `${montantEnLettres(solde)}${solde < 0 ? ' (en votre faveur)' : ''}.`, police: 'BI' },
  ], 503, 10);
  const k = phrase.length;
  const decalageNoms = RE.decalageNoms(k);

  const PE = 2 * RE.pas;
  const y0P1 = topP1 + RE.pas;
  const y0Suite = RE.topSuite + 2 * RE.pas;
  const y0 = (p) => (p === 0 ? y0P1 : y0Suite);
  const pages = repartir(
    lignes.length,
    (p) => Math.floor((RE.maxFinal - decalageNoms - 4 * RE.pas - y0(p)) / PE),
    (p) => Math.floor((RE.maxMilieu - RE.pas - y0(p)) / PE),
  );

  let cumD = 0;
  let cumC = 0;
  pages.forEach(([deb, fin], p) => {
    const derniere = p === pages.length - 1;
    pdf.addPage();
    let top;
    let y;

    if (p === 0) {
      pdf.texte(336.7, 83.0, `${VILLE} , le  ${dateEnLettres(date)}`);
      pdf.rect(RE.boxX, RE.boxY, RE.boxW, RE.boxH, 1.5);
      pdf.texte(RE.boxX + RE.boxW / 2, 114.0, titre, { taille: 14, align: 'center' });
      bloc.forEach((b, i) => pdf.texte(336.7, 143.9 + RE.pas * i, b.t, { police: 'B', taille: 11, souligne: b.souligne }));
      pdf.texte(146.8, yMess, 'Messieurs,', { taille: 11 });
      pdf.texte(146.8, yMess + 29.4, 'Nous vous prions de bien vouloir trouver ci-dessous le détail des primes', { taille: 11 });
      pdf.texte(146.8, yMess + 44.1, "d'assurances dont vous restez redevable à notre société à ce jour.", { taille: 11 });
      top = topP1;
      y = y0P1;
    } else {
      top = RE.topSuite;
      y = y0Suite;
    }

    const bh = top + 11.6;
    pdf.texte((c0 + c1) / 2, bh, 'N° Cte', { align: 'center' });
    pdf.texte((c1 + c2) / 2, bh, 'N° Police', { align: 'center' });
    pdf.texte((c2 + c3) / 2, bh, 'Quit', { align: 'center' });
    pdf.texte((c3 + c4) / 2, bh, 'L  I  B  E  L  L  E', { align: 'center' });
    pdf.texte((c4 + c5x) / 2, bh, 'Débit', { align: 'center' });
    pdf.texte((c5x + c6) / 2, bh, 'Crédit', { align: 'center' });
    pdf.texte((c6 + c7) / 2, bh, 'Observations', { align: 'center' });
    if (p > 0) {
      const yr = top + RE.pas + 11.6;
      pdf.texte((c3 + c4) / 2, yr, 'Report :', { police: 'BI', align: 'center' });
      pdf.texte(xDebit, yr, fmtAr(cumD), { align: 'right' });
      pdf.texte(xCredit, yr, fmtAr(cumC), { align: 'right' });
    }

    for (let i = deb; i < fin; i++) {
      const l = lignes[i];
      const yD = y + 13.1;
      const yP = yD + RE.pas;
      const dsg = assurance(l.designation);
      const libre = c4 - c3 - 3;
      pdf.texte(c3 + 1.0, yD, dsg, { police: 'B', souligne: true, taille: ajuster(pdf, dsg, 'B', 10, libre) });
      const periode = [
        { t: `Période du ${fdate(l.effet)} au ${fdate(l.fin)}`, police: 'I' },
        ...(l.mention ? [{ t: ' ' }, { t: `(${l.mention})`, police: 'BI' }] : []),
      ];
      const wPer = periode.reduce((a, m) => a + pdf.largeur(m.t, m.police || 'R', 10), 0);
      pdf.riche(c3 + 1.0, yP, periode, { taille: wPer > libre ? Math.max(6.5, (10 * libre) / wPer) : 10 });
      pdf.texte((c0 + c1) / 2, yP, c5, { align: 'center' });
      pdf.texte((c1 + c2) / 2, yP, l.police, { align: 'center', taille: ajuster(pdf, l.police, 'R', 10, c2 - c1 - 2) });
      const q = l.quittance && l.quittance !== '-' ? l.quittance : '';
      const morceaux = decouper(pdf, q, c3 - c2 - 2, 10);
      morceaux.forEach((m, j) => pdf.texte((c2 + c3) / 2, yP - 10.5 * (morceaux.length - 1 - j), m, { align: 'center' }));
      if (l.deb) pdf.texte(xDebit, yP, fmtAr(l.deb), { align: 'right' });
      if (l.cre) pdf.texte(xCredit, yP, fmtAr(l.cre), { align: 'right' });
      if (l.cre && l.observation) {
        const maxW = c7 - c6 - 4;
        const manuel = String(l.observation).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        let tx = 8;
        let lg = manuel.flatMap((x) => couperMots(pdf, x, maxW, tx, 'B'));
        while (lg.length > 3 && tx > 6) { tx -= 0.5; lg = manuel.flatMap((x) => couperMots(pdf, x, maxW, tx, 'B')); }
        const pasObs = tx + 1.5;
        lg.forEach((m, j) => pdf.texte((c6 + c7) / 2, yP - pasObs * (lg.length - 1 - j), m, { police: 'B', taille: tx, align: 'center' }));
      }
      cumD += l.deb;
      cumC += l.cre;
      y += PE;
    }

    let bas;
    if (!derniere) {
      const yt = y + 11.6;
      pdf.texte((c3 + c4) / 2, yt, 'Total à reporter', { police: 'BI', align: 'center' });
      pdf.texte(xDebit, yt, fmtAr(cumD), { align: 'right' });
      pdf.texte(xCredit, yt, fmtAr(cumC), { align: 'right' });
      bas = y + RE.pas;
      pdf.trait(c4, y, c7, y, RE.ep);
    } else {
      y += RE.pas;
      pdf.trait(c4 - 0.4, y, c7 + 0.4, y, RE.ep);
      const yt = y + RE.pas - 3.2;
      pdf.texte((c3 + c4) / 2, yt, 'TOTAL', { police: 'B', align: 'center' });
      pdf.texte(xDebit, yt, fmtAr(totalD), { align: 'right' });
      pdf.texte(xCredit, yt, fmtAr(totalC), { align: 'right' });
      const ys = yt + RE.pas;
      const libSolde = `VOTRE SOLDE ${solde < 0 ? 'CREDITEUR' : 'DEBITEUR'} S.E.O ....`;
      pdf.texte((c3 + c4) / 2, ys, libSolde, { police: 'B', align: 'center', taille: ajuster(pdf, libSolde, 'B', 10, c4 - c3 - 8) });
      pdf.texte(solde < 0 ? xDebit : xCredit, ys, fmtAr(Math.abs(solde)), { police: 'B', align: 'right' });
      const yq = ys + RE.pas;
      pdf.trait(c4 - 0.4, yq - RE.pas + 3.2, c7 + 0.4, yq - RE.pas + 3.2, RE.ep);
      const egal = Math.max(totalD, totalC);
      pdf.texte(xDebit, yq, fmtAr(egal), { align: 'right' });
      pdf.texte(xCredit, yq, fmtAr(egal), { align: 'right' });
      bas = y + 3 * RE.pas;
    }

    [top, top + RE.pas, bas].forEach((t) => pdf.trait(c0 - 0.3, t, c7 + 0.4, t, RE.ep));
    cols.forEach((x) => pdf.trait(x, top, x, bas, RE.ep));

    if (derniere) {
      phrase.forEach((ln, i) => ecrireLigne(pdf, 57.5, bas + 25.9 + RE.pas * i, ln, 10));
      const yA = bas + 25.9 + RE.pas * (k - 1);
      pdf.texte(57.5, yA + 29.4, "Dans l'attente de votre aimable règlement et avec nos remerciements anticipés.");
      pdf.texte(57.5, yA + 58.8, 'Recevez, Messieurs, nos salutations distinguées.');
      const yBanque = blocBanque(pdf, 26.5, yA + 88.2, RE.pas);
      pdf.texte(42.7, yBanque + 44.5, sig.role);
      pdf.texte(403.9, yBanque + 44.5, DIRECTEUR.role);
      pdf.texte(42.7, yBanque + 117.9, sig.nom);
      pdf.texte(403.9, yBanque + 117.9, DIRECTEUR.nom);
    }
  });

  return pdf.construire();
}

export function ouvrirPdf(octets, nomFichier) {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
