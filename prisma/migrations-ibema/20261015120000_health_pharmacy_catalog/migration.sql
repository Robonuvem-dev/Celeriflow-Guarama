CREATE TABLE "HealthDcbSubstance" (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, "casNumber" TEXT NOT NULL,
  version TEXT NOT NULL, "sourceReference" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code, version)
);
CREATE INDEX "HealthDcbSubstance_name_isActive_idx" ON "HealthDcbSubstance"(name, "isActive");
ALTER TABLE "HealthMaterialProfile"
  ADD COLUMN "catmatCode" TEXT, ADD COLUMN "supplyUnitCode" TEXT,
  ADD COLUMN "stockUnitsPerSupply" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "renameMember" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "renameReference" TEXT,
  ADD COLUMN "remumeMember" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "remumeReference" TEXT,
  ADD COLUMN "prescriptionRecommendation" TEXT, ADD COLUMN "pharmaceuticalComponent" TEXT,
  ADD COLUMN "dcbSubstanceId" TEXT REFERENCES "HealthDcbSubstance"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "HealthCatmatUnitMapping" (
  id TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "HealthMaterialProfile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "localUnitCode" TEXT NOT NULL, "officialUnitCode" TEXT NOT NULL, "localUnitsPerOfficial" DOUBLE PRECISION NOT NULL,
  reference TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("profileId", "officialUnitCode")
);
