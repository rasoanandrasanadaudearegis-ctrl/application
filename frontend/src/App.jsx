import { useCallback, useEffect, useMemo, useState } from 'react';
import Anomalies from './Anomalies';
import PertesProfits from './PertesProfits';
import InventaireQuittances from './InventaireQuittances';
import GrosDebiteurs from './GrosDebiteurs';
import Accueil from './Accueil';
import Logo from './Logo';
import Aide from './Aide';
import './accueil.css';
import ImportRCC from './ImportRCC';
import Impression from './Impression';
import { API_URL, ROLES } from './auth';
import { Confirmation, Modale } from './Modale';
import { notifier } from './notifier';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT, paginer } from './paginer';
import { DIRECTEUR, SIGNATAIRES } from './pdf/config.js';
import { apparierDebitsCredits } from './paires';
import { applyTheme } from './theme';
import './app.css';

applyTheme('clair');


const STATUTS = {
  reste_a_payer:           { label: 'Reste à payer',           cls: 'neutre' },
  solde:                   { label: 'Soldé',                   cls: 'ok'  },
  production_indeterminee: { label: 'Production indéterminée', cls: 'unk' },
};

const toC = (v) => (typeof v === 'string' ? Number(v.replace('.', '')) : Math.round(v * 100));
const MONTANT_KPI = { reste_a_payer: 'montant-perte', solde: 'montant-profit', production_indeterminee: 'montant-attention' };

const fmt = (c) => {
  const a = Math.abs(c);
  return (c < 0 ? '-' : '') + new Intl.NumberFormat('fr-FR').format(Math.floor(a / 100))
    + ',' + String(a % 100).padStart(2, '0');
};
const parseAr = (t) => {
  const x = String(t).replace(/\s/g, '').replace(',', '.');
  if (x === '' || x === '-' || x === '+') return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const fdate = (d) => (d ? d.split('-').reverse().join('/') : '');
const INITIALES_ROLE = { directeur: DIRECTEUR.initiales, comptable: SIGNATAIRES.comptable.ref, conseiller: SIGNATAIRES.conseiller.ref };
const initiales = (u) => (INITIALES_ROLE[u.role] || String(u.nom || '?').split(/[\s'-]+/).filter(Boolean).slice(0, 2)
  .map((m) => m[0]).join('')).toUpperCase();

const normRow = (r) => ({ ...r, total_debit: toC(r.total_debit), total_credit: toC(r.total_credit), solde: toC(r.solde) });
const normOp = (o) => ({ ...o, deb: toC(o.deb), cre: toC(o.cre) });

const loadSoldes = () =>
  (window.RCC_DATA
    ? Promise.resolve(window.RCC_DATA)
    : fetch(`${API_URL}?action=soldes`).then((r) => r.json())
  ).then((rows) => rows.map(normRow));

const loadOps = (compte) =>
  (window.RCC_OPS
    ? Promise.resolve(window.RCC_OPS[compte] || [])
    : fetch(`${API_URL}?action=operations&compte=${encodeURIComponent(compte)}`).then((r) => r.json())
  ).then((ops) => ops.map(normOp));

const TRAVAIL_URL = '/api/travail';
const envoyerTravail = async (corps) => {
  const r = await fetch(TRAVAIL_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({ error: 'Réponse invalide du serveur (travail_api.php installé ?)' }));
  return { statut: r.status, ...d };
};

const loadOpsTravail = (compte) =>
  (window.RCC_OPS
    ? loadOps(compte)
    : fetch(`${TRAVAIL_URL}?action=operations_travail&compte=${encodeURIComponent(compte)}`)
      .then((r) => r.json())
      .then((ops) => (Array.isArray(ops) ? ops.map((o) => ({ ...normOp(o), fait: !!o.fait })) : loadOps(compte)))
  );

function Badge({ statut }) {
  const s = STATUTS[statut];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}


const nbFr = (n) => Number(n || 0).toLocaleString('fr-FR');
const fdateHeure = (s) => {
  if (!s) return '';
  const [d, h] = s.split(' ');
  return `${fdate(d)} ${(h || '').slice(0, 5)}`;
};

function Imports({ onClose }) {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const pg = paginer(list || [], page, parPage);
  useEffect(() => {
    fetch(`${API_URL}?action=imports`).then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) { setList(d); return; }
      notifier('erreur', d?.error || 'Historique des imports indisponible');
      setList([]);
    }).catch(() => { notifier('erreur', 'Impossible de joindre le serveur'); setList([]); });
  }, []);
  return (
    <Modale titre="Historique des imports" onClose={onClose}>
      {!list ? <p>Chargement…</p> : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Fichier</th><th>Utilisateur</th>
                <th className="n">Lues</th><th className="n">Nouvelles</th><th className="n">Déjà en base</th>
                <th className="n">Rejetées</th><th className="n">Lettrées</th>
              </tr>
            </thead>
            <tbody>
              {pg.visibles.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td><td>{fdateHeure(i.date_import)}</td><td className="l">{i.nom_fichier}</td><td>{i.utilisateur}</td>
                  <td className="n">{nbFr(i.lignes_lues)}</td><td className="n">{nbFr(i.lignes_nouvelles)}</td>
                  <td className="n">{nbFr(i.lignes_existantes)}</td><td className="n">{nbFr(i.lignes_anomalies)}</td>
                  <td className="n">{nbFr(i.lignes_lettrees)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={9}>Aucun import.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {list && (
        <Pagination page={pg.page} pages={pg.pages} total={list.length} debut={pg.debut} nbAffiches={pg.visibles.length}
                    parPage={parPage} onPage={setPage} onParPage={(n) => { setParPage(n); setPage(0); }} />
      )}
    </Modale>
  );
}

function ConfirmerFin({ compte, nom, nbLignes, occupe, onConfirmer, onAnnuler }) {
  return (
    <Confirmation titre={`Terminer le compte ${compte} ?`} sousTitre={nom || '(sans nom)'}
                  libelle="Terminer" libelleOccupe="Enregistrement…" danger={false} occupe={occupe}
                  onConfirmer={onConfirmer} onAnnuler={onAnnuler}>
      <p style={{ margin: '0 0 8px' }}>
        {nbLignes ? `Les ${nbLignes} ligne(s) du compte seront marquées lettrées` : 'Toutes les lignes du compte seront marquées lettrées'} et
        le compte passera dans l'onglet <b>Terminé</b>.
      </p>
      <p style={{ margin: 0 }}>Vous pourrez le rouvrir à tout moment.</p>
    </Confirmation>
  );
}

function Detail({ compte, onClose, role, onTravail }) {
  const [ops, setOps] = useState(null);
  const [imp, setImp] = useState(null);
  const [f, setF] = useState('');
  const [survol, setSurvol] = useState(0);
  const [sansPaires, setSansPaires] = useState(false);
  useEffect(() => {
    loadOpsTravail(compte.compte_client).then(setOps);
  }, [compte]);

  const marquer = async (cibles, fait) => {
    if (!cibles.length) return;
    const ids = cibles.map((o) => o.id);
    const r = await envoyerTravail({ action: 'travail_marquer', compte: compte.compte_client, ids, fait });
    if (r.error) { notifier('erreur', r.error); return false; }
    const set = new Set(ids);
    setOps((prev) => prev.map((o) => (set.has(o.id) ? { ...o, fait } : o)));
    onTravail?.(compte.compte_client, r.etat);
    return true;
  };
  const numeros = useMemo(() => apparierDebitsCredits(ops || []), [ops]);
  const paireDe = new Map((ops || []).map((o, i) => [o, numeros[i]]));
  const nbPaires = Math.max(0, ...numeros);
  const pairesAPointer = (ops || []).filter((o) => paireDe.get(o) && !o.fait && o.id != null);
  const t = f.trim().toLowerCase();
  const vues = (ops || []).filter((o) => (!sansPaires || !paireDe.get(o)) && (!t
    || [o.pc, o.l, o.p, o.q, o.j].some((v) => (v || '').toLowerCase().includes(t))));
  const sum = (k) => vues.reduce((a, o) => a + o[k], 0);
  const [confirmerFin, setConfirmerFin] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const terminerCompte = async (fait) => {
    setEnCours(true);
    const r = await envoyerTravail({ action: 'travail_marquer', compte: compte.compte_client, tout: true, fait });
    setEnCours(false);
    setConfirmerFin(false);
    if (r.error) { notifier('erreur', r.error); return; }
    setOps((prev) => prev.map((o) => ({ ...o, fait })));
    onTravail?.(compte.compte_client, r.etat);
    notifier('ok', fait ? `Compte ${compte.compte_client} terminé.` : `Compte ${compte.compte_client} rouvert.`);
    if (fait) onClose();
  };
  const avecTravail = (ops || []).some((o) => o.id != null);
  const nbFaites = (ops || []).filter((o) => o.fait).length;
  const avecApporteur = (ops || []).some((o) => o.ca);

  return (
    <Modale taille="large" onClose={onClose} titre={compte.nom_client || '(sans nom)'}
            sousTitre={(
              <span className="sous-fonce">
                Compte {compte.compte_client} · {compte.nb_polices} police(s) · <Badge statut={compte.statut} />{' '}
                · solde {fmt(compte.solde)} Ar
                {ops && avecTravail && <> · <b>{nbFaites} / {ops.length}</b> ligne(s) lettrée(s){nbFaites === ops.length && ops.length > 0 ? ' · travail terminé' : ''}</>}
              </span>
            )}
            actions={(
              <>
                {ops && avecTravail && (nbFaites === ops.length && ops.length > 0
                  ? <button className="p" onClick={() => terminerCompte(false)}>Rouvrir le compte</button>
                  : <button className="p on" onClick={() => setConfirmerFin(true)}>Terminer le compte</button>)}
                <button className="p" disabled={!ops} onClick={() => setImp('facture')}>Imprimer facture</button>
                <button className="p" disabled={!ops} onClick={() => setImp('releve')}>Imprimer relevé</button>
              </>
            )}>
        {!ops ? (
          <p>Chargement…</p>
        ) : (
          <>
          <div className="bar" style={{ margin: '0 0 8px' }}>
            <input type="search" placeholder="Filtrer par pièce, libellé, police, quittance…" value={f}
                   onChange={(e) => setF(e.target.value)} />
            {avecTravail && (
              <>
                <button className="p" disabled={!vues.some((o) => !o.fait)} onClick={() => marquer(vues.filter((o) => !o.fait), true)}>
                  Tout marquer lettré
                </button>
                <button className="p" disabled={!vues.some((o) => o.fait)} onClick={() => marquer(vues.filter((o) => o.fait), false)}>
                  Tout rouvrir
                </button>
                {nbPaires > 0 && (
                  <button className="p valider" disabled={!pairesAPointer.length}
                          title="Coche toutes les lignes dont le débit et le crédit s'annulent (#1, #2…)"
                          onClick={async () => {
                            const n = pairesAPointer.length;
                            if (await marquer(pairesAPointer, true)) notifier('ok', `${n} ligne(s) appariée(s) marquée(s) lettrée(s).`);
                          }}>
                    Marquer les paires lettrées ({pairesAPointer.length})
                  </button>
                )}
                {nbPaires > 0 && (
                  <label><input type="checkbox" checked={sansPaires} onChange={(e) => setSansPaires(e.target.checked)} /> Masquer les paires</label>
                )}
              </>
            )}
          </div>
          {!avecTravail && !window.RCC_OPS && (
            <div className="note">
              Cases de lettrage indisponibles : le suivi n'est pas installé (travail_api.php, travail.php et migration_travail.sql).
            </div>
          )}
          <div className="tw">
            <table>
              <thead>
                <tr>
                  {avecTravail && <th title="Ligne lettrée : travail fait">Lettré</th>}
                  {nbPaires > 0 && <th title="Débit et crédit de même montant qui s'annulent">Paire</th>}
                  <th>Pièce</th><th>Date</th><th>Journal</th><th>Libellé</th><th>Police</th><th>Effet</th>
                  <th>Échéance</th>{avecApporteur && <th>Apporteur</th>}<th>Quittance</th>
                  <th className="n">Débit</th><th className="n">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {vues.map((o, i) => {
                  const n = paireDe.get(o);
                  const cls = n ? `paire${survol === n ? ' paire-active' : ''}` : undefined;
                  return (
                  <tr key={i} className={cls} style={o.fait ? { opacity: 0.6 } : undefined}
                      onMouseEnter={n ? () => setSurvol(n) : undefined} onMouseLeave={n ? () => setSurvol(0) : undefined}>
                    {avecTravail && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={!!o.fait} onChange={(e) => marquer([o], e.target.checked)}
                               title={o.fait && o.fait_par ? `Lettré par ${o.fait_par}` : 'Marquer cette ligne comme lettrée'} />
                      </td>
                    )}
                    {nbPaires > 0 && <td>{n ? <span className="corr">#{n}</span> : ''}</td>}
                    <td title={o.pc}>{o.pc}</td>
                    <td>{fdate(o.d)}</td><td>{o.j}</td><td className="l" title={o.l}>{o.l}</td>
                    <td>{o.p}</td><td>{fdate(o.e)}</td><td>{fdate(o.ec)}</td>
                    {avecApporteur && <td>{o.ca}</td>}<td>{o.q}</td>
                    <td className="n">{o.deb ? fmt(o.deb) : ''}</td>
                    <td className="n">{o.cre ? fmt(o.cre) : ''}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={(avecApporteur ? 9 : 8) + (avecTravail ? 1 : 0) + (nbPaires > 0 ? 1 : 0)}>
                    Total ({vues.length === ops.length ? `${ops.length} opérations` : `${vues.length} / ${ops.length} opérations affichées`})
                  </td>
                  <td className="n">{fmt(sum('deb'))}</td>
                  <td className="n">{fmt(sum('cre'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
        {imp && ops && <Impression mode={imp} compte={compte} ops={ops} role={role} onClose={() => setImp(null)} />}
        {confirmerFin && ops && (
          <ConfirmerFin compte={compte.compte_client} nom={compte.nom_client} nbLignes={ops.length} occupe={enCours}
                        onConfirmer={() => terminerCompte(true)} onAnnuler={() => setConfirmerFin(false)} />
        )}
    </Modale>
  );
}

export default function App({ utilisateur, onDeconnexion }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState(null);
  const [arrondi, setArrondi] = useState(false);
  const [filtres, setFiltres] = useState(false);
  const [smin, setSmin] = useState('');
  const [smax, setSmax] = useState('');
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const [sel, setSel] = useState(null);
  const [showImports, setShowImports] = useState(false);
  const [vue, setVue] = useState('accueil');
  const [rev, setRev] = useState(0);
  const reload = useCallback(() => setRev((r) => r + 1), []);
  const [onglet, setOnglet] = useState('a_faire');
  const [travail, setTravail] = useState({});
  const [aTerminer, setATerminer] = useState(null);
  const [finEnCours, setFinEnCours] = useState(false);
  const terminerListe = async (r, fait) => {
    setFinEnCours(true);
    const res = await envoyerTravail({ action: 'travail_marquer', compte: r.compte_client, tout: true, fait });
    setFinEnCours(false);
    setATerminer(null);
    if (res.error) { notifier('erreur', res.error); return; }
    setTravail((t) => ({ ...t, [r.compte_client]: res.etat }));
    notifier('ok', fait ? `Compte ${r.compte_client} terminé.` : `Compte ${r.compte_client} rouvert.`);
  };
  const onTravail = useCallback((compte, etat) => setTravail((t) => ({ ...t, [compte]: etat })), []);

  useEffect(() => {
    if (window.RCC_DATA) return;
    fetch(`${TRAVAIL_URL}?action=travail_etat`).then((r) => r.json())
      .then((d) => setTravail(d && !d.error ? d : {})).catch(() => setTravail({}));
  }, [rev]);

  useEffect(() => {
    loadSoldes().then(setRows).catch((e) => setErr(String(e)));
  }, [rev]);
  useEffect(() => setPage(0), [q, statut, arrondi, smin, smax, onglet, parPage]);

  const termine = (r) => { const [t, f] = travail[r.compte_client] || [0, 0]; return r.statut === 'solde' || (t > 0 && f === t); };
  const rowsOnglet = useMemo(
    () => (rows || []).filter((r) => (onglet === 'termine') === termine(r)),
    [rows, travail, onglet],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nbTermine = useMemo(() => (rows || []).filter(termine).length,
    [rows, travail]);   // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    const k = {};
    Object.keys(STATUTS).forEach((s) => (k[s] = { n: 0, t: 0 }));
    rowsOnglet.forEach((r) => { k[r.statut].n++; k[r.statut].t += r.solde; });
    return k;
  }, [rowsOnglet]);

  const list = useMemo(() => {
    const lo = parseAr(smin), hi = parseAr(smax);
    const t = q.trim().toLowerCase();
    return rowsOnglet
      .filter((r) => (!statut || r.statut === statut) && (!arrondi || r.ecart_arrondi)
        && (lo === null || r.solde >= lo) && (hi === null || r.solde <= hi)
        && (!t || r.compte_client.toLowerCase().includes(t) || (r.nom_client || '').toLowerCase().includes(t)))
      .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
  }, [rowsOnglet, q, statut, arrondi, smin, smax]);
  const totalSolde = useMemo(() => list.reduce((a, r) => a + r.solde, 0), [list]);
  const bad = (t) => String(t).trim() !== '' && parseAr(t) === null;

  const { page: pageActive, pages, debut, visibles: visible } = paginer(list, page, parPage);

  if (err) return <div className="err">Impossible de joindre l'API : {err}<br />Vérifie que le serveur PHP tourne.</div>;
  if (!rows) return <div className="wrap">Chargement…</div>;

  return (
    <div className="app-page">
    <header className="topbar">
      <div className="topbar-in">
        <div className="marque">
          <Logo />
          <h1>ASSURANCES ARO</h1>
        </div>
        <div className="topbar-titre"><span>Suivi du portefeuille clients</span></div>
        <div className="topbar-droite">
          <div className="topbar-user">
            <span className={`avatar${initiales(utilisateur).length > 2 ? ' long' : ''}`} aria-hidden="true">{initiales(utilisateur)}</span>
            <span className="topbar-ident">
              <b title={utilisateur.nom}>{utilisateur.nom}</b>
              <small>{ROLES[utilisateur.role]}</small>
            </span>
          </div>
          <button className="hdr" onClick={onDeconnexion} title="Se déconnecter">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
            </svg>
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>
    </header>
    <div className="wrap">
      <div className="bar nav">
        <button className={`p ${vue === 'accueil' ? 'on' : ''}`} onClick={() => setVue('accueil')}>Accueil</button>
        <button className={`p ${vue === 'comptes' ? 'on' : ''}`} onClick={() => setVue('comptes')}>Comptes clients</button>
        <button className={`p ${vue === 'anomalies' ? 'on' : ''}`} onClick={() => setVue('anomalies')}>Anomalies</button>
        <button className={`p ${vue === 'pertes' ? 'on' : ''}`} onClick={() => setVue('pertes')}>Pertes et profits</button>
        <button className={`p ${vue === 'import' ? 'on' : ''}`} onClick={() => setVue('import')}>Import RCC</button>
        <button className={`p ${vue === 'inventaire' ? 'on' : ''}`} onClick={() => setVue('inventaire')}>Inventaire quittances</button>
        <button className={`p ${vue === 'gros' ? 'on' : ''}`} onClick={() => setVue('gros')}>Gros débiteurs</button>
        <button className={`p ${vue === 'aide' ? 'on' : ''}`} onClick={() => setVue('aide')}>Aide</button>
        <button className="p nav-droite" onClick={() => setShowImports(true)}>Historique des imports</button>
      </div>

      <div className="vue-anim" key={vue}>
      {vue === 'accueil' ? (
        <Accueil nom={utilisateur.nom} nbComptes={rows.length}
          nbAFaire={rows.length - nbTermine} nbTermine={nbTermine}
          totalSolde={fmt((rows || []).reduce((a, r) => a + r.solde, 0))} onGo={setVue} />
      ) : vue === 'pertes' ? (
        <PertesProfits rows={rows} fmt={fmt} parseAr={parseAr} onOpen={setSel} />
      ) : vue === 'import' ? (
        <ImportRCC api={API_URL} onDone={reload} role={utilisateur.role} />
      ) : vue === 'inventaire' ? (
        <InventaireQuittances api={API_URL} />
      ) : vue === 'gros' ? (
        <GrosDebiteurs api={API_URL} rev={rev} />
      ) : vue === 'aide' ? (
        <Aide onRetour={() => setVue('accueil')} />
      ) : vue === 'anomalies' ? (
        <Anomalies api={API_URL} fmt={(s) => fmt(toC(s))} />
      ) : (
      <div className="page">
      {window.RCC_DATA && <div className="note">Aperçu avec les données du fichier RCC d'exemple (feuille « 32 »).</div>}

      <div className="bar">
        <button className={`p ${onglet === 'a_faire' ? 'on' : ''}`} onClick={() => setOnglet('a_faire')}>
          À faire ({((rows || []).length - nbTermine).toLocaleString('fr-FR')})
        </button>
        <button className={`p ${onglet === 'termine' ? 'on' : ''}`} onClick={() => setOnglet('termine')}>
          Terminé ({nbTermine.toLocaleString('fr-FR')})
        </button>
      </div>

      <div className="kpis">
        {Object.entries(STATUTS).map(([key, s]) => (
          <button key={key} className={`kpi ${statut === key ? 'on' : ''}`}
                  onClick={() => setStatut(statut === key ? null : key)}>
            <small>{s.label}</small>
            <b className={MONTANT_KPI[key]}>{fmt(kpis[key].t)} Ar</b>
            <small>{kpis[key].n.toLocaleString('fr-FR')} compte(s)</small>
          </button>
        ))}
      </div>

      <div className="bar">
        <input type="search" placeholder="Rechercher un compte ou un nom…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <button className={`p ${filtres ? 'on' : ''}`} onClick={() => setFiltres(!filtres)}>
          Filtres{arrondi || smin || smax ? ' (actifs)' : ''}
        </button>
        <span className="sub" style={{ margin: 0 }}>
          {list.length.toLocaleString('fr-FR')} compte(s) · total des soldes {fmt(totalSolde)} Ar
        </span>
      </div>

      {filtres && (
      <div className="bar">
        <label>
          <input type="checkbox" checked={arrondi} onChange={(e) => setArrondi(e.target.checked)} />{' '}
          Écarts d'arrondi seulement (≤ 1 Ar)
        </label>
        <span>Solde entre</span>
        <input type="search" inputMode="decimal" placeholder="min (ex. -1000)" value={smin}
               onChange={(e) => setSmin(e.target.value)} style={{ maxWidth: 170, minWidth: 120, flex: 'none' }} />
        <span>et</span>
        <input type="search" inputMode="decimal" placeholder="max (ex. 1000)" value={smax}
               onChange={(e) => setSmax(e.target.value)} style={{ maxWidth: 170, minWidth: 120, flex: 'none' }} />
        <span>Ar</span>
        {(bad(smin) || bad(smax)) && <span className="err" style={{ padding: 0 }}>Valeur invalide</span>}
        {(arrondi || smin || smax) && (
          <button className="p" onClick={() => { setArrondi(false); setSmin(''); setSmax(''); }}>Effacer les filtres</button>
        )}
      </div>
      )}

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Compte client</th><th>Nom</th><th className="n">Opérations</th>
              <th className="n">Débit</th><th className="n">Crédit</th><th className="n">Solde</th><th>Statut</th>
              <th className="n" title="Lignes lettrées / total">Lettrage</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.compte_client} className="c" onClick={() => setSel(r)}>
                <td>{r.compte_client}</td>
                <td className="l">{r.nom_client}</td>
                <td className="n">{r.nb_operations}</td>
                <td className="n">{fmt(r.total_debit)}</td>
                <td className="n">{fmt(r.total_credit)}</td>
                <td className="n"><b>{fmt(r.solde)}</b></td>
                <td><Badge statut={r.statut} />{r.ecart_arrondi ? ' ≈' : ''}</td>
                <td className="n">{r.statut === 'solde' ? 'soldé' : travail[r.compte_client] ? `${travail[r.compte_client][1]} / ${travail[r.compte_client][0]}` : '–'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {r.statut === 'solde' ? null : onglet === 'a_faire'
                    ? <button className="p on" onClick={() => setATerminer(r)} title="Marquer toutes les lignes du compte comme lettrées">Terminer</button>
                    : <button className="p" onClick={() => terminerListe(r, false)} title="Remettre le compte à faire">Rouvrir</button>}
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={9}>{onglet === 'termine' ? 'Aucun compte terminé pour le moment.' : 'Aucun résultat.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={pageActive} pages={pages} total={list.length} debut={debut} nbAffiches={visible.length}
                  parPage={parPage} onPage={setPage} onParPage={setParPage} />
      </div>
      )}
      </div>

      {showImports && <Imports onClose={() => setShowImports(false)} />}
      {sel && <Detail compte={sel} role={utilisateur.role} onClose={() => setSel(null)} onTravail={onTravail} />}
      {aTerminer && (
        <ConfirmerFin compte={aTerminer.compte_client} nom={aTerminer.nom_client}
                      nbLignes={travail[aTerminer.compte_client]?.[0] ?? aTerminer.nb_operations} occupe={finEnCours}
                      onConfirmer={() => terminerListe(aTerminer, true)} onAnnuler={() => setATerminer(null)} />
      )}
    </div>
    </div>
  );
}
