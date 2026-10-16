-- Additive extension: no personal/operator/rubric catalogue is duplicated.
CREATE TABLE "SstHealthPlan" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "benefitConfigId" TEXT NOT NULL UNIQUE REFERENCES "BenefitConfig"("id") ON DELETE RESTRICT,
 "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
 "operatorCompanyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
 "ansPlanNumber" TEXT NOT NULL CHECK ("ansPlanNumber" ~ '^[0-9]{9}$'),
 "ansOperatorNumber" TEXT NOT NULL CHECK ("ansOperatorNumber" ~ '^[0-9]{6}$'),
 "monthlyRubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"("id") ON DELETE RESTRICT,
 "extraordinaryRubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"("id") ON DELETE RESTRICT,
 "monthlyEventId" TEXT REFERENCES "PayrollEvent"("id") ON DELETE RESTRICT,
 "extraordinaryEventId" TEXT REFERENCES "PayrollEvent"("id") ON DELETE RESTRICT,
 "contractReference" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("monthlyRubricId" <> "extraordinaryRubricId"),
 CHECK ("monthlyEventId" IS NULL OR "extraordinaryEventId" IS NULL OR "monthlyEventId" <> "extraordinaryEventId")
);
CREATE INDEX "SstHealthPlan_budgetUnitId_createdAt_idx" ON "SstHealthPlan"("budgetUnitId","createdAt");
CREATE TABLE "SstBenefitBeneficiary" (
 "id" TEXT PRIMARY KEY, "planId" TEXT NOT NULL REFERENCES "SstHealthPlan"("id") ON DELETE RESTRICT,
 "payrollBenefitId" TEXT NOT NULL REFERENCES "PayrollBenefit"("id") ON DELETE RESTRICT,
 "dependentId" TEXT REFERENCES "Dependent"("id") ON DELETE RESTRICT, "beneficiaryKey" TEXT NOT NULL,
 "admissionDate" DATE NOT NULL, "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL,
 "cardNumber" TEXT NOT NULL CHECK (length(trim("cardNumber")) > 0),
 "monthlyAmount" DECIMAL(18,2) NOT NULL CHECK ("monthlyAmount" >= 0),
 "contractReference" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("admissionDate" <= "startsAt" AND "startsAt" <= "endsAt"),
 CHECK ("beneficiaryKey" = COALESCE("dependentId", 'TITULAR')),
 UNIQUE ("payrollBenefitId", "beneficiaryKey", "startsAt")
);
CREATE INDEX "SstBenefitBeneficiary_planId_startsAt_endsAt_idx" ON "SstBenefitBeneficiary"("planId","startsAt","endsAt");
CREATE TABLE "SstBenefitEntry" (
 "id" TEXT PRIMARY KEY, "beneficiaryId" TEXT NOT NULL REFERENCES "SstBenefitBeneficiary"("id") ON DELETE RESTRICT,
 "competence" TEXT NOT NULL CHECK ("competence" ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'),
 CHECK (substring("competence" from 4)::integer BETWEEN 2000 AND 9998),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('MONTHLY','EXTRAORDINARY','REFUND')),
 "amount" DECIMAL(18,2) NOT NULL,
 "sourceReference" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "refundOfId" TEXT REFERENCES "SstBenefitEntry"("id") ON DELETE RESTRICT,
 "requestHash" TEXT NOT NULL, "candidateSnapshot" JSONB NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("kind" = 'REFUND' AND "amount" < 0 AND "refundOfId" IS NOT NULL) OR ("kind" <> 'REFUND' AND "amount" > 0 AND "refundOfId" IS NULL)),
 UNIQUE ("beneficiaryId", "sourceReference")
);
CREATE UNIQUE INDEX "SstBenefitEntry_one_monthly" ON "SstBenefitEntry"("beneficiaryId","competence") WHERE "kind" = 'MONTHLY';
CREATE INDEX "SstBenefitEntry_competence_beneficiaryId_idx" ON "SstBenefitEntry"("competence","beneficiaryId");

CREATE FUNCTION sst_benefit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SST benefit history is immutable'; END $$;
CREATE TRIGGER sst_plan_immutable BEFORE UPDATE OR DELETE ON "SstHealthPlan" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE TRIGGER sst_beneficiary_immutable BEFORE UPDATE OR DELETE ON "SstBenefitBeneficiary" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE TRIGGER sst_entry_immutable BEFORE UPDATE OR DELETE ON "SstBenefitEntry" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();

CREATE FUNCTION sst_health_plan_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config_supplier TEXT; supplier_company TEXT;
BEGIN
 SELECT "supplierId" INTO config_supplier FROM "BenefitConfig" WHERE id=NEW."benefitConfigId" FOR SHARE;
 SELECT "companyId" INTO supplier_company FROM "Supplier" WHERE id=NEW."supplierId" FOR SHARE;
 IF config_supplier IS DISTINCT FROM NEW."supplierId" OR supplier_company IS DISTINCT FROM NEW."operatorCompanyId" THEN RAISE EXCEPTION 'Canonical operator/supplier does not match benefit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_health_plan_validate BEFORE INSERT ON "SstHealthPlan" FOR EACH ROW EXECUTE FUNCTION sst_health_plan_validate();
CREATE FUNCTION sst_operator_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."companyId" IS DISTINCT FROM OLD."companyId" AND EXISTS (SELECT 1 FROM "SstHealthPlan" WHERE "supplierId"=OLD.id) THEN RAISE EXCEPTION 'Supplier operator identity used by SST'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_operator_identity BEFORE UPDATE ON "Supplier" FOR EACH ROW EXECUTE FUNCTION sst_operator_identity_guard();

CREATE FUNCTION sst_beneficiary_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE employee_id TEXT; config_id TEXT; dependent_employee_id TEXT;
BEGIN
 SELECT "employeeId", "benefitConfigId" INTO employee_id, config_id FROM "PayrollBenefit" WHERE id = NEW."payrollBenefitId" FOR SHARE;
 IF NOT EXISTS (SELECT 1 FROM "SstHealthPlan" WHERE id = NEW."planId" AND "benefitConfigId" = config_id) THEN RAISE EXCEPTION 'Canonical benefit does not match plan'; END IF;
 IF NEW."dependentId" IS NOT NULL THEN
   SELECT "employeeId" INTO dependent_employee_id FROM "Dependent" WHERE id=NEW."dependentId" FOR SHARE;
   IF dependent_employee_id IS DISTINCT FROM employee_id THEN RAISE EXCEPTION 'Dependent does not belong to employee'; END IF;
 END IF;
 -- Serialize periods across duplicate legacy PayrollBenefit assignments as well.
 PERFORM pg_advisory_xact_lock(hashtext('SST_BENEFICIARY:' || employee_id || ':' || config_id || ':' || NEW."beneficiaryKey"));
 IF EXISTS (SELECT 1 FROM "SstBenefitBeneficiary" b JOIN "PayrollBenefit" pb ON pb.id=b."payrollBenefitId"
 WHERE pb."employeeId"=employee_id AND pb."benefitConfigId"=config_id AND b."beneficiaryKey"=NEW."beneficiaryKey"
 AND b."startsAt" <= NEW."endsAt" AND b."endsAt" >= NEW."startsAt") THEN RAISE EXCEPTION 'Beneficiary periods overlap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_beneficiary_validate BEFORE INSERT ON "SstBenefitBeneficiary" FOR EACH ROW EXECUTE FUNCTION sst_beneficiary_validate();

CREATE FUNCTION sst_benefit_entry_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin "SstBenefitEntry"%ROWTYPE; coverage "SstBenefitBeneficiary"%ROWTYPE; month_start DATE; refunded DECIMAL(18,2);
BEGIN
 SELECT * INTO coverage FROM "SstBenefitBeneficiary" WHERE id=NEW."beneficiaryId";
 month_start := to_date('01/' || NEW."competence", 'DD/MM/YYYY');
 IF NEW."kind" <> 'REFUND' AND (coverage."startsAt" > (month_start + interval '1 month - 1 day')::date OR coverage."endsAt" < month_start) THEN RAISE EXCEPTION 'Competence outside beneficiary coverage'; END IF;
 IF NEW."kind" = 'MONTHLY' AND NEW."amount" <> coverage."monthlyAmount" THEN RAISE EXCEPTION 'Monthly amount differs from contract'; END IF;
 IF NEW."kind" = 'MONTHLY' AND (coverage."startsAt" > month_start OR coverage."endsAt" < (month_start + interval '1 month - 1 day')::date) THEN RAISE EXCEPTION 'Partial month requires contractual billing rule'; END IF;
 IF NEW."kind" = 'REFUND' THEN
   SELECT * INTO origin FROM "SstBenefitEntry" WHERE id=NEW."refundOfId" FOR UPDATE;
   IF origin.id IS NULL OR origin."beneficiaryId" <> NEW."beneficiaryId" OR origin.kind='REFUND' THEN RAISE EXCEPTION 'Invalid refund origin'; END IF;
   IF to_date('01/' || origin.competence,'DD/MM/YYYY') > month_start THEN RAISE EXCEPTION 'Refund precedes charge'; END IF;
   SELECT COALESCE(-SUM(amount),0) INTO refunded FROM "SstBenefitEntry" WHERE "refundOfId"=origin.id;
   IF refunded - NEW.amount > origin.amount THEN RAISE EXCEPTION 'Refund exceeds original charge'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_benefit_entry_validate BEFORE INSERT ON "SstBenefitEntry" FOR EACH ROW EXECUTE FUNCTION sst_benefit_entry_validate();

-- Legacy RH edits must not silently change the identity of persisted beneficiaries.
CREATE FUNCTION sst_benefit_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='PayrollBenefit' THEN
   IF (NEW."employeeId",NEW."benefitConfigId") IS DISTINCT FROM (OLD."employeeId",OLD."benefitConfigId") AND EXISTS (SELECT 1 FROM "SstBenefitBeneficiary" WHERE "payrollBenefitId"=OLD.id) THEN RAISE EXCEPTION 'Benefit identity used by SST'; END IF;
 ELSE
   IF NEW."employeeId" IS DISTINCT FROM OLD."employeeId" AND EXISTS (SELECT 1 FROM "SstBenefitBeneficiary" WHERE "dependentId"=OLD.id) THEN RAISE EXCEPTION 'Dependent identity used by SST'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_benefit_identity BEFORE UPDATE ON "PayrollBenefit" FOR EACH ROW EXECUTE FUNCTION sst_benefit_identity_guard();
CREATE TRIGGER sst_dependent_identity BEFORE UPDATE ON "Dependent" FOR EACH ROW EXECUTE FUNCTION sst_benefit_identity_guard();
