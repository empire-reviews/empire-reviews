-- Composite indexes for the two most common query patterns in api.reviews.tsx:
--
-- 1. Product page widget: WHERE shop = ? AND productId = ? AND status = 'approved'
-- 2. Store-wide widget / trust badge: WHERE shop = ? AND status = 'approved'
--
-- PostgreSQL can use a single index scan instead of intersecting two separate indexes.
-- This is the pattern used by Yotpo, Okendo, and Judge.me at scale.
-- The existing single-column indexes are kept (Prisma declared them); these composites
-- are additive and cover the multi-column hot paths.
--
-- NOTE: CONCURRENTLY was removed. Prisma wraps each migration file in a single
-- transaction, and `CREATE INDEX CONCURRENTLY` cannot run inside a transaction
-- (Postgres error 25001) — it aborted `migrate deploy` on every fresh DB. On a
-- fresh deploy the table is empty so there is no lock-contention concern, and
-- `IF NOT EXISTS` keeps these statements a no-op where the index already exists
-- (e.g. prod, which was bootstrapped before this migration).

CREATE INDEX IF NOT EXISTS "Review_shop_productId_status_idx"
  ON "Review" ("shop", "productId", "status");

CREATE INDEX IF NOT EXISTS "Review_shop_status_idx"
  ON "Review" ("shop", "status");
