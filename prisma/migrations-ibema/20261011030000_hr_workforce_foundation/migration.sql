-- Additive RH-only migration. Does not modify SST or legacy payroll values.
CREATE TABLE "HrEmploymentContract" (
 "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "registration" TEXT NOT NULL UNIQUE, "regimeId" TEXT NOT NULL, "roleId" TEXT NOT NULL,
 "departmentId" TEXT, "costCenterId" TEXT, "workLocation" TEXT NOT NULL, "salaryLevel" TEXT,
 "admittedAt" TIMESTAMP(3) NOT NULL, "appointedAt" TIMESTAMP(3), "swornAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3),
 "monthlyHours" INTEGER NOT NULL DEFAULT 220, "salary" DECIMAL(18,2) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ATIVO', "version" INTEGER NOT NULL DEFAULT 1, "details" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "hr_contract_dates" CHECK ("endsAt" IS NULL OR "endsAt" >= "admittedAt"),
 CONSTRAINT "hr_contract_salary" CHECK ("salary" >= 0 AND "monthlyHours" BETWEEN 1 AND 744 AND "version" > 0)
);
CREATE INDEX "HrEmploymentContract_employeeId_status_admittedAt_idx" ON "HrEmploymentContract"("employeeId","status","admittedAt");
CREATE TABLE "HrEmploymentRevision" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "actorId" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("contractId","version")
);
CREATE TABLE "HrMovement" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceKey" TEXT NOT NULL UNIQUE, "rubricCode" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3),
 "amount" DECIMAL(18,2) NOT NULL, "reference" TEXT, "notes" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE INDEX "HrMovement_contractId_startsAt_endsAt_idx" ON "HrMovement"("contractId","startsAt","endsAt");
CREATE TABLE "HrPayrollRun" (
 "id" TEXT PRIMARY KEY, "payrollId" TEXT NOT NULL REFERENCES "Payroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL UNIQUE, "mode" TEXT NOT NULL CHECK ("mode" IN ('SIMULACAO','OFICIAL')),
 "scope" TEXT NOT NULL CHECK ("scope" IN ('DEMONSTRACAO','HOMOLOGACAO','PRODUCAO')),
 "status" TEXT NOT NULL DEFAULT 'CALCULADA' CHECK ("status" IN ('CALCULADA','FECHADA','CANCELADA')),
 "ruleSetId" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "gross" DECIMAL(18,2) NOT NULL,
 "deductions" DECIMAL(18,2) NOT NULL, "net" DECIMAL(18,2) NOT NULL, "employer" DECIMAL(18,2) NOT NULL,
 "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "approvedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), CHECK ("net" = "gross" - "deductions"),
 CHECK ("mode" <> 'SIMULACAO' OR "status" <> 'FECHADA')
);
CREATE INDEX "HrPayrollRun_payrollId_mode_status_createdAt_idx" ON "HrPayrollRun"("payrollId","mode","status","createdAt");
CREATE TABLE "HrPayrollStatement" (
 "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "HrPayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "snapshot" JSONB NOT NULL, "gross" DECIMAL(18,2) NOT NULL, "deductions" DECIMAL(18,2) NOT NULL,
 "net" DECIMAL(18,2) NOT NULL, "employer" DECIMAL(18,2) NOT NULL, "releaseAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 UNIQUE("runId","contractId"), CHECK ("net" = "gross" - "deductions")
);
CREATE INDEX "HrPayrollStatement_contractId_releaseAt_idx" ON "HrPayrollStatement"("contractId","releaseAt");
CREATE TABLE "HrRightEntry" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceKey" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
 "quantity" DECIMAL(12,4) NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "details" JSONB NOT NULL, "actorId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("periodEnd" >= "periodStart")
);
CREATE INDEX "HrRightEntry_contractId_kind_periodStart_idx" ON "HrRightEntry"("contractId","kind","periodStart");
CREATE TABLE "HrIntegrationEvent" (
 "id" TEXT PRIMARY KEY, "sourceKey" TEXT NOT NULL UNIQUE, "domain" TEXT NOT NULL, "environment" TEXT NOT NULL,
 "eventType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_CONFIGURACAO', "payload" JSONB NOT NULL,
 "payloadHash" TEXT NOT NULL, "externalId" TEXT, "result" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "HrIntegrationEvent_domain_environment_status_nextAttemptAt_idx" ON "HrIntegrationEvent"("domain","environment","status","nextAttemptAt");
CREATE TABLE "HrPortalRequest" (
 "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL, "requestKey" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'EM_ANALISE', "payload" JSONB NOT NULL, "decision" TEXT, "actorId" TEXT NOT NULL,
 "decidedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3)
);
CREATE INDEX "HrPortalRequest_employeeId_kind_status_idx" ON "HrPortalRequest"("employeeId","kind","status");

CREATE TABLE "HrPayrollItemOrigin" (
 "id" TEXT PRIMARY KEY, "payrollItemId" TEXT NOT NULL UNIQUE REFERENCES "PayrollItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "runId" TEXT NOT NULL, "statementId" TEXT NOT NULL, "rubricCode" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("statementId","rubricCode")
);
CREATE INDEX "HrPayrollItemOrigin_runId_idx" ON "HrPayrollItemOrigin"("runId");

CREATE FUNCTION hr_immutable_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RH entry immutable: create a compensating entry'; END $$;
CREATE TRIGGER hr_revision_immutable BEFORE UPDATE OR DELETE ON "HrEmploymentRevision" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE TRIGGER hr_movement_immutable BEFORE UPDATE OR DELETE ON "HrMovement" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE TRIGGER hr_right_immutable BEFORE UPDATE OR DELETE ON "HrRightEntry" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE TRIGGER hr_item_origin_immutable BEFORE UPDATE OR DELETE ON "HrPayrollItemOrigin" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE FUNCTION hr_protect_projected_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "HrPayrollItemOrigin" WHERE "payrollItemId"=OLD.id) THEN RAISE EXCEPTION 'RH projected item immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER hr_projected_item_immutable BEFORE UPDATE OR DELETE ON "PayrollItem" FOR EACH ROW EXECUTE FUNCTION hr_protect_projected_item();

CREATE FUNCTION hr_protect_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'RH calculation immutable'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','approvedAt','cancelledAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','approvedAt','cancelledAt'])
 THEN RAISE EXCEPTION 'RH calculation immutable'; END IF;
 IF OLD."status" <> 'CALCULADA' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'RH final calculation immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_run_immutable BEFORE UPDATE OR DELETE ON "HrPayrollRun" FOR EACH ROW EXECUTE FUNCTION hr_protect_run();
CREATE FUNCTION hr_protect_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'RH statement immutable'; END IF;
 IF (to_jsonb(NEW) - ARRAY['releaseAt','revokedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['releaseAt','revokedAt'])
 THEN RAISE EXCEPTION 'RH statement immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_statement_immutable BEFORE UPDATE OR DELETE ON "HrPayrollStatement" FOR EACH ROW EXECUTE FUNCTION hr_protect_statement();
CREATE FUNCTION hr_protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'RH integration immutable'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','externalId','result','attempts','nextAttemptAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','externalId','result','attempts','nextAttemptAt','updatedAt'])
 THEN RAISE EXCEPTION 'RH integration origin immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_event_immutable BEFORE UPDATE OR DELETE ON "HrIntegrationEvent" FOR EACH ROW EXECUTE FUNCTION hr_protect_event();
