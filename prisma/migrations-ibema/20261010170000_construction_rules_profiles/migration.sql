ALTER TABLE "ConstructionCase" ADD COLUMN "additionalValues" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "formSnapshot" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "ConstructionProfessional" (
 "id" TEXT PRIMARY KEY, "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "professionalType" TEXT NOT NULL CHECK ("professionalType" IN ('ENGINEER','ARCHITECT','BROKER')),
 "council" TEXT NOT NULL, "registration" TEXT NOT NULL, "startsAt" DATE NOT NULL, "endsAt" DATE,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "ConstructionProfessional_council_registration_key" ON "ConstructionProfessional"("council","registration");
CREATE TABLE "ConstructionProfessionalEmployer" (
 "id" TEXT PRIMARY KEY, "professionalId" TEXT NOT NULL REFERENCES "ConstructionProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" DATE NOT NULL, "endsAt" DATE, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "ConstructionProfessionalEmployer_professionalId_companyId_startsAt_key" ON "ConstructionProfessionalEmployer"("professionalId","companyId","startsAt");
CREATE TABLE "ConstructionDefinitionVersion" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('FORM','VIABILITY','PERMIT','INSPECTION','COMPLETION')),
 "version" INTEGER NOT NULL CHECK ("version" > 0), "definition" JSONB NOT NULL, "publishedBy" TEXT NOT NULL,
 "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionDefinitionVersion_kind_version_key" ON "ConstructionDefinitionVersion"("kind","version");
CREATE TRIGGER "ConstructionDefinitionVersion_immutable" BEFORE UPDATE OR DELETE ON "ConstructionDefinitionVersion" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionDistributionVersion" (
 "id" TEXT PRIMARY KEY, "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "strategy" TEXT NOT NULL CHECK ("strategy" IN ('SECTOR','USER','MANAGER','LOWEST_LOAD')),
 "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("strategy" <> 'USER' OR "employeeId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ConstructionDistributionVersion_departmentId_version_key" ON "ConstructionDistributionVersion"("departmentId","version");
CREATE TRIGGER "ConstructionDistributionVersion_immutable" BEFORE UPDATE OR DELETE ON "ConstructionDistributionVersion" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionZoneVersion" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0), "name" TEXT NOT NULL,
 "legalBasis" TEXT NOT NULL, "startsAt" DATE NOT NULL, "endsAt" DATE, "allowedPurposeIds" TEXT[] NOT NULL, "allowedCategories" TEXT[] NOT NULL,
 "minimumLandArea" DECIMAL(14,4) NOT NULL CHECK ("minimumLandArea" >= 0), "maxFloorAreaRatio" DECIMAL(10,4) NOT NULL CHECK ("maxFloorAreaRatio" > 0),
 "automatic" BOOLEAN NOT NULL, "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "ConstructionZoneVersion_code_version_key" ON "ConstructionZoneVersion"("code","version");
CREATE TRIGGER "ConstructionZoneVersion_immutable" BEFORE UPDATE OR DELETE ON "ConstructionZoneVersion" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionPropertyZone" (
 "id" TEXT PRIMARY KEY, "realEstateId" TEXT NOT NULL REFERENCES "RealEstate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "zoneId" TEXT NOT NULL REFERENCES "ConstructionZoneVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ConstructionPropertyZone_realEstateId_key" ON "ConstructionPropertyZone"("realEstateId");
CREATE TABLE "ConstructionViabilityResult" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "outcome" TEXT NOT NULL CHECK ("outcome" IN ('APPROVED','DENIED','MANUAL')),
 "calculationSnapshot" JSONB NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionViabilityResult_requestKey_key" ON "ConstructionViabilityResult"("requestKey");
CREATE TRIGGER "ConstructionViabilityResult_immutable" BEFORE UPDATE OR DELETE ON "ConstructionViabilityResult" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
