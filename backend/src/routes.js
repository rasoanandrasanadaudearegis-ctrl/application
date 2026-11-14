import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { pool, rows, un, valeur, tx } from './db.js';
import { ApiError, fail, lg, sous } from './util.js';
import {
  exigerConnexion, verifierOrigine, ouvrirSession, utilisateurCourant, utilisateurPublic, viderSession,
  compteToujoursActif, changerMotDePasse,
} from './auth.js';
import {
  TYPES, REGLES_DOUBLONS, detecterAnomalies, partenairesDoublon, partenairesNomProche,
} from './detection.js';
import {
  dateArrete, pageQuittances, lireQuittances, enregistrerQuittance, supprimerQuittance, synchroniserInventaire,
  construireExportQuittances, nomFichierExport,
} from './quittances.js';
import { gdSeuil, gdSynchroniser, gdLignes, gdComptesLettres, gdExporter } from './grosDebiteurs.js';
import { travailEtat, operationsTravail, travailMarquer } from './travail.js';

const ROLES_SUPPRESSION_IMPORT = ['directeur', 'comptable', 'conseiller'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ACTIONS_PUBLIQUES = ['connexion', 'moi', 'deconnexion'];
const q1 = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

fs.mkdirSync(config.dossierUploads, { recursive: true });
const upload = multer({
  dest: config.dossierUploads,
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1 },
});

function lancerImport(fichier, user, id, force) {
  const log = fs.openSync(path.join(config.dossierUploads, `import_${id}.log`), 'a');
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'importWorker.js');
  const enfant = fork(worker, [fichier, user, String(id), force ? '1' : '0'], {
    stdio: ['ignore', log, log, 'ipc'],
    execArgv: ['--max-old-space-size=2048'],
  });
  enfant.on('error', async (e) => {
    await pool.query(`UPDATE imports SET statut = 'erreur', message = $1 WHERE id = $2 AND statut = 'en_cours'`,
      [sous(`Lancement de l'import impossible : ${e.message}`, 2000), id]).catch(() => {});
  });
  enfant.on('exit', async (code) => {
    fs.closeSync(log);
    if (code !== 0) {
      await pool.query(
        `UPDATE imports SET statut = 'erreur', message = COALESCE(message, $1) WHERE id = $2 AND statut = 'en_cours'`,
        [`Import interrompu (code ${code}) : voir uploads/import_${id}.log`, id]).catch(() => {});
    }
  });
}

async function executer(req, res, action, moi) {
  const q = req.query;
  const d = req.body && typeof req.body === 'object' ? req.body : {};

  switch (action) {
    case 'connexion': {
      const ident = String(d.identifiant ?? '').trim();
      const mdp = String(d.mot_de_passe ?? '');
      if (ident === '' || mdp === '') fail(400, 'Indique ton identifiant et ton mot de passe');
      return ouvrirSession(req, ident, mdp);
    }
    case 'moi': {
      let u = await utilisateurCourant(req, res);
      if (u && !(await compteToujoursActif(u.id))) { await viderSession(req, res); u = null; }
      return { utilisateur: u ? utilisateurPublic(u) : null, doit_changer: u ? Boolean(req.session.doit_changer) : false };
    }
    case 'deconnexion':
      await viderSession(req, res);
      return { ok: true };
    case 'changer_mot_de_passe':
      await changerMotDePasse(req, moi, String(d.ancien ?? ''), String(d.nouveau ?? ''));
      return { ok: true };

    case 'soldes': {
      const r = await rows(pool, 'SELECT * FROM v_soldes_comptes');
      return r.map((x) => ({
        ...x, compte_client: String(x.compte_client), nb_operations: Number(x.nb_operations),
        nb_polices: Number(x.nb_polices), ecart_arrondi: Boolean(x.ecart_arrondi),
      }));
    }

    case 'operations': {
      const compte = q1(q.compte);
      if (compte === '') fail(400, 'Parametre compte manquant');
      return rows(pool,
        `SELECT date_operation AS d, piece AS pc, journal AS j, libelle AS l, police AS p, quittance AS q,
                date_effet AS e, echeance AS ec, code_apporteur AS ca, code_apporteur AS ap, debit AS deb, credit AS cre
           FROM operations WHERE compte_client = $1 AND statut_ligne = 'en_attente'
          ORDER BY date_operation, id_source`, [compte]);
    }

    case 'anomalies': {
      const statut = q1(q.statut) || 'a_verifier';
      if (!['a_verifier', 'validee', 'corrigee', 'supprimee'].includes(statut)) fail(400, 'Statut inconnu');
      const filtre = statut === 'a_verifier' ? `AND o.statut_ligne = 'en_attente'` : '';
      return rows(pool,
        `SELECT a.type, o.compte_client, COALESCE(o.nom_client, '') AS nom_client,
                MIN(a.detail) AS detail, COUNT(*) AS nb_lignes,
                SUM(o.debit) AS total_debit, SUM(o.credit) AS total_credit,
                MAX(a.traite_par) AS traite_par, MAX(a.date_traitement) AS date_traitement
           FROM anomalies a JOIN operations o ON o.id = a.operation_id
          WHERE a.statut = $1 ${filtre}
          GROUP BY a.type, o.compte_client, COALESCE(o.nom_client, '')
          ORDER BY a.type, nb_lignes DESC, o.compte_client`, [statut]);
    }

    case 'anomalie_detail': {
      const type = q1(q.type), compte = q1(q.compte), nom = q1(q.nom);
      if (!TYPES.includes(type)) fail(400, 'Type inconnu');
      const sig = await rows(pool,
        `SELECT a.operation_id, a.detail FROM anomalies a JOIN operations o ON o.id = a.operation_id
          WHERE a.type = $1 AND o.compte_client = $2 AND COALESCE(o.nom_client, '') = $3`, [type, compte, nom]);
      const ids = sig.map((r) => Number(r.operation_id));
      const detail = sig[0]?.detail ?? '';

      let partenaires = [];
      if (compte !== '') {
        if (REGLES_DOUBLONS[type]) partenaires = await partenairesDoublon(pool, type, compte, ids);
        else if (type === 'meme_nom_comptes_proches') partenaires = await partenairesNomProche(pool, compte, nom);
      }
      const nbAutres = Math.max(0, partenaires.length - 4);
      partenaires = partenaires.slice(0, 4);

      const comptes = [];
      for (const [i, c] of [compte, ...partenaires].entries()) {
        const info = await un(pool,
          `SELECT MAX(nom_client) AS nom, COUNT(*) AS nb, COALESCE(SUM(debit), 0) AS total_debit,
                  COALESCE(SUM(credit), 0) AS total_credit
             FROM operations WHERE compte_client = $1 AND statut_ligne = 'en_attente'`, [c]);
        const ops = await rows(pool,
          `SELECT o.date_operation AS d, o.piece AS pc, o.libelle AS l, o.nom_client AS n, o.police AS p,
                  o.quittance AS q, o.date_effet AS e, o.echeance AS ec, o.code_apporteur AS ca,
                  o.debit AS deb, o.credit AS cre, (a.id IS NOT NULL) AS sig
             FROM operations o LEFT JOIN anomalies a ON a.operation_id = o.id AND a.type = $1
            WHERE o.compte_client = $2 AND (o.statut_ligne = 'en_attente' OR a.id IS NOT NULL)
            ORDER BY (a.id IS NULL), o.date_operation, o.id_source
            LIMIT 301`, [type, c]);
        const tronque = ops.length > 300;
        if (tronque) ops.pop();
        comptes.push({
          compte: c, nom: i === 0 ? nom : (info.nom ?? ''), principal: i === 0, nb: Number(info.nb),
          total_debit: info.total_debit, total_credit: info.total_credit, tronque,
          operations: ops.map((o) => ({ ...o, sig: Boolean(o.sig) })),
        });
      }
      return {
        type, detail, champs: (REGLES_DOUBLONS[type] ?? []).filter((x) => x !== 'solde_different'),
        nb_autres: nbAutres, comptes,
      };
    }

    case 'traiter': {
      const type = String(d.type ?? ''), compte = String(d.compte ?? ''), nom = String(d.nom ?? '');
      const dec = String(d.decision ?? '');
      const qui = sous(moi.nom, 100);
      if (!TYPES.includes(type)) fail(400, 'Type inconnu');
      if (!['valider', 'supprimer', 'modifier'].includes(dec)) fail(400, 'Decision inconnue');
      let nc = '', nn = '';
      if (dec === 'modifier') {
        nc = String(d.nouveau_compte ?? '').trim();
        nn = String(d.nouveau_nom ?? '').trim();
        if (nc === '' && nn === '') fail(400, 'Indique un nouveau compte ou un nouveau nom');
        if (nc !== '' && lg(nc) !== 10) fail(400, 'Le compte client doit faire 10 caractères');
      }
      return tx(async (c) => {
        const cibles = await rows(c,
          `SELECT a.id AS aid, o.id AS oid FROM anomalies a JOIN operations o ON o.id = a.operation_id
            WHERE a.type = $1 AND a.statut = 'a_verifier' AND o.statut_ligne = 'en_attente'
              AND o.compte_client = $2 AND COALESCE(o.nom_client, '') = $3`, [type, compte, nom]);
        const aids = cibles.map((x) => x.aid), oids = cibles.map((x) => x.oid);
        const statut = { valider: 'validee', supprimer: 'supprimee', modifier: 'corrigee' }[dec];
        if (dec === 'supprimer') {
          await c.query(`UPDATE operations SET statut_ligne = 'supprimee' WHERE id = ANY($1::bigint[])`, [oids]);
        } else if (dec === 'modifier') {
          const sets = [], p = [];
          if (nc !== '') { p.push(nc); sets.push(`compte_client = $${p.length}`); }
          if (nn !== '') { p.push(nn); sets.push(`nom_client = $${p.length}`); }
          p.push(oids);
          await c.query(`UPDATE operations SET ${sets.join(', ')} WHERE id = ANY($${p.length}::bigint[])`, p);
        }
        await c.query(
          `UPDATE anomalies SET statut = $1, date_traitement = now(), traite_par = $2 WHERE id = ANY($3::bigint[])`,
          [statut, qui, aids]);
        if (dec === 'modifier') await detecterAnomalies(c);
        return { ok: true, lignes: cibles.length };
      });
    }

    case 'relancer':
      return { ok: true, compteurs: await detecterAnomalies(pool) };

    case 'imports':
      return rows(pool,
        `SELECT i.id, i.nom_fichier, i.utilisateur, i.date_import, i.statut, i.message,
                i.lignes_lues, i.lignes_nouvelles, i.lignes_existantes, i.lignes_anomalies,
                i.lignes_lettrees, s.progression, s.lignes_lues AS lues_en_cours
           FROM imports i LEFT JOIN imports_suivi s ON s.import_id = i.id
          ORDER BY i.id DESC LIMIT 20`);

    case 'supprimer_import': {
      if (!ROLES_SUPPRESSION_IMPORT.includes(moi.role)) fail(403, "Tu n'as pas le droit de supprimer un import");
      const id = Number(d.id) || 0;
      const imp = await un(pool,
        `SELECT id, statut, nom_fichier, date_import, (date_import > now() - interval '2 hours') AS recent
           FROM imports WHERE id = $1`, [id]);
      if (!imp) fail(404, 'Import introuvable (déjà supprimé ?)');
      if (imp.statut === 'en_cours' && imp.recent) fail(409, "Cet import est encore en cours : attends qu'il se termine");
      if (imp.statut === 'termine') {
        const n = await valeur(pool, `SELECT COUNT(*) FROM imports WHERE id > $1 AND statut = 'termine'`, [id]);
        if (n > 0) fail(409, "Seul le dernier import peut être supprimé : supprime d'abord les imports plus récents");
      }
      const bilan = await tx(async (c) => {
        const prec = Number(await valeur(c, `SELECT MAX(id) FROM imports WHERE id < $1 AND statut = 'termine'`, [id])) || 0;
        const rest = await c.query(
          `UPDATE operations SET statut_ligne = 'en_attente', import_lettrage_id = NULL, date_lettrage = NULL
            WHERE import_lettrage_id = $1 AND statut_ligne = 'lettree'`, [id]);
        await c.query(
          `UPDATE operations SET dernier_import_id = GREATEST(premier_import_id, $1)
            WHERE dernier_import_id = $2 AND premier_import_id < $2`, [prec, id]);
        const sup = await c.query('DELETE FROM operations WHERE premier_import_id = $1', [id]);
        if (imp.statut === 'termine') {
          await c.query(
            `UPDATE gd_comptes SET statut = 'en_attente', date_lettrage = NULL, import_lettrage_id = NULL
              WHERE import_lettrage_id = $1`, [id]);
          await c.query('DELETE FROM gd_comptes WHERE date_detection >= $1', [imp.date_import]);
        }
        await c.query('DELETE FROM imports_suivi WHERE import_id = $1', [id]);
        await c.query('DELETE FROM imports WHERE id = $1', [id]);
        return { supprimees: sup.rowCount, restaurees: rest.rowCount };
      });
      for (const f of [`import_${id}.xlsx`, `import_${id}.log`]) fs.rmSync(path.join(config.dossierUploads, f), { force: true });

      let avert = null;
      try { await detecterAnomalies(pool); } catch (e) { avert = `Contrôles non relancés : ${e.message}`; }
      try { await synchroniserInventaire(pool, id); } catch (e) { avert = `${avert ?? ''} Inventaire non resynchronisé : ${e.message}`.trim(); }
      try { await gdSynchroniser(); } catch (e) { avert = `${avert ?? ''} Gros débiteurs non resynchronisés : ${e.message}`.trim(); }
      return { ok: true, ...bilan, avertissement: avert };
    }

    case 'quittances':
      return pageQuittances(pool, dateArrete(q1(q.arrete)), q1(q.q), parseInt(q1(q.page), 10) || 1, parseInt(q1(q.par_page), 10) || 200);

    case 'quittances_export': {
      const arrete = dateArrete(q1(q.arrete));
      const buffer = await construireExportQuittances(await lireQuittances(pool, arrete), arrete);
      res.set({ 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${nomFichierExport(arrete)}"` });
      res.send(buffer);
      return null;
    }

    case 'quittance_enregistrer': {
      const id = d.id !== undefined && d.id !== null && d.id !== '' ? Number(d.id) : null;
      return { ok: true, id: await enregistrerQuittance(pool, d, id, moi.nom) };
    }

    case 'quittance_supprimer':
      await supprimerQuittance(pool, Number(d.id) || 0);
      return { ok: true };

    case 'importer': {
      const f = req.file;
      if (!f) fail(400, 'Aucun fichier reçu');
      const nettoyer = () => fs.rmSync(f.path, { force: true });
      try {
        if (path.extname(f.originalname).toLowerCase() !== '.xlsx') fail(400, 'Le fichier doit être au format .xlsx');
        let user = sous(moi.nom.replace(/[^\p{L}\p{N} _.'’\-]/gu, '').trim(), 50);
        if (user === '') user = moi.identifiant;

        const enCours = await valeur(pool,
          `SELECT COUNT(*) FROM imports WHERE statut = 'en_cours' AND date_import > now() - interval '2 hours'`);
        if (enCours) fail(409, "Un import est déjà en cours, attends qu'il se termine");

        const id = await valeur(pool,
          `INSERT INTO imports (nom_fichier, utilisateur, statut) VALUES ($1, $2, 'en_cours') RETURNING id`,
          [sous(path.basename(f.originalname), 255), user]);
        const dest = path.join(config.dossierUploads, `import_${id}.xlsx`);
        try { fs.renameSync(f.path, dest); } catch {
          await pool.query(`UPDATE imports SET statut = 'erreur', message = 'Fichier non enregistré' WHERE id = $1`, [id]);
          fail(500, "Impossible d'enregistrer le fichier reçu");
        }
        lancerImport(dest, user, id, String(d.force ?? req.body?.force ?? '0') === '1');
        return { ok: true, import_id: id };
      } catch (e) { nettoyer(); throw e; }
    }

    case 'gd_lignes': {
      const statut = q1(q.statut) || 'en_attente';
      if (!['en_attente', 'lettree'].includes(statut)) fail(400, 'Statut inconnu');
      await gdSynchroniser();
      return { seuil: gdSeuil(), lignes: statut === 'en_attente' ? await gdLignes(pool) : await gdComptesLettres(pool) };
    }

    case 'gd_observation': {
      const compte = String(d.compte ?? '').trim();
      const obs = String(d.observation ?? '').replace(/\s+/gu, ' ').trim();
      if (compte === '') fail(400, 'Compte manquant');
      if (lg(obs) > 500) fail(400, 'Observation trop longue (500 caractères au maximum)');
      if (obs === '') await pool.query('DELETE FROM gd_observations WHERE compte = $1', [compte]);
      else {
        await pool.query(
          `INSERT INTO gd_observations (compte, observation, modifie_par) VALUES ($1, $2, $3)
           ON CONFLICT (compte) DO UPDATE SET observation = EXCLUDED.observation, modifie_par = EXCLUDED.modifie_par,
                                              modifie_le = now()`, [compte, obs, sous(moi.nom, 100)]);
      }
      return { ok: true, observation: obs };
    }

    case 'gd_export': {
      const { buffer, nom } = await gdExporter(pool);
      res.set({ 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${nom}"` });
      res.send(buffer);
      return null;
    }

    case 'travail_etat': return travailEtat(pool);
    case 'operations_travail': return operationsTravail(pool, q1(q.compte));
    case 'travail_marquer': return travailMarquer(pool, d, moi);

    default:
      return fail(400, 'Action inconnue');
  }
}

const enveloppe = (actionParDefaut) => async (req, res) => {
  let moi = null;
  try {
    verifierOrigine(req);
    const action = q1(req.query.action) || String(req.body?.action ?? '') || actionParDefaut;
    if (!ACTIONS_PUBLIQUES.includes(action)) moi = req.moi ?? await exigerConnexion(req, res, action);
    const resultat = await executer(req, res, action, moi);
    if (resultat !== null && !res.headersSent) res.json(resultat);
  } catch (e) {
    if (res.headersSent) return;
    if (e instanceof ApiError) {
      return res.status(e.status).json(e.motif ? { error: e.message, motif: e.motif } : { error: e.message });
    }
    console.error(e);
    const base = typeof e.code === 'string' && e.code.length === 5;
    res.status(500).json({
      error: moi ? (base ? `Erreur base de données : ${e.message}` : e.message) : 'Erreur de base de données ou du serveur',
    });
  }
};

async function prepareUpload(req, res, next) {
  if (req.method !== 'POST' || req.query.action !== 'importer') return next();
  try {
    verifierOrigine(req);
    req.moi = await exigerConnexion(req, res, 'importer');
  } catch (e) {
    return res.status(e.status ?? 500).json(e.motif ? { error: e.message, motif: e.motif } : { error: e.message });
  }
  return upload.single('fichier')(req, res, (err) => {
    if (!err) return next();
    const trop = err.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({ error: trop ? `Fichier trop volumineux (maximum ${config.uploadMaxMb} Mo)` : `Envoi impossible : ${err.message}` });
  });
}

export function routesApi() {
  const r = express.Router();
  r.use((req, res, next) => {
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    next();
  });
  const json = express.json({ limit: '2mb' });
 r.all('/api', json, prepareUpload, enveloppe('soldes'));
 r.all('/api/travail', json, prepareUpload, enveloppe(''));
  return r;
}
