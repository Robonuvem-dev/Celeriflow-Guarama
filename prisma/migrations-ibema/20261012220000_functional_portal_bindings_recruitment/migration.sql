-- Additive functional portal links; legacy requests remain intact.
ALTER TABLE "Process" ADD COLUMN "portalOrigin" TEXT, ADD COLUMN "portalPurpose" TEXT;

CREATE TABLE "HrPortalServiceConfiguration" (
  "ruleId" TEXT PRIMARY KEY REFERENCES "HrPayrollRule"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "publicServiceId" TEXT NOT NULL UNIQUE REFERENCES "PublicService"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "processTypeId" TEXT NOT NULL REFERENCES "ProcessType"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "subjectId" TEXT NOT NULL REFERENCES "Subject"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  operation TEXT NOT NULL CHECK (operation IN ('SOLICITACAO_RH','FERIAS','AJUSTE_PONTO')),
  snapshot JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HrPortalServiceConfiguration_budgetUnitId_operation_idx" ON "HrPortalServiceConfiguration"("budgetUnitId",operation);

CREATE TABLE "HrPortalRequestBinding" (
  "requestId" TEXT PRIMARY KEY REFERENCES "HrPortalRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "serviceRuleId" TEXT NOT NULL REFERENCES "HrPortalServiceConfiguration"("ruleId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "serviceVersion" INTEGER NOT NULL CHECK ("serviceVersion" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HrPortalRequestBinding_employeeId_createdAt_idx" ON "HrPortalRequestBinding"("employeeId","createdAt");

-- Link only unambiguous, existing canonical records. Never create historical processes.
INSERT INTO "HrPortalServiceConfiguration" ("ruleId","publicServiceId","budgetUnitId","processTypeId","subjectId",version,operation,snapshot)
SELECT r.id,p.id,u.id,t.id,s.id,(r.value->>'version')::integer,r.value->>'operation',r.value
FROM "HrPayrollRule" r
JOIN "PublicService" p ON p.id=r.value->>'publicServiceId' AND p.target='Servidor'
JOIN "BudgetUnit" u ON u.id=r.value->>'budgetUnitId'
JOIN "ProcessType" t ON t.id=r.value->>'processTypeId'
JOIN "Subject" s ON s.id=r.value->>'subjectId' AND s."processTypeId"=t.id
WHERE r.category='PORTAL' AND r.value->>'origin'='SERVICO_PORTAL_SERVIDOR'
AND r.value->>'version' ~ '^[1-9][0-9]{0,8}$'
AND r.value->>'operation' IN ('SOLICITACAO_RH','FERIAS','AJUSTE_PONTO')
AND (SELECT count(*) FROM "HrPayrollRule" x WHERE x.value->>'origin'='SERVICO_PORTAL_SERVIDOR' AND x.value->>'publicServiceId'=p.id)=1;

INSERT INTO "HrPortalRequestBinding" ("requestId","processId","serviceRuleId","employeeId","actorId","serviceVersion","createdAt")
SELECT q.id,p.id,c."ruleId",e.id,u.id,(q.payload#>>'{configuration,version}')::integer,q."createdAt"
FROM "HrPortalRequest" q
JOIN "Employee" e ON e.id=q."employeeId"
JOIN "Usuario" u ON u.id=q."actorId"
JOIN "Process" p ON p.id=q.payload->>'processId' AND p."personId"=e."personId"
JOIN "HrPortalServiceConfiguration" c ON c."ruleId"=q.payload->>'serviceId'
WHERE q.payload->>'origin'='REQUERIMENTO_FUNCIONAL'
AND q.payload#>>'{configuration,version}' ~ '^[1-9][0-9]{0,8}$'
AND (SELECT count(*) FROM "HrPortalRequest" other WHERE other.payload->>'processId'=p.id)=1;

UPDATE "Process" p SET "portalOrigin"='PORTAL_SERVIDOR',"portalPurpose"='INTERNO_ENTIDADE'
FROM "HrPortalRequestBinding" b WHERE b."processId"=p.id;

-- Diagnostics preserve unresolved legacy identities and process references for RH reconciliation.
CREATE VIEW "HrPortalReferenceDiagnostics" AS
SELECT q.id AS "requestId",q.kind,
  NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=q."employeeId") AS "missingEmployee",
  NOT EXISTS(SELECT 1 FROM "Usuario" u WHERE u.id=q."actorId") AS "missingActor",
  q."decidedBy" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Usuario" u WHERE u.id=q."decidedBy") AS "missingDecider",
  q.payload->>'origin'='REQUERIMENTO_FUNCIONAL' AND NOT EXISTS(SELECT 1 FROM "HrPortalRequestBinding" b WHERE b."requestId"=q.id) AS "unresolvedFunctionalBinding"
FROM "HrPortalRequest" q;

CREATE TABLE "HrRecruitmentApplication" (
  id TEXT PRIMARY KEY,
  "noticeRuleId" TEXT NOT NULL REFERENCES "HrPayrollRule"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "applicantUserId" TEXT NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  cpf TEXT NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  "roleCode" TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number > 0),
  status TEXT NOT NULL DEFAULT 'RECEBIDA' CHECK (status IN ('RECEBIDA','DEFERIDA','INDEFERIDA')),
  snapshot JSONB NOT NULL,
  "requestHash" TEXT NOT NULL,
  decision TEXT,
  "decidedById" TEXT REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  UNIQUE("noticeRuleId",cpf),UNIQUE("noticeRuleId","applicantUserId"),UNIQUE("noticeRuleId",number)
);
CREATE INDEX "HrRecruitmentApplication_applicantUserId_createdAt_idx" ON "HrRecruitmentApplication"("applicantUserId","createdAt");

CREATE FUNCTION enforce_functional_portal_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Functional request bindings are immutable'; END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "HrPortalRequest" q JOIN "Employee" e ON e.id=q."employeeId"
    JOIN "Process" p ON p.id=NEW."processId" AND p."personId"=e."personId"
    WHERE q.id=NEW."requestId" AND q."employeeId"=NEW."employeeId" AND q."actorId"=NEW."actorId"
    AND q.payload->>'processId'=NEW."processId" AND q.payload->>'serviceId'=NEW."serviceRuleId"
    AND q.payload#>>'{configuration,version}'=NEW."serviceVersion"::text
  ) THEN RAISE EXCEPTION 'Functional request binding conflicts with canonical identity or snapshot'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HrPortalRequestBinding_guard" BEFORE INSERT OR UPDATE ON "HrPortalRequestBinding" FOR EACH ROW EXECUTE FUNCTION enforce_functional_portal_binding();

CREATE FUNCTION preserve_recruitment_application_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW."noticeRuleId",NEW."applicantUserId",NEW.cpf,NEW."roleCode",NEW.number,NEW.snapshot,NEW."requestHash",NEW."createdAt")
    IS DISTINCT FROM (OLD.id,OLD."noticeRuleId",OLD."applicantUserId",OLD.cpf,OLD."roleCode",OLD.number,OLD.snapshot,OLD."requestHash",OLD."createdAt")
  THEN RAISE EXCEPTION 'Recruitment application source is immutable'; END IF;
  IF OLD.status<>'RECEBIDA' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Recruitment application decision is immutable'; END IF;
  IF NEW.status<>'RECEBIDA' AND (NEW.decision IS NULL OR NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL)
  THEN RAISE EXCEPTION 'Recruitment decision requires actor, reason and timestamp'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HrRecruitmentApplication_guard" BEFORE UPDATE ON "HrRecruitmentApplication" FOR EACH ROW EXECUTE FUNCTION preserve_recruitment_application_source();
