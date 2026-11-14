CREATE TABLE IF NOT EXISTS imports (
  id                serial PRIMARY KEY,
  nom_fichier       varchar(255) NOT NULL,
  utilisateur       varchar(100) NOT NULL,
  date_import       timestamp NOT NULL DEFAULT now(),
  lignes_lues       integer NOT NULL DEFAULT 0,
  lignes_nouvelles  integer NOT NULL DEFAULT 0,
  lignes_existantes integer NOT NULL DEFAULT 0,
  lignes_anomalies  integer NOT NULL DEFAULT 0,
  lignes_lettrees   integer NOT NULL DEFAULT 0,
  statut            text NOT NULL DEFAULT 'termine' CHECK (statut IN ('en_cours','termine','erreur')),
  message           text
);

CREATE TABLE IF NOT EXISTS imports_suivi (
  import_id   integer PRIMARY KEY,
  progression smallint NOT NULL DEFAULT 0,
  lignes_lues integer NOT NULL DEFAULT 0,
  maj         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations (
  id                 bigserial PRIMARY KEY,
  id_source          bigint NOT NULL UNIQUE,
  piece              varchar(60),
  compte_client      varchar(30) NOT NULL DEFAULT '',
  nom_client         varchar(255),
  date_operation     date,
  journal            varchar(20),
  libelle            varchar(255),
  police             varchar(40),
  date_effet         date,
  echeance           date,
  code_apporteur     varchar(30),
  quittance          varchar(30),
  periode            varchar(10),
  debit              numeric(15,2) NOT NULL DEFAULT 0,
  credit             numeric(15,2) NOT NULL DEFAULT 0,
  ref_lettrage       varchar(60),
  statut_ligne       text NOT NULL DEFAULT 'en_attente' CHECK (statut_ligne IN ('en_attente','lettree','supprimee')),
  premier_import_id  integer NOT NULL REFERENCES imports(id),
  dernier_import_id  integer NOT NULL REFERENCES imports(id),
  import_lettrage_id integer,
  date_lettrage      timestamp
);
CREATE INDEX IF NOT EXISTS idx_op_compte   ON operations (compte_client);
CREATE INDEX IF NOT EXISTS idx_op_police   ON operations (compte_client, police);
CREATE INDEX IF NOT EXISTS idx_op_statut   ON operations (statut_ligne);
CREATE INDEX IF NOT EXISTS idx_op_premier  ON operations (premier_import_id);
CREATE INDEX IF NOT EXISTS idx_op_dernier  ON operations (dernier_import_id);
CREATE INDEX IF NOT EXISTS idx_op_piece    ON operations (piece);
CREATE INDEX IF NOT EXISTS idx_op_lettrage ON operations (import_lettrage_id);

CREATE TABLE IF NOT EXISTS anomalies (
  id              bigserial PRIMARY KEY,
  operation_id    bigint NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  type            varchar(80) NOT NULL,
  detail          text NOT NULL,
  statut          text NOT NULL DEFAULT 'a_verifier' CHECK (statut IN ('a_verifier','validee','corrigee','supprimee')),
  date_traitement timestamp,
  traite_par      varchar(100),
  CONSTRAINT uq_operation_type UNIQUE (operation_id, type)
);
CREATE INDEX IF NOT EXISTS idx_ano_statut ON anomalies (statut);

CREATE TABLE IF NOT EXISTS operations_travail (
  operation_id bigint PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE,
  fait_par     varchar(100),
  date_fait    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gd_observations (
  compte      varchar(30) PRIMARY KEY,
  observation varchar(500) NOT NULL,
  modifie_par varchar(100),
  modifie_le  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gd_comptes (
  compte             varchar(30) PRIMARY KEY,
  nom                varchar(255),
  solde              numeric(15,2) NOT NULL DEFAULT 0,
  statut             text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','lettree')),
  date_detection     timestamp NOT NULL DEFAULT now(),
  date_lettrage      timestamp,
  import_lettrage_id integer,
  marque             varchar(20)
);
CREATE INDEX IF NOT EXISTS idx_gdc_statut ON gd_comptes (statut);

CREATE TABLE IF NOT EXISTS quittances (
  id            serial PRIMARY KEY,
  cle           char(40) NOT NULL UNIQUE,
  numero_assure varchar(20),
  assure        varchar(255) NOT NULL,
  apporteur     varchar(30),
  police        varchar(40),
  quittance     varchar(30),
  date_effet    date NOT NULL,
  echeance      date,
  prime         numeric(15,2) NOT NULL DEFAULT 0,
  acompte       numeric(15,2) NOT NULL DEFAULT 0,
  observations  text,
  actions       text,
  cree_par      varchar(100),
  date_creation timestamp NOT NULL DEFAULT now(),
  date_modif    timestamp
);
ALTER TABLE quittances ADD COLUMN IF NOT EXISTS masquee boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_quittance_effet  ON quittances (date_effet);
CREATE INDEX IF NOT EXISTS idx_quittance_numero ON quittances (quittance);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id                 serial PRIMARY KEY,
  identifiant        varchar(50) NOT NULL,
  nom_affiche        varchar(100) NOT NULL,
  role               text NOT NULL CHECK (role IN ('directeur','comptable','conseiller')),
  mot_de_passe       varchar(255) NOT NULL,
  mdp_provisoire     boolean NOT NULL DEFAULT true,
  actif              boolean NOT NULL DEFAULT true,
  echecs             smallint NOT NULL DEFAULT 0,
  bloque_jusqua      timestamp,
  derniere_connexion timestamp,
  cree_le            timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identifiant ON utilisateurs (lower(identifiant));

CREATE TABLE IF NOT EXISTS session (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

CREATE OR REPLACE VIEW v_soldes_comptes AS
SELECT compte_client,
       max(nom_client)          AS nom_client,
       count(*)                 AS nb_operations,
       count(DISTINCT police)   AS nb_polices,
       sum(debit)               AS total_debit,
       sum(credit)              AS total_credit,
       sum(debit) - sum(credit) AS solde,
       CASE WHEN sum(debit) - sum(credit) = 0 THEN 'solde'
            WHEN sum(debit) - sum(credit) > 0 THEN 'reste_a_payer'
            ELSE 'production_indeterminee' END AS statut,
       (abs(sum(debit) - sum(credit)) > 0 AND abs(sum(debit) - sum(credit)) <= 1) AS ecart_arrondi
  FROM operations
 WHERE statut_ligne = 'en_attente' AND compte_client <> ''
 GROUP BY compte_client;
