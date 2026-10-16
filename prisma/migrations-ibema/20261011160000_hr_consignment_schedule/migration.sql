CREATE TABLE "HrConsignmentAgreement" (
  "id" TEXT PRIMARY KEY,
  "sourceKey" TEXT NOT NULL UNIQUE,
  "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceRunId" TEXT NOT NULL REFERENCES "HrPayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scope" TEXT NOT NULL, "number" TEXT NOT NULL, "rubricCode" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("contractId","supplierId","number","scope")
);
CREATE INDEX "HrConsignmentAgreement_contractId_scope_idx" ON "HrConsignmentAgreement"("contractId","scope");
CREATE TABLE "HrConsignmentInstallment" (
  "id" TEXT PRIMARY KEY,
  "agreementId" TEXT NOT NULL REFERENCES "HrConsignmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sequence" INTEGER NOT NULL CHECK ("sequence">0),
  "competenceAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount">0),
  UNIQUE("agreementId","sequence"), UNIQUE("agreementId","competenceAt")
);
CREATE INDEX "HrConsignmentInstallment_competenceAt_idx" ON "HrConsignmentInstallment"("competenceAt");
CREATE TABLE "HrConsignmentEntry" (
  "id" TEXT PRIMARY KEY,
  "installmentId" TEXT NOT NULL REFERENCES "HrConsignmentInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceKey" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('RESERVA','LANCAMENTO','CANCELAMENTO')),
  "amount" DECIMAL(18,2) NOT NULL,
  "movementId" TEXT UNIQUE REFERENCES "HrMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("kind"='RESERVA' AND "amount">0 AND "movementId" IS NULL) OR
         ("kind"='CANCELAMENTO' AND "amount"<0 AND "movementId" IS NULL) OR
         ("kind"='LANCAMENTO' AND "amount"=0 AND "movementId" IS NOT NULL))
);
CREATE INDEX "HrConsignmentEntry_installmentId_idx" ON "HrConsignmentEntry"("installmentId");
CREATE TRIGGER hr_consignment_agreement_immutable BEFORE UPDATE OR DELETE ON "HrConsignmentAgreement" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE TRIGGER hr_consignment_installment_immutable BEFORE UPDATE OR DELETE ON "HrConsignmentInstallment" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
CREATE TRIGGER hr_consignment_entry_immutable BEFORE UPDATE OR DELETE ON "HrConsignmentEntry" FOR EACH ROW EXECUTE FUNCTION hr_immutable_entry();
