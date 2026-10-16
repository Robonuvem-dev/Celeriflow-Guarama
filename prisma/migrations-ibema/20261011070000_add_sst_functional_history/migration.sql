-- Canonical Employee is the source of contractual history; no person duplication/backfill guesses.
CREATE TABLE "HrBudgetUnitEntityMapping" (
  "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT,
  "sourceReference" TEXT NOT NULL CHECK (length("sourceReference") >= 10),
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("budgetUnitId")
);
CREATE TABLE "HrEmployeeFunctionalPeriod" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT,
  "employmentRegimeId" TEXT NOT NULL REFERENCES "HrEmploymentRegime"("id") ON DELETE RESTRICT,
  "roleId" TEXT NOT NULL REFERENCES "Role"("id") ON DELETE RESTRICT,
  "functionRoleId" TEXT REFERENCES "Role"("id") ON DELETE RESTRICT,
  "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT,
  "localId" TEXT NOT NULL REFERENCES "AdministrativeUnit"("id") ON DELETE RESTRICT,
  "costCenterId" TEXT NOT NULL REFERENCES "CostCenter"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "contractReference" TEXT NOT NULL, "sourceReference" TEXT NOT NULL,
  "supersedesId" TEXT UNIQUE REFERENCES "HrEmployeeFunctionalPeriod"("id") ON DELETE RESTRICT,
  "voided" BOOLEAN NOT NULL DEFAULT false, "snapshot" JSONB NOT NULL,
  "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" > "startsAt"), CHECK ("supersedesId" IS DISTINCT FROM "id")
);
CREATE INDEX "HrEmployeeFunctionalPeriod_scope_dates" ON "HrEmployeeFunctionalPeriod" ("budgetUnitId", "employeeId", "startsAt", "endsAt");
CREATE INDEX "HrEmployeeFunctionalPeriod_filters" ON "HrEmployeeFunctionalPeriod" ("budgetUnitId", "employmentRegimeId", "localId", "costCenterId");
CREATE TABLE "SstTechnicalResponsibility" (
  "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ENVIRONMENTAL', 'BIOLOGICAL')),
  "groupId" TEXT REFERENCES "SstExposureGroup"("id") ON DELETE RESTRICT,
  "council" TEXT NOT NULL, "sourceReference" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL, "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" > "startsAt")
);
CREATE TABLE "SstServiceOrder" (
  "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "programGroupId" TEXT NOT NULL REFERENCES "SstProgramExposureGroup"("id") ON DELETE RESTRICT,
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT,
  "functionalPeriodId" TEXT REFERENCES "HrEmployeeFunctionalPeriod"("id") ON DELETE RESTRICT,
  "responsibilityId" TEXT NOT NULL REFERENCES "SstTechnicalResponsibility"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "prevention" TEXT NOT NULL, "standards" TEXT NOT NULL, "accidentConduct" TEXT NOT NULL,
  "trainingRequirements" JSONB NOT NULL, "equipmentRequirements" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL, "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" > "startsAt"), CHECK (("employeeId" IS NULL) = ("functionalPeriodId" IS NULL))
);
CREATE TABLE "SstFoundationalRevocation" (
  "id" TEXT PRIMARY KEY, "serviceOrderId" TEXT UNIQUE REFERENCES "SstServiceOrder"("id") ON DELETE RESTRICT,
  "responsibilityId" TEXT UNIQUE REFERENCES "SstTechnicalResponsibility"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL CHECK (length("reason") >= 10), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("serviceOrderId" IS NULL) <> ("responsibilityId" IS NULL))
);
CREATE TABLE "SstCertificateDecisionRevision" (
  "id" TEXT PRIMARY KEY, "certificateId" TEXT NOT NULL REFERENCES "SstMedicalCertificate"("id") ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0), UNIQUE ("certificateId",revision),
  "previousStatus" TEXT NOT NULL, "decision" TEXT NOT NULL CHECK ("decision" IN ('APPROVED', 'REJECTED', 'REVOKED')),
  "reason" TEXT NOT NULL, "examinerPersonId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT,
  "examinerCouncil" TEXT NOT NULL, "previousLeaveId" TEXT REFERENCES "Leave"("id") ON DELETE RESTRICT,
  "newLeaveId" TEXT REFERENCES "Leave"("id") ON DELETE RESTRICT,
  "reconciliation" JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SstServiceOrder_scope_dates" ON "SstServiceOrder" ("budgetUnitId", "startsAt", "id");
CREATE INDEX "SstTechnicalResponsibility_scope_dates" ON "SstTechnicalResponsibility" ("budgetUnitId", "kind", "startsAt", "endsAt");
CREATE FUNCTION sst_foundational_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SST foundational history is immutable; append a correction/revocation'; END $$;
CREATE TRIGGER "HrBudgetUnitEntityMapping_immutable" BEFORE UPDATE OR DELETE ON "HrBudgetUnitEntityMapping" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "HrEmployeeFunctionalPeriod_immutable" BEFORE UPDATE OR DELETE ON "HrEmployeeFunctionalPeriod" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstTechnicalResponsibility_immutable" BEFORE UPDATE OR DELETE ON "SstTechnicalResponsibility" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstServiceOrder_immutable" BEFORE UPDATE OR DELETE ON "SstServiceOrder" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstFoundationalRevocation_immutable" BEFORE UPDATE OR DELETE ON "SstFoundationalRevocation" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstCertificateDecisionRevision_immutable" BEFORE UPDATE OR DELETE ON "SstCertificateDecisionRevision" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
-- Serialize history even for SQL clients, and reject inconsistent canonical references.
CREATE FUNCTION hr_functional_period_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('HR_FUNCTIONAL:' || NEW."employeeId"));
  IF NOT EXISTS (SELECT 1 FROM "HrBudgetUnitEntityMapping" m WHERE m."budgetUnitId" = NEW."budgetUnitId" AND m."governmentEntityId" = NEW."governmentEntityId") THEN
    RAISE EXCEPTION 'Verified UG/entity mapping required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "BudgetUnit" u JOIN "Department" d ON d.id = NEW."departmentId" JOIN "AdministrativeUnit" l ON l.id = NEW."localId" JOIN "CostCenter" c ON c.id = NEW."costCenterId"
    WHERE u.id = NEW."budgetUnitId" AND d."secretariatId" = u."secretariatId" AND l."secretariatId" = u."secretariatId" AND c."governmentEntityId" = NEW."governmentEntityId"
      AND (c."secretariatId" IS NULL OR c."secretariatId" = u."secretariatId") AND (c."departmentId" IS NULL OR c."departmentId" = d.id) AND (c."administrativeUnitId" IS NULL OR c."administrativeUnitId" = l.id)) THEN
    RAISE EXCEPTION 'Incompatible functional scope';
  END IF;
  IF NEW."supersedesId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" p WHERE p.id = NEW."supersedesId" AND p."employeeId" = NEW."employeeId" AND p."budgetUnitId" = NEW."budgetUnitId" AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId" = p.id)) THEN
    RAISE EXCEPTION 'Correction requires current same-scope history';
  END IF;
  IF NOT NEW."voided" AND EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId" = NEW."employeeId" AND NOT p."voided" AND p.id IS DISTINCT FROM NEW."supersedesId" AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId" = p.id) AND p."startsAt" < NEW."endsAt" AND p."endsAt" > NEW."startsAt") THEN
    RAISE EXCEPTION 'Overlapping employee functional history';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HrEmployeeFunctionalPeriod_integrity" BEFORE INSERT ON "HrEmployeeFunctionalPeriod" FOR EACH ROW EXECUTE FUNCTION hr_functional_period_integrity();
CREATE TABLE "SstReasonRegimePolicy" (
  id TEXT PRIMARY KEY, "reasonId" TEXT NOT NULL REFERENCES "SstCertificateReason"(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE ("reasonId",version),
  "restrictedRegimeIds" TEXT[] NOT NULL, justification TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SstReasonRegimePolicy_latest" ON "SstReasonRegimePolicy" ("reasonId","createdAt",id);
CREATE TABLE "SstCertificateFunctionalSource" (
  "certificateId" TEXT PRIMARY KEY REFERENCES "SstMedicalCertificate"(id) ON DELETE RESTRICT,
  "functionalPeriodId" TEXT NOT NULL REFERENCES "HrEmployeeFunctionalPeriod"(id) ON DELETE RESTRICT,
  "regimePolicyId" TEXT REFERENCES "SstReasonRegimePolicy"(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL
);
CREATE TABLE "SstCertificateLeaveConfirmation" (
  id TEXT PRIMARY KEY, "certificateId" TEXT UNIQUE NOT NULL REFERENCES "SstMedicalCertificate"(id) ON DELETE RESTRICT,
  confirmed BOOLEAN NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "SstReasonRegimePolicy_immutable" BEFORE UPDATE OR DELETE ON "SstReasonRegimePolicy" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstCertificateFunctionalSource_immutable" BEFORE UPDATE OR DELETE ON "SstCertificateFunctionalSource" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER "SstCertificateLeaveConfirmation_immutable" BEFORE UPDATE OR DELETE ON "SstCertificateLeaveConfirmation" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE FUNCTION sst_historical_leave_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SstMedicalCertificate" c WHERE c."leaveId"=OLD.id)
    OR EXISTS (SELECT 1 FROM "SstCertificateDecisionRevision" r WHERE r."previousLeaveId"=OLD.id OR r."newLeaveId"=OLD.id) THEN
    IF TG_OP='UPDATE' AND current_setting('sst.certificate_revision',true)='on' AND NEW.status='Revogada SST'
      AND (to_jsonb(NEW)-'status'-'updatedAt')=(to_jsonb(OLD)-'status'-'updatedAt') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'SST-origin leave requires immutable decision reconciliation';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Leave_sst_history_guard" BEFORE UPDATE OR DELETE ON "Leave" FOR EACH ROW EXECUTE FUNCTION sst_historical_leave_guard();
CREATE FUNCTION sst_service_order_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE criteria JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('SST_RESPONSIBILITY:' || NEW."budgetUnitId"));
  SELECT g."groupSnapshot" INTO criteria FROM "SstProgramExposureGroup" g JOIN "SstOccupationalProgram" p ON p.id=g."programId"
    WHERE g.id=NEW."programGroupId" AND p."budgetUnitId"=NEW."budgetUnitId" AND p.kind IN ('PGR','LTCAT') AND p."startsAt"<=NEW."startsAt" AND p."endsAt">=NEW."endsAt"
      AND EXISTS (SELECT 1 FROM "SstTechnicalResponsibility" r WHERE r.id=NEW."responsibilityId" AND r."budgetUnitId"=NEW."budgetUnitId" AND r.kind='ENVIRONMENTAL' AND (r."groupId" IS NULL OR r."groupId"=g."groupId") AND r."startsAt"<=NEW."startsAt" AND r."endsAt">=NEW."endsAt" AND NOT EXISTS (SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."responsibilityId"=r.id));
  IF criteria IS NULL THEN RAISE EXCEPTION 'Service order requires authorized risk version and responsibility'; END IF;
  IF (criteria->>'startsAt')::timestamp>NEW."startsAt" OR (criteria->>'endsAt')::timestamp<NEW."endsAt" THEN RAISE EXCEPTION 'Service order outside GHE historical validity'; END IF;
  IF NEW."employeeId" IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('HR_FUNCTIONAL:' || NEW."employeeId"));
    IF NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" f WHERE f.id=NEW."functionalPeriodId" AND f."employeeId"=NEW."employeeId" AND f."budgetUnitId"=NEW."budgetUnitId" AND NOT f.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=NEW."startsAt" AND f."endsAt">=NEW."endsAt"
      AND (jsonb_array_length(criteria->'departmentIds')=0 OR criteria->'departmentIds' ? f."departmentId") AND (jsonb_array_length(criteria->'roleIds')=0 OR criteria->'roleIds' ? f."roleId")) THEN RAISE EXCEPTION 'Service order individual historical scope mismatch'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."equipmentRequirements") item WHERE NOT EXISTS (SELECT 1 FROM "Material" m WHERE m.id=item->>'materialId' AND m."isActive")) THEN RAISE EXCEPTION 'Canonical material required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SstServiceOrder_integrity" BEFORE INSERT ON "SstServiceOrder" FOR EACH ROW EXECUTE FUNCTION sst_service_order_integrity();
CREATE TRIGGER "SstMedicalAssessment_foundational_immutable" BEFORE UPDATE OR DELETE ON "SstMedicalAssessment" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE FUNCTION sst_certificate_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'leaveId'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'leaveId'-'updatedAt') THEN
    RAISE EXCEPTION 'Issued certificate content is immutable; preserve origin and append decision revision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SstMedicalCertificate_content_immutable" BEFORE UPDATE OR DELETE ON "SstMedicalCertificate" FOR EACH ROW EXECUTE FUNCTION sst_certificate_content_immutable();
