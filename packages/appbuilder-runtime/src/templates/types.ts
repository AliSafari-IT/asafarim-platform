import type { AppMetadataType, ApplicationSpecificationType } from "@asafarim/appbuilder-schema";

/**
 * A template's `id` matches `apps/appbuilder`'s `StarterFamily` enum values
 * (`lib/validation/createApp.ts`) one-to-one, so a creation-time starter
 * choice can be looked up here by the same string with no translation
 * layer. `build` is a pure function — no I/O, no randomness, no reference
 * to the caller's app id — so the same `AppMetadataType` always produces a
 * byte-identical specification (verified by templates/*.test.ts).
 */
export interface AppTemplate {
  id: string;
  displayName: string;
  description: string;
  build(app: AppMetadataType): ApplicationSpecificationType;
}
