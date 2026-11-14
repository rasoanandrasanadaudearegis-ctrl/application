import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { config } from './config.js';
import { rows, lignesTab, valeur, tx } from './db.js';
import { parseYmd, valeurModele, aujourdhui } from './util.js';

export const gdSeuil = () => config.seuilGrosDebiteur.toFixed(2);

export async function gdSynchroniser() {
  return tx(async (db) => {
    const courants = await lignesTab(db,
      `SELECT compte_client, MAX(nom_client), SUM(debit) - SUM(credit)
         FROM operations WHERE statut_ligne = 'en_attente' AND compte_client <> ''
        GROUP BY compte_client HAVING SUM(debit) - SUM(credit) >= $1`, [gdSeuil()]);
    const dernierImport = await valeur(db, `SELECT MAX(id) FROM imports WHERE statut = 'termine'`);
    const marque = crypto.randomBytes(8).toString('hex');

    for (let i = 0; i < courants.length; i += 1000) {
      const lot = courants.slice(i, i + 1000);
      await db.query(
        `INSERT INTO gd_comptes (compte, nom, solde, statut, marque)
         SELECT c, n, s, 'en_attente', $4 FROM unnest($1::text[], $2::text[], $3::numeric[]) AS t(c, n, s)
         ON CONFLICT (compte) DO UPDATE SET
           date_detection = CASE WHEN gd_comptes.statut = 'lettree' THEN now() ELSE gd_comptes.date_detection END,
           nom = EXCLUDED.nom, solde = EXCLUDED.solde, marque = EXCLUDED.marque,
           statut = 'en_attente', date_lettrage = NULL, import_lettrage_id = NULL`,
        [lot.map((r) => String(r[0])), lot.map((r) => r[1]), lot.map((r) => r[2]), marque]);
    }
    const r = await db.query(
      `UPDATE gd_comptes SET statut = 'lettree', date_lettrage = now(), import_lettrage_id = $1
        WHERE statut = 'en_attente' AND (marque IS NULL OR marque <> $2)`, [dernierImport, marque]);
    return { gros: courants.length, lettres: r.rowCount };
  });
}

export async function gdLignes(db) {
  return rows(db,
    `SELECT o.compte_client AS compte, g.nom AS assure, TRIM(COALESCE(o.police, '')) AS police,
            o.date_effet AS e, SUM(o.debit) AS prime, SUM(o.credit) AS acompte, ob.observation AS obs
       FROM operations o
       JOIN (SELECT compte_client, MAX(TRIM(nom_client)) AS nom FROM operations
              WHERE statut_ligne = 'en_attente' AND compte_client <> ''
              GROUP BY compte_client HAVING SUM(debit) - SUM(credit) >= $1) g ON g.compte_client = o.compte_client
       LEFT JOIN gd_observations ob ON ob.compte = o.compte_client
      WHERE o.statut_ligne = 'en_attente'
      GROUP BY o.compte_client, g.nom, TRIM(COALESCE(o.police, '')), o.date_effet, ob.observation
     HAVING SUM(o.debit) - SUM(o.credit) <> 0
      ORDER BY o.compte_client, o.date_effet, 3`, [gdSeuil()]);
}

export async function gdComptesLettres(db) {
  return rows(db,
    `SELECT c.compte, COALESCE(c.nom, '') AS assure, c.solde AS solde_gros, c.date_lettrage AS dl,
            COALESCE(v.solde, 0) AS solde_actuel, ob.observation AS obs
       FROM gd_comptes c
       LEFT JOIN v_soldes_comptes v ON v.compte_client = c.compte
       LEFT JOIN gd_observations ob ON ob.compte = c.compte
      WHERE c.statut = 'lettree'
      ORDER BY c.date_lettrage DESC, c.compte`);
}

const FORMAT_MONTANT = '_-* #,##0.00\\ _€_-;\\-* #,##0.00\\ _€_-;_-* "-"??\\ _€_-;_-@_-';
const fin = { style: 'thin' };
const bordures = { top: fin, left: fin, bottom: fin, right: fin };
const fondGris = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

function ligneVide(ws, r) {
  for (const c of 'ABCDEFGH') {
    const cell = ws.getCell(`${c}${r}`);
    cell.border = bordures;
    cell.font = { name: 'Arial', size: 10 };
  }
  for (const c of 'EFG') ws.getCell(`${c}${r}`).numFmt = FORMAT_MONTANT;
  ws.getCell(`G${r}`).fill = fondGris;
  ws.getCell(`G${r}`).value = { formula: `+E${r}-F${r}` };
}

export async function gdExporter(db) {
  const groupes = new Map();
  for (const l of await gdLignes(db)) {
    if (!groupes.has(l.compte)) groupes.set(l.compte, { lignes: [], solde: 0 });
    const g = groupes.get(l.compte);
    g.lignes.push(l);
    g.solde += Number(l.prime) - Number(l.acompte);
  }
  const tries = [...groupes.values()].sort((a, b) => b.solde - a.solde);

  const dateImport = await valeur(db, `SELECT MAX(date_import) FROM imports WHERE statut = 'termine'`);
  const iso = dateImport ? String(dateImport).slice(0, 10) : aujourdhui();
  const [yy, mm, dd] = iso.split('-');
  const dateArrete = `${dd}/${mm}/${yy}`;
  const titre = `LISTE DES GROS DEBITEURS ${config.agence} CE ${dateArrete}`;
  const directeur = (await valeur(db,
    `SELECT nom_affiche FROM utilisateurs WHERE role = 'directeur' AND actif ORDER BY id LIMIT 1`)) ?? '';

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('GROS DEBITEURS');
  Object.entries({ A: 45.1, B: 10.4, C: 11.6, D: 12.1, E: 18.4, F: 17.7, G: 16.4, H: 41.1 })
    .forEach(([c, w]) => { ws.getColumn(c).width = w; });

  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = titre;
  for (const c of 'ABCDEFGH') ws.getCell(`${c}2`).border = bordures;
  ws.getCell('A2').font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF44546A' } };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 25.8;
  ws.getRow(3).height = 12;

  Object.entries({ A: 'A S S U R E S', B: 'COMPTE', C: 'Police', D: 'Effet', E: 'PRIME', F: 'AC./RIST.', G: 'SOLDE', H: 'OBSERVATIONS' })
    .forEach(([c, t]) => {
      const cell = ws.getCell(`${c}4`);
      cell.value = t;
      cell.border = bordures;
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF222B35' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  ws.getRow(4).height = 33;

  let r = 5;
  for (const g of tries) {
    const debut = r;
    for (const l of g.lignes) {
      ws.getCell(`A${r}`).value = l.assure ?? '';
      const b = valeurModele(String(l.compte)); if (b !== null) ws.getCell(`B${r}`).value = b;
      const c = valeurModele(String(l.police)); if (c !== null) ws.getCell(`C${r}`).value = c;
      if (l.e) ws.getCell(`D${r}`).value = parseYmd(l.e);
      ws.getCell(`E${r}`).value = Number(l.prime);
      if (Number(l.acompte) !== 0) ws.getCell(`F${r}`).value = Number(l.acompte);
      ws.getCell(`G${r}`).value = { formula: `+E${r}-F${r}` };
      r++;
    }
    const dernier = r - 1;
    for (let k = debut; k <= dernier; k++) {
      for (const col of 'ABCDEFG') {
        const cell = ws.getCell(`${col}${k}`);
        cell.border = bordures;
        cell.font = { name: 'AB'.includes(col) || 'CD'.includes(col) ? 'Arial1' : 'Arial', size: 10 };
      }
      ws.getCell(`A${k}`).alignment = { horizontal: 'left', vertical: 'middle' };
      for (const col of 'BCD') ws.getCell(`${col}${k}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`B${k}`).numFmt = '00000';
      ws.getCell(`D${k}`).numFmt = 'mm-dd-yy';
      for (const col of 'EFG') {
        const cell = ws.getCell(`${col}${k}`);
        cell.numFmt = FORMAT_MONTANT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      ws.getCell(`G${k}`).fill = fondGris;
    }
    if (dernier > debut) ws.mergeCells(`H${debut}:H${dernier}`);
    const obs = String(g.lignes[0].obs ?? '').trim();
    if (obs) ws.getCell(`H${debut}`).value = obs;
    for (let k = debut; k <= dernier; k++) {
      const cell = ws.getCell(`H${k}`);
      cell.border = bordures;
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    ligneVide(ws, r); r++;
  }
  for (let k = 0; k < 5; k++) { ligneVide(ws, r); r++; }

  const total = r, der = Math.max(5, total - 1);
  ws.getCell(`E${total}`).value = { formula: `SUM(E5:E${der})` };
  ws.getCell(`F${total}`).value = { formula: `SUM(F5:F${der})` };
  ws.getCell(`G${total}`).value = { formula: `+E${total}-F${total}` };
  for (const col of 'ABCDEFGH') {
    const cell = ws.getCell(`${col}${total}`);
    cell.border = bordures;
    cell.font = { name: 'Arial', size: 10, bold: true };
  }
  for (const col of 'EFG') {
    const cell = ws.getCell(`${col}${total}`);
    cell.numFmt = FORMAT_MONTANT;
    cell.alignment = { horizontal: 'right' };
  }
  ws.getCell(`G${total}`).fill = fondGris;

  const sig = total + 6;
  ws.getCell(`A${sig}`).value = 'Le  Responsable des quittances';
  ws.getCell(`G${sig}`).value = "LE DIRECTEUR D'AGENCE";
  if (directeur) ws.getCell(`G${sig + 4}`).value = directeur;
  for (let k = 0; k <= 4; k++) {
    ws.getRow(sig + k).height = 13.8;
    for (const col of 'ABCDEFGH') ws.getCell(`${col}${sig + k}`).font = { name: 'Arial', size: 11 };
  }
  ws.getRow(sig - 3).height = 14.4;
  ws.getCell(`G${sig + 4}`).alignment = { horizontal: 'left' };

  ws.pageSetup = {
    orientation: 'landscape', paperSize: 9, scale: 81, horizontalCentered: true, printArea: `A1:H${sig + 4}`,
    margins: { left: 0.1574, right: 0.1574, top: 0.315, bottom: 0.551, header: 0.197, footer: 0.1574 },
  };
  wb.calcProperties = { fullCalcOnLoad: true };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nom: `LISTE_GROS_DEBITEURS_DRF_ARRETEE_${dd}_${mm}_${yy.slice(2)}.xlsx` };
}
