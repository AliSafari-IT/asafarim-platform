-- AlterTable
ALTER TABLE "Timeline" ADD COLUMN     "aiLockedFields" JSONB;

-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN     "aiLocked" BOOLEAN NOT NULL DEFAULT false;
