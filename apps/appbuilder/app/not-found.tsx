import { ButtonLink, EmptyState } from "@asafarim/ui";

export default function NotFound() {
  return (
    <EmptyState
      glyph="[ ? ]"
      title="Page not found"
      description="That route doesn't exist in AppBuilder."
      action={<ButtonLink href="/">Back to overview</ButtonLink>}
    />
  );
}
