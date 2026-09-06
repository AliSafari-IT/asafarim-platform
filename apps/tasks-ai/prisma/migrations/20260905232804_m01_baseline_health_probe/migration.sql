-- CreateTable
CREATE TABLE "health_probe" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "health_probe_pkey" PRIMARY KEY ("id")
);
