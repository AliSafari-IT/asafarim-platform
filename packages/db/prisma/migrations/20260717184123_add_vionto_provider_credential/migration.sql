-- CreateTable
CREATE TABLE "ViontoProviderCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "apiSecretEnc" TEXT,
    "label" TEXT,
    "maskedKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViontoProviderCredential_userId_idx" ON "ViontoProviderCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ViontoProviderCredential_userId_provider_key" ON "ViontoProviderCredential"("userId", "provider");
