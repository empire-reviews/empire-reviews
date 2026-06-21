-- CreateTable
CREATE TABLE "SupportPresence" (
    "scope" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typingShop" TEXT,
    "typingAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportPresence_pkey" PRIMARY KEY ("scope")
);
