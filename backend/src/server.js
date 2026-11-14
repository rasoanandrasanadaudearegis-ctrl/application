import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { middlewareSession } from './auth.js';
import { routesApi } from './routes.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy !== '0') app.set('trust proxy', config.trustProxy === '1' ? 1 : config.trustProxy);

app.use(middlewareSession());

if (config.frontDist && fs.existsSync(path.join(config.frontDist, 'index.html'))) {
  app.use(
    '/aro-rcc-front',
    express.static(config.frontDist, {
      index: 'index.html',
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  app.get('/', (_req, res) => res.redirect('/aro-rcc-front/'));

  console.log(`Front servi sur /aro-rcc-front/ depuis ${config.frontDist}`);
}

app.use(routesApi());

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  res.status(err.status === 400 || err.type === 'entity.parse.failed' ? 400 : 500)
    .json({ error: err.type === 'entity.parse.failed' ? 'Requête invalide' : 'Erreur du serveur' });
});

try { await pool.query('SELECT 1'); } catch (e) {
  console.error(`Connexion PostgreSQL impossible : ${e.message}\nVerifie DATABASE_URL dans .env et lance "npm run db:init".`);
  process.exit(1);
}
await pool.query(
  `UPDATE imports SET statut = 'erreur', message = 'Import interrompu (arret du serveur)' WHERE statut = 'en_cours'`).catch(() => {});

app.listen(config.port, () => {
  console.log(`ARO RCC : API Express démarrée sur http://127.0.0.1:${config.port}`);
});;
