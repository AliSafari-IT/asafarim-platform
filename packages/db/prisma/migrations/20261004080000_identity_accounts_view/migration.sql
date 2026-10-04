-- ASafariM OS identity service: read-only accounts view (#782, P2.2;
-- ADR 0002, Addendum A3). The identity service (id.asafarim.site) reads the
-- people it issues tokens for from THIS view only, as the login role
-- identity_ro, which has no grant on any table.
--
-- Contract (asafarim-os core/identity/src/accounts.ts): exactly
--   id, email, name, image, "isActive", roles (role names, sorted; [] if none)
-- Change it only together with the identity service.
CREATE OR REPLACE VIEW "identity_accounts_v" AS
SELECT
  u."id",
  u."email",
  u."name",
  u."image",
  u."isActive",
  COALESCE(
    array_agg(r."name" ORDER BY r."name") FILTER (WHERE r."name" IS NOT NULL),
    ARRAY[]::text[]
  ) AS "roles"
FROM "User" u
LEFT JOIN "UserRole" ur ON ur."userId" = u."id"
LEFT JOIN "Role" r ON r."id" = ur."roleId"
GROUP BY u."id";

-- The role is created WITHOUT a password and NOLOGIN: the password comes from
-- the deployment's encrypted env (IDENTITY_RO_PASSWORD) and is set by
-- vps-deploy.sh, never committed. A view runs with its owner's privileges, so
-- SELECT on the view is all identity_ro needs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_ro') THEN
    CREATE ROLE identity_ro NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM identity_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM identity_ro;
GRANT USAGE ON SCHEMA public TO identity_ro;
GRANT SELECT ON "identity_accounts_v" TO identity_ro;
