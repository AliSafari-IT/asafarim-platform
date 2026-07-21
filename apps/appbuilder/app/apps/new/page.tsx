import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New app" };

export default async function NewAppPage() {
  // Route contract only for M01/M02: the prompt-first creation flow (spec
  // generation, requirements planning) ships in M05/M07. The AI never emits
  // arbitrary code, only operations against a validated specification
  // (docs/adr/0001-appbuilder-managed-runtime.md). Session enforcement here
  // is defense-in-depth alongside proxy.ts.
  await requireActor({ callbackUrl: "/apps/new" });

  return (
    <>
      <PageHeader
        kicker="Create"
        kickerIndex="02"
        title="Describe your app"
        description="Tell AppBuilder what the app should manage. It builds a versioned specification you can preview and refine — never generated source code."
      />
      <Card title="Coming soon">
        <Alert tone="info">
          Prompt-first app creation lands with the versioned specification
          engine (M04) and the creation flow (M05). This route establishes
          the contract that later milestones fill in.
        </Alert>
      </Card>
    </>
  );
}
