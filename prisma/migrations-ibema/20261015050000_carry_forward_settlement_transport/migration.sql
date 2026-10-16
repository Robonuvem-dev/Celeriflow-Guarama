-- Additive documentary allocation. Original settlements and closed years are never rewritten.
CREATE TABLE "PayableCarryForwardSettlementLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payableCarryForwardId" TEXT NOT NULL REFERENCES "PayableCarryForward"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourcePayableCarryForwardId" TEXT NOT NULL REFERENCES "PayableCarryForward"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "settlementId" TEXT NOT NULL REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceFinancialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "transportAuditId" TEXT NOT NULL REFERENCES "FinancialAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "valueDecimal" NUMERIC(18,2) NOT NULL CHECK ("valueDecimal" > 0),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("payableCarryForwardId" <> "sourcePayableCarryForwardId")
);
CREATE UNIQUE INDEX "PayableCarryForwardSettlementLink_payableCarryForwardId_settlementId_key" ON "PayableCarryForwardSettlementLink"("payableCarryForwardId", "settlementId");
CREATE INDEX "PayableCarryForwardSettlementLink_sourcePayableCarryForwardId_idx" ON "PayableCarryForwardSettlementLink"("sourcePayableCarryForwardId");
CREATE FUNCTION preserve_carry_forward_settlement_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Transported settlement memory cannot be deleted'; END IF;
  IF ROW(NEW."id", NEW."payableCarryForwardId", NEW."sourcePayableCarryForwardId", NEW."settlementId", NEW."sourceFinancialYearId", NEW."transportAuditId", NEW."valueDecimal", NEW."createdAt") IS DISTINCT FROM ROW(OLD."id", OLD."payableCarryForwardId", OLD."sourcePayableCarryForwardId", OLD."settlementId", OLD."sourceFinancialYearId", OLD."transportAuditId", OLD."valueDecimal", OLD."createdAt") THEN
    RAISE EXCEPTION 'Transported settlement documentary fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER carry_forward_settlement_link_preserved BEFORE UPDATE OR DELETE ON "PayableCarryForwardSettlementLink" FOR EACH ROW EXECUTE FUNCTION preserve_carry_forward_settlement_link();
