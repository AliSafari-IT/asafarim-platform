/**
 * Structured, multi-app-scoped address CRUD for UserLocation (see the Prisma
 * model in packages/db/prisma/schema.prisma). Trimmed port of the validation
 * shape in asafarim-digital's @asafarim/location package — kept here rather
 * than as a separate workspace package since this platform doesn't yet need
 * geocoding/distance helpers, just storage + CRUD.
 */
import { z } from "zod";
import { prisma } from "@asafarim/db";

export const LocationTypeSchema = z.enum(["home", "work", "billing", "shipping", "other"]);
export const LocationSourceSchema = z.enum(["manual", "browser", "geocoded", "ip"]);

const CountryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "Must be a valid 2-letter country code (e.g. US, NL)")
  .transform((c) => c.toUpperCase());

/** Treats an empty/whitespace-only string as "field not provided" — forms routinely submit "" for untouched optional inputs. */
function optionalTrimmed<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
}

export const CreateLocationInputSchema = z.object({
  type: LocationTypeSchema.default("home"),
  label: optionalTrimmed(z.string().trim().min(1).max(50)),
  formatted: optionalTrimmed(z.string().trim().min(1).max(500)),
  street1: optionalTrimmed(z.string().trim().min(1).max(200)),
  street2: optionalTrimmed(z.string().trim().max(200)),
  city: optionalTrimmed(z.string().trim().min(1).max(100)),
  state: optionalTrimmed(z.string().trim().min(1).max(100)),
  postalCode: optionalTrimmed(z.string().trim().min(1).max(20)),
  country: optionalTrimmed(CountryCodeSchema),
  countryName: optionalTrimmed(z.string().trim().min(1).max(100)),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  timezone: optionalTrimmed(z.string().max(50)),
  isPrimary: z.boolean().default(false),
  source: LocationSourceSchema.default("manual"),
});
export type CreateLocationInput = z.infer<typeof CreateLocationInputSchema>;

export const UpdateLocationInputSchema = CreateLocationInputSchema.partial();
export type UpdateLocationInput = z.infer<typeof UpdateLocationInputSchema>;

export async function listUserLocations(userId: string) {
  return prisma.userLocation.findMany({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/** Unsets isPrimary on every other location for this user. */
async function clearOtherPrimaries(userId: string, exceptId?: string) {
  await prisma.userLocation.updateMany({
    where: { userId, isPrimary: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isPrimary: false },
  });
}

export async function createUserLocation(userId: string, rawInput: unknown) {
  const input = CreateLocationInputSchema.parse(rawInput);
  const created = await prisma.userLocation.create({
    data: { userId, ...input },
  });
  if (input.isPrimary) {
    await clearOtherPrimaries(userId, created.id);
  }
  return created;
}

/** Scoped by userId — a user can only update their own locations. */
export async function updateUserLocation(userId: string, locationId: string, rawInput: unknown) {
  const input = UpdateLocationInputSchema.parse(rawInput);
  const existing = await prisma.userLocation.findFirst({ where: { id: locationId, userId } });
  if (!existing) return null;

  const updated = await prisma.userLocation.update({
    where: { id: locationId },
    data: input,
  });
  if (input.isPrimary) {
    await clearOtherPrimaries(userId, locationId);
  }
  return updated;
}

/** Scoped by userId — a user can only delete their own locations. */
export async function deleteUserLocation(userId: string, locationId: string): Promise<boolean> {
  const existing = await prisma.userLocation.findFirst({ where: { id: locationId, userId } });
  if (!existing) return false;
  await prisma.userLocation.delete({ where: { id: locationId } });
  return true;
}
