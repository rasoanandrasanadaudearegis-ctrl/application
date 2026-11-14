import { runImport } from './importRcc.js';
import { pool } from './db.js';

const [, , fichier, user, id, force] = process.argv;
try {
  await runImport({ fichier, user, importId: Number(id), force: force === '1', log: (m) => console.log(m) });
  await pool.end();
  process.exit(0);
} catch (e) {
  console.error(`ERREUR : ${e.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
}
