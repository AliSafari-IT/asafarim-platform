/**
 * Lightweight in-memory upload session tracker with TTL.
 *
 * Production: replace with Redis / BullMQ for persistence and horizontal scaling.
 * Local dev: works out-of-the-box without external services.
 *
 * A session represents a batch upload context. Assets are staged here until
 * the user creates a ViontoProject (or the session expires and is cleaned up).
 */

export type StagedAsset = {
  key: string;
  publicUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  exif?: Record<string, unknown>;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  uploadedAt: Date;
};

export type UploadSession = {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  assets: StagedAsset[];
  metadata?: Record<string, unknown>;
};

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const globalForUploadSessions = globalThis as typeof globalThis & {
  __viontoUploadSessions?: Map<string, UploadSession>;
  __viontoUploadSessionCleanupTimer?: ReturnType<typeof setInterval> | null;
};

const sessions = globalForUploadSessions.__viontoUploadSessions ?? new Map<string, UploadSession>();
globalForUploadSessions.__viontoUploadSessions = sessions;

function startCleanup() {
  if (globalForUploadSessions.__viontoUploadSessionCleanupTimer) return;
  globalForUploadSessions.__viontoUploadSessionCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt.getTime() < now) {
        sessions.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

startCleanup();

export function createSession(userId: string, metadata?: Record<string, unknown>): UploadSession {
  const id = generateSessionId();
  const now = new Date();
  const session: UploadSession = {
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    assets: [],
    metadata,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(sessionId: string): UploadSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (session.expiresAt.getTime() < Date.now()) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function getSessionForUser(sessionId: string, userId: string): UploadSession | undefined {
  const session = getSession(sessionId);
  if (!session || session.userId !== userId) return undefined;
  return session;
}

export function addAssetToSession(sessionId: string, asset: StagedAsset): UploadSession | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;
  session.assets.push(asset);
  // Extend session TTL on activity
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return session;
}

export function removeAssetFromSession(sessionId: string, key: string): UploadSession | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;
  session.assets = session.assets.filter((a) => a.key !== key);
  return session;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listStaleSessions(maxAgeMs: number = SESSION_TTL_MS): UploadSession[] {
  const cutoff = Date.now() - maxAgeMs;
  return Array.from(sessions.values()).filter((s) => s.createdAt.getTime() < cutoff);
}

export function cleanupStaleSessions(maxAgeMs: number = SESSION_TTL_MS): number {
  const stale = listStaleSessions(maxAgeMs);
  let count = 0;
  for (const s of stale) {
    if (sessions.delete(s.id)) count++;
  }
  return count;
}

function generateSessionId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "vss_"; // vionto session
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
