import { useState } from 'react';
import './aide.css';

function Cmd({ children }) {
  const [ok, setOk] = useState(false);
  const copier = () => {
    navigator.clipboard?.writeText(children).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); });
  };
  return (
    <div className="aide-cmd">
      <code>{children}</code>
      <button type="button" onClick={copier}>{ok ? 'Copié ✓' : 'Copier'}</button>
    </div>
  );
}

const SECTIONS = [
  {
    id: 'install', titre: 'Installer l’application sur un nouvel ordinateur',
    contenu: (
      <>
        <p>L’application se compose d’un serveur <b>Node.js</b> (dossier <code>backend</code>), d’une base <b>PostgreSQL</b>{' '}
          et de l’interface web (dossier <code>frontend</code>).</p>
        <ol>
          <li><b>Installer Node.js</b> (version 18 ou plus récente) et <b>PostgreSQL</b>, puis créer une base <code>aro_rcc</code>.</li>
          <li>Dans le dossier <code>backend</code>, copier <code>.env.example</code> en <code>.env</code> et renseigner au moins{' '}
            <code>DATABASE_URL</code> et <code>SESSION_SECRET</code> (longue chaîne aléatoire).</li>
          <li>Toujours dans <code>backend</code>, installer les dépendances et créer les tables :
            <Cmd>{'npm install && npm run db:init'}</Cmd>
          </li>
          <li>Dans le dossier <code>frontend</code>, compiler l’interface :
            <Cmd>{'npm install && npm run build'}</Cmd>
          </li>
          <li>Créer au moins un compte <i>directeur</i> (section « Créer un utilisateur »).</li>
        </ol>
      </>
    ),
  },
  {
    id: 'jour', titre: 'Démarrer et arrêter l’application',
    contenu: (
      <>
        <ul>
          <li><b>Démarrer</b> : PostgreSQL doit tourner, puis dans le dossier <code>backend</code> :
            <Cmd>{'npm start'}</Cmd>
            L’application s’ouvre ensuite dans le navigateur à l’adresse <code>/aro-rcc-front/</code> du serveur.</li>
          <li><b>Arrêter</b> : <i>Ctrl + C</i> dans la fenêtre du serveur. Un import en cours au moment de l’arrêt est marqué « Erreur » au redémarrage : il suffit de le relancer.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'usage', titre: 'Utiliser l’application au quotidien',
    contenu: (
      <>
        <ul>
          <li><b>Import RCC</b> : charger le fichier Excel du relevé de compte client. Le nom de la feuille n’a pas d’importance : c’est la première feuille contenant toutes les colonnes attendues qui est importée. Les lignes déjà présentes ne sont pas dupliquées.</li>
          <li><b>Comptes clients</b> : soldes par compte. Ouvrir un compte, cocher chaque ligne lettrée, puis <i>Terminer</i> le compte.</li>
          <li><b>Anomalies</b> : lignes suspectes détectées à l’import, à valider, corriger ou supprimer.</li>
          <li><b>Factures et relevés</b> : dans le détail d’un compte, choisir les lignes puis imprimer. « Du / Au » reprend la date d’effet et l’échéance.</li>
          <li><b>Gros débiteurs</b> : comptes dont le solde atteint 500 000 Ar, avec observations et export Excel.</li>
          <li><b>Inventaire quittances</b> : inventaire arrêté à une date, exportable au format du modèle.</li>
          <li><b>Annuler un import</b> : dans l’onglet Import RCC, bouton Supprimer sur le dernier import.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sauve', titre: 'Sauvegarder les données et changer d’ordinateur',
    contenu: (
      <>
        <p><b>Sauvegarder</b> (idéalement chaque semaine) avec l’outil de PostgreSQL, puis copier le fichier sur une clé USB ou un lecteur réseau :</p>
        <Cmd>{'pg_dump -Fc -d aro_rcc -f sauvegarde_aro.dump'}</Cmd>
        <p><b>Changer d’ordinateur en gardant les données</b> :</p>
        <ol>
          <li>Ancien PC : faire une sauvegarde et la copier sur une clé.</li>
          <li>Nouveau PC : faire l’installation (première section).</li>
          <li>Nouveau PC : restaurer la sauvegarde :
            <Cmd>{'pg_restore --clean --if-exists -d aro_rcc sauvegarde_aro.dump'}</Cmd>
          </li>
        </ol>
        <p className="aide-note">La restauration remplace toutes les données actuelles de la base.</p>
      </>
    ),
  },
  {
    id: 'users', titre: 'Créer un utilisateur ou réinitialiser un mot de passe',
    contenu: (
      <>
        <p>Dans le dossier <code>backend</code>, lancer la commande en adaptant les valeurs (rôle : <code>directeur</code>, <code>comptable</code> ou <code>conseiller</code>) :</p>
        <Cmd>{'npm run user -- IDENTIFIANT comptable "NOM AFFICHE" MotDePasseProvisoire'}</Cmd>
        <p>Si l’identifiant existe déjà, son mot de passe est réinitialisé : la personne en choisira un nouveau à sa prochaine connexion.</p>
        <p>Pour désactiver un compte :</p>
        <Cmd>{'npm run user -- IDENTIFIANT --desactiver'}</Cmd>
      </>
    ),
  },
  {
    id: 'pb', titre: 'Problèmes fréquents',
    contenu: (
      <>
        <dl>
          <dt>« Impossible de joindre l’API » ou page blanche</dt>
          <dd>Le serveur n’est pas démarré (<code>npm start</code> dans <code>backend</code>) ou PostgreSQL est arrêté.
            Au démarrage, le message « Connexion PostgreSQL impossible » indique une erreur dans <code>DATABASE_URL</code> du fichier <code>.env</code>.</dd>
          <dt>Le serveur ne démarre pas : port déjà utilisé</dt>
          <dd>Un autre programme utilise le port du serveur. Changer <code>PORT</code> dans le fichier <code>.env</code> de <code>backend</code>, puis redémarrer.</dd>
          <dt>L’import d’un fichier RCC échoue</dt>
          <dd>Vérifier qu’une feuille du fichier contient bien toutes les colonnes attendues (le motif s’affiche dans la liste des imports).
            Pour un fichier très lourd, augmenter <code>UPLOAD_MAX_MB</code> dans le fichier <code>.env</code>, puis redémarrer le serveur.</dd>
          <dt>« Compte bloqué » à la connexion</dt>
          <dd>Après 5 échecs, le compte est bloqué quelques minutes. Attendre, ou réinitialiser le mot de passe (section « Créer un utilisateur »).</dd>
          <dt>Le logo ou le fond de la page de connexion ne s’affiche pas</dt>
          <dd>Ils viennent des fichiers <code>logo-aro.png</code> et <code>fond-connexion.jpg</code> du dossier <code>public</code> (avant compilation).</dd>
        </dl>
      </>
    ),
  },
];

export default function Aide({ onRetour }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const MOTS = {
    install: 'installer installation node postgresql nouvel ordinateur pc',
    jour: 'ouvrir fermer lancer arreter demarrer serveur',
    usage: 'import rcc comptes anomalies facture releve gros debiteurs inventaire lettrage',
    sauve: 'sauvegarde sauvegarder restaurer transfert changer ordinateur donnees usb pg_dump',
    users: 'utilisateur compte mot de passe oublie reinitialiser creer role',
    pb: 'probleme erreur api port serveur postgresql import bloque logo',
  };
  const visibles = SECTIONS.filter((s) => !t || `${s.titre} ${MOTS[s.id]}`.toLowerCase().includes(t));

  return (
    <div className="aide">
      <div className="aide-tete">
        <div>
          <h2>Aide et installation</h2>
        </div>
        {onRetour && <button className="p" onClick={onRetour}>← Accueil</button>}
      </div>
      <input className="aide-recherche" type="search" placeholder="Rechercher dans l’aide (ex. sauvegarde, mot de passe, port)…"
             value={q} onChange={(e) => setQ(e.target.value)} />
      {visibles.length === 0 && <p className="aide-vide">Aucune rubrique ne correspond à « {q} ».</p>}
      {visibles.map((s, i) => (
        <details key={s.id} className="aide-sec" style={{ '--i': i }} open={s.ouvert || !!t}>
          <summary>{s.titre}</summary>
          <div className="aide-corps">{s.contenu}</div>
        </details>
      ))}
    </div>
  );
}
