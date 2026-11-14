import './accueil.css';

const ICONES = {
  comptes: <path d="M3 7h18M3 12h18M3 17h18" />,
  anomalies: <path d="M12 3 2 20h20L12 3zm0 6v5m0 3v.5" />,
  pertes: <path d="M3 17l6-6 4 4 8-9M15 6h6v6" />,
  import: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16" />,
  inventaire: <path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />,
  aide: <path d="M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8M12 17.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
  gros: <path d="M12 2v20M17 6.5C17 4.5 14.8 4 12 4S7 5 7 7.5 9 11 12 12s5 1.8 5 4.5S14.8 20 12 20s-5-.7-5-3" />,
};

const ICONES_KPI = {
  comptes: <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" />,
  afaire: <path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
  termines: <path d="M8 12.5l3 3 5-6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
  solde: <path d="M3 7h18v12H3zM3 11h18M7 15h3" />,
};

const CARTES = [
  { id: 'comptes', titre: 'Comptes clients', texte: 'Soldes par compte, détail des opérations et lettrage.' },
  { id: 'anomalies', titre: 'Anomalies', texte: 'Lignes suspectes détectées à l\u2019import : valider, corriger ou supprimer.' },
  { id: 'pertes', titre: 'Pertes et profits', texte: 'Comptes à passer en pertes et profits.' },
  { id: 'import', titre: 'Import RCC', texte: 'Charger un fichier Excel du relevé de compte client.' },
  { id: 'inventaire', titre: 'Inventaire quittances', texte: 'Inventaire physique arrêté à une date, export Excel.' },
  { id: 'gros', titre: 'Gros débiteurs', texte: 'Comptes dont le solde atteint le seuil, avec observations.' },
  { id: 'aide', titre: 'Aide et installation', texte: 'Installer sur un autre ordinateur, sauvegarder, dépanner.' },
];

function salutation() {
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

export default function Accueil({ nom, nbComptes, nbAFaire, nbTermine, totalSolde, onGo }) {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean);
  const prenom = mots.length > 1 ? mots[1] : mots[0] || '';

  return (
    <div className="acc">
      <section className="acc-hero">
        <div className="acc-hero-txt">
          <p className="acc-salut">{salutation()}{prenom ? `, ${prenom}` : ''}</p>
          <h2>Suivi du portefeuille clients</h2>
        </div>
      </section>

      <section className="acc-kpis">
        {[
          { cle: 'comptes', libelle: 'Comptes clients', valeur: nbComptes.toLocaleString('fr-FR') },
          { cle: 'afaire', libelle: 'À lettrer', valeur: nbAFaire.toLocaleString('fr-FR'), cls: 'due' },
          { cle: 'termines', libelle: 'Terminés', valeur: nbTermine.toLocaleString('fr-FR'), cls: 'ok' },
          { cle: 'solde', libelle: 'Total des soldes', valeur: <>{totalSolde} <em>Ar</em></>, cls: 'acc-ar' },
        ].map((k) => (
          <div key={k.cle} className={`acc-kpi ${k.cls || ''}`}>
            <svg viewBox="0 0 24 24" className="acc-kpi-ico" aria-hidden="true">{ICONES_KPI[k.cle]}</svg>
            <div>
              <small>{k.libelle}</small>
              <b>{k.valeur}</b>
            </div>
          </div>
        ))}
      </section>

      <section className="acc-grille">
        {CARTES.map((c) => (
          <button key={c.id} className="acc-carte" onClick={() => onGo(c.id)}>
            <svg viewBox="0 0 24 24" className="acc-ico" aria-hidden="true">{ICONES[c.id]}</svg>
            <strong>{c.titre}</strong>
            <span>{c.texte}</span>
            <i className="acc-fleche">→</i>
          </button>
        ))}
      </section>
    </div>
  );
}
