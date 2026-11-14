import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { pool, un, valeur } from './db.js';
import { fail, lg } from './util.js';

export const SESSION_NOM = 'RCCSESSID';
const SESSION_INACTIVITE = 8 * 3600 * 1000;
const ESSAIS_MAX = 5;
const BLOCAGE_MINUTES = 5;
export const MDP_MIN = 8;
export const ROLES_UTILISATEUR = ['directeur', 'comptable', 'conseiller'];

export function middlewareSession() {
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET manquant ou trop court (16 caracteres minimum) : voir .env');
  }
  const PgStore = connectPgSimple(session);
  return session({
    name: SESSION_NOM,
    secret: config.sessionSecret,
    store: new PgStore({ pool, tableName: 'session', ttl: SESSION_INACTIVITE / 1000, pruneSessionInterval: 3600 }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
    },
  });
}

const promesse = (fn) => new Promise((res, rej) => fn((e) => (e ? rej(e) : res())));

async function regenerer(req, garder = true) {
  const data = garder ? { ...req.session } : {};
  delete data.cookie;
  await promesse((cb) => req.session.regenerate(cb));
  Object.assign(req.session, data);
}

export async function viderSession(req, res) {
  if (req.session) await promesse((cb) => req.session.destroy(cb));
  res.clearCookie(SESSION_NOM, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
}

export async function utilisateurCourant(req, res) {
  const u = req.session?.u;
  if (!u) return null;
  const maintenant = Date.now();
  if (maintenant - (req.session.activite ?? 0) > SESSION_INACTIVITE) {
    await viderSession(req, res);
    return null;
  }
  if (maintenant - req.session.activite > 60000) req.session.activite = maintenant;
  return u;
}

export const utilisateurPublic = (u) => ({ id: Number(u.id), identifiant: u.identifiant, nom: u.nom, role: u.role });

export async function compteToujoursActif(id) {
  return Boolean(await valeur(pool, 'SELECT actif FROM utilisateurs WHERE id = $1', [id]));
}

export async function exigerConnexion(req, res, action) {
  let u = await utilisateurCourant(req, res);
  if (u && !(await compteToujoursActif(u.id))) {
    await viderSession(req, res);
    u = null;
  }
  if (!u) fail(401, 'Connexion requise', 'connexion');
  if (req.session.doit_changer && action !== 'changer_mot_de_passe') {
    fail(403, "Choisis d'abord ton mot de passe personnel", 'changer_mdp');
  }
  return u;
}


export function verifierOrigine(req) {
  const origine = req.headers.origin;

  if (!origine) return;

  let urlOrigine;

  try {
    urlOrigine = new URL(origine);
  } catch {
    fail(403, 'Origine refusée');
  }

  const hote = (config.trustProxy !== '0' && req.headers['x-forwarded-host']) || req.headers.host;
  if (hote && urlOrigine.host === String(hote).split(',')[0].trim()) return;

  const originesDev = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  if (!originesDev.has(urlOrigine.origin)) {
    fail(403, 'Origine refusée');
  }
}


export async function ouvrirSession(req, ident, mdp) {
  const u = await un(pool,
    `SELECT *, (bloque_jusqua IS NOT NULL AND bloque_jusqua > now()) AS bloque,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (bloque_jusqua - now())) / 60))::int AS minutes
       FROM utilisateurs WHERE lower(identifiant) = lower($1) AND actif`, [ident]);

  if (!u) {
    await bcrypt.hash(mdp, 10);
    fail(401, 'Identifiant ou mot de passe incorrect');
  }
  if (u.bloque) fail(429, `Trop d'essais : réessaie dans ${u.minutes} minute(s)`);

  if (!(await bcrypt.compare(mdp, u.mot_de_passe))) {
    const n = Number(u.echecs) + 1;
    if (n >= ESSAIS_MAX) {
      await pool.query(
        `UPDATE utilisateurs SET echecs = 0, bloque_jusqua = now() + make_interval(mins => $2) WHERE id = $1`,
        [u.id, BLOCAGE_MINUTES]);
      fail(429, `Trop d'essais : compte bloqué pendant ${BLOCAGE_MINUTES} minutes`);
    }
    await pool.query('UPDATE utilisateurs SET echecs = $1 WHERE id = $2', [n, u.id]);
    fail(401, 'Identifiant ou mot de passe incorrect');
  }

  await pool.query(
    'UPDATE utilisateurs SET echecs = 0, bloque_jusqua = NULL, derniere_connexion = now() WHERE id = $1', [u.id]);

  await regenerer(req, false);
  req.session.u = { id: Number(u.id), identifiant: u.identifiant, nom: u.nom_affiche, role: u.role };
  req.session.activite = Date.now();
  req.session.doit_changer = Boolean(u.mdp_provisoire);
  return { utilisateur: utilisateurPublic(req.session.u), doit_changer: req.session.doit_changer };
}

export async function changerMotDePasse(req, u, ancien, nouveau) {
  const hash = await valeur(pool, 'SELECT mot_de_passe FROM utilisateurs WHERE id = $1', [u.id]);
  if (!hash || !(await bcrypt.compare(ancien, hash))) fail(400, 'Mot de passe actuel incorrect');
  if (lg(nouveau) < MDP_MIN) fail(400, `Le nouveau mot de passe doit faire au moins ${MDP_MIN} caractères`);
  if (nouveau === ancien) fail(400, "Le nouveau mot de passe doit être différent de l'ancien");
  if (nouveau.toLowerCase() === String(u.identifiant).toLowerCase()) fail(400, 'Le mot de passe ne peut pas être ton identifiant');

  await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, mdp_provisoire = false WHERE id = $2',
    [await bcrypt.hash(nouveau, 10), u.id]);
  req.session.doit_changer = false;
  await regenerer(req, true);
}
