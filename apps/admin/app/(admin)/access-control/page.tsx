import type { Metadata } from "next";
import {
  MATRIX_ROLES,
  NAV_MODULES,
  ROLES,
  getModuleOverrides,
  requireRole,
} from "@asafarim/auth";
import { Alert, EmptyState, PageHeader, Panel } from "@asafarim/ui";
import { VisibilityMatrix, type MatrixModule } from "./_components/VisibilityMatrix";

export const metadata: Metadata = { title: "Access Control" };

export default async function AccessControlPage() {
  // Superadmin-only: this page rewrites what every other admin can find.
  const session = await requireRole([ROLES.SUPERADMIN]);
  const isSuperadmin = (session.user.roles ?? []).includes(ROLES.SUPERADMIN);

  const overrides = await getModuleOverrides();

  const modules: MatrixModule[] = NAV_MODULES.map((module) => ({
    id: module.id,
    label: module.label,
    description: module.description,
    group: module.group,
    defaultRoles: [...module.defaultRoles],
  }));

  return (
    <>
      <PageHeader
        kicker="Navigation"
        kickerIndex="NAV"
        title="Access Control"
        description="Which console sections and platform apps each role sees in menus. One screen for the whole platform — new apps join the matrix automatically from the app registry."
      />

      <Alert tone="warning">
        Visibility only — this is not an authorization control. Every route
        keeps its own server-side gate, and app access is still decided by the
        registry&apos;s access rule. Hiding an entry reduces clutter for a role;
        it never grants or revokes access, so it must never be used as a
        security boundary.
      </Alert>

      {!isSuperadmin ? (
        <EmptyState
          glyph="[sa]"
          title="Superadmin required"
          description="Navigation visibility can only be edited by a superadmin."
        />
      ) : (
        <VisibilityMatrix
          modules={modules}
          roles={[...MATRIX_ROLES]}
          overrides={overrides}
          superadminRole={ROLES.SUPERADMIN}
        />
      )}

      <div style={{ marginTop: "var(--space-5)" }}>
        <Panel title="how the matrix resolves">
          <ul
            className="u-muted"
            style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)" }}
          >
            <li>
              A cell with no override follows the module&apos;s registry
              default; only deviations are stored, so changing a default later
              still reaches everyone who never overrode it.
            </li>
            <li>
              Superadmin always sees every module. Without that rule, hiding
              this page from superadmin would remove the only way to undo it.
            </li>
            <li>
              An amber ring marks a cell that differs from its default.
              &ldquo;Reset all to defaults&rdquo; clears every override at once,
              and saving an all-default matrix deletes the stored row entirely.
            </li>
            <li>
              Unknown module ids and roles are dropped on read, so renaming a
              module or deleting a role degrades to the default rather than
              breaking navigation.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
