CREATE TABLE "SocialCatalogEntry" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialCatalogEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialCatalogEntry_kind_name_key" ON "SocialCatalogEntry"("kind", "name");
CREATE INDEX "SocialCatalogEntry_kind_isActive_idx" ON "SocialCatalogEntry"("kind", "isActive");
CREATE TABLE "SocialMinimumWage" (
  "id" TEXT NOT NULL,
  "validFrom" DATE NOT NULL,
  "value" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialMinimumWage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialMinimumWage_positive_value" CHECK ("value" > 0)
);
CREATE UNIQUE INDEX "SocialMinimumWage_validFrom_key" ON "SocialMinimumWage"("validFrom");
