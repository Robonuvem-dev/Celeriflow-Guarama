ALTER TABLE "HealthAppointment" ADD COLUMN "billingContextSnapshot" JSONB;
ALTER TABLE "HealthProductionFact" ADD COLUMN "pricingSnapshot" JSONB;
CREATE TABLE "HealthProcedurePriceTable" (
 "id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "agreementId" TEXT REFERENCES "HealthCareAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "code" TEXT NOT NULL, "name" TEXT NOT NULL, "version" INTEGER NOT NULL, "validFrom" DATE NOT NULL, "validUntil" DATE NOT NULL,
 "sourceReference" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("unitId", "code", "version"), CHECK ("validFrom" <= "validUntil")
);
CREATE INDEX "HealthProcedurePriceTable_unitId_agreementId_validFrom_validUntil_idx" ON "HealthProcedurePriceTable"("unitId", "agreementId", "validFrom", "validUntil");
CREATE TABLE "HealthProcedurePriceItem" (
 "id" TEXT PRIMARY KEY, "tableId" TEXT NOT NULL REFERENCES "HealthProcedurePriceTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "procedureId" TEXT NOT NULL REFERENCES "HealthSusProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitValue" DECIMAL(18,6) NOT NULL CHECK ("unitValue" >= 0), UNIQUE ("tableId", "procedureId")
);
CREATE FUNCTION preserve_health_procedure_price_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Tabela de preços imutável: publique nova versão com fonte e vigência.';
END;
$$;
CREATE TRIGGER "HealthProcedurePriceTable_immutable" BEFORE UPDATE OR DELETE ON "HealthProcedurePriceTable" FOR EACH ROW EXECUTE FUNCTION preserve_health_procedure_price_version();
CREATE TRIGGER "HealthProcedurePriceItem_immutable" BEFORE UPDATE OR DELETE ON "HealthProcedurePriceItem" FOR EACH ROW EXECUTE FUNCTION preserve_health_procedure_price_version();
