import type { ReactNode } from "react";
import { Alert, Badge, EmptyState } from "@asafarim/ui";
import type { EmptyStateConfig } from "../configSchemas";
import type { ComponentRenderProps } from "../types";

export interface DemoDataNoticeProps {
  children: ReactNode;
}

/**
 * Wraps any component body that shows fabricated/demo rows so a reviewer
 * can never mistake preview data for a persisted record — M09 (functional
 * generated-record CRUD) has not shipped yet, so nothing rendered here has
 * actually been saved.
 */
export function DemoDataNotice({ children }: DemoDataNoticeProps) {
  return (
    <div className="ab-demo-notice" role="note" aria-label="Preview data notice">
      {/* tone="neutral", not "info": @asafarim/ui's tone="info" (--accent
          on --accent-soft) fails WCAG AA contrast for this app's violet
          "Factory" mood — a pre-existing shared-token issue, flagged
          separately rather than patched here. */}
      <Badge tone="neutral">Preview data</Badge>
      {children}
    </div>
  );
}

export function ComponentEmptyState({ title, description }: { title: string; description?: string }) {
  return <EmptyState title={title} description={description} glyph="[ · ]" />;
}

export function ComponentErrorState({ title, description }: { title: string; description: string }) {
  return (
    <Alert tone="error">
      <strong>{title}</strong>
      <p>{description}</p>
    </Alert>
  );
}

export function ComponentLoadingState({ label }: { label: string }) {
  return (
    <div className="ab-loading" role="status" aria-live="polite">
      <span className="ab-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function StandaloneEmptyStateRenderer({ config }: ComponentRenderProps<EmptyStateConfig>) {
  return <ComponentEmptyState title={config.title} description={config.description} />;
}
