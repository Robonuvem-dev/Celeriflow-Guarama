ALTER TABLE "SocialCatalogEntry" ADD COLUMN "allowedUnitTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "SocialPersonProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "nis" TEXT,
  "genderIdentity" TEXT,
  "sexualOrientation" TEXT,
  "workSituation" TEXT,
  "occupation" TEXT,
  "workplace" TEXT,
  "admittedAt" DATE,
  "lastReviewedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SocialPersonProfile_personId_key" ON "SocialPersonProfile"("personId");
CREATE UNIQUE INDEX "SocialPersonProfile_nis_key" ON "SocialPersonProfile"("nis");
CREATE TABLE "SocialPersonFact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "catalogId" TEXT NOT NULL REFERENCES "SocialCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "identifiedAt" DATE NOT NULL,
  "observations" TEXT,
  "endedAt" DATE,
  "endingReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "endedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPersonFact_kind_check" CHECK ("kind" IN ('VULNERABILITY','POTENTIALITY')),
  CONSTRAINT "SocialPersonFact_period_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "identifiedAt")
);
CREATE INDEX "SocialPersonFact_personId_kind_endedAt_idx" ON "SocialPersonFact"("personId", "kind", "endedAt");
CREATE INDEX "SocialPersonFact_unitId_idx" ON "SocialPersonFact"("unitId");
CREATE UNIQUE INDEX "SocialPersonFact_active_key" ON "SocialPersonFact"("personId", "catalogId", "unitId") WHERE "endedAt" IS NULL;
CREATE TABLE "SocialFinancialEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "catalogId" TEXT NOT NULL REFERENCES "SocialCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "value" DECIMAL(14,2) NOT NULL,
  "employmentDescription" TEXT,
  "observations" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "cancelledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialFinancialEntry_kind_check" CHECK ("kind" IN ('INCOME','EXPENSE')),
  CONSTRAINT "SocialFinancialEntry_value_check" CHECK ("value" > 0)
);
CREATE INDEX "SocialFinancialEntry_personId_competence_kind_idx" ON "SocialFinancialEntry"("personId", "competence", "kind");
CREATE INDEX "SocialFinancialEntry_unitId_idx" ON "SocialFinancialEntry"("unitId");
