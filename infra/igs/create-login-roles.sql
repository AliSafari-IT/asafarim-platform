-- Pinned copy of igs-pharma infra/db/create-login-roles.sql at 3a42a27372d6116d576b9b06cec09263ddc38194
-- (asafarim-platform#841). Run on staging by infra/scripts/igs-db-roles.sh; update it only together
-- with that file in igs-pharma. Below: the file, unchanged.
--
-- igs-pharma#66 (D-036): creates the two LOGIN roles the application and the worker connect as, and
-- maps them to the group roles the migrations define. Run it ONCE per database server, by the host
-- administrator, AFTER the first migrate (that is what creates the `igs_app` / `igs_worker` groups):
--
--   psql "<administrative DSN>" -v ON_ERROR_STOP=1 \
--     -v app_login=igs_app_login -v worker_login=igs_worker_login \
--     -f infra/db/create-login-roles.sql
--
-- It contains NO secrets: passwords are set separately, interactively (they never touch a file or a
-- shell history):
--
--   psql "<administrative DSN>" -c '\password igs_app_login'
--   psql "<administrative DSN>" -c '\password igs_worker_login'
--
-- Then: DATABASE_URL (web, platform) = the app login, DATABASE_URL (worker) = the worker login,
-- DATABASE_MIGRATE_URL (migrate entry, db:migrate, bootstrap-owner, seed-catalog) = the
-- administrative role that owns the schemas. Re-running this file is safe.
--
-- The logins are plain roles: no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS, and they
-- must never be members of the administrative role (the migration refuses to continue if they are).

\if :{?app_login}
\else
  \echo 'set -v app_login=<name>'
  \quit 1
\endif
\if :{?worker_login}
\else
  \echo 'set -v worker_login=<name>'
  \quit 1
\endif

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT', :'app_login')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_login') \gexec

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT', :'worker_login')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'worker_login') \gexec

-- the application: igs_app only
GRANT igs_app TO :"app_login";

-- the worker: additive to the application's rights (the manifest lists what it has beyond them)
GRANT igs_app, igs_worker TO :"worker_login";

-- what the database allows these logins to do besides the group rights: connect
SELECT format('GRANT CONNECT ON DATABASE %I TO %I, %I', current_database(), :'app_login', :'worker_login') \gexec

\echo 'Done. Set the passwords with \\password (see the header of this file).'
