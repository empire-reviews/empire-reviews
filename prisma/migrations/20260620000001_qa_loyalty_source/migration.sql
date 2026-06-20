-- Feature foundation migration: Q&A, Loyalty rewards, and review source tagging.
--
-- All statements are additive and idempotent (IF NOT EXISTS / DEFAULTs) so they
-- are safe to run on the existing production DB as well as a fresh deploy.
-- Prisma wraps each migration in a single transaction; no CONCURRENTLY here.

-- 1. Review source tagging (native | csv | google | aliexpress)
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'native';

-- 2. Loyalty / reward settings (all defaulted so existing rows backfill cleanly)
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "enableRewards" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "rewardType" TEXT NOT NULL DEFAULT 'percentage';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "rewardValue" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "rewardMinRating" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "rewardRequirePhoto" BOOLEAN NOT NULL DEFAULT false;

-- 3. Question & Answer tables
CREATE TABLE IF NOT EXISTS "Question" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "isMerchant" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Question_shop_idx" ON "Question" ("shop");
CREATE INDEX IF NOT EXISTS "Question_productId_idx" ON "Question" ("productId");
CREATE INDEX IF NOT EXISTS "Question_shop_productId_status_idx" ON "Question" ("shop", "productId", "status");
CREATE INDEX IF NOT EXISTS "Question_shop_status_idx" ON "Question" ("shop", "status");
CREATE INDEX IF NOT EXISTS "Answer_questionId_idx" ON "Answer" ("questionId");

-- FK with cascade delete so answers vanish when a question is removed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Answer_questionId_fkey'
  ) THEN
    ALTER TABLE "Answer"
      ADD CONSTRAINT "Answer_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "Question"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- 4. Reward table (loyalty)
CREATE TABLE IF NOT EXISTS "Reward" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reviewId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "discountCode" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Reward_shop_idx" ON "Reward" ("shop");
CREATE INDEX IF NOT EXISTS "Reward_customerEmail_idx" ON "Reward" ("customerEmail");
CREATE INDEX IF NOT EXISTS "Reward_shop_customerEmail_idx" ON "Reward" ("shop", "customerEmail");
