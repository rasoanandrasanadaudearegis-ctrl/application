import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { config } from './config.js';
import { rows, tx } from './db.js';
import {
  fail, lg, parseYmd, ymd, aujourdhui, estNumerique, serialExcelVersYmd, valeurModele, libelleDate,
} from './util.js';

export const LIGNE_DEBUT = 12;
const FORMAT_ACOMPTE = '#,##0.00_);[Red]-#,##0.00_)';

export const dateArrete = (s) => (parseYmd(s) ? s : aujourdhui());

function moinsMois(arrete, n) {
  const d = parseYmd(arrete);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  const dernierJour = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernierJour));
  return ymd(d);
}
const moinsAnnees = (arrete, n) => moinsMois(arrete, 12 * n);

export function trancheQuittance(effet, arrete) {
  if (effet <= moinsAnnees(arrete, 1)) return 'an';
  if (effet <= moinsMois(arrete, 3)) return 'm3p';
  return 'm3m';
}

const texteOuNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isInteger(v)) v = String(v);
  const s = String(v).replace(/\s+/gu, ' ').trim();
  return s === '' ? null : s;
};

function nombreSaisi(v) {
  if (v === null || v === undefined || v === '') return '0.00';
  if (typeof v === 'number') return v.toFixed(2);
  const s = String(v).replace(/[ \u00A0]/g, '').replace(',', '.').trim();
  return estNumerique(s) ? Number(s).toFixed(2) : null;
}

function dateOuNull(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return ymd(v);
  if (estNumerique(v)) return serialExcelVersYmd(v);
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return parseYmd(s) ? s : null;
  if ((m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(s))) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    return parseYmd(iso) ? iso : null;
  }
  return null;
}

export function cleQuittance(q, n = 1) {
  const base = `${q.quittance ?? ''}|${q.police ?? ''}|${q.date_effet}|${q.echeance ?? ''}|${q.assure}`.toUpperCase();
  return crypto.createHash('sha1').update(`${base}#${n}`, 'utf8').digest('hex');
}

function filtreQuittances(arrete, recherche, debut) {
  let where = `NOT masquee AND date_effet <= $${debut}`;
  const p = [arrete];
  recherche = String(recherche ?? '').trim();
  if (recherche !== '') {
    where += ` AND concat_ws(' ', numero_assure, assure, apporteur, police, quittance, observations, actions) ILIKE $${debut + 1}`;
    p.push('%' + recherche.replace(/[\\%_]/g, '\\$&') + '%');
  }
  return [where, p];
}

const mapLigne = (r, arrete) => ({
  id: Number(r.id), na: r.numero_assure, assure: r.assure, ap: r.apporteur, police: r.police, quit: r.quittance,
  effet: r.date_effet, ech: r.echeance, prime: Number(r.prime), acompte: Number(r.acompte),
  tranche: trancheQuittance(r.date_effet, arrete), obs: r.observations, act: r.actions,
});
const COLS = 'id, numero_assure, assure, apporteur, police, quittance, date_effet, echeance, prime, acompte, observations, actions';
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

export async function lireQuittances(db, arrete) {
  const [where, p] = filtreQuittances(arrete, '', 1);
  const lignes = (await rows(db, `SELECT ${COLS} FROM quittances WHERE ${where} ORDER BY id`, p)).map((r) => mapLigne(r, arrete));
  return lignes;
}

export async function pageQuittances(db, arrete, recherche, page, parPage) {
  parPage = Math.max(5, Math.min(1000, parPage || 200));
  page = Math.max(1, page || 1);
  const [where, p] = filtreQuittances(arrete, recherche, 3);

  const tot = { an: { prime: 0, acompte: 0 }, m3p: { prime: 0, acompte: 0 }, m3m: { prime: 0, acompte: 0 } };
  let total = 0;
  for (const r of await rows(db,
    `SELECT CASE WHEN date_effet <= $1 THEN 'an' WHEN date_effet <= $2 THEN 'm3p' ELSE 'm3m' END AS t,
            COUNT(*) AS n, SUM(prime) AS prime, SUM(acompte) AS acompte
       FROM quittances WHERE ${where} GROUP BY 1`,
    [moinsAnnees(arrete, 1), moinsMois(arrete, 3), ...p])) {
    tot[r.t] = { prime: r2(r.prime), acompte: r2(r.acompte) };
    total += r.n;
  }

  const [where1, p1] = filtreQuittances(arrete, recherche, 1);
  const pages = Math.max(1, Math.ceil(total / parPage));
  page = Math.min(page, pages);
  const lignes = (await rows(db,
    `SELECT ${COLS} FROM quittances WHERE ${where1} ORDER BY id LIMIT ${parPage} OFFSET ${(page - 1) * parPage}`, p1))
    .map((r) => mapLigne(r, arrete));
  return { arrete, lignes, totaux: tot, total, page, pages, par_page: parPage };
}

export async function enregistrerQuittance(db, d, id, user) {
  const q = {
    numero_assure: texteOuNull(d.numero_assure), assure: texteOuNull(d.assure), apporteur: texteOuNull(d.apporteur),
    police: texteOuNull(d.police), quittance: texteOuNull(d.quittance), date_effet: dateOuNull(d.date_effet),
    echeance: dateOuNull(d.echeance), prime: nombreSaisi(d.prime), acompte: nombreSaisi(d.acompte),
    observations: texteOuNull(d.observations), actions: texteOuNull(d.actions),
  };
  if (q.assure === null) fail(400, "Le nom de l'assuré est obligatoire");
  if (q.date_effet === null) fail(400, "La date d'effet est obligatoire (JJ/MM/AAAA)");
  if (d.echeance && q.echeance === null) fail(400, "Date d'échéance invalide");
  if (q.prime === null || q.acompte === null) fail(400, 'Montant invalide (prime ou acompte)');
  for (const [c, max] of Object.entries({ numero_assure: 20, apporteur: 30, police: 40, quittance: 30, assure: 255 })) {
    if (q[c] !== null && lg(q[c]) > max) fail(400, `« ${c} » est trop long (max. ${max} caractères)`);
  }
  q.cle = cleQuittance(q);
  if (id !== null) {
    const origine = await rows(db, 'SELECT cree_par FROM quittances WHERE id = $1', [id]);
    if (origine[0]?.cree_par?.startsWith('RCC import #')) delete q.cle;
  }
  try {
    if (id === null) {
      q.cree_par = user;
      const cols = Object.keys(q);
      const r = await db.query(
        `INSERT INTO quittances (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
        Object.values(q));
      return r.rows[0].id;
    }
    const cols = Object.keys(q);
    const r = await db.query(
      `UPDATE quittances SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(',')}, date_modif = now()
        WHERE id = $${cols.length + 1}`, [...Object.values(q), id]);
    if (!r.rowCount) fail(400, 'Quittance introuvable (déjà supprimée ?)');
    return id;
  } catch (e) {
    if (e.code === '23505') fail(400, 'Cette quittance existe déjà (même quittance, police, effet, échéance et assuré)');
    throw e;
  }
}

export async function supprimerQuittance(db, id) {
  const masquee = await db.query(
    `UPDATE quittances SET masquee = true, date_modif = now()
      WHERE id = $1 AND cree_par LIKE 'RCC import #%' AND NOT masquee`, [id]);
  if (masquee.rowCount) return;
  const r = await db.query('DELETE FROM quittances WHERE id = $1 AND NOT masquee', [id]);
  if (!r.rowCount) fail(404, 'Quittance introuvable (déjà supprimée ?)');
}

export async function synchroniserInventaire(dbOuPool, importId) {
  const auteur = `RCC import #${importId}`;
  const res = { lues: 0, nouvelles: 0, mises_a_jour: 0, retirees: 0 };

  const source = await rows(dbOuPool,
    `SELECT compte_client, MAX(nom_client) AS nom, MAX(code_apporteur) AS apporteur, police, quittance,
            COALESCE(date_effet, MIN(date_operation)) AS effet, echeance,
            SUM(debit) AS prime, -SUM(credit) AS acompte
       FROM operations
      WHERE statut_ligne = 'en_attente' AND compte_client <> '' AND quittance IS NOT NULL AND quittance <> ''
      GROUP BY compte_client, police, quittance, date_effet, echeance
      ORDER BY compte_client, date_effet, quittance`);

  const lignes = [];
  const vus = new Map();
  for (const r of source) {
    if (r.effet === null) continue;
    const q = {
      assure: texteOuNull(r.nom) ?? r.compte_client, police: texteOuNull(r.police), quittance: texteOuNull(r.quittance),
      date_effet: r.effet, echeance: r.echeance,
    };
    const base = cleQuittance(q, 0);
    vus.set(base, (vus.get(base) ?? 0) + 1);
    lignes.push({ ...q, cle: cleQuittance(q, vus.get(base)), numero_assure: texteOuNull(r.compte_client),
      apporteur: texteOuNull(r.apporteur), prime: r.prime, acompte: r.acompte });
  }

  await tx(async (db) => {
    for (let i = 0; i < lignes.length; i += 1000) {
      const lot = lignes.slice(i, i + 1000);
      const col = (k) => lot.map((l) => l[k]);
      const r = await db.query(
        `INSERT INTO quittances (cle, numero_assure, assure, apporteur, police, quittance, date_effet, echeance,
                                 prime, acompte, cree_par)
         SELECT cle, na, assure, ap, police, quit, effet, ech, prime, acompte, $11
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::date[],
                       $8::date[], $9::numeric[], $10::numeric[])
                AS t(cle, na, assure, ap, police, quit, effet, ech, prime, acompte)
         ON CONFLICT (cle) DO UPDATE SET numero_assure = EXCLUDED.numero_assure, apporteur = EXCLUDED.apporteur,
                                         prime = EXCLUDED.prime, acompte = EXCLUDED.acompte
          WHERE (quittances.numero_assure, quittances.apporteur, quittances.prime, quittances.acompte)
                IS DISTINCT FROM (EXCLUDED.numero_assure, EXCLUDED.apporteur, EXCLUDED.prime, EXCLUDED.acompte)
         RETURNING (xmax = 0) AS inserted`,
        [col('cle'), col('numero_assure'), col('assure'), col('apporteur'), col('police'), col('quittance'),
          col('date_effet'), col('echeance'), col('prime'), col('acompte'), auteur]);
      for (const x of r.rows) x.inserted ? res.nouvelles++ : res.mises_a_jour++;
      res.lues += lot.length;
    }
    const del = await db.query(
      `DELETE FROM quittances WHERE cree_par LIKE 'RCC import #%' AND NOT (cle = ANY($1::text[]))`,
      [lignes.map((l) => l.cle)]);
    res.retirees = del.rowCount;
  });
  return res;
}

const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

export async function construireExportQuittances(lignes, arrete) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(config.modeleInventaire);
  const ws = wb.worksheets[0];
  const COLS16 = 'ABCDEFGHIJKLMNOP'.split('');

  const style = (adr) => clone(ws.getCell(adr).style);
  const stPremiere = COLS16.map((c) => style(`${c}12`));
  const stCourante = COLS16.map((c) => style(`${c}13`));
  for (const st of [stPremiere, stCourante]) {
    st[3].numFmt = 'General';
    for (const i of [8, 10, 12]) st[i].numFmt = FORMAT_ACOMPTE;
  }
  const stTotal = COLS16.map((c) => style(`${c}257`));
  const hauteur = { premiere: ws.getRow(12).height, courante: ws.getRow(13).height, total: ws.getRow(257).height };
  const pied = [260, 263, 268].map((rr) => ({
    dec: rr - 257, h: ws.getRow(rr).height,
    cells: COLS16.map((c) => ({ c, v: ws.getCell(`${c}${rr}`).value, st: style(`${c}${rr}`) }))
      .filter((x) => x.v !== null && x.v !== undefined && x.v !== ''),
  }));

  for (const m of [...(ws.model.merges ?? [])]) {
    const ligne = parseInt(m.replace(/^[A-Z]+/, ''), 10);
    if (ligne >= LIGNE_DEBUT) ws.unMergeCells(m);
  }
  const derniereModele = ws.rowCount;
  if (derniereModele >= LIGNE_DEBUT) ws.spliceRows(LIGNE_DEBUT, derniereModele - LIGNE_DEBUT + 1);
  for (const c of ['F', 'G']) ws.getColumn(c).width = 11;

  const colTranche = { an: [8, 9], m3p: [10, 11], m3m: [12, 13] };
  let r = LIGNE_DEBUT;
  const poser = (row, col, val, st) => {
    const cell = row.getCell(col);
    cell.style = clone(st[col - 1]);
    if (val !== null && val !== undefined) cell.value = val;
  };
  lignes.forEach((l, i) => {
    const st = i === 0 ? stPremiere : stCourante;
    const row = ws.getRow(r);
    row.height = i === 0 ? hauteur.premiere : hauteur.courante;
    poser(row, 1, valeurModele(l.na), st);
    poser(row, 2, l.assure, st);
    poser(row, 3, valeurModele(l.ap), st);
    poser(row, 4, valeurModele(l.police), st);
    poser(row, 5, valeurModele(l.quit), st);
    poser(row, 6, parseYmd(l.effet), st);
    poser(row, 7, l.ech ? parseYmd(l.ech) : null, st);
    for (let k = 8; k <= 13; k++) poser(row, k, null, st);
    const [cp, ca] = colTranche[l.tranche];
    if (l.prime !== 0) row.getCell(cp).value = l.prime;
    if (l.acompte !== 0) row.getCell(ca).value = l.acompte;
    poser(row, 14, { formula: `+H${r}+I${r}+J${r}+K${r}+L${r}+M${r}` }, st);
    poser(row, 15, l.obs, st);
    poser(row, 16, l.act, st);
    r++;
  });
  const derniere = Math.max(r - 1, LIGNE_DEBUT);
  if (lignes.length === 0) {
    const row = ws.getRow(LIGNE_DEBUT);
    COLS16.forEach((_, k) => { row.getCell(k + 1).style = clone(stPremiere[k]); });
    row.getCell(14).value = { formula: '+H12+I12+J12+K12+L12+M12' };
    r = LIGNE_DEBUT + 1;
  }

  const tot = r + 1;
  const rowTot = ws.getRow(tot);
  rowTot.height = hauteur.total;
  COLS16.forEach((c, k) => { rowTot.getCell(k + 1).style = clone(stTotal[k]); });
  for (const c of ['I', 'K', 'M']) rowTot.getCell(c).numFmt = FORMAT_ACOMPTE;
  rowTot.getCell('F').value = 'TOTAUX';
  for (const c of ['H', 'I', 'J', 'K', 'L', 'M']) rowTot.getCell(c).value = { formula: `SUM(${c}${LIGNE_DEBUT}:${c}${derniere})` };
  rowTot.getCell('N').value = { formula: `SUM(H${tot}:M${tot})` };

  for (const p of pied) {
    const row = ws.getRow(tot + p.dec);
    row.height = p.h;
    for (const { c, v, st } of p.cells) { const cell = row.getCell(c); cell.value = v; cell.style = clone(st); }
  }
  ws.pageSetup.printArea = `A5:N${tot + 6}`;
  ws.pageSetup.printTitlesRow = '10:11';
  ws.views = [{ state: 'frozen', ySplit: 11, topLeftCell: 'A12', activeCell: 'A1' }];

  ws.name = ('INV QUITT AU ' + libelleDate(arrete)).slice(0, 31);
  const mois = libelleDate(arrete, false).split(' ').slice(1).join(' ');
  ws.headerFooter.oddHeader = `&LDR FIANARANTSOA&R&8${mois}`;
  const titres = [
    [5, "ETAT D'INVENTAIRE  PHYSIQUE  DES QUITTANCES", 14],
    [6, 'Situation arrêtée au  ' + libelleDate(arrete, false), 12],
    [7, 'Agence 32 - TOLIARA', 12],
  ];
  for (const [rr, txt, taille] of titres) {
    try { ws.unMergeCells(`A${rr}:N${rr}`); } catch { }
    ws.mergeCells(`A${rr}:N${rr}`);
    const cell = ws.getCell(`A${rr}`);
    cell.value = txt;
    cell.font = { name: 'Bookman Old Style', size: taille, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rr).height = taille + 8;
  }

  const rs = wb.getWorksheet('Ristournes');
  if (rs) {
    rs.getCell('H6').value = libelleDate(arrete, false);
    for (let rr = 18; rr <= 25; rr++) for (const c of 'ABCDEFGHIJK'.split('')) rs.getCell(`${c}${rr}`).value = null;
  }

  wb.calcProperties = { fullCalcOnLoad: true };
  wb.views = [{ activeTab: 0 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function nomFichierExport(arrete) {
  const d = parseYmd(arrete);
  const p = (n) => String(n).padStart(2, '0');
  return `INVENTAIRE_PHYSIQUE_QUITTANCES_DRF_ARRETEE_${p(d.getUTCDate())}_${p(d.getUTCMonth() + 1)}_${p(d.getUTCFullYear() % 100)}.xlsx`;
}

