# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ARO RCC: an internal web app for the ARO Assurances agency (FIANARANTSOA by default). It imports the "Relevé de Compte Client" (RCC) Excel export into PostgreSQL. It tracks lettrage (reconciliation), detects anomalies, lists gros débiteurs, keeps a physical inventory of quittances and prints invoices and statements as PDF. The code, comments, identifiers and UI are in French. Keep new code in French to match.

The backend is a **port of an earlier PHP/MySQL (XAMPP) app**. Many comments still name the PHP originals (`api.php`, `import.php`, `travail_api.php`, `detection.php`...), and the JSON contract was kept as it was. Some helpers copy PHP behaviour on purpose: `similarPct` = `similar_text()`, `lg`/`sous` = `mb_strlen`/`mb_substr`, stable sort = `arsort`.

Layout:
- `backend/`: Express API (Node ≥18, ESM, no build step).
- `frontend/`: React 19 + Vite SPA (plain JSX, no TypeScript, no router library).
- `rcc_controle_import.xlsx` at the root is a sample RCC file (local only, gitignored). `src/auth.js` at the root is an empty stray file and is not used.

There is no git repository. Tests use Node’s built-in runner (no extra dependency) and cover the pure logic only, not the database or the React screens: `backend/test/` (utils, anomaly detection, quittance age brackets and key, sheet selection) and `frontend/test/` (amount in words, PDF form logic, pagination, debit/credit pairing in `src/paires.js`).

## Commands

Backend (`cd backend`):
```
npm install
cp .env.example .env          # then edit DATABASE_URL, SESSION_SECRET, PORT...
npm run db:init               # applies sql/schema.sql (idempotent, never drops data)
npm run user -- <identifiant> <directeur|comptable|conseiller> "<Nom affiché>" <mdp_provisoire>
npm run user -- <identifiant> --desactiver
npm run dev                   # node --watch
npm start
MYSQL_URL=mysql://root:@127.0.0.1:3306/aro_rcc npm run migrer [-- --vider]   # one-off MySQL → PG copy
npm test                      # node --test; one file: node --test test/detection.test.js
```

Frontend (`cd frontend`):
```
npm run dev       # Vite; proxies /api → http://127.0.0.1:5000
npm run build     # outputs dist/, served under base /aro-rcc-front/
npm run lint      # oxlint (.oxlintrc.json: react rules-of-hooks, only-export-components)
npm test          # node --test; one file: node --test test/modele.test.js
```

### Port and origin mismatches to watch for
- `config.js` defaults `PORT` to **5000**, which matches the Vite proxy. `.env.example` sets **8040**. If `.env` uses 8040, change `vite.config.js` to match or `npm run dev` on the frontend won't reach the API.
- `verifierOrigine` (`backend/src/auth.js`) accepts requests with no `Origin`, a same-origin `Origin` (matching the `Host` header, or `X-Forwarded-Host` when `TRUST_PROXY` is set), and the Vite dev origins on port 5173; anything else gets a 403.
- `FRONT_DIST` in `.env.example` points to `../app_rcc/dist`. The folder in this repo is `../frontend/dist`.

## Architecture

### Single-origin session model
The session cookie (`express-session` + `connect-pg-simple`, stored in table `session`) needs the SPA and the API on the same origin. In dev this goes through the Vite proxy. In production, Express serves the built front at `/aro-rcc-front/` (`FRONT_DIST`) and `/` redirects there. The frontend always calls the relative URL `/api`.

### Action-dispatch API (not REST)
`backend/src/routes.js` exposes only two endpoints: `/api` and `/api/travail`. Both use `r.all`. The operation is chosen by `?action=...` (GET) or `{action: ...}` in the JSON body (POST). `executer()` is one big `switch (action)` that calls the domain modules. To add a feature, add a `case` there, not a new route.
- Public actions: `connexion`, `moi`, `deconnexion`. Every other action calls `exigerConnexion` (401 if not logged in) and the origin check.
- To return an error, throw `fail(status, message, motif?)` (`util.js` → `ApiError`). It becomes `{error, motif?}` JSON.
- The frontend wraps `window.fetch` (`frontend/src/auth.js`). Any 401 fires the event `rcc-session-expiree`, and the app goes back to the login screen.
- Roles: `directeur`, `comptable`, `conseiller`. The server checks the role for import deletion (`ROLES_SUPPRESSION_IMPORT`), and the frontend keeps a copy of that list. Passwords set from the CLI are provisional (`mdp_provisoire`), so the user must change theirs at first login.

### RCC import pipeline
1. `POST /api?action=importer` (multipart, field `fichier`). `prepareUpload` checks the session **before** multer writes the file to `uploads/`.
2. `lancerImport` creates a **separate Node process** (`fork` of `src/importWorker.js`, 2 GB heap). Output goes to `uploads/import_<id>.log`. Progress goes into `imports_suivi`, and the frontend polls for it.
3. `importRcc.js#runImport` reads the workbook with ExcelJS. `choisirFeuille` picks the **first sheet, in tab order, whose header row (searched in the first 10 rows) has every required column**; the sheet name does not matter. Columns are found **by header name** (`COLONNES`), not by position; `Echeance` and `code_apporteur` are optional. It upserts on `id_source` in batches of 1000.
4. **Lettrage rule:** a pending line that is in the DB but missing from the new file becomes `lettree`. If more than 50 % of pending lines would disappear, the import is aborted unless `force` is set.
5. It then runs `detection.js#detecterAnomalies` and `quittances.js#synchroniserInventaire`.
6. If a worker crashes, the import is marked `erreur`. At startup, `server.js` also marks any leftover `en_cours` import as `erreur`.

### Domain modules (`backend/src/`)
- `detection.js`: anomaly rules (missing or wrong-length account, near-duplicate accounts with the same name, one account with different names, 12 `doublon_*` rules in `REGLES_DOUBLONS`). `analyserGroupes` is pure, with no DB access. An anomaly's status (`a_verifier`/`validee`/`corrigee`/`supprimee`) is kept when detection runs again.
- `grosDebiteurs.js`: gros débiteurs are **computed** (pending balance ≥ `SEUIL_GROS_DEBITEUR`). `gdSynchroniser` is idempotent, runs on every display, and updates `gd_comptes` (auto-lettrage when an account drops under the threshold).
- `quittances.js`: inventory "arrêtée au <date>" with age brackets (`an`/`m3p`/`m3m`). The Excel export fills a copy of `modele/modele_inventaire.xlsx` (data starts at row `LIGNE_DEBUT` = 12). `synchroniserInventaire` (run after each import) upserts on `cle` (hash of quittance, police, effet, échéance, assuré) and **deletes RCC-origin rows (`cree_par` = `RCC import #N`) whose `cle` is no longer produced**. So when a user edits an RCC-origin quittance, `enregistrerQuittance` keeps its existing `cle`; recomputing it would make the next import delete the edited row and recreate it without the edits. Likewise, deleting an RCC-origin quittance only sets `masquee = true` (`supprimerQuittance`); a real DELETE would let the next import recreate it. Every inventory read filters `NOT masquee`; manually added quittances are really deleted.
- `travail.js`: checkboxes for "Comptes clients" lettrage progress (table `operations_travail`).
- `db.js` helpers: `rows`, `lignesTab` (array rows), `un`, `valeur`, `tx(fn)`. They take a pool or a transaction client.
- The view `v_soldes_comptes` in `sql/schema.sql` defines account balance and status (`solde`/`reste_a_payer`/`production_indeterminee`). Only `statut_ligne = 'en_attente'` lines count.

### Money, dates and time zone
- PG `NUMERIC` comes back as **exact strings** (e.g. `"1188876.20"`). Do not set a type parser that turns it into a float. The frontend turns money into **integer centimes** (`toC` in `App.jsx`) and does all arithmetic in centimes. The PDF code expects centimes too.
- `date` comes back as `'AAAA-MM-JJ'` and `timestamp` as `'AAAA-MM-JJ HH:MM:SS'` (type parsers in `db.js`). Each connection runs `SET TIME ZONE DB_TIMEZONE` (default `Indian/Antananarivo`). "Today" is `util.aujourdhui()`.
- Excel dates can be serial numbers, `Date` objects or `JJ-MM-AAAA` text. See `parseDate` / `serialExcelVersYmd`.

### Frontend
- `main.jsx` → `Acces.jsx` (calls `?action=moi`, shows login or forced password change) → `App.jsx`. `App.jsx` is the main shell: the client-account list, with screens switched by state. Other screens are their own components (`Anomalies`, `GrosDebiteurs`, `InventaireQuittances`, `ImportRCC`, `PertesProfits`, `Impression`, `Aide`).
- `window.RCC_DATA` / `window.RCC_OPS`, when set, put `App.jsx` in offline preview mode with embedded data.
- `src/pdf/` is a **dependency-free PDF writer** (`pdfWriter.js`: Helvetica, WinAnsi encoding, A4, origin at top-left). `documents.js` draws the "Facture" and "Relevé de compte de prime" layouts. `modele.js` holds the print-form logic and has no React, so it can be tested on its own. Agency constants (city, director, signatories, bank, VAT) are in `pdf/config.js`.
