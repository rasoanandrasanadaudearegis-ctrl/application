import { rows, lignesTab, un, tx } from './db.js';
import { fail, sous } from './util.js';

export async function travailEtat(db) {
  const etat = {};
  for (const [c, total, faites] of await lignesTab(db,
    `SELECT o.compte_client, COUNT(*), COUNT(t.operation_id)
       FROM operations o LEFT JOIN operations_travail t ON t.operation_id = o.id
      WHERE o.statut_ligne = 'en_attente' AND o.compte_client <> '' GROUP BY o.compte_client`)) {
    etat[String(c)] = [Number(total), Number(faites)];
  }
  return etat;
}

export async function operationsTravail(db, compte) {
  if (!compte) fail(400, 'Parametre compte manquant');
  const l = await rows(db,
    `SELECT o.id, o.date_operation AS d, o.piece AS pc, o.journal AS j, o.libelle AS l, o.police AS p,
            o.quittance AS q, o.date_effet AS e, o.echeance AS ec, o.code_apporteur AS ca,
            o.debit AS deb, o.credit AS cre,
            (t.operation_id IS NOT NULL) AS fait, t.fait_par, t.date_fait
       FROM operations o LEFT JOIN operations_travail t ON t.operation_id = o.id
      WHERE o.compte_client = $1 AND o.statut_ligne = 'en_attente'
      ORDER BY o.date_operation, o.id_source`, [compte]);
  return l.map((x) => ({ ...x, id: Number(x.id), fait: Boolean(x.fait) }));
}

export async function travailMarquer(db, d, moi) {
  const compte = String(d.compte ?? '');
  const fait = Boolean(d.fait);
  const tout = Boolean(d.tout);
  const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map(Number).filter((i) => Number.isInteger(i) && i > 0))];
  if (compte === '' || (!tout && !ids.length)) fail(400, 'Aucune ligne a marquer');
  if (!tout && ids.length > 5000) fail(400, 'Trop de lignes en une fois');
  const qui = sous(moi.nom, 100);

  await tx(async (c) => {
    if (tout) {
      if (fait) {
        await c.query(
          `INSERT INTO operations_travail (operation_id, fait_par)
           SELECT id, $1 FROM operations WHERE compte_client = $2 AND statut_ligne = 'en_attente'
           ON CONFLICT DO NOTHING`, [qui, compte]);
      } else {
        await c.query(
          `DELETE FROM operations_travail t USING operations o WHERE o.id = t.operation_id AND o.compte_client = $1`, [compte]);
      }
      return;
    }
    for (let i = 0; i < ids.length; i += 500) {
      const lot = ids.slice(i, i + 500);
      if (fait) {
        await c.query(
          `INSERT INTO operations_travail (operation_id, fait_par)
           SELECT id, $1 FROM operations
            WHERE compte_client = $2 AND statut_ligne = 'en_attente' AND id = ANY($3::bigint[])
           ON CONFLICT DO NOTHING`, [qui, compte, lot]);
      } else {
        await c.query(
          `DELETE FROM operations_travail t USING operations o
            WHERE o.id = t.operation_id AND o.compte_client = $1 AND t.operation_id = ANY($2::bigint[])`, [compte, lot]);
      }
    }
  });
  const r = await un(db,
    `SELECT COUNT(*) AS total, COUNT(t.operation_id) AS faites FROM operations o
       LEFT JOIN operations_travail t ON t.operation_id = o.id
      WHERE o.compte_client = $1 AND o.statut_ligne = 'en_attente'`, [compte]);
  return { ok: true, etat: [Number(r.total), Number(r.faites)] };
}
