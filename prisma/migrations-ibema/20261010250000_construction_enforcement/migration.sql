CREATE TABLE "ConstructionEnforcementCase" (
  "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"("id") ON DELETE RESTRICT,
  "realEstateId" TEXT NOT NULL REFERENCES "RealEstate"("id") ON DELETE RESTRICT,
  "permitCaseId" TEXT REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
  "locationType" TEXT NOT NULL CHECK ("locationType" IN ('URBAN','RURAL')),
  "permitStatus" TEXT NOT NULL CHECK ("permitStatus" IN ('WITHOUT_PERMIT','REPORTED_PERMIT','UNKNOWN')),
  "reason" TEXT NOT NULL, "cadastralSnapshot" JSONB NOT NULL, "assignedEmployeeId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','EMBARGOED')),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0), "isDemonstration" BOOLEAN NOT NULL DEFAULT true CHECK ("isDemonstration"),
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("permitStatus" <> 'WITHOUT_PERMIT' OR "permitCaseId" IS NULL)
);
CREATE INDEX "ConstructionEnforcementCase_realEstateId_createdAt_idx" ON "ConstructionEnforcementCase"("realEstateId","createdAt");
CREATE TABLE "ConstructionEnforcementAssignment" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionEnforcementCase"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "previousEmployeeId" TEXT, "employeeId" TEXT NOT NULL, "departmentId" TEXT NOT NULL,
  "staffRoleId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionEnforcementAssignment_caseId_createdAt_idx" ON "ConstructionEnforcementAssignment"("caseId","createdAt");
CREATE TABLE "ConstructionEnforcementVisit" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionEnforcementCase"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "visitedAt" TIMESTAMP(3) NOT NULL, "findings" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL, "staffRoleId" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionEnforcementVisit_caseId_visitedAt_idx" ON "ConstructionEnforcementVisit"("caseId","visitedAt");
CREATE TABLE "ConstructionEnforcementAct" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionEnforcementCase"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "number" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PRELIMINARY_NOTICE','FISCAL_NOTICE','INFRACTION','EMBARGO','LIFT_EMBARGO')),
  "visitId" TEXT REFERENCES "ConstructionEnforcementVisit"("id") ON DELETE RESTRICT,
  "relatedActId" TEXT REFERENCES "ConstructionEnforcementAct"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL, "legalBasis" TEXT NOT NULL, "issuedAt" TIMESTAMP(3) NOT NULL, "deadlineAt" TIMESTAMP(3),
  "employeeId" TEXT NOT NULL, "departmentId" TEXT NOT NULL, "staffRoleId" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("deadlineAt" IS NULL OR "deadlineAt" >= "issuedAt"),
  CHECK ("kind" <> 'LIFT_EMBARGO' OR "relatedActId" IS NOT NULL),
  CHECK ("kind" NOT IN ('PRELIMINARY_NOTICE','FISCAL_NOTICE') OR "deadlineAt" IS NOT NULL)
);
CREATE INDEX "ConstructionEnforcementAct_caseId_issuedAt_idx" ON "ConstructionEnforcementAct"("caseId","issuedAt");
CREATE TABLE "ConstructionEnforcementAcknowledgement" (
  "id" TEXT PRIMARY KEY, "actId" TEXT NOT NULL REFERENCES "ConstructionEnforcementAct"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "acknowledgedAt" TIMESTAMP(3) NOT NULL,
  "method" TEXT NOT NULL CHECK ("method" IN ('PERSONAL','POSTAL','ELECTRONIC','PUBLICATION','REFUSAL')),
  "recipient" TEXT NOT NULL, "notes" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ConstructionEnforcementEvidence" (
  "id" TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE RESTRICT,
  "visitId" TEXT REFERENCES "ConstructionEnforcementVisit"("id") ON DELETE RESTRICT,
  "actId" TEXT REFERENCES "ConstructionEnforcementAct"("id") ON DELETE RESTRICT,
  "acknowledgementId" TEXT REFERENCES "ConstructionEnforcementAcknowledgement"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PHOTO','DOCUMENT','SERVICE_PROOF')),
  "versionSnapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls("visitId","actId","acknowledgementId") = 1)
);
CREATE INDEX "ConstructionEnforcementEvidence_documentId_idx" ON "ConstructionEnforcementEvidence"("documentId");
CREATE TABLE "ConstructionEnforcementSequence" (
  "year" INTEGER NOT NULL, "kind" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL CHECK ("nextNumber" > 0), PRIMARY KEY ("year","kind")
);
CREATE FUNCTION construction_enforcement_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historico de fiscalizacao edilicia imutavel'; END;
$$;
CREATE TRIGGER enforcement_assignment_immutable BEFORE UPDATE OR DELETE ON "ConstructionEnforcementAssignment" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE TRIGGER enforcement_visit_immutable BEFORE UPDATE OR DELETE ON "ConstructionEnforcementVisit" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE TRIGGER enforcement_act_immutable BEFORE UPDATE OR DELETE ON "ConstructionEnforcementAct" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE TRIGGER enforcement_ack_immutable BEFORE UPDATE OR DELETE ON "ConstructionEnforcementAcknowledgement" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE TRIGGER enforcement_evidence_immutable BEFORE UPDATE OR DELETE ON "ConstructionEnforcementEvidence" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE TRIGGER enforcement_case_no_delete BEFORE DELETE ON "ConstructionEnforcementCase" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_append_only();
CREATE FUNCTION construction_enforcement_case_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(OLD) - ARRAY['assignedEmployeeId','status','revision']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['assignedEmployeeId','status','revision']) THEN
    RAISE EXCEPTION 'Identidade de processo fiscal imutavel';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforcement_case_identity BEFORE UPDATE ON "ConstructionEnforcementCase" FOR EACH ROW EXECUTE FUNCTION construction_enforcement_case_identity();
