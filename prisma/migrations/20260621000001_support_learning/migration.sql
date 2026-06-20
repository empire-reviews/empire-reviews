-- Support assistant learning loop: feedback fields + curated LearnedAnswer memory.
-- Additive + idempotent.

ALTER TABLE "SupportLog" ADD COLUMN IF NOT EXISTS "learned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupportLog" ADD COLUMN IF NOT EXISTS "helpful" BOOLEAN;
ALTER TABLE "SupportLog" ADD COLUMN IF NOT EXISTS "taught" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "LearnedAnswer" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearnedAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LearnedAnswer_active_idx" ON "LearnedAnswer" ("active");
