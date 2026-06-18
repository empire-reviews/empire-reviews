-- Composite indexes for the two most common query patterns in api.reviews.tsx:
--
-- 1. Product page widget: WHERE shop = ? AND productId = ? AND status = 'approved'
-- 2. Store-wide widget / trust badge: WHERE shop = ? AND status = 'approved'
--
-- PostgreSQL can use a single index scan instead of intersecting two separate indexes.
-- This is the pattern used by Yotpo, Okendo, and Judge.me at scale.
-- The existing single-column indexes are kept (Prisma declared them); these composites
-- are additive and cover the multi-column hot paths.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Review_shop_productId_status_idx"
  ON "Review" ("shop", "productId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Review_shop_status_idx"
  ON "Review" ("shop", "status");
