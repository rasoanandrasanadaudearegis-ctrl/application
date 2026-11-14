import { pool } from '../src/db.js';

let mysql;
try { mysql = (await import('mysql2/promise')).default; } catch {
  console.error('Le module mysql2 manque : lance "npm install mysql2".'); process.exit(1);
}
const url = process.env.MYSQL_URL || 'mysql://root:@127.0.0.1:3306/aro_rcc';
const my = await mysql.createConnection({ uri: url, dateStrings: true, decimalNumbers: false });

const TABLES = [
  { t: 'imports', seq: 'id' }, { t: 'imports_suivi' }, { t: 'operations', seq: 'id' }, { t: 'anomalies', seq: 'id' },
  { t: 'gd_observations' }, { t: 'gd_comptes' }, { t: 'quittances', seq: 'id' }, { t: 'utilisateurs', seq: 'id' },
  { t: 'operations_travail', optionnelle: true },
];
const BOOL = { utilisateurs: ['mdp_provisoire', 'actif'] };
const ZERO = /^0000-00-00/;

if (process.argv.includes('--vider')) {
  await pool.query('TRUNCATE operations_travail, anomalies, operations, imports_suivi, imports, gd_observations, gd_comptes, quittances, utilisateurs RESTART IDENTITY CASCADE');
  console.log('Tables PostgreSQL videes.');
}

for (const { t, seq, optionnelle } of TABLES) {
  let lignes;
  try { [lignes] = await my.query(`SELECT * FROM \`${t}\``); } catch (e) {
    if (optionnelle) { console.log(`- ${t} : absente de MySQL (ignoree)`); continue; }
    throw e;
  }
  if (!lignes.length) { console.log(`- ${t} : 0 ligne`); continue; }
  const cols = Object.keys(lignes[0]);
  const lot = 1000;
  for (let i = 0; i < lignes.length; i += lot) {
    const part = lignes.slice(i, i + lot);
    const params = [];
    const tuples = part.map((l) => `(${cols.map((c) => {
      let v = l[c];
      if (typeof v === 'string' && ZERO.test(v)) v = null;
      if (BOOL[t]?.includes(c)) v = Boolean(Number(v));
      if (Buffer.isBuffer(v)) v = v.toString('utf8');
      params.push(v);
      return `$${params.length}`;
    }).join(',')})`);
    await pool.query(`INSERT INTO ${t} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, params);
  }
  if (seq) await pool.query(`SELECT setval(pg_get_serial_sequence('${t}', '${seq}'), COALESCE((SELECT MAX(${seq}) FROM ${t}), 1))`);
  console.log(`- ${t} : ${lignes.length} ligne(s) copiee(s)`);
}
await my.end();
await pool.end();
console.log('Migration terminee.');
