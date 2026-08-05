import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findNearbyTutors,
  scoreTutors,
  canTutorServiceLocation,
  updateTutorLocation,
  type ScoredTutor,
} from "../tutor-matching";
import { prisma } from "@asafarim/db";

// Mock Prisma
vi.mock("@asafarim/db", () => ({
  prisma: {
    eduTutorProfile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("findNearbyTutors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries PostGIS for tutors within radius", async () => {
    const mockResults = [
      {
        userId: "tutor-1",
        bio: "Math expert",
        subjectsTaught: ["Math", "Physics"],
        levelsTaught: ["K12", "UNDERGRAD"],
        hourlyRateCents: 5000,
        onlineOnly: false,
        serviceRadiusKm: 25,
        ratingAvg: 4.8,
        ratingCount: 12,
        verifiedAt: new Date(),
        homeLat: 51.552366140432586,
        homeLng: -0.1278,
      },
    ];

    vi.mocked(prisma.eduTutorProfile.findMany).mockResolvedValueOnce(mockResults as never);

    const result = await findNearbyTutors({
      studentLocation: { lat: 51.5074, lng: -0.1278 }, // London
      subject: "Math",
      gradeLevel: "K12",
      maxDistanceKm: 50,
      limit: 20,
    });

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("tutor-1");
    expect(result[0].distanceKm).toBe(5); // 5000m = 5km
  });

  it("returns empty array when no tutors found", async () => {
    vi.mocked(prisma.eduTutorProfile.findMany).mockResolvedValueOnce([]);

    const result = await findNearbyTutors({
      studentLocation: { lat: 0, lng: 0 },
      subject: "Biology",
      gradeLevel: "GRAD",
      maxDistanceKm: 10,
    });

    expect(result).toHaveLength(0);
  });

  it("converts distance from meters to km with precision", async () => {
    vi.mocked(prisma.eduTutorProfile.findMany).mockResolvedValueOnce([
      {
        ...mockTutor(),
        homeLat: 40.82380717154044,
        homeLng: -74.006,
      },
    ] as never);

    const result = await findNearbyTutors({
      studentLocation: { lat: 40.7128, lng: -74.006 }, // NYC
      subject: "Physics",
      gradeLevel: "UNDERGRAD",
    });

    expect(result[0].distanceKm).toBe(12.3); // rounded to 1 decimal
  });
});

describe("scoreTutors", () => {
  const baseTutor: ScoredTutor = {
    userId: "tutor-1",
    bio: "Experienced tutor",
    subjectsTaught: ["Math", "Physics"],
    levelsTaught: ["K12", "UNDERGRAD"],
    hourlyRateCents: 5000,
    onlineOnly: false,
    serviceRadiusKm: 25,
    ratingAvg: 4.5,
    ratingCount: 10,
    verifiedAt: new Date(),
    distanceKm: 10,
    subjectMatch: false,
    levelMatch: false,
    availabilityScore: 0,
    compositeScore: 0,
  };

  it("gives higher scores to closer tutors", () => {
    const tutors = [
      { ...baseTutor, userId: "far", distanceKm: 40 },
      { ...baseTutor, userId: "near", distanceKm: 5 },
    ];

    const scored = scoreTutors(tutors, "Math", "K12");

    const nearTutor = scored.find((t) => t.userId === "near")!;
    const farTutor = scored.find((t) => t.userId === "far")!;
    expect(nearTutor.compositeScore).toBeGreaterThan(farTutor.compositeScore);
  });

  it("gives full credit for exact subject match", () => {
    const tutors = [
      { ...baseTutor, subjectsTaught: ["Math"], userId: "exact" },
      { ...baseTutor, subjectsTaught: ["Chemistry"], userId: "none" },
    ];

    const scored = scoreTutors(tutors, "Math", "K12");

    const exactMatch = scored.find((t) => t.userId === "exact")!;
    expect(exactMatch.subjectMatch).toBe(true);
    expect(exactMatch.compositeScore).toBeGreaterThan(
      scored.find((t) => t.userId === "none")!.compositeScore,
    );
  });

  it("gives partial credit for case-insensitive substring match", () => {
    const tutors = [
      { ...baseTutor, subjectsTaught: ["Mathematics"], userId: "substring" },
    ];

    const scored = scoreTutors(tutors, "Math", "K12");

    expect(scored[0].subjectMatch).toBe(true);
  });

  it("gives bonus for verified tutors", () => {
    const tutors = [
      { ...baseTutor, verifiedAt: new Date(), userId: "verified" },
      { ...baseTutor, verifiedAt: null, userId: "unverified" },
    ];

    const scored = scoreTutors(tutors, "Physics", "UNDERGRAD");

    const verified = scored.find((t) => t.userId === "verified")!;
    const unverified = scored.find((t) => t.userId === "unverified")!;
    expect(verified.compositeScore).toBeGreaterThan(unverified.compositeScore);
  });

  it("incorporates rating into score", () => {
    const tutors = [
      { ...baseTutor, ratingAvg: 5.0, userId: "top" },
      { ...baseTutor, ratingAvg: 3.0, userId: "avg" },
    ];

    const scored = scoreTutors(tutors, "Math", "K12");

    expect(scored[0].userId).toBe("top");
  });

  it("penalizes tutors who don't match online preference", () => {
    const tutors = [
      { ...baseTutor, onlineOnly: false, userId: "inperson" },
      { ...baseTutor, onlineOnly: true, userId: "online" },
    ];

    const scored = scoreTutors(tutors, "Math", "K12", true); // preferOnline=true

    const onlineTutor = scored.find((t) => t.userId === "online")!;
    const inPersonTutor = scored.find((t) => t.userId === "inperson")!;
    expect(onlineTutor.availabilityScore).toBe(1);
    expect(inPersonTutor.availabilityScore).toBe(0.5);
    expect(onlineTutor.compositeScore).toBeGreaterThan(inPersonTutor.compositeScore);
  });

  it("sorts by composite score descending", () => {
    const tutors = [
      { ...baseTutor, ratingAvg: 3.0, distanceKm: 5, userId: "low" },
      { ...baseTutor, ratingAvg: 5.0, distanceKm: 5, userId: "high" },
    ];

    const scored = scoreTutors(tutors, "Math", "K12");

    expect(scored[0].userId).toBe("high");
    expect(scored[1].userId).toBe("low");
  });
});

describe("canTutorServiceLocation", () => {
  it("returns true when student is within tutor's service radius", async () => {
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValueOnce({
      onlineOnly: false,
      serviceRadiusKm: 25,
      homeLat: 51.5074,
      homeLng: -0.1278,
    } as never);

    const result = await canTutorServiceLocation("tutor-1", { lat: 51.5, lng: -0.1 });

    expect(result).toBe(true);
  });

  it("returns false when outside service radius", async () => {
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValueOnce({
      onlineOnly: false,
      serviceRadiusKm: 25,
      homeLat: 51.5074,
      homeLng: -0.1278,
    } as never);

    const result = await canTutorServiceLocation("tutor-1", { lat: 60, lng: 0 });
    expect(result).toBe(false);
  });

  it("returns false when tutor has no location", async () => {
    vi.mocked(prisma.eduTutorProfile.findUnique).mockResolvedValueOnce({
      onlineOnly: false,
      serviceRadiusKm: 25,
      homeLat: null,
      homeLng: null,
    } as never);

    const result = await canTutorServiceLocation("tutor-no-location", { lat: 51.5, lng: -0.1 });
    expect(result).toBe(false);
  });
});

describe("updateTutorLocation", () => {
  it("updates tutor home location with PostGIS point", async () => {
    vi.mocked(prisma.eduTutorProfile.update).mockResolvedValueOnce({} as never);

    await updateTutorLocation("tutor-1", { lat: 51.5074, lng: -0.1278 });

    expect(prisma.eduTutorProfile.update).toHaveBeenCalledWith({
      where: { userId: "tutor-1" },
      data: { homeLat: 51.5074, homeLng: -0.1278 },
    });
  });
});

function mockTutor() {
  return {
    userId: "tutor-1",
    bio: "Expert",
    subjectsTaught: ["Math"],
    levelsTaught: ["K12"],
    hourlyRateCents: 5000,
    onlineOnly: false,
    serviceRadiusKm: 25,
    ratingAvg: 4.5,
    ratingCount: 10,
    verifiedAt: new Date(),
    homeLat: 40.75791045708758,
    homeLng: -74.006,
  };
}
