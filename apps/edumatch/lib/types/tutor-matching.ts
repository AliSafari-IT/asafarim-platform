export type ScoredTutor = {
  userId: string;
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  hourlyRateCents: number;
  onlineOnly: boolean;
  serviceRadiusKm: number;
  ratingAvg: number;
  ratingCount: number;
  verifiedAt: Date | null;
  distanceKm: number | null;
  subjectMatch: boolean;
  levelMatch: boolean;
  availabilityScore: number;
  compositeScore: number;
};
