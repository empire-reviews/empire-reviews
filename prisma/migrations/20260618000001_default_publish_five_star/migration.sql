-- Default new shops to auto-publishing 5-star reviews (was 'none' = everything pending).
-- This is the merchant-friendly default: great reviews appear instantly, anything
-- below 5 stars still waits for manual approval in the War Room.
ALTER TABLE "Settings" ALTER COLUMN "publishMode" SET DEFAULT 'five_star';

-- One-time backfill: move existing shops still sitting on the legacy 'none' default
-- onto the new default so their genuine 5-star reviews surface on the storefront
-- without requiring manual approval first. Shops can still switch back to manual
-- ('none') from Settings; this UPDATE only runs once as part of this migration.
UPDATE "Settings" SET "publishMode" = 'five_star' WHERE "publishMode" = 'none';
