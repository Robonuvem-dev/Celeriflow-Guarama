CREATE TABLE "ConstructionAnalystReplacement" (
 "id" TEXT PRIMARY KEY,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL,
 "previousAnalystId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "previousAssignedId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "replacementEmployeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reason" TEXT NOT NULL CHECK (char_length(btrim("reason")) BETWEEN 10 AND 4000),
 "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionAnalystReplacement_requestKey_key" ON "ConstructionAnalystReplacement"("requestKey");
CREATE INDEX "ConstructionAnalystReplacement_caseId_createdAt_idx" ON "ConstructionAnalystReplacement"("caseId", "createdAt");
CREATE TRIGGER "ConstructionAnalystReplacement_immutable" BEFORE UPDATE OR DELETE ON "ConstructionAnalystReplacement" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
