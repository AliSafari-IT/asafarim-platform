import { z } from "zod";
import { DisplayName } from "./ids";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color");

/**
 * Constrained branding — a fixed, typed set of fields. Never a CSS/JS
 * override or an arbitrary style-injection point.
 */
export const Branding = z.object({
  companyName: DisplayName.optional(),
  primaryColor: hexColor.optional(),
  logoUrl: z.string().url().max(2000).optional(),
  faviconUrl: z.string().url().max(2000).optional(),
  theme: z.enum(["light", "dark", "system"] as const).default("system"),
});
export type BrandingType = z.infer<typeof Branding>;
