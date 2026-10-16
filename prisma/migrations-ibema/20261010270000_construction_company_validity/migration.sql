CREATE TABLE "ConstructionCompanyProfile" (
 "id" TEXT PRIMARY KEY,
 "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "legalReference" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "ConstructionCompanyProfile_companyId_key" ON "ConstructionCompanyProfile"("companyId");
CREATE TABLE "ConstructionCompanyProfileEvent" (
 "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "ConstructionCompanyProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionCompanyProfileEvent_profileId_createdAt_idx" ON "ConstructionCompanyProfileEvent"("profileId","createdAt");
CREATE TRIGGER "ConstructionCompanyProfileEvent_immutable" BEFORE UPDATE OR DELETE ON "ConstructionCompanyProfileEvent" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
