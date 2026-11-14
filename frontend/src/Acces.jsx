import { useCallback, useEffect, useState } from 'react';
import App from './App';
import Connexion from './Connexion';
import MotDePasse from './MotDePasse';
import Toasts from './Toasts';
import { API_URL, EVENT_SESSION_EXPIREE, envoyer } from './auth';

const ETAT_INITIAL = { charge: false, utilisateur: null, doitChanger: false, erreur: '', info: '' };

export default function Acces() {
  const [etat, setEtat] = useState(ETAT_INITIAL);




  

  const verifier = useCallback(() => {
    setEtat(ETAT_INITIAL);
    fetch(`${API_URL}?action=moi`)
      .then((r) => r.json())
      .then((d) => setEtat({ ...ETAT_INITIAL, charge: true, utilisateur: d.utilisateur || null, doitChanger: !!d.doit_changer }))
      .catch(() => setEtat({
        ...ETAT_INITIAL, charge: true,
        erreur: "Impossible de joindre le serveur. Vérifie qu'Apache et MySQL sont démarrés.",
      }));
  }, []);
  useEffect(() => { verifier(); }, [verifier]);

  useEffect(() => {
    const expiree = () => setEtat((e) => (e.utilisateur
      ? { ...ETAT_INITIAL, charge: true, info: 'Ta session a expiré : reconnecte-toi.' }
      : e));
    window.addEventListener(EVENT_SESSION_EXPIREE, expiree);
    return () => window.removeEventListener(EVENT_SESSION_EXPIREE, expiree);
  }, []);

  const deconnecter = async () => {
    await envoyer({ action: 'deconnexion' }).catch(() => {});
    setEtat({ ...ETAT_INITIAL, charge: true });
  };

  let contenu;
  if (!etat.charge) contenu = <div className="wrap">Chargement…</div>;
  else if (!etat.utilisateur) {
    contenu = (
      <Connexion info={etat.info} erreurServeur={etat.erreur} onReessayer={verifier}
                 onOk={(r) => setEtat({ ...ETAT_INITIAL, charge: true, utilisateur: r.utilisateur, doitChanger: !!r.doit_changer })} />
    );
  } else if (etat.doitChanger) {
    contenu = (
      <MotDePasse force onDeconnexion={deconnecter} onFait={() => setEtat((e) => ({ ...e, doitChanger: false }))} />
    );
  } else {
    contenu = <App utilisateur={etat.utilisateur} onDeconnexion={deconnecter} />;
  }
  return <>{contenu}<Toasts /></>;
}
