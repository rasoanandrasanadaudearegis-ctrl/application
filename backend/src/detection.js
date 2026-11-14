import { rows, lignesTab } from './db.js';
import { normNom, levenshtein, similarPct } from './util.js';

export const REGLES_DOUBLONS = {
  doublon_nom_police_quittance_solde: ['police', 'quittance', 'solde'],
  doublon_nom_police_effet_solde: ['police', 'effet', 'solde'],
  doublon_nom_effet_quittance_solde: ['effet', 'quittance', 'solde'],
  doublon_nom_police_effet_quittance: ['police', 'effet', 'quittance'],
  doublon_nom_police_quittance_montant: ['police', 'quittance', 'montant'],
  doublon_nom_police_effet_montant: ['police', 'effet', 'montant'],
  doublon_nom_effet_quittance_montant: ['effet', 'quittance', 'montant'],
  doublon_nom_police_effet_quittance_montant: ['police', 'effet', 'quittance', 'montant'],
  doublon_nom_police_quittance_montant_solde_diff: ['police', 'quittance', 'montant', 'solde_different'],
  doublon_nom_police_effet_montant_solde_diff: ['police', 'effet', 'montant', 'solde_different'],
  doublon_nom_effet_quittance_montant_solde_diff: ['effet', 'quittance', 'montant', 'solde_different'],
  doublon_nom_police_effet_quittance_montant_solde_diff: ['police', 'effet', 'quittance', 'montant', 'solde_different'],
};

export const TYPES = [
  'compte_manquant', 'compte_longueur', 'meme_nom_comptes_proches', 'compte_noms_differents',
  ...Object.keys(REGLES_DOUBLONS),
];

const incr = (m, k, n) => m.set(k, (m.get(k) ?? 0) + n);
const trierDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function analyserGroupes(groupes) {
  const parNom = new Map(), parCompte = new Map(), orig = new Map();
  for (const [c0, n, k] of groupes) {
    const nn = normNom(n);
    const c = String(c0);
    if (nn === '' || /^[0-9 ]+$/.test(nn) || nn.includes(c)) continue;
    if (!parNom.has(nn)) parNom.set(nn, new Map());
    incr(parNom.get(nn), c, Number(k));
    if (!parCompte.has(c)) parCompte.set(c, new Map());
    incr(parCompte.get(c), nn, Number(k));
    if (!orig.has(c)) orig.set(c, new Map());
    if (!orig.get(c).has(nn)) orig.get(c).set(nn, new Set());
    orig.get(c).get(nn).add(String(n));
  }

  const out = new Map();
  const add = (type, c, nn, detail) => {
    out.set(`${type}|${c}|${nn}`, [type, c, [...orig.get(c).get(nn)], detail]);
  };

  for (const [nn, cs0] of parNom) {
    if (cs0.size < 2) continue;
    const cs = new Map(trierDesc(cs0));
    const ks = [...cs.keys()];
    ks.forEach((a, i) => {
      ks.forEach((b, j) => {
        if (j <= i || levenshtein(a, b) > 2) return;
        const ka = cs.get(a), kb = cs.get(b);
        const t = 'meme_nom_comptes_proches';
        if (kb * 4 <= ka) {
          add(t, b, nn, `Même nom que le compte ${a} (${ka} lignes) : compte probablement mal saisi`);
        } else if (ka === kb) {
          add(t, a, nn, `Même nom que le compte ${b} (${kb} lignes) : lequel est le bon ?`);
          add(t, b, nn, `Même nom que le compte ${a} (${ka} lignes) : lequel est le bon ?`);
        }
      });
    });
  }

  for (const [c, ns0] of parCompte) {
    if (ns0.size < 2) continue;
    const ns = new Map(trierDesc(ns0));
    const dom = ns.keys().next().value;
    for (const nn of ns.keys()) {
      if (nn === dom) continue;
      if (similarPct(dom, nn) >= 50 || dom.includes(nn) || nn.includes(dom)) continue;
      add('compte_noms_differents', c, nn, `Nom différent du nom principal « ${dom} » (${ns.get(dom)} lignes)`);
    }
  }
  return [...out.values()];
}

export function quittanceValide(q) {
  const s = String(q ?? '').trim().toUpperCase();
  if (s === '' || s === '-') return null;
  if (/^\d+$/.test(s) && parseInt(s, 10) <= 1) return null;
  return s;
}

export function analyserDoublons(lignes, soldes, seulementType = null) {
  const out = [];
  for (const [type, champsBruts] of Object.entries(REGLES_DOUBLONS)) {
    if (seulementType !== null && type !== seulementType) continue;
    const soldesDiff = champsBruts.includes('solde_different');
    const champs = champsBruts.filter((c) => c !== 'solde_different');
    const groupes = new Map();

    for (const [id, c0, nom, police, effet, quit, debit, credit] of lignes) {
      const c = String(c0);
      const nn = normNom(nom);
      if (nn === '' || /^[0-9 ]+$/.test(nn) || nn.includes(c)) continue;
      const val = {
        police: police === null ? null : String(police).trim().toUpperCase(),
        effet: effet === null ? null : String(effet).trim(),
        quittance: quittanceValide(quit),
        solde: soldes.get(c) ?? null,
        montant: (Number(debit) === 0 && Number(credit) === 0) ? null : `${debit}/${credit}`,
      };
      const cle = [nn];
      let ok = true;
      for (const ch of champs) {
        if (val[ch] === null || val[ch] === '') { ok = false; break; }
        cle.push(String(val[ch]));
      }
      if (!ok) continue;
      const k = cle.join('\x1f');
      if (!groupes.has(k)) groupes.set(k, new Map());
      const g = groupes.get(k);
      if (!g.has(c)) g.set(c, []);
      g.get(c).push(Number(id));
    }

    const libelle = [...['nom', ...champs.slice(0, -1)]].join(', ') + ' et ' + champs[champs.length - 1];
    for (const cs of groupes.values()) {
      if (cs.size < 2) continue;
      const comptes = [...cs.keys()];
      if (soldesDiff) {
        const distincts = new Set(comptes.map((cc) => String(soldes.get(cc) ?? '')));
        if (distincts.size < 2) continue;
      }
      for (const [c, ids] of cs) {
        const autres = comptes.filter((x) => x !== c);
        const liste = autres.slice(0, 3).join(', ') + (autres.length > 3 ? ` (+${autres.length - 3})` : '');
        const detail = `Mêmes ${libelle} que ${autres.length > 1 ? 'les comptes ' : 'le compte '}${liste}`
          + (soldesDiff ? ', mais soldes différents' : '');
        for (const id of ids) out.push([type, id, detail, autres, c]);
      }
    }
  }
  return out;
}

async function chargerPourDoublons(db) {
  const soldes = new Map(
    (await lignesTab(db,
      `SELECT compte_client, SUM(debit) - SUM(credit) FROM operations
        WHERE statut_ligne = 'en_attente' AND compte_client <> '' GROUP BY compte_client`)
    ).map(([c, s]) => [String(c), s]),
  );
  const lignes = await lignesTab(db,
    `SELECT id, compte_client, nom_client, police, date_effet, quittance, debit, credit FROM operations
      WHERE statut_ligne = 'en_attente' AND compte_client <> '' AND nom_client IS NOT NULL`);
  return [lignes, soldes];
}

async function insererAnomalies(db, trouvees) {
  for (let i = 0; i < trouvees.length; i += 5000) {
    const lot = trouvees.slice(i, i + 5000);
    await db.query(
      `INSERT INTO anomalies (operation_id, type, detail)
       SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[])
       ON CONFLICT (operation_id, type) DO NOTHING`,
      [lot.map((t) => t[1]), lot.map((t) => t[0]), lot.map((t) => t[2])],
    );
  }
}

async function detecterDoublons(db) {
  const [lignes, soldes] = await chargerPourDoublons(db);
  await insererAnomalies(db, analyserDoublons(lignes, soldes));
}

export async function partenairesDoublon(db, type, compte, ids) {
  if (!REGLES_DOUBLONS[type]) return [];
  const [lignes, soldes] = await chargerPourDoublons(db);
  const set = new Set(ids.map(Number));
  const partenaires = new Set();
  for (const t of analyserDoublons(lignes, soldes, type)) {
    if (t[4] === compte && set.has(t[1])) t[3].forEach((p) => partenaires.add(String(p)));
  }
  return [...partenaires];
}

export async function partenairesNomProche(db, compte, nom) {
  if (compte === '' || nom === '') return [];
  const r = await rows(db,
    `SELECT DISTINCT compte_client FROM operations
      WHERE nom_client = $1 AND compte_client <> $2 AND char_length(compte_client) = 10
        AND statut_ligne = 'en_attente'`, [nom, compte]);
  return r.map((x) => String(x.compte_client)).filter((c) => levenshtein(compte, c) <= 2);
}

export async function detecterAnomalies(db) {
  await db.query(`DELETE FROM anomalies WHERE statut = 'a_verifier'`);

  await db.query(
    `INSERT INTO anomalies (operation_id, type, detail)
     SELECT id, 'compte_manquant', 'Compte client manquant'
       FROM operations WHERE compte_client = '' AND statut_ligne = 'en_attente'
     ON CONFLICT (operation_id, type) DO NOTHING`);

  await db.query(
    `INSERT INTO anomalies (operation_id, type, detail)
     SELECT id, 'compte_longueur', 'Compte de ' || char_length(compte_client) || ' caractères au lieu de 10'
       FROM operations
      WHERE compte_client <> '' AND char_length(compte_client) <> 10 AND statut_ligne = 'en_attente'
     ON CONFLICT (operation_id, type) DO NOTHING`);

  const groupes = await lignesTab(db,
    `SELECT compte_client, nom_client, COUNT(*) FROM operations
      WHERE char_length(compte_client) = 10 AND nom_client IS NOT NULL AND statut_ligne = 'en_attente'
      GROUP BY compte_client, nom_client`);

  for (const [type, c, noms, detail] of analyserGroupes(groupes)) {
    for (const n of noms) {
      await db.query(
        `INSERT INTO anomalies (operation_id, type, detail)
         SELECT id, $1, $2 FROM operations
          WHERE compte_client = $3 AND nom_client = $4 AND statut_ligne = 'en_attente'
         ON CONFLICT (operation_id, type) DO NOTHING`, [type, detail, c, n]);
    }
  }

  await detecterDoublons(db);

  const out = {};
  for (const [t, n] of await lignesTab(db,
    `SELECT type, COUNT(*) FROM anomalies WHERE statut = 'a_verifier' GROUP BY type`)) out[t] = n;
  return out;
}

