import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import { readContactPreferences, type ContactPreferences } from "./contract";

/** The workspace's saved contact preferences (#940), or null: none saved,
 *  or stored content that no longer reads. */
export async function getContactPreferences(workspaceId: string): Promise<ContactPreferences | null> {
  const row = await getJobmatchDb().contactPreferences.findUnique({ where: { workspaceId }, select: { content: true } });
  return row ? readContactPreferences(row.content) : null;
}

/** Saves the defaults, or removes them with null (back to today's emails). */
export async function saveContactPreferences(workspaceId: string, prefs: ContactPreferences | null): Promise<void> {
  const db = getJobmatchDb();
  if (prefs === null) {
    const { count } = await db.contactPreferences.deleteMany({ where: { workspaceId } });
    if (count > 0) await recordAuditEvent(workspaceId, "contact_preferences.cleared", {});
    return;
  }
  const content = prefs as unknown as object;
  await db.contactPreferences.upsert({ where: { workspaceId }, create: { workspaceId, content }, update: { content } });
  await recordAuditEvent(workspaceId, "contact_preferences.saved", {
    callWindows: prefs.callWindows.length,
    outsideHours: prefs.outsideHours,
    email: prefs.email,
    whatsapp: prefs.whatsapp,
  });
}
