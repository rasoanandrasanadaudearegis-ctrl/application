import fs from 'node:fs';
import path from 'node:path';
import { racine } from '../src/config.js';
import { pool } from '../src/db.js';

const sql = fs.readFileSync(path.join(racine, 'sql', 'schema.sql'), 'utf8');
try {
  await pool.query(sql);
  console.log('Base initialisee : tables, index et vue v_soldes_comptes crees (ou deja presents).');
} catch (e) {
  console.error('Echec :', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
