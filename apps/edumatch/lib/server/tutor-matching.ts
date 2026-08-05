/**
 * Phase 3 — Tutor matching.
 *
 * Core capabilities:
 * - Find tutors within radius using Haversine on homeLat/homeLng columns
 * - Match by subject expertise, grade level, and availability
 * - Score and rank tutors by composite algorithm
 *
 * Note: PostGIS is not yet installed; uses plain lat/lng Float columns.
 * TODO: Migrate to ST_DWithin once PostGIS is enabled.
 */

import { prisma } from "@asafarim/db";
import type { GeoPoint } from "./geocoding";
import { unverifiedTutorsExcluded } from "./tutor-verification";
import type { ScoredTutor } from "@/lib/types/tutor-matching";

export type { ScoredTutor } from "@/lib/types/tutor-matching";

export type AvailabilitySlot = {
  start: string; // ISO datetime
  end: string;
  mode: "ONLINE" | "IN_PERSON";
};

export type TutorMatchInput = {
  studentLocation: GeoPoint;
  subject: string;
  gradeLevel: string;
  maxDistanceKm?: number;
  preferOnline?: boolean;
  limit?: number;
};

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find tutors within the specified radius using Haversine on homeLat/homeLng.
 * (PostGIS is not yet installed; uses plain Float columns.)
 */
export async function findNearbyTutors(
  input: TutorMatchInput,
): Promise<ScoredTutor[]> {
  const { studentLocation, maxDistanceKm = 50, limit = 20 } = input;

  const requireVerified = unverifiedTutorsExcluded();
  const tutors = await prisma.eduTutorProfile.findMany({
    where: {
      OR: [
        { onlineOnly: true },
        { homeLat: { not: null }, homeLng: { not: null } },
      ],
      ...(requireVerified ? { verifiedAt: { not: null } } : {}),
    },
    select: {
      userId: true,
      bio: true,
      subjectsTaught: true,
      levelsTaught: true,
      hourlyRateCents: true,
      onlineOnly: true,
      serviceRadiusKm: true,
      ratingAvg: true,
      ratingCount: true,
      verifiedAt: true,
      homeLat: true,
      homeLng: true,
    },
  });

  const nearby: ScoredTutor[] = [];
  for (const t of tutors) {
    let distanceKm = 0;
    if (t.homeLat != null && t.homeLng != null) {
      distanceKm = Math.round(
        haversineKm(studentLocation.lat, studentLocation.lng, t.homeLat, t.homeLng) * 10,
      ) / 10;
      if (!t.onlineOnly && distanceKm > maxDistanceKm) continue;
    }
    nearby.push({
      userId: t.userId,
      bio: t.bio,
      subjectsTaught: t.subjectsTaught,
      levelsTaught: t.levelsTaught,
      hourlyRateCents: t.hourlyRateCents,
      onlineOnly: t.onlineOnly,
      serviceRadiusKm: t.serviceRadiusKm,
      ratingAvg: t.ratingAvg,
      ratingCount: t.ratingCount,
      verifiedAt: t.verifiedAt,
      distanceKm,
      subjectMatch: false,
      levelMatch: false,
      availabilityScore: 0,
      compositeScore: 0,
    });
  }

  return nearby.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

/**
 * Score tutors by composite algorithm.
 * Factors:
 * - Proximity (closer = higher score)
 * - Subject expertise (exact match vs partial)
 * - Grade level match
 * - Rating (higher is better)
 * - Verification status (verified tutors get bonus)
 * - Hourly rate (optional: prefer mid-range)
 */
export function scoreTutors(
  tutors: ScoredTutor[],
  subject: string,
  gradeLevel: string,
  preferOnline: boolean = false,
): ScoredTutor[] {
  return tutors
    .map((t) => {
      // Subject match (case-insensitive partial match)
      const subjectMatch = t.subjectsTaught.some(
        (s) => s.toLowerCase() === subject.toLowerCase() || s.toLowerCase().includes(subject.toLowerCase()),
      );

      // Level match
      const levelMatch = t.levelsTaught.some(
        (l) => l.toLowerCase() === gradeLevel.toLowerCase(),
      );

      // Online preference match
      // If preferOnline=true, only match online-only tutors
      // If preferOnline=false, accept any tutor
      const onlineMatch = preferOnline ? t.onlineOnly : true;

      // Scoring weights (tune based on business priorities)
      const distanceScore = Math.max(0, 50 - t.distanceKm) / 50; // 0-1, closer is better
      const subjectScore = subjectMatch ? 1 : 0.3; // Partial credit for tutors who might be able to help
      const levelScore = levelMatch ? 1 : 0.5;
      const ratingScore = Math.min(t.ratingAvg / 5, 1); // Normalize 0-5 to 0-1
      const verifiedScore = t.verifiedAt ? 0.2 : 0;

      // Composite: weighted sum (all factors 0-1)
      const compositeScore =
        distanceScore * 0.3 +
        subjectScore * 0.25 +
        levelScore * 0.15 +
        ratingScore * 0.2 +
        verifiedScore * 0.1;

      // Availability score for transparency
      const availabilityScore = onlineMatch ? 1 : 0.5;

      // Final score includes availability penalty
      const finalScore = onlineMatch ? compositeScore : compositeScore * 0.5;

      return {
        ...t,
        subjectMatch,
        levelMatch,
        availabilityScore,
        compositeScore: Math.round(finalScore * 1000) / 1000,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Get best matching tutors for an inquiry.
 * Combines spatial query with scoring algorithm.
 */
export async function findBestTutors(
  input: TutorMatchInput,
): Promise<ScoredTutor[]> {
  const nearby = await findNearbyTutors(input);
  return scoreTutors(nearby, input.subject, input.gradeLevel, input.preferOnline);
}

/**
 * Check if a tutor can service a specific location.
 * Uses Haversine with homeLat/homeLng (PostGIS not available).
 */
export async function canTutorServiceLocation(
  tutorId: string,
  location: GeoPoint,
): Promise<boolean> {
  const tutor = await prisma.eduTutorProfile.findUnique({
    where: { userId: tutorId },
    select: { onlineOnly: true, serviceRadiusKm: true, homeLat: true, homeLng: true },
  });
  if (!tutor) return false;
  if (tutor.onlineOnly) return true;
  if (tutor.homeLat == null || tutor.homeLng == null) return false;
  const distanceKm = haversineKm(location.lat, location.lng, tutor.homeLat, tutor.homeLng);
  return distanceKm <= tutor.serviceRadiusKm;
}

/**
 * Update tutor home location with geocoded coordinates.
 * Call this when a tutor updates their address.
 */
export async function updateTutorLocation(
  tutorId: string,
  location: GeoPoint,
): Promise<void> {
  await prisma.eduTutorProfile.update({
    where: { userId: tutorId },
    data: { homeLat: location.lat, homeLng: location.lng },
  });
}
