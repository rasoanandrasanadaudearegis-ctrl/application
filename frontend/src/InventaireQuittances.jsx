import { useCallback, useEffect, useRef, useState } from 'react';
import { envoyer } from './auth';
import { Confirmation, Modale } from './Modale';
import { notifier } from './notifier';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT } from './paginer';


const TRANCHES = [
  { cle: 'an', titre: "Plus d'un an", classe: 't-an' },
  { cle: 'm3p', titre: 'Plus de 3 mois', classe: 't-m3p' },
  { cle: 'm3m', titre: 'Moins de 3 mois', classe: 't-m3m' },
];
const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const montant = (v) => nf.format(v);
const acompte = (v) => (v < 0 ? <span className="neg">({nf.format(Math.abs(v))})</span> : nf.format(v));
const fdate = (d) => (d ? d.split('-').reverse().join('/') : '');
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (ymd) => {
  const [a, m, j] = ymd.split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const VIDE = { numero_assure: '', assure: '', apporteur: '', police: '', quittance: '', date_effet: '', echeance: '',
  prime: '', acompte: '', observations: '', actions: '' };

export default function InventaireQuittances({ api }) {
  const [arrete, setArrete] = useState(aujourdhui());
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [edition, setEdition] = useState(null);
  const [erreurForm, setErreurForm] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);

  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const [chargement, setChargement] = useState(false);
  const requete = useRef(null);

  const charger = useCallback(() => {
    requete.current?.abort();
    const ctrl = new AbortController();
    requete.current = ctrl;
    setChargement(true);
    const url = `${api}?action=quittances&arrete=${encodeURIComponent(arrete)}&q=${encodeURIComponent(q)}`
      + `&page=${page}&par_page=${parPage}`;
    return fetch(url, { signal: ctrl.signal }).then((r) => r.json()).then((d) => {
      if (d.error) { notifier('erreur', d.error); return; }
      setData(d);
      if (d.page !== page) setPage(d.page);
    }).catch((e) => {
      if (e.name !== 'AbortError') notifier('erreur', 'Impossible de joindre le serveur');
    }).finally(() => { if (requete.current === ctrl) setChargement(false); });
  }, [api, arrete, q, page, parPage]);

  useEffect(() => { setPage(1); }, [arrete, q, parPage]);

  useEffect(() => {
    const t = setTimeout(charger, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [charger, q]);

  useEffect(() => () => requete.current?.abort(), []);

  const exporter = async () => {
    setOccupe(true); setMsg('Génération du fichier Excel en cours… (quelques secondes pour un grand état, ne ferme pas la page)');
    try {
      const r = await fetch(`${api}?action=quittances_export&arrete=${encodeURIComponent(arrete)}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erreur ${r.status}`);
      }
      if (!(r.headers.get('Content-Type') || '').includes('spreadsheetml')) {
        const txt = await r.text().catch(() => '');
        let err = ''; try { err = JSON.parse(txt).error; } catch { }
        throw new Error(err || 'le serveur n\'a pas renvoyé de fichier Excel (voir le journal d\'erreurs PHP)');
      }
      const nom = /filename="?([^";]+)"?/.exec(r.headers.get('Content-Disposition') || '')?.[1]
        || `INVENTAIRE_QUITTANCES_${arrete}.xlsx`;
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: nom });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      notifier('ok', `Export Excel généré : situation arrêtée au ${dateLongue(arrete)}.`);
    } catch (e) {
      notifier('erreur', `Export impossible : ${e.message}`);
    } finally { setOccupe(false); setMsg(''); }
  };

  const enregistrer = async () => {
    setErreurForm('');
    setEnvoi(true);
    const r = await envoyer({ action: 'quittance_enregistrer', ...edition })
      .catch(() => ({ error: 'Impossible de joindre le serveur' }));
    setEnvoi(false);
    if (r.error) { setErreurForm(r.error); return; }
    setEdition(null);
    notifier('ok', edition.id ? 'Quittance modifiée.' : 'Quittance ajoutée.');
    charger();
  };

  const supprimer = async (l) => {
    setEnvoi(true);
    const r = await envoyer({ action: 'quittance_supprimer', id: l.id })
      .catch(() => ({ error: 'Impossible de joindre le serveur' }));
    setEnvoi(false);
    setASupprimer(null);
    if (r.error) { notifier('erreur', r.error); return; }
    notifier('ok', `Quittance ${l.quit || ''} de ${l.assure} supprimée.`);
    charger();
  };

  const ouvrirEdition = (l) => setEdition(l ? {
    id: l.id, numero_assure: l.na ?? '', assure: l.assure, apporteur: l.ap ?? '', police: l.police ?? '', quittance: l.quit ?? '',
    date_effet: l.effet, echeance: l.ech ?? '', prime: l.prime, acompte: l.acompte, observations: l.obs ?? '', actions: l.act ?? '',
  } : { ...VIDE });
  const champ = (k) => ({ value: edition[k], onChange: (e) => setEdition({ ...edition, [k]: e.target.value }) });

  const lignes = data?.lignes || [];
  const total = data?.total ?? 0;
  const tot = data?.totaux;
  const soldeTotal = tot ? TRANCHES.reduce((a, t) => a + tot[t.cle].prime + tot[t.cle].acompte, 0) : 0;

  return (
    <div className="page">
      <div className="bar">
        <label className="champ-date">Situation arrêtée au{' '}
          <input type="date" value={arrete} onChange={(e) => e.target.value && setArrete(e.target.value)} />
        </label>
        <input type="search" placeholder="Rechercher : assuré, police, quittance, observations…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <button className="p on" disabled={occupe} onClick={exporter}>Exporter en Excel</button>
        <button className="p" disabled={occupe} onClick={() => { setErreurForm(''); ouvrirEdition(null); }}>Ajouter une quittance</button>
      </div>

      {msg && <div className="note">{msg}</div>}

      <div className="sub" style={{ margin: '4px 0 8px' }}>
        <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
          <b style={{ fontSize: 16 }}>ETAT D'INVENTAIRE PHYSIQUE DES QUITTANCES</b><br />
          <b>Situation arrêtée au {dateLongue(arrete).replace(/^(\d+) (\p{L})/u, (_, j, c) => `${j} ${c.toUpperCase()}`)}</b><br />
          <b>Agence 32 - TOLIARA</b>
        </div>
        {data && <div style={{ marginTop: 6 }}>{data.total.toLocaleString('fr-FR')} quittance(s){q && ' (recherche)'}</div>}
      </div>


      <div className="tw" style={chargement && data ? { opacity: 0.6 } : undefined}>
        <table className="inv">
          <thead>
            <tr>
              <th rowSpan={2}>N° assuré</th><th rowSpan={2}>Assurés</th><th rowSpan={2}>N° apporteur</th>
              <th rowSpan={2}>N° police</th><th rowSpan={2}>N° quittance</th>
              <th className="grp debut-grp" colSpan={2}>Date</th>
              {TRANCHES.map((t) => <th key={t.cle} className={`grp debut-grp ${t.classe}`} colSpan={2}>{t.titre}</th>)}
              <th className="debut-grp" rowSpan={2}>Solde</th><th rowSpan={2}>Observations</th><th rowSpan={2}>Actions</th>
              <th rowSpan={2}></th>
            </tr>
            <tr>
              <th className="debut-grp">Effet</th><th>Échéance</th>
              {TRANCHES.map((t) => [
                <th key={t.cle + 'p'} className={`debut-grp ${t.classe}`}>Prime</th>, <th key={t.cle + 'a'} className={t.classe}>Acompte</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id}>
                <td className="c">{/^\d+$/.test(l.na || '') ? l.na.padStart(5, '0') : l.na}</td>
                <td className="l" title={l.assure}>{l.assure}</td>
                <td className="c">{l.ap}</td><td className="c">{l.police}</td><td className="c">{l.quit}</td>
                <td className="c debut-grp">{fdate(l.effet)}</td><td className="c">{fdate(l.ech)}</td>
                {TRANCHES.map((t) => [
                  <td key={t.cle + 'p'} className="n debut-grp">{l.tranche === t.cle && l.prime !== 0 ? montant(l.prime) : ''}</td>,
                  <td key={t.cle + 'a'} className="n">{l.tranche === t.cle && l.acompte !== 0 ? acompte(l.acompte) : ''}</td>,
                ])}
                <td className="n debut-grp">{montant(l.prime + l.acompte)}</td>
                <td className="l obs" title={l.obs || ''}>{l.obs}</td>
                <td className="l obs" title={l.act || ''}>{l.act}</td>
                <td className="actions">
                  <button className="p modifier" onClick={() => { setErreurForm(''); ouvrirEdition(l); }}>Modifier</button>{' '}
                  <button className="p supprimer" onClick={() => setASupprimer(l)}>Supprimer</button>
                </td>
              </tr>
            ))}
            {data && !lignes.length && (
              <tr><td colSpan={17}>Aucune quittance avec une date d'effet antérieure ou égale au {dateLongue(arrete)}.
                Importe un RCC (onglet Import RCC) ou ajoute une quittance.</td></tr>
            )}
            {!data && <tr><td colSpan={17}>Chargement…</td></tr>}
          </tbody>
          {tot && total > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} className="n">TOTAUX (toutes les pages)</td><td colSpan={2} className="debut-grp"></td>
                {TRANCHES.map((t) => [
                  <td key={t.cle + 'p'} className="n debut-grp">{montant(tot[t.cle].prime)}</td>,
                  <td key={t.cle + 'a'} className="n">{acompte(tot[t.cle].acompte)}</td>,
                ])}
                <td className="n debut-grp">{montant(soldeTotal)}</td><td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>


      {data && (
        <Pagination page={data.page - 1} pages={data.pages} total={total} debut={(data.page - 1) * data.par_page}
                    nbAffiches={lignes.length} parPage={parPage} occupe={chargement}
                    onPage={(i) => setPage(i + 1)} onParPage={setParPage} />
      )}

      {edition && (
        <Modale titre={edition.id ? 'Modifier la quittance' : 'Ajouter une quittance'} fermable={!envoi}
                sousTitre="Les champs marqués * sont obligatoires." onClose={() => setEdition(null)}
                pied={(
                  <>
                    <button className="p" disabled={envoi} onClick={() => setEdition(null)}>Annuler</button>
                    <button className="p on" disabled={envoi} onClick={enregistrer}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
                  </>
                )}>
            <div className="form-grille">
              <label>N° assuré<input type="text" {...champ('numero_assure')} /></label>
              <label>Assuré *<input type="text" {...champ('assure')} /></label>
              <label>Apporteur<input type="text" {...champ('apporteur')} /></label>
              <label>Police<input type="text" {...champ('police')} /></label>
              <label>N° quittance<input type="text" {...champ('quittance')} /></label>
              <label>Date d'effet *<input type="date" {...champ('date_effet')} /></label>
              <label>Échéance<input type="date" {...champ('echeance')} /></label>
              <label>Prime<input type="text" inputMode="decimal" {...champ('prime')} /></label>
              <label>Acompte (négatif si versé)<input type="text" inputMode="decimal" {...champ('acompte')} /></label>
              <label className="large">Observations<input type="text" {...champ('observations')} /></label>
              <label className="large">Actions<input type="text" {...champ('actions')} /></label>
            </div>
            {erreurForm && <div className="err-form">{erreurForm}</div>}
        </Modale>
      )}

      {aSupprimer && (
        <Confirmation titre={`Supprimer la quittance ${aSupprimer.quit || ''} ?`}
                      sousTitre={`${aSupprimer.assure} · effet ${fdate(aSupprimer.effet)}`}
                      alerte="Cette action est définitive." occupe={envoi}
                      onConfirmer={() => supprimer(aSupprimer)} onAnnuler={() => setASupprimer(null)}>
          <p style={{ margin: '0 0 12px' }}>La quittance sera retirée de l'état d'inventaire et de l'export Excel.</p>
        </Confirmation>
      )}
    </div>
  );
}
