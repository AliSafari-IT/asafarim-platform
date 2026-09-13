-- AlterTable
ALTER TABLE "ViontoAiClip" ADD COLUMN     "costSource" TEXT,
ADD COLUMN     "credentialSource" TEXT,
ADD COLUMN     "estimatedCostUsdMicros" BIGINT,
ADD COLUMN     "pricingSnapshot" JSONB;
