-- Track one-time delivery of the Vionto architecture subscriber incentive.

ALTER TABLE "NewsletterSubscriber"
ADD COLUMN "incentiveSentAt" TIMESTAMP(3),
ADD COLUMN "incentiveMessageId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
