import { z } from "zod";

/** Bounded — a record payload is dynamic per entity (validated for real against the spec in lib/generated-data/validation.ts), but the raw JSON body itself must still be shape- and size-bounded before it ever reaches that layer. */
export const RecordDataBody = z.object({
  data: z.record(z.string().max(100), z.unknown()).refine((obj) => Object.keys(obj).length <= 100, "Too many fields in one request."),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export const UpdateRecordBody = z.object({
  data: z.record(z.string().max(100), z.unknown()).refine((obj) => Object.keys(obj).length <= 100, "Too many fields in one request."),
  baseRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export const AddMemberBody = z.object({
  principalId: z.string().min(1).max(200),
  roleIds: z.array(z.string().min(1).max(64)).min(1).max(20),
});

export const ChangeMemberRolesBody = z.object({
  roleIds: z.array(z.string().min(1).max(64)).min(1).max(20),
});

export const BootstrapAdminBody = z.object({
  adminRoleId: z.string().min(1).max(64),
});

export const InitUploadBody = z.object({
  entityId: z.string().min(1).max(64),
  fieldId: z.string().min(1).max(64),
  recordId: z.string().min(1).max(100).optional(),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  originalFilename: z.string().min(1).max(255),
});

export const SeedResetBody = z.object({
  confirm: z.literal(true),
});

const FilterOperator = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains"]);
export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sortFieldId: z.string().max(64).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  search: z.string().max(200).optional(),
  includeArchived: z.coerce.boolean().optional(),
  filters: z
    .string()
    .max(2000)
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw);
        const result = z.array(z.object({ fieldId: z.string().max(64), op: FilterOperator, value: z.union([z.string(), z.number(), z.boolean()]) })).max(10).safeParse(parsed);
        if (!result.success) {
          ctx.addIssue({ code: "custom", message: "Invalid filters." });
          return undefined;
        }
        return result.data;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid filters JSON." });
        return undefined;
      }
    }),
});
