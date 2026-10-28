ALTER TABLE "SanConsumerUnit"
  ADD COLUMN "streetAddress" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "postalCode" TEXT;

-- Keep the original address intact; split only the conventional comma-delimited
-- addresses already used by the municipal fixture and the unit registration.
UPDATE "SanConsumerUnit"
SET "streetAddress" = trim(split_part("address", ',', 1) || ', ' || split_part("address", ',', 2)),
    "neighborhood" = nullif(trim(split_part("address", ',', 3)), '')
WHERE "address" ~ '^[^,]+,\s*[^,]+,\s*[^,]+';

CREATE INDEX "SanConsumerUnit_createdAt_id_idx" ON "SanConsumerUnit" ("createdAt", "id");
CREATE INDEX "SanMeterReading_readingDate_id_idx" ON "SanMeterReading" ("readingDate", "id");
CREATE INDEX "SanInvoice_dueDate_id_idx" ON "SanInvoice" ("dueDate", "id");
CREATE INDEX "SanServiceOrder_createdAt_id_idx" ON "SanServiceOrder" ("createdAt", "id");
