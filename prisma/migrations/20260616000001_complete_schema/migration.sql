-- Complete schema migration
-- Brings a DB created only by 20260212160001_init_neon up to the full schema.prisma.
-- Adds missing Settings/Order columns, the Unsubscriber & RateLimit tables,
-- missing CampaignSend/Order indexes, and ALL foreign key constraints.
-- IF [NOT] EXISTS guards make this safe to run against a DB that was bootstrapped
-- via `prisma db push` (which may already have some of these objects).

-- ============================================================
-- Settings: add missing columns
-- ============================================================
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "publishMode" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#3b82f6';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "bgColor" TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "widgetBgColor" TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "starColor" TEXT NOT NULL DEFAULT '#fbbf24';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "borderRadius" TEXT NOT NULL DEFAULT '8px';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "enableFloatingTab" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "floatingTabPosition" TEXT NOT NULL DEFAULT 'left';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "enableAiSummary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "adminEmail" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "businessType" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "isDropshipping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "acquisitionStrategy" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "storeLogoUrl" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiApiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiInsightsSummary" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "aiInsightsUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "resendApiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "reviewRequestDelay" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "senderEmail" TEXT NOT NULL DEFAULT 'reviews@empirereviews.com';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "physicalAddress" TEXT;

-- ============================================================
-- Order: add missing columns
-- ============================================================
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "productTitle" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reviewRequestSentAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reviewRequestStatus" TEXT NOT NULL DEFAULT 'pending';

-- ============================================================
-- Unsubscriber: create table
-- ============================================================
CREATE TABLE IF NOT EXISTS "Unsubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unsubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Unsubscriber_email_shop_key" ON "Unsubscriber"("email", "shop");
CREATE INDEX IF NOT EXISTS "Unsubscriber_email_idx" ON "Unsubscriber"("email");
CREATE INDEX IF NOT EXISTS "Unsubscriber_shop_idx" ON "Unsubscriber"("shop");

-- ============================================================
-- RateLimit: create table
-- ============================================================
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimit_key_window_key" ON "RateLimit"("key", "window");
CREATE INDEX IF NOT EXISTS "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- ============================================================
-- Missing indexes from schema.prisma
-- ============================================================
CREATE INDEX IF NOT EXISTS "Review_shop_idx" ON "Review"("shop");
CREATE INDEX IF NOT EXISTS "Review_productId_idx" ON "Review"("productId");
CREATE INDEX IF NOT EXISTS "Review_status_idx" ON "Review"("status");

CREATE INDEX IF NOT EXISTS "CampaignSend_sentAt_idx" ON "CampaignSend"("sentAt");
CREATE INDEX IF NOT EXISTS "CampaignSend_openedAt_idx" ON "CampaignSend"("openedAt");
CREATE INDEX IF NOT EXISTS "CampaignSend_clickedAt_idx" ON "CampaignSend"("clickedAt");

CREATE INDEX IF NOT EXISTS "Order_reviewRequestStatus_idx" ON "Order"("reviewRequestStatus");
CREATE INDEX IF NOT EXISTS "Order_shop_reviewRequestStatus_idx" ON "Order"("shop", "reviewRequestStatus");
CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order"("customerEmail");
CREATE INDEX IF NOT EXISTS "Order_fulfilledAt_idx" ON "Order"("fulfilledAt");
CREATE INDEX IF NOT EXISTS "Order_deliveredAt_idx" ON "Order"("deliveredAt");

-- ============================================================
-- Foreign key constraints
-- (DO blocks guard against re-adding if already present, since
--  `prisma db push` may have created them under the same name.)
-- ============================================================
DO $$ BEGIN
    ALTER TABLE "ReviewMedia" ADD CONSTRAINT "ReviewMedia_reviewId_fkey"
        FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Reply" ADD CONSTRAINT "Reply_reviewId_fkey"
        FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "CampaignMetrics" ADD CONSTRAINT "CampaignMetrics_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
