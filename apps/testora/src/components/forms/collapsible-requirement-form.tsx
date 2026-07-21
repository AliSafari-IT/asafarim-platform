"use client";

import { CollapsibleForm } from "@/components/forms/collapsible-form";
import { RequirementForm } from "@/components/forms/requirement-form";

export function CollapsibleRequirementForm() {
  return (
    <CollapsibleForm
      buttonLabel="Add a functional requirement"
      title="Add a functional requirement"
      description="A high-level domain, e.g. Authentication or Checkout."
    >
      {(onSuccess) => <RequirementForm onSuccess={onSuccess} />}
    </CollapsibleForm>
  );
}
