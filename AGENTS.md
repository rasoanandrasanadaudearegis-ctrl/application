# AGENTS.md

ARO RCC — internal web app for an insurance agency. Imports the "Relevé de Compte Client" Excel into PostgreSQL, tracks lettrage/anomalies/gros débiteurs, manages a quittance inventory, prints PDFs. **Code, comments, identifiers and UI are French**: keep new work in French.

`CLAUDE.md` has a longer architecture walkthrough. This file is the quick operational guide; if they disagree with the code, trust the code.

## Read this first

- There is **no git repo, no CI, no TypeScript, and no build step for the backend**. Don't assume commits/PRs/branches.
- Root junk: `src/auth.js` is an empty stray file, `proj rcc.zip` is an archive, `rcc_*.xlsx` are sample imports, and `frontend/README.md` is the stock Vite template. Ignore or don't "clean up" without asking.
- The `.gitignore` files deliberately exclude `.env`, `backend/uploads/`, `frontend/dist/`, root spreadsheets/archives and local backups. Never force-add secrets or client data.
- `backend/uploads/` and `frontend/dist/` are runtime/build output. Don't hand-edit them.

## Layout

- `backend/` — Express API, Node ≥18, ESM, no build, no TS. Real entrypoint is `src/server.js`; `backend/server.js` only re-imports it.
- `frontend/` — React 19 + Vite SPA, plain JSX, **no router library** (screens switch by state), no TS.
- Root `package.json` — only a launcher (`concurrently`); package-specific deps and scripts stay in `backend/` and `frontend/`.
- `backend/sql/schema.sql` — tables plus view `v_soldes_comptes` (defines `solde` / `reste_a_payer` / `production_indeterminee`; only `statut_ligne = 'en_attente'` lines count).
- `backend/modele/modele_inventaire.xlsx` — template filled by the inventory export (data starts at row 12). Don't alter or "clean" it.

## Commands

At the repo root (launcher only):
```bash
npm install            # installs concurrently; backend/frontend deps are separate
npm run dev            # starts both servers, prefixed [API] and [WEB]
npm run dev:back       # backend only
npm run dev:front      # frontend only
```
- The root `package.json` is only a launcher: `npm install` there does not install `backend/` or `frontend/` dependencies.
- Vite dev URL is `http://localhost:5173/aro-rcc-front/` (the configured base path), not the bare port.

Backend, from `backend/` (`.env` is loaded from the current directory, so don't run from the repo root):
```bash
npm install
npm run db:init        # idempotent, never drops data
npm run user -- <identifiant> <directeur|comptable|conseiller> "<Nom affiché>" <mdp_provisoire>
npm run dev            # node --watch
npm test               # node --test, pure logic only, no DB needed
node --test test/detection.test.js   # single file
```
Frontend, from `frontend/`:
```bash
npm run dev            # Vite, proxies /api → http://127.0.0.1:5000
npm run build          # dist/, served under base /aro-rcc-front/
npm run lint           # oxlint
npm test               # node --test, pure logic only
node --test test/modele.test.js      # single file
```
- `npm run lint` currently reports pre-existing warnings but exits 0. Don't treat those warnings as a regression you introduced.
- Start PostgreSQL and run `npm run db:init` before `npm run dev`; the server exits if the DB is unreachable.
- CLI-created users get `mdp_provisoire = true`, so they must change the password at first login.

## Config and ports (common source of dev failure)

- `backend/src/config.js` defaults `PORT` to **5000**, matching the Vite proxy. `.env.example` says **8040**, and its `FRONT_DIST=../app_rcc/dist`, while the real folder is `../frontend/dist`. The existing `backend/.env` is already corrected to `PORT=5000` and `FRONT_DIST=../frontend/dist`; keep any new env aligned.
- Session is a same-origin cookie (`express-session` + `connect-pg-simple`). The frontend always calls relative `/api`. In production Express serves `FRONT_DIST` at `/aro-rcc-front/` and redirects `/` there, but only if `FRONT_DIST/index.html` exists at startup — run `npm run build` first.
- `verifierOrigine` 403s unknown `Origin`s; development origins are accepted only on port 5173.
- The frontend wraps `window.fetch`: any 401 dispatches `rcc-session-expiree`, returning the app to login.

## Architecture traps

- The API is **action-dispatch, not REST**: only `/api` and `/api/travail`, both handled by `r.all`. Choose the operation with `?action=...` (GET) or `{action: ...}` (POST). Add a `case` to `executer()` in `backend/src/routes.js`; do not add routes.
- Throw `fail(status, message, motif?)` for errors; it becomes `{error, motif?}` JSON.
- Only `connexion`, `moi`, `deconnexion` are public. Everything else requires a session and passes the origin check.
- RCC import runs in a **forked child process** (`importWorker.js`), not in the request. Progress is in `imports_suivi`; debugging output is `backend/uploads/import_<id>.log`. At startup leftover `en_cours` imports are marked `erreur`.
- The import picks the **first sheet in tab order** whose header row (within the first 10 rows) contains every required column. Columns are matched **by header name**, not position; `Echeance` and `code_apporteur` are optional. It upserts on `id_source` in batches of 1000.
- A pending line missing from a new import becomes `lettree`. If more than 50 % of pending lines would disappear, the import aborts unless forced.
- Before changing `importRcc.js`, `quittances.js`, `detection.js` or `grosDebiteurs.js`, read the domain notes in `CLAUDE.md`: anomaly statuses are preserved across reruns, gros débiteurs are recomputed on every display, and RCC-origin quittances keep their existing `cle` and are soft-deleted (`masquee = true`) so the next import cannot resurrect or overwrite user edits.

## Money, dates, frontend

- PostgreSQL `NUMERIC` comes back as **exact strings** (e.g. `"1188876.20"`). Do not register a float parser. The frontend converts to integer centimes (`toC` in `App.jsx`) and the PDF code expects centimes.
- `date` → `'AAAA-MM-JJ'`, `timestamp` → `'AAAA-MM-JJ HH:MM:SS'` (parsers in `db.js`). The pool passes `timezone` from `DB_TIMEZONE` (default `Indian/Antananarivo`); "today" is `util.aujourdhui()`.
- Excel dates may be serial numbers, `Date` objects or `JJ-MM-AAAA` text; use `parseDate` / `serialExcelVersYmd`.
- Frontend entry flow: `main.jsx` → `Acces.jsx` (login / forced password change) → `App.jsx` (main shell). Screens are separate components. Setting `window.RCC_DATA` / `window.RCC_OPS` puts `App.jsx` in offline preview mode.
- `src/pdf/` is a dependency-free PDF writer. `modele.js` holds print-form logic without React and is unit-tested; keep new pure logic there or in similar standalone modules if you want test coverage.

## Tests

- Node's built-in runner only; no Jest/Vitest, no DB, no React rendering.
- Backend covers pure helpers, detection, import sheet selection and quittance rules. Frontend covers amount-in-words, PDF form logic, pagination and debit/credit pairing (`src/paires.js`).
