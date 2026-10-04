/**
 * #782 (P2.2): the identity service's read-only access. identity_ro can SELECT
 * identity_accounts_v and nothing else; the view has exactly the columns the
 * identity service reads (asafarim-os core/identity/src/accounts.ts).
 *
 * Needs PLATFORM_TEST_DATABASE_URL: a THROWAWAY database with every migration
 * applied (`prisma migrate deploy`), connected as a role that may CREATE ROLE.
 * Skipped without it.
 *
 * Roles are cluster-wide, so the test never touches identity_ro's own login
 * (that could lock out a real identity service on a shared cluster). It
 * connects as a temporary login role that is a MEMBER of identity_ro and
 * inherits exactly its privileges, then drops it.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.PLATFORM_TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL)("identity_accounts_v and identity_ro (integration)", () => {
  let admin: pg.Client;
  let ro: pg.Client;
  const tag = `idv-${Date.now()}`;
  const probeRole = `identity_ro_probe_${Date.now()}`;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    // base64url: no quotes, safe to inline in the DDL (roles can't be bound parameters).
    const password = randomBytes(24).toString("base64url");
    await admin.query(`CREATE ROLE "${probeRole}" LOGIN INHERIT PASSWORD '${password}' IN ROLE identity_ro`);
    const url = new URL(ADMIN_URL!);
    url.username = probeRole;
    url.password = password;
    ro = new pg.Client({ connectionString: url.href });
    await ro.connect();

    await admin.query(`INSERT INTO "User" (id, email, name, image, "isActive", "updatedAt") VALUES
      ($1, $2, 'Active Person', 'https://cdn.example/a.png', true, now()),
      ($3, $4, NULL, NULL, false, now())`, [`${tag}-a`, `${tag}-a@example.test`, `${tag}-b`, `${tag}-b@example.test`]);
    await admin.query(`INSERT INTO "Role" (id, name, "displayName", "updatedAt") VALUES ($1, $2, 'T1', now()), ($3, $4, 'T2', now())`, [
      `${tag}-r1`,
      `${tag}-zeta`,
      `${tag}-r2`,
      `${tag}-alpha`,
    ]);
    await admin.query(`INSERT INTO "UserRole" (id, "userId", "roleId") VALUES ($1, $2, $3), ($4, $2, $5)`, [
      `${tag}-ur1`,
      `${tag}-a`,
      `${tag}-r1`,
      `${tag}-ur2`,
      `${tag}-r2`,
    ]);
  });

  afterAll(async () => {
    await ro?.end();
    if (admin) {
      await admin.query(`DELETE FROM "User" WHERE id LIKE $1`, [`${tag}-%`]);
      await admin.query(`DELETE FROM "Role" WHERE id LIKE $1`, [`${tag}-%`]);
      await admin.query(`DROP ROLE IF EXISTS "${probeRole}"`);
      await admin.end();
    }
  });

  it("identity_ro can SELECT the view, with exactly the agreed columns", async () => {
    const { rows, fields } = await ro.query(`SELECT * FROM identity_accounts_v WHERE id = ANY($1) ORDER BY id`, [[`${tag}-a`, `${tag}-b`]]);
    expect(fields.map((f) => f.name)).toEqual(["id", "email", "name", "image", "isActive", "roles"]);
    expect(rows).toEqual([
      { id: `${tag}-a`, email: `${tag}-a@example.test`, name: "Active Person", image: "https://cdn.example/a.png", isActive: true, roles: [`${tag}-alpha`, `${tag}-zeta`] },
      { id: `${tag}-b`, email: `${tag}-b@example.test`, name: null, image: null, isActive: false, roles: [] },
    ]);
  });

  it("identity_ro gets permission denied on the tables themselves", async () => {
    for (const table of ['"User"', '"UserRole"', '"Role"', '"Account"', '"Session"']) {
      await expect(ro.query(`SELECT 1 FROM ${table} LIMIT 1`)).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("identity_ro has SELECT on the view and nothing else", async () => {
    const { rows } = await admin.query(`SELECT
      has_table_privilege('identity_ro', 'identity_accounts_v', 'SELECT') AS view_select,
      has_table_privilege('identity_ro', 'identity_accounts_v', 'INSERT,UPDATE,DELETE,TRUNCATE') AS view_write,
      (SELECT count(*) FROM information_schema.role_table_grants
        WHERE grantee = 'identity_ro' AND table_name <> 'identity_accounts_v')::int AS other_grants`);
    expect(rows[0]).toEqual({ view_select: true, view_write: false, other_grants: 0 });
    // And the view itself refuses writes (an aggregate view isn't updatable).
    await expect(ro.query(`UPDATE identity_accounts_v SET name = 'x' WHERE id = $1`, [`${tag}-a`])).rejects.toThrow();
  });
});
