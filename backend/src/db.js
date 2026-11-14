import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v.replace(/\.\d+$/, ''));

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10, options: `-c timezone=${config.timezone}` });
pool.on('error', (e) => console.error('Erreur PostgreSQL (connexion inactive) :', e.message));

export async function rows(db, text, params = []) {
  return (await db.query(text, params)).rows;
}
export async function lignesTab(db, text, params = []) {
  return (await db.query({ text, values: params, rowMode: 'array' })).rows;
}
export async function un(db, text, params = []) {
  return (await db.query(text, params)).rows[0] ?? null;
}
export async function valeur(db, text, params = []) {
  const r = (await db.query({ text, values: params, rowMode: 'array' })).rows[0];
  return r ? r[0] : null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { }
    throw e;
  } finally {
    client.release();
  }
}
