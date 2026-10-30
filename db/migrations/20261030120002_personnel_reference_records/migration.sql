CREATE TABLE "HrReferenceRecord" (
 "id" TEXT PRIMARY KEY,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('FERIADO','EQUIPE','FAIXA','ESCALA','PLANO_SAUDE','AMBIENTE_RISCO','PROCESSO','LICENCA_EDUCACAO','PREVIDENCIA_OPTATIVA','MODELO_DOCUMENTO','LOTACAO_ORCAMENTARIA')),
 "code" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "details" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("kind", "code")
);

CREATE UNIQUE INDEX "HrReferenceRecord_optional_pension_employee_rubric_date_key" ON "HrReferenceRecord" (("details"->>'employeeId'), ("details"->>'rubricCode'), ("details"->>'effectiveFrom')) WHERE "kind" = 'PREVIDENCIA_OPTATIVA';

CREATE TABLE "HrEmployeeDocument" (
 "id" TEXT PRIMARY KEY,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "templateId" TEXT NOT NULL,
 "templateUpdatedAt" TIMESTAMP(3) NOT NULL,
 "documentType" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "body" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HrEmployeeDocument_employeeId_createdAt_idx" ON "HrEmployeeDocument"("employeeId", "createdAt");

CREATE UNIQUE INDEX "HrReferenceRecord_employee_appropriation_key" ON "HrReferenceRecord" (("details"->>'employeeId'), ("details"->>'appropriationId')) WHERE "kind" = 'LOTACAO_ORCAMENTARIA';
