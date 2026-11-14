import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENT_SESSION_EXPIREE, ROLES_SUPPRESSION_IMPORT } from './auth';
import { Confirmation } from './Modale';
import { notifier } from './notifier';
import Pagination from './Pagination';
import { PAR_PAGE_DEFAUT, paginer } from './paginer';

const STATUT = {
  en_cours: { label: 'En cours', cls: 'unk' },
  termine: { label: 'Terminé', cls: 'ok' },
  erreur: { label: 'Erreur', cls: 'due' },
};
const COLONNES = ['Id', 'Pieces', 'Comptes Client', 'Nom Client', 'Date', 'Journal', 'Libelle', 'Police', 'Effet',
  'Quittance', 'Période', 'Débit', 'Crédit'];
const nb = (n) => Number(n || 0).toLocaleString('fr-FR');
const fdt = (s) => {
  if (!s) return '';
  const [d, h] = s.split(' ');
  return `${d.split('-').reverse().join('/')} ${(h || '').slice(0, 5)}`;
};

function resume(i) {
  if (i.statut === 'erreur') return i.message || 'Erreur inconnue';
  if (i.statut !== 'termine' || !i.message) return '';
  try {
    const m = JSON.parse(i.message);
    const parts = [];
    if (m.feuille) parts.push(`Feuille « ${m.feuille} »`);
    if (m.avertissement) parts.push(`Contrôles non lancés : ${m.avertissement}`);
    else {
      const n = Object.values(m.anomalies || {}).reduce((a, b) => a + Number(b), 0);
      parts.push(`${nb(n)} ligne(s) d'anomalie à vérifier`);
    }
    if (m.avertissement_inventaire) parts.push(`Inventaire des quittances NON lancé : ${m.avertissement_inventaire}`);
    else if (m.inventaire) {
      parts.push(`Inventaire : ${nb(m.inventaire.lues)} quittance(s) reprises (${nb(m.inventaire.nouvelles)} nouvelles, `
        + `${nb(m.inventaire.mises_a_jour)} mises à jour, ${nb(m.inventaire.retirees)} retirées)`);
    }
    return parts.join(' — ');
  } catch { return ''; }
}

export default function ImportRCC({ api, onDone, role }) {
  const [file, setFile] = useState(null);
  const [force, setForce] = useState(false);
  const [up, setUp] = useState(null);
  const [list, setList] = useState([]);
  const enCoursAvant = useRef(false);
  const champFichier = useRef(null);
  const [page, setPage] = useState(0);
  const [parPage, setParPage] = useState(PAR_PAGE_DEFAUT);
  const [aConfirmer, setAConfirmer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const load = useCallback(() =>
    fetch(`${api}?action=imports`).then((r) => r.json()).then((d) => {
      if (!Array.isArray(d)) return;
      setList(d);
      const tourne = d.some((i) => i.statut === 'en_cours');
      if (enCoursAvant.current && !tourne) {
        const fini = d[0];
        if (fini?.statut === 'termine') notifier('ok', `Import n° ${fini.id} terminé : ${nb(fini.lignes_lues)} ligne(s) lue(s).`);
        else if (fini?.statut === 'erreur') notifier('erreur', `Import n° ${fini.id} en erreur : voir le résumé dans la liste.`);
        onDone();
      }
      enCoursAvant.current = tourne;
    }).catch(() => {}), [api, onDone]);

  useEffect(() => { load(); }, [load]);
  const tourne = list.some((i) => i.statut === 'en_cours');
  const pg = paginer(list, page, parPage);
  useEffect(() => {
    if (!tourne) return undefined;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [tourne, load]);

  const envoyer = () => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${api}?action=importer`);
    x.upload.onprogress = (e) => e.lengthComputable && setUp(Math.round((100 * e.loaded) / e.total));
    x.onload = () => {
      if (x.status === 401) window.dispatchEvent(new Event(EVENT_SESSION_EXPIREE));
      try { resolve(JSON.parse(x.responseText)); } catch { reject(new Error('Réponse invalide du serveur')); } };
    x.onerror = () => reject(new Error("Envoi impossible : vérifie que le serveur tourne"));
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('force', force ? '1' : '0');
    x.send(fd);
  });

  const dernierTermine = Math.max(0, ...list.filter((i) => i.statut === 'termine').map((i) => Number(i.id)));
  const peutSupprimer = ROLES_SUPPRESSION_IMPORT.includes(role);
  const supprimable = (i) => i.statut === 'erreur' || (i.statut === 'termine' && Number(i.id) === dernierTermine);

  const supprimer = async (i) => {
    setSuppression(true);
    try {
      const r = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'supprimer_import', id: i.id }),
      }).then((x) => x.json());
      if (r.error) notifier('erreur', r.error);
      else {
        notifier('ok', i.statut === 'termine'
          ? `Import n° ${i.id} supprimé : ${nb(r.supprimees)} ligne(s) retirée(s), ${nb(r.restaurees)} remise(s) en attente.`
          : `Import n° ${i.id} retiré de la liste.`);
        onDone();
      }
    } catch (e) { notifier('erreur', String(e.message || e)); }
    setSuppression(false);
    setAConfirmer(null);
    load();
  };

  const lancer = async () => {
    if (!file) return notifier('erreur', 'Choisis un fichier .xlsx');
    try {
      setUp(0);
      const r = await envoyer();
      if (r.error) notifier('erreur', r.error);
      else { notifier('info', 'Fichier envoyé, import lancé…'); setFile(null); if (champFichier.current) champFichier.current.value = ''; enCoursAvant.current = true; }
    } catch (e) { notifier('erreur', e.message); }
    setUp(null);
    load();
  };

  return (
    <div className="page">
      <details className="sub">
        <summary>Colonnes attendues dans le fichier</summary>
        <p style={{ margin: '6px 0 0' }}>
          {COLONNES.map((c, i) => (
            <span key={c}>{i > 0 && ' · '}<b>{c}</b></span>
          ))}
          {' '}— facultatives : Echeance · code_apporteur (laissées vides si absentes) ; Solde/Police · Solde (recalculées par l'application).
          Le nom de la feuille n'a pas d'importance : l'import prend la première feuille (dans l'ordre des onglets) qui contient toutes les colonnes obligatoires.
          L'ordre des colonnes n'a pas d'importance non plus ; si aucune feuille ne convient, l'import est refusé et le motif s'affiche dans la liste ci-dessous.
        </p>
      </details>

      <div className="bar">
        <label className={`choix-fichier${tourne || up !== null ? ' inactif' : ''}`}>
          <input ref={champFichier} type="file" accept=".xlsx" disabled={tourne || up !== null}
                 onChange={(e) => setFile(e.target.files[0] || null)} />
          <span className="choix-bouton">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
            </svg>
            Choisir un fichier
          </span>
          <span className={`choix-nom${file ? ' choisi' : ''}`} title={file?.name}>{file ? file.name : 'Aucun fichier choisi'}</span>
        </label>
        <label title="À utiliser seulement si le fichier est volontairement partiel">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Forcer
        </label>
        <button className="p on" disabled={tourne || up !== null} onClick={lancer}>Importer</button>
      </div>

      {up !== null && <div className="note">Envoi du fichier : {up} %</div>}

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Fichier</th><th>Utilisateur</th><th>Statut</th>
              <th className="n">Lues</th><th className="n">Nouvelles</th><th className="n">Déjà en base</th>
              <th className="n">Rejetées</th><th className="n">Lettrées</th><th>Résumé</th>{peutSupprimer && <th />}
            </tr>
          </thead>
          <tbody>
            {!list.length && <tr><td colSpan={12}>Aucun import pour le moment.</td></tr>}
            {pg.visibles.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{fdt(i.date_import)}</td>
                <td className="l" title={i.nom_fichier}>{i.nom_fichier}</td>
                <td>{i.utilisateur}</td>
                <td>
                  <span className={`badge ${STATUT[i.statut].cls}`}>{STATUT[i.statut].label}</span>
                  {i.statut === 'en_cours' && <> <progress max="100" value={i.progression || 0} /> {i.progression || 0} %</>}
                </td>
                <td className="n">{nb(i.statut === 'en_cours' ? i.lues_en_cours : i.lignes_lues)}</td>
                <td className="n">{nb(i.lignes_nouvelles)}</td>
                <td className="n">{nb(i.lignes_existantes)}</td>
                <td className="n">{nb(i.lignes_anomalies)}</td>
                <td className="n">{nb(i.lignes_lettrees)}</td>
                <td className="resume" title={resume(i)}><span>{resume(i)}</span></td>
                {peutSupprimer && (
                  <td>
                    <button className="p supprimer" disabled={!supprimable(i) || tourne}
                            title={supprimable(i) ? 'Supprimer cet import' : i.statut === 'en_cours' ? 'Import en cours' : 'Seul le dernier import peut être supprimé'}
                            onClick={() => setAConfirmer(i)}>
                      Supprimer
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pg.page} pages={pg.pages} total={list.length} debut={pg.debut} nbAffiches={pg.visibles.length}
                  parPage={parPage} onPage={setPage} onParPage={(n) => { setParPage(n); setPage(0); }} />

      {aConfirmer && (
        <Confirmation
          titre={aConfirmer.statut === 'termine' ? `Supprimer l'import n° ${aConfirmer.id} ?` : `Retirer l'import n° ${aConfirmer.id} ?`}
          sousTitre={aConfirmer.nom_fichier}
          alerte={aConfirmer.statut === 'termine' ? 'Cette action est irréversible.' : null}
          libelle={aConfirmer.statut === 'termine' ? 'Supprimer' : 'Retirer'}
          occupe={suppression}
          onConfirmer={() => supprimer(aConfirmer)}
          onAnnuler={() => setAConfirmer(null)}>
          {aConfirmer.statut === 'termine' ? (
            <ul>
              <li>les <b>{nb(aConfirmer.lignes_nouvelles)}</b> ligne(s) qu'il a ajoutées seront supprimées ;</li>
              <li>les <b>{nb(aConfirmer.lignes_lettrees)}</b> ligne(s) qu'il avait marquées lettrées redeviendront en attente ;</li>
              <li>les anomalies seront recalculées.</li>
            </ul>
          ) : <p style={{ margin: 0 }}>Cet import est en erreur : il sera seulement retiré de la liste.</p>}
        </Confirmation>
      )}
    </div>
  );
}
