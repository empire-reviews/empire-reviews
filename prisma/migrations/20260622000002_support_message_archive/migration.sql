-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportMessage_shop_archivedAt_idx" ON "SupportMessage"("shop", "archivedAt");
