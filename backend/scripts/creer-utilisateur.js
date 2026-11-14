import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { ROLES_UTILISATEUR } from '../src/auth.js';
import { lg } from '../src/util.js';

const a = process.argv.slice(2);
const quitter = async (msg, code = 1) => { (code === 0 ? console.log : console.error)(msg); await pool.end(); process.exit(code); };

if (a.length < 2) {
  await quitter(`Usage :\n  npm run user -- <identifiant> <role> "<Nom affiche>" <mot_de_passe_provisoire>\n`
    + `  npm run user -- <identifiant> --desactiver\nRoles : ${ROLES_UTILISATEUR.join(', ')}`);
}
const ident = a[0].trim();
if (!/^[A-Za-z0-9._-]{3,50}$/.test(ident)) await quitter('Identifiant invalide : 3 à 50 caractères (lettres, chiffres, . _ -), sans espace ni accent.');

if (a[1] === '--desactiver') {
  const r = await pool.query('UPDATE utilisateurs SET actif = false WHERE lower(identifiant) = lower($1)', [ident]);
  await quitter(r.rowCount ? `Compte « ${ident} » désactivé (il ne peut plus se connecter).` : `Aucun compte « ${ident} ».`, r.rowCount ? 0 : 1);
}
if (a.length < 4) await quitter('Il manque des arguments : <identifiant> <role> "<Nom affiche>" <mot_de_passe_provisoire>');
const role = a[1].toLowerCase().trim(), nom = a[2].trim(), mdp = a[3];
if (!ROLES_UTILISATEUR.includes(role)) await quitter(`Rôle invalide. Choisis : ${ROLES_UTILISATEUR.join(', ')}`);
if (nom === '' || lg(nom) > 100) await quitter('Le nom affiché est vide ou trop long.');
if (lg(mdp) < 8) await quitter('Le mot de passe provisoire doit faire au moins 8 caractères.');

const r = await pool.query(
  `INSERT INTO utilisateurs (identifiant, nom_affiche, role, mot_de_passe, mdp_provisoire, actif)
   VALUES ($1, $2, $3, $4, true, true)
   ON CONFLICT (lower(identifiant)) DO UPDATE SET nom_affiche = EXCLUDED.nom_affiche, role = EXCLUDED.role,
     mot_de_passe = EXCLUDED.mot_de_passe, mdp_provisoire = true, actif = true, echecs = 0, bloque_jusqua = NULL
   RETURNING (xmax = 0) AS cree`, [ident, nom, role, await bcrypt.hash(mdp, 10)]);
await quitter(`${r.rows[0].cree ? 'Compte créé' : 'Compte réinitialisé'} : ${ident} (${role}) — ${nom}\n`
  + 'Mot de passe provisoire à communiquer : il devra être changé à la première connexion.', 0);
