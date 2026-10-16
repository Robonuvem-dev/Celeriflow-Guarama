CREATE TABLE "ConstructionConsultation" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "requestedBy" TEXT NOT NULL,
 "sourceDepartmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "targetDepartmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "question" TEXT NOT NULL CHECK (char_length(btrim("question")) BETWEEN 10 AND 4000),
 "dueAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("sourceDepartmentId" <> "targetDepartmentId")
);
CREATE UNIQUE INDEX "ConstructionConsultation_requestKey_key" ON "ConstructionConsultation"("requestKey");
CREATE INDEX "ConstructionConsultation_targetDepartmentId_dueAt_idx" ON "ConstructionConsultation"("targetDepartmentId","dueAt");
CREATE TRIGGER "ConstructionConsultation_immutable" BEFORE UPDATE OR DELETE ON "ConstructionConsultation" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionConsultationResponse" (
 "id" TEXT PRIMARY KEY, "consultationId" TEXT NOT NULL REFERENCES "ConstructionConsultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "opinion" TEXT NOT NULL CHECK (char_length(btrim("opinion")) BETWEEN 10 AND 10000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionConsultationResponse_consultationId_key" ON "ConstructionConsultationResponse"("consultationId");
CREATE TRIGGER "ConstructionConsultationResponse_immutable" BEFORE UPDATE OR DELETE ON "ConstructionConsultationResponse" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
