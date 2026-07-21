"use client";

import Link from "next/link";
import { CollapsibleForm } from "@/components/forms/collapsible-form";
import { SuiteForm } from "@/components/forms/suite-form";

interface FrOption {
  id: string;
  title: string;
}

interface CollapsibleSuiteFormProps {
  frOptions: FrOption[];
}

export function CollapsibleSuiteForm({ frOptions }: CollapsibleSuiteFormProps) {
  return (
    <CollapsibleForm
      buttonLabel="Add a test suite"
      title="Add a test suite"
      description="Group related test fixtures under a functional requirement."
    >
      {(onSuccess) =>
        frOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A test suite needs a functional requirement to belong to. Create one first on the{" "}
            <Link href="/requirements" className="text-accent underline-offset-4 hover:underline">
              Requirements
            </Link>{" "}
            page, then come back here.
          </p>
        ) : (
          <SuiteForm frOptions={frOptions} onSuccess={onSuccess} />
        )
      }
    </CollapsibleForm>
  );
}
