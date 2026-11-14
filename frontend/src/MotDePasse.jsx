import { useState } from 'react';
import { envoyer } from './auth';
import { Modale } from './Modale';
import { notifier } from './notifier';

export default function MotDePasse({ force = false, onFait, onFermer, onDeconnexion }) {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e) => {
    e.preventDefault();
    if (nouveau.length < 8) return setErreur('Le nouveau mot de passe doit faire au moins 8 caractères.');
    if (nouveau !== confirmation) return setErreur('Les deux nouveaux mots de passe sont différents.');
    setErreur('');
    setEnvoi(true);
    const r = await envoyer({ action: 'changer_mot_de_passe', ancien, nouveau })
      .catch(() => ({ error: 'Impossible de joindre le serveur' }));
    setEnvoi(false);
    if (r.error) setErreur(r.error);
    else { notifier('ok', 'Mot de passe modifié.'); onFait(); }
    return undefined;
  };

  const formulaire = (
    <form className="login-carte" style={{ boxShadow: 'none', border: 0, padding: 0 }} onSubmit={valider}>
      {force && <h2 style={{ margin: '0 0 6px' }}>Choisis ton mot de passe</h2>}
      {force && (
        <div className="sub">
          C'est ta première connexion : le mot de passe provisoire doit être remplacé par un mot de passe que toi seul(e) connais.
        </div>
      )}
      <label>
        {force ? 'Mot de passe provisoire' : 'Mot de passe actuel'}
        <input type="password" value={ancien} autoComplete="current-password" autoFocus
               onChange={(e) => setAncien(e.target.value)} />
      </label>
      <label>
        Nouveau mot de passe (8 caractères minimum)
        <input type="password" value={nouveau} autoComplete="new-password" onChange={(e) => setNouveau(e.target.value)} />
      </label>
      <label>
        Confirmer le nouveau mot de passe
        <input type="password" value={confirmation} autoComplete="new-password"
               onChange={(e) => setConfirmation(e.target.value)} />
      </label>
      {erreur && <div className={force ? 'err' : 'err-form'} style={force ? { padding: '4px 0' } : undefined}>{erreur}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {force
          ? <button type="button" className="p" onClick={onDeconnexion}>Se déconnecter</button>
          : <button type="button" className="p" onClick={onFermer}>Annuler</button>}
        <button className="p on" type="submit" disabled={envoi || !ancien || !nouveau || !confirmation}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );

  if (force) return <div className="login"><div className="login-carte">{formulaire}</div></div>;
  return (
    <Modale titre="Changer mon mot de passe" taille="etroite" fermable={!envoi} onClose={onFermer}>{formulaire}</Modale>
  );
}
