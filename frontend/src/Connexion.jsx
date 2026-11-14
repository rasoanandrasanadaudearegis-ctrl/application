import { useState } from 'react';
import { envoyer } from './auth';
import Logo from './Logo';

export default function Connexion({ info, erreurServeur, onOk, onReessayer }) {
  const [identifiant, setIdentifiant] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    const r = await envoyer({ action: 'connexion', identifiant: identifiant.trim(), mot_de_passe: mdp })
      .catch(() => ({ error: 'Impossible de joindre le serveur' }));
    setEnvoi(false);
    if (r.error) {
      setErreur(r.error);
      setMdp('');
    } else {
      onOk(r);
    }
  };

  return (
    <div className="login" style={{ '--fond-connexion': `url(${import.meta.env.BASE_URL}fond-connexion.jpg)` }}>
      <form className="login-carte" onSubmit={soumettre}>
        <div className="login-marque">
          <Logo />
          <h1>ASSURANCES ARO</h1>
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>Suivi du portefeuille clients — connexion</div>

        {info && <div className="note">{info}</div>}
        {erreurServeur && (
          <div className="err" style={{ padding: '8px 0' }}>
            {erreurServeur} <button type="button" className="p" onClick={onReessayer}>Réessayer</button>
          </div>
        )}

        <label>
          Identifiant
          <input type="text" value={identifiant} autoFocus autoComplete="username" autoCapitalize="none"
                 onChange={(e) => setIdentifiant(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input type="password" value={mdp} autoComplete="current-password"
                 onChange={(e) => setMdp(e.target.value)} />
        </label>
        {erreur && <div className="err" style={{ padding: '4px 0' }}>{erreur}</div>}
        <button className="p on" type="submit" disabled={envoi || !identifiant.trim() || !mdp}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
