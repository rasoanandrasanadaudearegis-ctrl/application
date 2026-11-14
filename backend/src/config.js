import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tz = process.env.DB_TIMEZONE || 'Indian/Antananarivo';
if (!/^[A-Za-z0-9_\/+-]+$/.test(tz)) throw new Error('DB_TIMEZONE invalide');
export const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5432/aro_rcc',
  sessionSecret: process.env.SESSION_SECRET || '',
  timezone: tz,
  seuilGrosDebiteur: Number(process.env.SEUIL_GROS_DEBITEUR || 500000),
  agence: process.env.AGENCE || 'FIANARANTSOA',
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB || 200),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY || '0',
  frontDist: process.env.FRONT_DIST ? path.resolve(racine, process.env.FRONT_DIST) : '',
  dossierUploads: path.join(racine, 'uploads'),
  modeleInventaire: path.join(racine, 'modele', 'modele_inventaire.xlsx'),
};
