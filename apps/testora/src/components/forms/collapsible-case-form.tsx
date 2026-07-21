"use client";

import Link from "next/link";
import { CaseForm } from "@/components/forms/case-form";
import { CollapsibleForm } from "@/components/forms/collapsible-form";

interface FixtureOption {
  fixtureId: string;
  title: string;
}

interface CollapsibleCaseFormProps {
  fixtureOptions: FixtureOption[];
}

export function CollapsibleCaseForm({ fixtureOptions }: CollapsibleCaseFormProps) {
  return (
    <CollapsibleForm
      buttonLabel="Add a test case"
      title="Add a test case"
      description="Pick a fixture, then add single-run or multi-run JSON test data — or a scripted case carrying raw TestCafe code for multi-step flows. No seeding required."
    >
      {(onSuccess) =>
        fixtureOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A test case needs a fixture to live under. Create one first on the{" "}
            <Link href="/fixtures" className="text-accent underline-offset-4 hover:underline">
              Fixtures
            </Link>{" "}
            page (open a suite to add a fixture), then come back here.
          </p>
        ) : (
          <CaseForm fixtureOptions={fixtureOptions} onSuccess={onSuccess} />
        )
      }
    </CollapsibleForm>
  );
}
