-- In-app support assistant conversation log. Additive + idempotent.
CREATE TABLE IF NOT EXISTS "SupportLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "usedAi" BOOLEAN NOT NULL DEFAULT false,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportLog_shop_idx" ON "SupportLog" ("shop");
CREATE INDEX IF NOT EXISTS "SupportLog_createdAt_idx" ON "SupportLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "SupportLog_shop_createdAt_idx" ON "SupportLog" ("shop", "createdAt");
