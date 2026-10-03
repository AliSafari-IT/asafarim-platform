-- AlterTable
ALTER TABLE "membership" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "profileSyncedAt" TIMESTAMP(3);
