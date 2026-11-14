import { useState } from 'react';
import { Modale } from './Modale';
import { notifier } from './notifier';
import { SIGNATAIRES, DIRECTEUR } from './pdf/config.js';
import { genererFacture, genererReleve, ouvrirPdf, fmtAr, cinqChiffres, fdate } from './pdf/documents.js';
import { lignesInitiales, policesChoisies, verifier, construireDonnees } from './pdf/modele.js';

const lire = (cle, defaut) => {
  try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; }
};
const ecrire = (cle, valeur) => {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { }
};

export default function Impression({ mode, compte, ops, role, onClose }) {
  const facture = mode === 'facture';
  const [numero, setNumero] = useState('');
  const [agence, setAgence] = useState(() => lire('rcc_impression', {}).agence || '');
  const [signataire, setSignataire] = useState(() => (
    role === 'comptable' || role === 'conseiller' ? role : lire('rcc_impression', {}).signataire || 'comptable'));
  const [adresse, setAdresse] = useState(() => lire('rcc_adresses', {})[compte.compte_client] || '');
  const [lignes, setLignes] = useState(() => lignesInitiales(mode, ops));
  const [des, setDes] = useState(() => lire('rcc_designations', {}));
  const [erreur, setErreur] = useState('');

  const maj = (i, patch) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const toutCocher = (v) => setLignes((ls) => ls.map((l) => ({ ...l, sel: v })));

  const choisies = lignes.filter((l) => l.sel);
  const polices = policesChoisies(lignes);
  const problemes = verifier({ numero, agence, lignes, des });
  const annee = new Date().getFullYear();
  const sig = SIGNATAIRES[signataire];
  const c5 = cinqChiffres(compte.compte_client);
  const totalD = choisies.reduce((a, l) => a + l.deb, 0);
  const totalC = choisies.reduce((a, l) => a + l.cre, 0);
  const reference = `${facture ? 'FACTURE' : 'RELEVE'} N° ${numero.trim() || '…'} / ${annee} / ${DIRECTEUR.initiales}${facture ? '-' : '/'}${sig.ref}`;

  const generer = () => {
    try {
      const doc = construireDonnees({ numero, agence, signataire, adresse, lignes, des }, compte);
      const octets = facture ? genererFacture(doc) : genererReleve(doc);
      ecrire('rcc_impression', { agence: agence.trim(), signataire });
      ecrire('rcc_adresses', { ...lire('rcc_adresses', {}), [compte.compte_client]: adresse });
      ecrire('rcc_designations', {
        ...lire('rcc_designations', {}),
        ...Object.fromEntries(polices.map((p) => [p, (des[p] || '').trim()])),
      });
      const nomPdf = `${facture ? 'Facture' : 'Releve'}_${doc.numero}-${annee}_${c5}.pdf`;
      ouvrirPdf(octets, nomPdf);
      setErreur('');
      notifier('ok', `PDF généré : ${nomPdf}`);
    } catch (e) {
      setErreur(String(e.message || e));
    }
  };

  return (
    <Modale taille="large" titre={facture ? 'Imprimer la facture' : 'Imprimer le relevé'} onClose={onClose}
            sousTitre={`${compte.nom_client || '(sans nom)'} · compte ${compte.compte_client} (imprimé « ${c5} »)`}
            pied={(
              <>
                <button className="p" onClick={onClose}>Annuler</button>
                <button className="p on" disabled={problemes.length > 0} onClick={generer}>
                  Générer le PDF {facture ? 'de la facture' : 'du relevé'}
                </button>
              </>
            )}>

        <div className="frm">
          <label>
            Numéro {facture ? 'de la facture' : 'du relevé'}
            <input type="text" value={numero} placeholder="ex. 114" onChange={(e) => setNumero(e.target.value)} />
          </label>
          <label>
            Agence
            <input type="text" value={agence} placeholder="ex. 70" onChange={(e) => setAgence(e.target.value)} />
          </label>
          <label>
            Établi par
            <select value={signataire} onChange={(e) => setSignataire(e.target.value)}>
              {Object.entries(SIGNATAIRES).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}
            </select>
          </label>
          <label className="large">
            Adresse du client (une ligne par ligne, facultatif — ex. « - 602 - TOLIARA », NIF, STAT…)
            <textarea rows={3} value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
        </div>

        <div className="bar" style={{ marginBottom: 6 }}>
          <b>{facture ? 'Primes à facturer' : 'Lignes du relevé'}</b>
          <button className="p" onClick={() => toutCocher(true)}>Tout cocher</button>
          <button className="p" onClick={() => toutCocher(false)}>Tout décocher</button>
          <span className="sub" style={{ margin: 0 }}>
            Les lignes à 0 ne sont pas proposées. « Du / Au » : début = date d'effet, fin = échéance du RCC (si elle est vide : effet +1 an, à vérifier).
          </span>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th />
                <th>Pièce</th><th>Date</th><th>Libellé RCC</th><th>Police</th><th>Quittance</th><th>Période du</th><th>au</th>
                {facture ? <th className="n">Montant TTC</th> : <><th className="n">Débit</th><th className="n">Crédit</th><th>Mention</th><th>Observation (crédit)</th></>}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} style={l.sel ? undefined : { opacity: 0.5 }}>
                  <td><input type="checkbox" checked={l.sel} onChange={(e) => maj(i, { sel: e.target.checked })} /></td>
                  <td title={l.pc}>{l.pc}</td>
                  <td>{fdate(l.date)}</td>
                  <td className="l" title={l.l}>{l.l}</td>
                  <td>{l.p}</td>
                  <td>{l.q}</td>
                  <td><input type="date" value={l.e} onChange={(e) => maj(i, { e: e.target.value })} /></td>
                  <td><input type="date" value={l.fin} onChange={(e) => maj(i, { fin: e.target.value })} /></td>
                  {facture ? (
                    <td className="n">{fmtAr(l.deb)}</td>
                  ) : (
                    <>
                      <td className="n">{l.deb ? fmtAr(l.deb) : ''}</td>
                      <td className="n">{l.cre ? fmtAr(l.cre) : ''}</td>
                      <td>
                        <input type="text" className="mini" value={l.mention} placeholder="ex. CP, Résiliation"
                               onChange={(e) => maj(i, { mention: e.target.value })} />
                      </td>
                      <td>
                        {l.cre > 0 && (
                          <textarea className="obs" rows={3} value={l.observation || ''}
                                    placeholder={'partie CHQ BFV\n37731994\nR047300'}
                                    onChange={(e) => maj(i, { observation: e.target.value })} />
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr><td colSpan={11}>Aucune ligne {facture ? 'au débit' : ''} sur ce compte.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {polices.length > 0 && (
          <>
            <div className="bar" style={{ margin: '14px 0 6px' }}><b>Désignation de la police</b></div>
            <div className="frm">
              {polices.map((p) => (
                <label key={p}>
                  Police {p || '(sans numéro)'}
                  <input type="text" value={des[p] || ''} placeholder="ex. MOTO BMW N° 8136TCA"
                         onChange={(e) => setDes((d) => ({ ...d, [p]: e.target.value }))} />
                </label>
              ))}
            </div>
          </>
        )}

        <div className="sub" style={{ marginTop: 12, marginBottom: 6 }}>
          {reference} · Toliara, le jour de l'impression ·{' '}
          {facture
            ? <>total TTC <b>{fmtAr(totalD)}</b> Ar</>
            : <>débit {fmtAr(totalD)} · crédit {fmtAr(totalC)} · solde <b>{fmtAr(totalD - totalC)}</b> Ar</>}
        </div>
        {problemes.length > 0 && <div className="sub">À compléter : {problemes.join(' · ')}</div>}
        {erreur && <div className="err-form">Erreur : {erreur}</div>}
    </Modale>
  );
}
