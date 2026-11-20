-- Optional CV photo (one per workspace) and a per-CV choice to show it.
-- Additive: no existing row changes meaning; showPhoto null = follow the
-- profile default.

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pixelSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "shape" TEXT NOT NULL DEFAULT 'circle',
    "includeByDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_workspaceId_key" ON "profile_photos"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_storageKey_key" ON "profile_photos"("storageKey");

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "tailored_resumes" ADD COLUMN "showPhoto" BOOLEAN;
