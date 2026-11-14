import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from './config.js';
import { pool, tx, valeur } from './db.js';
import { normNom, ymd, estNumerique, serialExcelVersYmd, sous } from './util.js';
import { detecterAnomalies } from './detection.js';
import { synchroniserInventaire } from './quittances.js';

const BATCH_SIZE = 1000;
const COLONNES = {
  id: 'Id', piece: 'Pieces', compte: 'Comptes Client', nom: 'Nom Client', date: 'Date', journal: 'Journal',
  libelle: 'Libelle', police: 'Police', effet: 'Effet', echeance: 'Echeance', apporteur: 'code_apporteur',
  quittance: 'Quittance', periode: 'Période', debit: 'Débit', credit: 'Crédit',
};
const COLONNES_FACULTATIVES = ['echeance', 'apporteur'];
const LIGNES_ENTETE_MAX = 10;

function analyserEntetes(feuille, ligne) {
  const entetes = [];
  feuille.getRow(ligne).eachCell({ includeEmpty: false }, (cell, col) => { entetes[col] = String(brut(cell.value) ?? '').trim(); });
  const trouves = new Map();
  entetes.forEach((h, col) => {
    const n = normNom(h);
    if (n !== '' && !trouves.has(n)) trouves.set(n, col);
  });
  const ix = {};
  const manquantes = [];
  for (const [cle, nomCol] of Object.entries(COLONNES)) {
    const col = trouves.get(normNom(nomCol));
    if (col) ix[cle] = col;
    else if (!COLONNES_FACULTATIVES.includes(cle)) manquantes.push(nomCol);
  }
  return { feuille, ligne, entetes, ix, manquantes };
}
const COLONNES_IGNOREES = ['Solde/Police', 'Solde'];

function brut(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return brut(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}
const nettoyer = (v) => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? ymd(v) : String(v)).trim();
  return s === '' ? null : s;
};

function parseDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return [null, true];
  if (v instanceof Date) return [ymd(v), true];
  if (estNumerique(v)) return [serialExcelVersYmd(v), true];
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(v).trim());
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (ymd(d) === `${m[3]}-${m[2]}-${m[1]}`) return [ymd(d), true];
  }
  return [null, false];
}

function parseMontant(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '0.00';
  if (!estNumerique(v)) return null;
  const x = Number(v);
  return (Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9) / 100).toFixed(2);
}

const ligneVide = (valeurs) => valeurs.every((c) => c === null || String(c).trim() === '');

export function choisirFeuille(wb) {
  const conformes = [];
  const meilleurEssai = [];
  for (const feuille of wb.worksheets) {
    let essai = null;
    for (let l = 1; l <= Math.min(LIGNES_ENTETE_MAX, feuille.rowCount); l++) {
      const a = analyserEntetes(feuille, l);
      if (!a.entetes.some(Boolean)) continue;
      if (!essai || a.manquantes.length < essai.manquantes.length) essai = a;
      if (!a.manquantes.length) break;
    }
    if (essai && !essai.manquantes.length) conformes.push(essai);
    else meilleurEssai.push(essai ? `« ${feuille.name} » : manque ${essai.manquantes.join(', ')}` : `« ${feuille.name} » : vide`);
  }
  return { conformes, meilleurEssai };
}

export async function runImport({ fichier, user, importId, force = false, log = () => {} }) {
  const echec = async (msg) => {
    try {
      await pool.query(`UPDATE imports SET statut = 'erreur', message = $1 WHERE id = $2`, [sous(msg, 2000), importId]);
    } catch { }
    throw new Error(msg);
  };

  if (!fs.existsSync(fichier)) await echec(`Fichier introuvable : ${fichier}`);

  await pool.query(
    `INSERT INTO imports_suivi (import_id) VALUES ($1)
     ON CONFLICT (import_id) DO UPDATE SET progression = 0, lignes_lues = 0`, [importId]);

  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(fichier); } catch (e) { await echec(`Fichier Excel illisible : ${e.message}`); }
  const { conformes, meilleurEssai } = choisirFeuille(wb);
  if (!conformes.length) {
    await echec(`Aucune feuille ne contient toutes les colonnes obligatoires.\n${meilleurEssai.join('\n')}\n`
      + `Colonnes attendues : ${[...Object.values(COLONNES), ...COLONNES_IGNOREES].join(' | ')}`);
  }
  const { feuille: ws, ligne: ligneEntete, ix } = conformes[0];
  log(`Feuille importee : « ${ws.name} » (en-tetes ligne ${ligneEntete})`);
  if (conformes.length > 1) log(`Autres feuilles conformes ignorees : ${conformes.slice(1).map((c) => `« ${c.feuille.name} »`).join(', ')}`);
  for (const cle of COLONNES_FACULTATIVES) if (!ix[cle]) log(`Colonne facultative absente : ${COLONNES[cle]} (laissee vide)`);

  const totalRows = ws.rowCount;
  const compteurs = { lues: 0, nouvelles: 0, existantes: 0, anomalies: 0, lettrees: 0 };
  const rejets = path.join(config.dossierUploads, 'rejets.txt');

  try {
    await tx(async (db) => {
      let batch = new Map();
      let doublonsLot = 0;

      const flush = async () => {
        if (!batch.size) return;
        const l = [...batch.values()];
        const col = (i) => l.map((r) => r[i]);
        const res = await db.query(
          `INSERT INTO operations
             (id_source, piece, compte_client, nom_client, date_operation, journal, libelle, police, date_effet,
              echeance, code_apporteur, quittance, periode, debit, credit, premier_import_id, dernier_import_id)
           SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::date[], $6::text[], $7::text[],
                                $8::text[], $9::date[], $10::date[], $11::text[], $12::text[], $13::text[],
                                $14::numeric[], $15::numeric[], $16::int[], $17::int[])
           ON CONFLICT (id_source) DO UPDATE SET
             piece = COALESCE(EXCLUDED.piece, operations.piece),
             echeance = COALESCE(EXCLUDED.echeance, operations.echeance),
             code_apporteur = COALESCE(EXCLUDED.code_apporteur, operations.code_apporteur),
             dernier_import_id = EXCLUDED.dernier_import_id,
             statut_ligne = CASE WHEN operations.statut_ligne = 'supprimee' THEN 'supprimee' ELSE 'en_attente' END,
             import_lettrage_id = NULL,
             date_lettrage = NULL
           RETURNING (xmax = 0) AS inserted`,
          Array.from({ length: 17 }, (_, i) => col(i)));
        const ins = res.rows.filter((r) => r.inserted).length;
        compteurs.nouvelles += ins;
        compteurs.existantes += l.length - ins + doublonsLot;
        batch = new Map();
        doublonsLot = 0;
      };

      for (let n = ligneEntete + 1; n <= totalRows; n++) {
        const row = ws.getRow(n);
        if (!row.hasValues) continue;
        const v = (cle) => (ix[cle] ? brut(row.getCell(ix[cle]).value) : null);
        const toutes = Object.keys(ix).map((c) => v(c));
        if (ligneVide(toutes)) continue;
        if (v('id') === null && nettoyer(v('piece')) === null && nettoyer(v('compte')) === null) continue;
        compteurs.lues++;

        let raison = null;
        const idSource = v('id');
        const [dateOp, okDate] = parseDate(v('date'));
        const [dateEff, okEffet] = parseDate(v('effet'));
        const [dateEch, okEch] = parseDate(v('echeance'));
        const debit = parseMontant(v('debit'));
        const credit = parseMontant(v('credit'));

        if (idSource === null || !/^\d+$/.test(String(idSource).trim())) raison = 'Id manquant ou invalide';
        else if (!okDate || !okEffet || !okEch) raison = 'Date invalide';
        else if (debit === null || credit === null) raison = 'Montant invalide';

        if (raison !== null) {
          compteurs.anomalies++;
          fs.appendFileSync(rejets, `Import #${importId}, ligne ${n} : ${raison} | ${JSON.stringify(toutes)}\n`);
          continue;
        }

        const id = Number(String(idSource).trim());
        const ligne = [
          id, nettoyer(v('piece')), nettoyer(v('compte')) ?? '', nettoyer(v('nom')), dateOp, nettoyer(v('journal')),
          nettoyer(v('libelle')), nettoyer(v('police')), dateEff, dateEch, nettoyer(v('apporteur')),
          nettoyer(v('quittance')), nettoyer(v('periode')), debit, credit, importId, importId,
        ];
        if (batch.has(id)) {
          const prem = batch.get(id);
          for (const k of [1, 9, 10]) prem[k] = ligne[k] ?? prem[k];
          doublonsLot++;
        } else {
          batch.set(id, ligne);
        }
        if (batch.size >= BATCH_SIZE) await flush();

        if (n % 5000 === 0) {
          log(`  ... ligne ${n} / ${totalRows}`);
          await pool.query('UPDATE imports_suivi SET progression = $1, lignes_lues = $2, maj = now() WHERE import_id = $3',
            [Math.min(90, Math.round((90 * n) / totalRows)), compteurs.lues, importId]);
        }
      }
      await flush();

      const absentes = await valeur(db,
        `SELECT COUNT(*) FROM operations WHERE statut_ligne = 'en_attente' AND dernier_import_id < $1`, [importId]);
      const anciennes = await valeur(db,
        `SELECT COUNT(*) FROM operations WHERE statut_ligne = 'en_attente' AND premier_import_id < $1`, [importId]);
      if (!force && anciennes > 0 && absentes / anciennes > 0.5) {
        throw new Error(`${absentes} lignes sur ${anciennes} (plus de 50 %) ne sont pas dans ce fichier : `
          + `il est probablement incomplet. Verifie le fichier, ou coche « Forcer ».`);
      }
      const upd = await db.query(
        `UPDATE operations SET statut_ligne = 'lettree', import_lettrage_id = $1, date_lettrage = now()
          WHERE statut_ligne = 'en_attente' AND dernier_import_id < $1`, [importId]);
      compteurs.lettrees = upd.rowCount;

      await db.query(
        `UPDATE imports SET lignes_lues = $1, lignes_nouvelles = $2, lignes_existantes = $3,
                            lignes_anomalies = $4, lignes_lettrees = $5 WHERE id = $6`,
        [compteurs.lues, compteurs.nouvelles, compteurs.existantes, compteurs.anomalies, compteurs.lettrees, importId]);
    });
  } catch (e) {
    await echec(`Import annule : ${e.message}`);
  }

  log(`\n=== Import #${importId} termine ===`);
  log(`Lignes lues : ${compteurs.lues} | nouvelles : ${compteurs.nouvelles} | deja en base : ${compteurs.existantes}`
    + ` | rejetees : ${compteurs.anomalies} | lettrees : ${compteurs.lettrees}`);

  let parType = {}, avert = null, inv = null, avertInv = null;
  try { parType = await detecterAnomalies(pool); } catch (e) { avert = e.message; }
  try {
    inv = await synchroniserInventaire(pool, importId);
    log(`Inventaire : ${inv.lues} quittances (${inv.nouvelles} nouvelles, ${inv.mises_a_jour} mises a jour, ${inv.retirees} retirees)`);
  } catch (e) {
    avertInv = `Inventaire des quittances non mis a jour : ${e.message}`;
  }

  await pool.query(`UPDATE imports SET statut = 'termine', message = $1 WHERE id = $2`, [
    JSON.stringify({ feuille: ws.name, anomalies: parType, avertissement: avert, avertissement_inventaire: avertInv, inventaire: inv }),
    importId,
  ]);
  await pool.query('UPDATE imports_suivi SET progression = 100, maj = now() WHERE import_id = $1', [importId]);
  try { fs.unlinkSync(fichier); } catch { }
  return compteurs;
}
