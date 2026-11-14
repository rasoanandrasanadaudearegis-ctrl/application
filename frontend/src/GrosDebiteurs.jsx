import { useCallback, useEffect, useMemo, useState } from 'react';
import { envoyer } from './auth';
import { Modale } from './Modale';
import { notifier } from './notifier';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT, paginer } from './paginer';


const toC = (v) => Number(String(v ?? '0').replace('.', ''));
const fmt = (c) => {
  const a = Math.abs(c);
  return (c < 0 ? '-' : '') + new Intl.NumberFormat('fr-FR').format(Math.floor(a / 100))
    + ',' + String(a % 100).padStart(2, '0');
};
const fdate = (d) => (d ? d.split('-').reverse().join('/') : '');
const fdt = (s) => {
  if (!s) return '';
  const [d, h] = s.split(' ');
  return `${d.split('-').reverse().join('/')} ${(h || '').slice(0, 5)}`;
};

function Detail({ groupe, onClose, onObservation }) {
  const [obs, setObs] = useState(groupe.observation || '');
  const [envoi, setEnvoi] = useState(false);
  const modifie = obs.trim() !== (groupe.observation || '');

  const enregistrer = async () => {
    setEnvoi(true);
    const r = await envoyer({ action: 'gd_observation', compte: groupe.compte, observation: obs })
      .catch(() => ({ error: 'Impossible de joindre le serveur' }));
    setEnvoi(false);
    if (r.error) { notifier('erreur', r.error); return; }
    onObservation(groupe.compte, r.observation);
    setObs(r.observation);
    notifier('ok', `Observation enregistrée pour le compte ${groupe.compte}.`);
  };

  return (
    <Modale titre={groupe.nom || '(sans nom)'} onClose={onClose}
            sousTitre={`Compte ${groupe.compte} · ${groupe.nbPolices} police(s) · solde ${fmt(groupe.solde)} Ar`}>
        <div className="bar" style={{ marginTop: 0 }}>
          <input type="text" maxLength={500} placeholder="Observation (ex. EN ATTENTE CHQ)…" value={obs}
                 onChange={(e) => setObs(e.target.value)} />
          <button className="p on" disabled={!modifie || envoi} onClick={enregistrer}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Assuré</th><th>Police</th><th>Effet</th>
                <th className="n">Prime</th><th className="n">Ac./Rist.</th><th className="n">Solde</th>
              </tr>
            </thead>
            <tbody>
              {groupe.lignes.map((l, i) => (
                <tr key={i}>
                  <td className="l" title={l.assure}>{l.assure}</td>
                  <td>{l.police}</td><td>{fdate(l.e)}</td>
                  <td className="n">{fmt(l.prime)}</td>
                  <td className="n">{l.acompte ? fmt(l.acompte) : ''}</td>
                  <td className="n"><b>{fmt(l.prime - l.acompte)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total ({groupe.lignes.length} ligne(s))</td>
                <td className="n">{fmt(groupe.prime)}</td>
                <td className="n">{fmt(groupe.acompte)}</td>
                <td className="n">{fmt(groupe.solde)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="sub" style={{ marginTop: 8 }}>
          Une ligne = une police et une date d'effet du RCC (prime = débits, ac./rist. = crédits).
        </div>
    </Modale>
  );
}

function ObservationCell({ groupe, onSaved }) {
  const [val, setVal] = useState(groupe.observation || '');
  const [etat, setEtat] = useState('');

  useEffect(() => { setVal(groupe.observation || ''); }, [groupe.observation]);

  const enregistrer = async () => {
    if (val.trim() === (groupe.observation || '')) { setVal(groupe.observation || ''); return; }
    setEtat('envoi');
    const r = await envoyer({ action: 'gd_observation', compte: groupe.compte, observation: val });
    if (r.error) { setEtat(r.error); notifier('erreur', r.error); return; }
    onSaved(groupe.compte, r.observation);
    setVal(r.observation);
    setEtat('ok');
    setTimeout(() => setEtat((e) => (e === 'ok' ? '' : e)), 1500);
  };

  return (
    <td className="l" onClick={(e) => e.stopPropagation()}>
      <input type="text" maxLength={500} value={val} placeholder="Observation…"
             title={etat && etat !== 'ok' && etat !== 'envoi' ? etat : 'Saisis puis Entrée : visible dans l\'export Excel'}
             style={{ width: '100%', boxSizing: 'border-box', borderColor: etat && etat !== 'ok' && etat !== 'envoi' ? '#c0392b' : undefined }}
             onChange={(e) => { setVal(e.target.value); setEtat(''); }}
             onBlur={enregistrer}
             onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(groupe.observation || ''); e.currentTarget.blur(); } }} />
      {etat === 'envoi' && <small> …</small>}
      {etat === 'ok' && <small> ✓</small>}
      {etat && etat !== 'ok' && etat !== 'envoi' && <small style={{ color: '#c0392b' }}> {etat}</small>}
    </td>
  );
}

export default function GrosDebiteurs({ api, rev = 0 }) {
  const [vue, setVue] = useState('en_attente');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    let annule = false;
    setData(null);
    fetch(`${api}?action=gd_lignes&statut=${vue}`)
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (!Array.isArray(d.lignes)) throw new Error(d.error || 'Réponse invalide');
        setErr(null);
        const lignes = vue === 'en_attente'
          ? d.lignes.map((l) => ({ ...l, prime: toC(l.prime), acompte: toC(l.acompte) }))
          : d.lignes.map((l) => ({ ...l, solde_gros: toC(l.solde_gros), solde_actuel: toC(l.solde_actuel) }));
        setData({ seuil: toC(d.seuil), lignes });
      })
      .catch((e) => { if (!annule) setErr(e.message); });
    return () => { annule = true; };
  }, [api, vue, rev]);
  useEffect(() => setPage(0), [q, vue, parPage]);

  const lettrees = vue === 'lettree';

  const groupes = useMemo(() => {
    if (!data || lettrees) return [];
    const m = new Map();
    data.lignes.forEach((l) => {
      let g = m.get(l.compte);
      if (!g) {
        g = { compte: l.compte, nom: l.assure || '', observation: l.obs || '', lignes: [], polices: new Set(), prime: 0, acompte: 0 };
        m.set(l.compte, g);
      }
      g.lignes.push(l);
      g.polices.add(l.police);
      g.prime += l.prime;
      g.acompte += l.acompte;
    });
    return [...m.values()].map((g) => ({ ...g, nbPolices: g.polices.size, solde: g.prime - g.acompte }));
  }, [data, lettrees]);

  const liste = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    if (lettrees) {
      return data.lignes.filter((l) => !t || l.compte.toLowerCase().includes(t) || l.assure.toLowerCase().includes(t));
    }
    return groupes
      .filter((g) => !t || g.compte.toLowerCase().includes(t) || g.nom.toLowerCase().includes(t)
        || g.lignes.some((l) => (l.police || '').toLowerCase().includes(t)))
      .sort((a, b) => b.solde - a.solde);
  }, [data, groupes, q, lettrees]);

  const { page: pageActive, pages, debut, visibles: visible } = paginer(liste, page, parPage);

  const majObservation = useCallback((compte, obs) => {
    setData((d) => ({ ...d, lignes: d.lignes.map((l) => (l.compte === compte ? { ...l, obs } : l)) }));
    setSel((s) => (s && s.compte === compte ? { ...s, observation: obs } : s));
  }, []);

  const exporter = async () => {
    try {
      const r = await fetch(`${api}?action=gd_export`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Export impossible');
      }
      const blob = await r.blob();
      const nom = /filename="?([^";]+)"?/.exec(r.headers.get('Content-Disposition') || '')?.[1]
        || 'LISTE_GROS_DEBITEURS.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifier('ok', `Export Excel téléchargé : ${nom}.`);
    } catch (e) {
      notifier('erreur', e.message);
    }
  };

  if (err) return <div className="err">Impossible de charger les gros débiteurs : {err}</div>;

  return (
    <div className="page">
      <div className="bar">
        <button className={`p ${vue === 'en_attente' ? 'on' : ''}`} onClick={() => setVue('en_attente')}>En attente</button>
        <button className={`p ${vue === 'lettree' ? 'on' : ''}`} onClick={() => setVue('lettree')}>Lettrés</button>
        <span style={{ flex: 1 }} />
        <button className="p" onClick={exporter}>Exporter Excel</button>
      </div>


      {!data ? <p>Chargement…</p> : (
        <>
          {!lettrees && (
            <div className="kpis">
              <div className="kpi"><small>Gros débiteurs · solde ≥ {fmt(data.seuil)} Ar</small><b>{groupes.length.toLocaleString('fr-FR')}</b>
                <small>{data.lignes.length.toLocaleString('fr-FR')} ligne(s)</small></div>
              <div className="kpi"><small>Prime</small><b>{fmt(groupes.reduce((a, g) => a + g.prime, 0))}</b><small>Ar</small></div>
              <div className="kpi"><small>Solde à recouvrer</small><b>{fmt(groupes.reduce((a, g) => a + g.solde, 0))}</b><small>Ar</small></div>
            </div>
          )}

          <div className="bar">
            <input type="search" placeholder="Rechercher un compte, un nom ou une police…" value={q}
                   onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="tw">
            {lettrees ? (
              <table>
                <thead>
                  <tr>
                    <th>Compte</th><th>Assuré</th>
                    <th className="n">Solde quand gros débiteur</th><th className="n">Solde actuel</th>
                    <th>Lettré le</th><th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((l) => (
                    <tr key={l.compte}>
                      <td>{l.compte}</td>
                      <td className="l" title={l.assure}>{l.assure}</td>
                      <td className="n">{fmt(l.solde_gros)}</td>
                      <td className="n"><b>{fmt(l.solde_actuel)}</b></td>
                      <td>{fdt(l.dl)}</td>
                      <td className="l" title={l.obs}>{l.obs}</td>
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={6}>Aucun compte lettré pour le moment.</td></tr>}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Compte</th><th>Assuré</th><th className="n">Polices</th><th className="n">Lignes</th>
                    <th className="n">Prime</th><th className="n">Ac./Rist.</th><th className="n">Solde</th>
                    <th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((g) => (
                    <tr key={g.compte} className="c" onClick={() => setSel(g)}>
                      <td>{g.compte}</td>
                      <td className="l" title={g.nom}>{g.nom}</td>
                      <td className="n">{g.nbPolices}</td>
                      <td className="n">{g.lignes.length}</td>
                      <td className="n">{fmt(g.prime)}</td>
                      <td className="n">{g.acompte ? fmt(g.acompte) : ''}</td>
                      <td className="n"><b>{fmt(g.solde)}</b></td>
                      <ObservationCell groupe={g} onSaved={majObservation} />
                    </tr>
                  ))}
                  {!visible.length && (
                    <tr><td colSpan={8}>Aucun gros débiteur. Importe un fichier RCC : la liste se remplit toute seule.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={pageActive} pages={pages} total={liste.length} debut={debut} nbAffiches={visible.length}
                      parPage={parPage} onPage={setPage} onParPage={setParPage} />
        </>
      )}

      {sel && <Detail groupe={sel} onClose={() => setSel(null)} onObservation={majObservation} />}
    </div>
  );
}
