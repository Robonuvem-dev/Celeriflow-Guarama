CREATE TABLE "ConstructionPortalIdentity" (
 "id" TEXT PRIMARY KEY, "firebaseUid" TEXT NOT NULL, "email" TEXT NOT NULL,
 "professionalId" TEXT NOT NULL REFERENCES "ConstructionProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ConstructionPortalIdentity_firebaseUid_key" ON "ConstructionPortalIdentity"("firebaseUid");
CREATE UNIQUE INDEX "ConstructionPortalIdentity_professionalId_key" ON "ConstructionPortalIdentity"("professionalId");
CREATE TABLE "ConstructionParticipant" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "identityId" TEXT NOT NULL REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" TEXT NOT NULL CHECK ("role" IN ('TECHNICAL','BROKER','REPRESENTATIVE')), "isActive" BOOLEAN NOT NULL DEFAULT true,
 "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endsAt" TIMESTAMP(3), "reason" TEXT NOT NULL,
 "createdBy" TEXT NOT NULL, CHECK (("isActive" AND "endsAt" IS NULL) OR (NOT "isActive" AND "endsAt" IS NOT NULL))
);
CREATE INDEX "ConstructionParticipant_caseId_identityId_isActive_idx" ON "ConstructionParticipant"("caseId","identityId","isActive");
CREATE UNIQUE INDEX "ConstructionParticipant_active_unique" ON "ConstructionParticipant"("caseId","identityId") WHERE "isActive";
CREATE TABLE "ConstructionTermVersion" (
 "id" TEXT PRIMARY KEY, "version" INTEGER NOT NULL CHECK ("version">0), "text" TEXT NOT NULL,
 "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionTermVersion_version_key" ON "ConstructionTermVersion"("version");
CREATE TRIGGER "ConstructionTermVersion_immutable" BEFORE UPDATE OR DELETE ON "ConstructionTermVersion" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionTermAcceptance" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "identityId" TEXT NOT NULL REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "termId" TEXT NOT NULL REFERENCES "ConstructionTermVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionTermAcceptance_caseId_identityId_termId_key" ON "ConstructionTermAcceptance"("caseId","identityId","termId");
CREATE TRIGGER "ConstructionTermAcceptance_immutable" BEFORE UPDATE OR DELETE ON "ConstructionTermAcceptance" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionMessage" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "identityId" TEXT REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "content" TEXT NOT NULL CHECK (char_length(btrim("content")) BETWEEN 1 AND 4000),
 "documentId" TEXT REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "evidenceSnapshot" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("identityId" IS NULL) <> ("employeeId" IS NULL))
);
CREATE UNIQUE INDEX "ConstructionMessage_requestKey_key" ON "ConstructionMessage"("requestKey");
CREATE INDEX "ConstructionMessage_caseId_createdAt_idx" ON "ConstructionMessage"("caseId","createdAt");
CREATE TRIGGER "ConstructionMessage_immutable" BEFORE UPDATE OR DELETE ON "ConstructionMessage" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
