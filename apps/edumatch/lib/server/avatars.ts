/**
 * The student avatar system.
 *
 * Every student gets a safe drawn avatar by default. A real-photo upload is
 * only ever allowed once we can prove the student is 13 or older via
 * `EduStudentProfile.dateOfBirth` (see age.ts). The rule is enforced here,
 * server-side, in `setStudentAvatar` — the UI hides the upload option below
 * 13 too, but that's a courtesy, not the boundary.
 */

import { prisma } from "@asafarim/db";
import { isUnder13 } from "./age";
import { isAvatarKeyOwnedBy, buildPublicAvatarUrl } from "./storage";

export type StudentAvatarId =
  | "default"
  | "cosmo"
  | "nova"
  | "bram"
  | "rocket"
  | "microscope"
  | "palette"
  | "globe";

export const STUDENT_AVATARS: ReadonlyArray<{ id: StudentAvatarId; name: string }> = [
  { id: "default", name: "Default" },
  { id: "cosmo", name: "Cosmo the curious cat" },
  { id: "nova", name: "Nova the star" },
  { id: "bram", name: "Bram the book" },
  { id: "rocket", name: "Rocket" },
  { id: "microscope", name: "Microscope" },
  { id: "palette", name: "Palette" },
  { id: "globe", name: "Globe" },
];

const STUDENT_AVATAR_IDS = new Set<string>(STUDENT_AVATARS.map((a) => a.id));

export const DEFAULT_STUDENT_AVATAR_PATH = "/avatars/students/default.svg";

export function presetAvatarPath(id: string): string | null {
  if (!STUDENT_AVATAR_IDS.has(id)) return null;
  return `/avatars/students/${id}.svg`;
}

/** True if `image` is one of our own drawn-avatar paths (vs. an uploaded photo / OAuth picture). */
export function isPresetAvatarPath(image: string | null | undefined): boolean {
  if (!image) return false;
  return STUDENT_AVATARS.some((a) => image === `/avatars/students/${a.id}.svg`);
}

export class AvatarError extends Error {
  constructor(
    public status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AvatarError";
  }
}

export type AvatarSource =
  | { type: "preset"; id: string }
  | { type: "upload"; key: string; publicUrl: string };

export type AvatarState = {
  current: string;
  isPreset: boolean;
  ageVerified: boolean;
  canUpload: boolean;
  avatars: Array<{ id: StudentAvatarId; name: string; src: string }>;
};

/** Read-only view for the avatar picker: current image, upload eligibility, and the preset list. */
export async function getAvatarState(userId: string): Promise<AvatarState> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { image: true } }),
    prisma.eduStudentProfile.findUnique({
      where: { userId },
      select: { dateOfBirth: true },
    }),
  ]);

  const current = user?.image || DEFAULT_STUDENT_AVATAR_PATH;
  const under13 = isUnder13(profile?.dateOfBirth ?? null);

  return {
    current,
    isPreset: isPresetAvatarPath(current),
    ageVerified: profile?.dateOfBirth != null,
    canUpload: !under13,
    avatars: STUDENT_AVATARS.map((a) => ({
      ...a,
      src: `/avatars/students/${a.id}.svg`,
    })),
  };
}

/**
 * Set the caller's avatar. This is the enforcement boundary: an upload is
 * rejected for an under-13 (or unverified-age) student regardless of what
 * the client sent, because the client's own gating is only a courtesy.
 */
export async function setStudentAvatar(
  userId: string,
  source: AvatarSource,
): Promise<{ image: string }> {
  if (source.type === "preset") {
    const path = presetAvatarPath(source.id);
    if (!path) throw new AvatarError(400, "Unknown avatar.");
    await prisma.user.update({ where: { id: userId }, data: { image: path } });
    return { image: path };
  }

  // type === "upload"
  const profile = await prisma.eduStudentProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true },
  });
  if (isUnder13(profile?.dateOfBirth ?? null)) {
    throw new AvatarError(403, "Photo upload is only available for users 13 or older.");
  }
  if (!isAvatarKeyOwnedBy(source.key, userId)) {
    throw new AvatarError(403, "This upload does not belong to you.");
  }

  const url = source.publicUrl || buildPublicAvatarUrl(source.key);
  await prisma.user.update({ where: { id: userId }, data: { image: url } });
  return { image: url };
}

/**
 * Called when a student profile is created. The safe default is always a
 * drawn avatar: an OAuth-supplied photo is left in place only when we can
 * already prove the student is 13+, otherwise it's replaced.
 */
export async function applyDefaultAvatarIfNeeded(
  userId: string,
  dateOfBirth: Date | null | undefined,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
  const hasImage = Boolean(user?.image);

  if (!hasImage) {
    await prisma.user.update({
      where: { id: userId },
      data: { image: DEFAULT_STUDENT_AVATAR_PATH },
    });
    return;
  }

  if (isUnder13(dateOfBirth) && !isPresetAvatarPath(user?.image)) {
    await prisma.user.update({
      where: { id: userId },
      data: { image: DEFAULT_STUDENT_AVATAR_PATH },
    });
  }
}
