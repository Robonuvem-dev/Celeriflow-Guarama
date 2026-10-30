CREATE TABLE "ProcessJunction" (
 "id" text PRIMARY KEY,
 "parentProcessId" text NOT NULL REFERENCES "Process"("id"),
 "childProcessId" text NOT NULL REFERENCES "Process"("id"),
 "reason" text NOT NULL CHECK (length(trim("reason")) BETWEEN 10 AND 2000),
 "createdByUsuarioId" text NOT NULL REFERENCES "Usuario"("id"),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "endedByUsuarioId" text REFERENCES "Usuario"("id"),
 "endedAt" timestamp(3),
 "endReason" text,
 CHECK ("parentProcessId" <> "childProcessId"),
 CHECK (("endedAt" IS NULL AND "endedByUsuarioId" IS NULL AND "endReason" IS NULL) OR ("endedAt" IS NOT NULL AND "endedByUsuarioId" IS NOT NULL AND length(trim("endReason")) BETWEEN 10 AND 2000))
);
CREATE UNIQUE INDEX "ProcessJunction_active_child_key" ON "ProcessJunction" ("childProcessId") WHERE "endedAt" IS NULL;
CREATE INDEX "ProcessJunction_parent_idx" ON "ProcessJunction" ("parentProcessId");
