"use client";

import Link from "next/link";
import { CollapsibleForm } from "@/components/forms/collapsible-form";
import { FixtureForm } from "@/components/forms/fixture-form";

interface SuiteOption {
  suiteId: string;
  title: string;
}

interface CollapsibleFixtureFormProps {
  suiteOptions: SuiteOption[];
}

export function CollapsibleFixtureForm({ suiteOptions }: CollapsibleFixtureFormProps) {
  return (
    <CollapsibleForm
      buttonLabel="Add a test fixture"
      title="Add a test fixture"
      description="Shared environment setup for a group of test cases."
    >
      {(onSuccess) =>
        suiteOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A test fixture needs a test suite to live under. Create one first on the{" "}
            <Link href="/suites" className="text-accent underline-offset-4 hover:underline">
              Suites
            </Link>{" "}
            page, then come back here.
          </p>
        ) : (
          <FixtureForm suiteOptions={suiteOptions} onSuccess={onSuccess} />
        )
      }
    </CollapsibleForm>
  );
}
