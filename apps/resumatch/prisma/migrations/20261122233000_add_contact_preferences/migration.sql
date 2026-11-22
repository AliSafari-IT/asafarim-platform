
-- CreateEnum
CREATE TYPE "ContactMode" AS ENUM ('DEFAULT', 'OVERRIDE', 'OMIT');

-- AlterTable
ALTER TABLE "application_email_drafts" ADD COLUMN     "contactMode" "ContactMode" NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "contactOverride" JSONB,
ADD COLUMN     "contactParagraph" TEXT;

-- CreateTable
CREATE TABLE "contact_preferences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_preferences_workspaceId_key" ON "contact_preferences"("workspaceId");

-- AddForeignKey
ALTER TABLE "contact_preferences" ADD CONSTRAINT "contact_preferences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

