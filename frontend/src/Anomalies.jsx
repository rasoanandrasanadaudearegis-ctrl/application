import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Confirmation, Modale } from './Modale';
import { notifier } from './notifier';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT, paginer } from './paginer';

const TYPES = {
  compte_manquant: 'Compte manquant',
  compte_longueur: 'Compte ≠ 10 caractères',
  meme_nom_comptes_proches: 'Même nom, comptes proches',
  compte_noms_differents: 'Même compte, noms différents',
  doublon_nom_police_quittance_solde: 'Nom + police + quittance + solde',
  doublon_nom_police_effet_solde: 'Nom + police + effet + solde',
  doublon_nom_effet_quittance_solde: 'Nom + effet + quittance + solde',
  doublon_nom_police_effet_quittance: 'Nom + police + effet + quittance',
  doublon_nom_police_quittance_montant: 'Nom + police + quittance + montant',
  doublon_nom_police_effet_montant: 'Nom + police + effet + montant',
  doublon_nom_effet_quittance_montant: 'Nom + effet + quittance + montant',
  doublon_nom_police_effet_quittance_montant: 'Nom + police + effet + quittance + montant',
  doublon_nom_police_quittance_montant_solde_diff: 'Nom + police + quittance + montant, soldes différents',
  doublon_nom_police_effet_montant_solde_diff: 'Nom + police + effet + montant, soldes différents',
  doublon_nom_effet_quittance_montant_solde_diff: 'Nom + effet + quittance + montant, soldes différents',
  doublon_nom_police_effet_quittance_montant_solde_diff: 'Nom + police + effet + quittance + montant, soldes différents',
};
const libelle = (t) => (t.startsWith('doublon_') ? `Doublon : ${TYPES[t].toLowerCase()}` : TYPES[t]);

const FAMILLES = {
  compte_manquant: 'Compte manquant',
  compte_longueur: 'Compte ≠ 10 caractères',
  meme_nom_comptes_proches: 'Même nom, comptes proches',
  compte_noms_differents: 'Même compte, noms différents',
  doublon_references: 'Doublon : mêmes références',
  doublon_solde: 'Doublon : même solde',
  doublon_montant: 'Doublon : même montant',
  doublon_soldes_differents: 'Doublon : soldes différents',
};
const familleDe = (t) => {
  if (!t.startsWith('doublon_')) return t;
  if (t.endsWith('_solde_diff')) return 'doublon_soldes_differents';
  if (t.endsWith('_montant')) return 'doublon_montant';
  if (t.endsWith('_solde')) return 'doublon_solde';
  return 'doublon_references';
};
function proposition(g) {
  const detail = g.detail || '';
  if (g.famille === 'compte_noms_differents') {
    const m = /nom principal « (.+?) »/.exec(detail);
    if (m) return { nom: m[1] };
  }
  if (g.famille === 'meme_nom_comptes_proches' && /probablement mal saisi/.test(detail)) {
    const m = /compte (\S+)/.exec(detail);
    if (m) return { compte: m[1] };
  }
  return {};
}

function regrouper(rows) {
  const parCle = new Map();
  for (const g of rows) {
    const famille = familleDe(g.type);
    const cle = `${famille}|${g.compte_client}|${g.nom_client}`;
    const r = parCle.get(cle);
    if (!r) { parCle.set(cle, { ...g, famille, types: [g.type] }); continue; }
    r.types.push(g.type);
    if (Number(g.nb_lignes) > Number(r.nb_lignes)) {
      Object.assign(r, { type: g.type, nb_lignes: g.nb_lignes, total_debit: g.total_debit, total_credit: g.total_credit, detail: g.detail });
    }
  }
  return [...parCle.values()];
}
const STATUTS = { a_verifier: 'À vérifier', validee: 'Validées', corrigee: 'Corrigées', supprimee: 'Supprimées' };

const fdate = (d) => (d ? d.split('-').reverse().join('/') : '');
const fdt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');
const nonNul = (v) => Number(v) !== 0;
const cts = (v) => Math.round(Number(v) * 100);
const LIBELLE_CHAMP = { police: 'Police', effet: 'Effet', quittance: 'Quittance', montant: 'Montant' };

function Correspondance({ api, fmt, cible, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const q = new URLSearchParams({ action: 'anomalie_detail', type: cible.type, compte: cible.compte, nom: cible.nom });
    fetch(`${api}?${q}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, [api, cible]);

  const { paires, cleDe, numeros } = useMemo(() => {
    const champs = data ? data.champs.filter((c) => c !== 'solde') : [];
    const cleDe = (o) => champs.map((c) => {
      if (c === 'police') return (o.p || '').trim().toUpperCase();
      if (c === 'quittance') return (o.q || '').trim().toUpperCase();
      if (c === 'effet') return o.e || '';
      return `${o.deb}/${o.cre}`;
    }).join('|');
    const numeros = new Map();
    const paires = [];
    if (!data || !champs.length) return { paires, cleDe, numeros };
    const vues = new Map();
    data.comptes.forEach((c) => c.operations.forEach((o) => {
      if (!o.sig) return;
      const k = cleDe(o);
      if (!vues.has(k)) vues.set(k, { comptes: new Set(), ex: o });
      vues.get(k).comptes.add(c.compte);
    }));
    vues.forEach((v, k) => {
      if (v.comptes.size < 2) return;
      paires.push({ n: paires.length + 1, comptes: [...v.comptes], ex: v.ex });
      numeros.set(k, paires.length);
    });
    return { paires, cleDe, numeros };
  }, [data]);

  const champs = data ? data.champs.filter((c) => c !== 'solde') : [];
  const montantTxt = (o) => [nonNul(o.deb) && `Débit ${fmt(o.deb)}`, nonNul(o.cre) && `Crédit ${fmt(o.cre)}`]
    .filter(Boolean).join(' / ');

  return (
    <Modale taille="large" titre={libelle(cible.type)} sousTitre={`${cible.compte || '(sans compte)'} · ${cible.nom || '(sans nom)'}`}
            onClose={onClose}>
        {err && <p className="err-form" style={{ marginTop: 0 }}>{err}</p>}
        {!data && !err && <p>Chargement…</p>}
        {data && (
          <>
            <div className="sub">{data.detail}</div>

            {data.comptes.length === 1 && champs.length > 0 && (
              <div className="note">
                Aucun autre compte correspondant n'a été trouvé : il a peut-être déjà été traité, modifié ou supprimé.
              </div>
            )}
            {data.nb_autres > 0 && (
              <div className="note">+ {data.nb_autres} autre(s) compte(s) correspondant(s) non affiché(s).</div>
            )}

            {paires.length > 0 && (
              <div className="tw" style={{ margin: '12px 0' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Correspondance</th>
                      {champs.map((c) => <th key={c}>{LIBELLE_CHAMP[c]}</th>)}
                      <th>Comptes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paires.map((p) => (
                      <tr key={p.n}>
                        <td><span className="corr">#{p.n}</span></td>
                        {champs.map((c) => (
                          <td key={c}>
                            {c === 'police' && p.ex.p}
                            {c === 'effet' && fdate(p.ex.e)}
                            {c === 'quittance' && p.ex.q}
                            {c === 'montant' && montantTxt(p.ex)}
                          </td>
                        ))}
                        <td>{p.comptes.join(' ↔ ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="cmp-grid">
              {data.comptes.map((c) => {
                const solde = ((cts(c.total_debit) - cts(c.total_credit)) / 100).toFixed(2);
                const plusieursNoms = new Set(c.operations.map((o) => o.n || '')).size > 1;
                return (
                  <div className="cmp-col" key={c.compte}>
                    <div className="cmp-head">
                      <b>{c.nom || '(sans nom)'}</b>{' '}
                      {c.principal && <span className="badge unk">Compte sélectionné</span>}
                      <div className="sub">
                        Compte {c.compte || '(vide)'} · {c.nb} opération(s) · solde {fmt(solde)} Ar
                      </div>
                      <div className="sub">Débit {fmt(c.total_debit)} · Crédit {fmt(c.total_credit)}</div>
                    </div>
                    <div className="tw">
                      <table>
                        <thead>
                          <tr>
                            {paires.length > 0 && <th>#</th>}
                            <th>Pièce</th><th>Date</th><th>Libellé</th>{plusieursNoms && <th>Nom</th>}
                            <th>Police</th><th>Effet</th><th>Quittance</th>
                            <th className="n">Débit</th><th className="n">Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.operations.map((o, i) => (
                            <tr key={i} className={o.sig ? 'sig' : ''}>
                              {paires.length > 0 && (
                                <td>{o.sig && numeros.has(cleDe(o)) && <span className="corr">#{numeros.get(cleDe(o))}</span>}</td>
                              )}
                              <td title={o.pc}>{o.pc}</td>
                              <td>{fdate(o.d)}</td>
                              <td className="l" title={o.l}>{o.l}</td>
                              {plusieursNoms && <td className="l" title={o.n}>{o.n}</td>}
                              <td>{o.p}</td><td>{fdate(o.e)}</td><td>{o.q}</td>
                              <td className="n">{nonNul(o.deb) ? fmt(o.deb) : ''}</td>
                              <td className="n">{nonNul(o.cre) ? fmt(o.cre) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {c.tronque && <div className="sub">Seules les 300 premières lignes sont affichées (lignes signalées en premier).</div>}
                  </div>
                );
              })}
            </div>
            <div className="sub" style={{ marginTop: 8 }}>Les lignes sur fond coloré sont celles signalées par cette anomalie.</div>
          </>
        )}
    </Modale>
  );
}

export default function Anomalies({ api, fmt }) {
  const [statut, setStatut] = useState('a_verifier');
  const [type, setType] = useState(null);
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [voir, setVoir] = useState(null);
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);

  const load = useCallback(() => {
    setRows(null);
    fetch(`${api}?action=anomalies&statut=${statut}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) { notifier('erreur', d.error); setRows([]); } else setRows(d); })
      .catch((e) => { notifier('erreur', String(e)); setRows([]); });
  }, [api, statut]);
  useEffect(() => { load(); }, [load]);

  const post = (body) =>
    fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.json());

  const key = (g) => `${g.famille}|${g.compte_client}|${g.nom_client}`;

  const traiter = async (g, decision, extra = {}) => {
    setOccupe(true);
    const r = { lignes: 0 };
    for (const type of g.types) {
      const x = await post({ action: 'traiter', decision, type, compte: g.compte_client, nom: g.nom_client, ...extra })
        .catch((e) => ({ error: String(e.message || e) }));
      if (x.error) { r.error = x.error; break; }
      r.lignes = Math.max(r.lignes, Number(x.lignes) || 0);
    }
    setOccupe(false);
    setASupprimer(null);
    if (r.error) { notifier('erreur', r.error); return; }
    notifier('ok', decision === 'supprimer' ? `${r.lignes} ligne(s) supprimée(s).` : `${r.lignes} ligne(s) traitée(s).`);
    setEdit(null);
    load();
  };

  const relancer = async () => {
    const r = await post({ action: 'relancer' }).catch((e) => ({ error: String(e.message || e) }));
    notifier(r.error ? 'erreur' : 'ok', r.error || 'Contrôles relancés.');
    load();
  };

  const groupes = useMemo(() => regrouper(rows || []), [rows]);
  const counts = {};
  groupes.forEach((g) => { counts[g.famille] = (counts[g.famille] || 0) + Number(g.nb_lignes); });
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const typeActif = type && counts[type] ? type : null;
  const list = groupes.filter((g) => !typeActif || g.famille === typeActif);
  const { page: pageActive, pages, debut, visibles } = paginer(list, page, parPage);

  return (
    <div className="page">
      <div className="bar">
        {Object.entries(STATUTS).map(([k, label]) => (
          <button key={k} className={`p ${statut === k ? 'on' : ''}`} onClick={() => { setStatut(k); setPage(0); }}>{label}</button>
        ))}
        <button className="p" onClick={relancer}>Relancer les contrôles</button>
      </div>

      <div className="bar">
        <label htmlFor="anomalie-type">Type d'anomalie</label>
        <select id="anomalie-type" className="cb" value={typeActif || ''} onChange={(e) => { setType(e.target.value || null); setPage(0); }}>
          <option value="">Tous les types ({total})</option>
          {Object.entries(FAMILLES).filter(([k]) => counts[k] > 0).map(([k, l]) => (
            <option key={k} value={k}>{l} ({counts[k]})</option>
          ))}
        </select>
      </div>


      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Compte</th><th>Nom</th><th className="n">Lignes</th>
              <th className="n">Débit</th><th className="n">Crédit</th><th>Détail</th>
              {statut === 'a_verifier' ? <th className="actions">Actions</th> : <th>Traité par</th>}
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={8}>Chargement…</td></tr>}
            {rows && !list.length && <tr><td colSpan={8}>Aucune anomalie.</td></tr>}
            {visibles.map((g) => (
              <Fragment key={key(g)}>
                <tr>
                  <td className="t">{FAMILLES[g.famille]}</td>
                  <td>
                    <button className="lien" title="Voir le détail du compte et le compte correspondant"
                            onClick={() => setVoir({ type: g.type, compte: g.compte_client, nom: g.nom_client })}>
                      {g.compte_client || '(vide)'}
                    </button>
                  </td>
                  <td className="l" title={g.nom_client}>{g.nom_client}</td>
                  <td className="n">{g.nb_lignes}</td>
                  <td className="n">{fmt(g.total_debit)}</td>
                  <td className="n">{fmt(g.total_credit)}</td>
                  <td className="l" title={g.detail}>{g.detail}</td>
                  {statut !== 'a_verifier' && <td>{g.traite_par ? `${g.traite_par} · ${fdt(g.date_traitement)}` : ''}</td>}
                  {statut === 'a_verifier' && (
                    <td className="actions">
                      <button className="p valider" onClick={() => traiter(g, 'valider')}>Valider</button>{' '}
                      <button className="p modifier" onClick={() => {
                        const p = proposition(g);
                        setEdit({ key: key(g), compte: p.compte ?? g.compte_client, nom: p.nom ?? g.nom_client, propose: Boolean(p.compte || p.nom) });
                      }}>Modifier</button>{' '}
                      <button className="p supprimer" onClick={() => setASupprimer(g)}>Supprimer</button>
                    </td>
                  )}
                </tr>
                {edit && edit.key === key(g) && (
                  <tr>
                    <td colSpan={8}>
                      <div className="bar edition">
                        <label className="champ-edition">Compte client (10 caractères)
                          <input type="search" value={edit.compte} onChange={(e) => setEdit({ ...edit, compte: e.target.value })} />
                        </label>
                        <label className="champ-edition">Nom du client
                          <input type="search" value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} />
                        </label>
                        <button className="p valider" disabled={occupe}
                                onClick={() => traiter(g, 'modifier', { nouveau_compte: edit.compte, nouveau_nom: edit.nom })}>
                          Enregistrer
                        </button>
                        <button className="p" onClick={() => setEdit(null)}>Annuler</button>
                      </div>
                      {edit.propose && (
                        <p className="edition-aide">Valeur proposée d'après l'anomalie : vérifiez-la avant d'enregistrer.</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pageActive} pages={pages} total={list.length} debut={debut} nbAffiches={visibles.length}
                  parPage={parPage} onPage={setPage} onParPage={(n) => { setParPage(n); setPage(0); }} />

      {voir && <Correspondance api={api} fmt={fmt} cible={voir} onClose={() => setVoir(null)} />}

      {aSupprimer && (
        <Confirmation titre={`Supprimer ${aSupprimer.nb_lignes} ligne(s) ?`}
                      sousTitre={`${aSupprimer.compte_client || '(sans compte)'} · ${aSupprimer.nom_client || '(sans nom)'} · ${FAMILLES[aSupprimer.famille]}`}
                      alerte="Ces lignes ne compteront plus dans les soldes." occupe={occupe}
                      onConfirmer={() => traiter(aSupprimer, 'supprimer')} onAnnuler={() => setASupprimer(null)}>
          <p style={{ margin: '0 0 12px' }}>L'anomalie passera dans l'onglet des anomalies supprimées.</p>
        </Confirmation>
      )}
    </div>
  );
}
