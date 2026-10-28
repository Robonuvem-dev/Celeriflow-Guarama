-- The active historical baseline has only a non-unique lookup index. Preserve
-- that index and every notification; fail atomically if prior duplicates exist.
-- The application lookup preserves replay and ON CONFLICT handles racing sends.
CREATE UNIQUE INDEX "ProtocolNotification_userId_dedupeKey_unique"
  ON "ProtocolNotification" ("userId", "dedupeKey")
  WHERE "dedupeKey" IS NOT NULL;
