-- CreateTable
CREATE TABLE "SupportThread" (
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ai',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("shop")
);
