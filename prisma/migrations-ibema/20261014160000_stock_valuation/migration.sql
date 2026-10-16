ALTER TABLE "MaterialStock" ADD COLUMN "valuationEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "MaterialStockValuation" (
 "id" TEXT PRIMARY KEY, "stockId" TEXT NOT NULL UNIQUE REFERENCES "MaterialStock"("id") ON DELETE RESTRICT,
 "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT,
 "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "inventoryAccountId" TEXT NOT NULL REFERENCES "AccountingPlan"("id") ON DELETE RESTRICT,
 "consumptionAccountId" TEXT NOT NULL REFERENCES "AccountingPlan"("id") ON DELETE RESTRICT,
 "method" TEXT NOT NULL DEFAULT 'MOVING_WEIGHTED_AVERAGE_BATCH',
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
 "quantity" DECIMAL(18,6) NOT NULL, "amount" DECIMAL(18,2) NOT NULL,
 "openingQuantity" DECIMAL(18,6) NOT NULL, "openingAmount" DECIMAL(18,2) NOT NULL,
 "openingEvidence" JSONB NOT NULL, "openingHash" TEXT NOT NULL,
 "createdByUsuarioId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("method" = 'MOVING_WEIGHTED_AVERAGE_BATCH'),
 CHECK ("quantity" >= 0 AND "amount" >= 0 AND ("quantity" > 0 OR "amount" = 0)),
 CHECK ("openingQuantity" >= 0 AND "openingAmount" >= 0 AND ("openingQuantity" > 0 OR "openingAmount" = 0))
);
CREATE TABLE "MaterialStockValuationEvent" (
 "id" TEXT PRIMARY KEY,
 "valuationId" TEXT NOT NULL REFERENCES "MaterialStockValuation"("id") ON DELETE RESTRICT,
 "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
 "movementId" TEXT NOT NULL UNIQUE REFERENCES "MaterialMovement"("id") ON DELETE RESTRICT,
 "originMovementId" TEXT REFERENCES "MaterialMovement"("id") ON DELETE RESTRICT,
 "quantityDelta" DECIMAL(18,6) NOT NULL, "amountDelta" DECIMAL(18,2) NOT NULL,
 "quantityBefore" DECIMAL(18,6) NOT NULL, "amountBefore" DECIMAL(18,2) NOT NULL,
 "quantityAfter" DECIMAL(18,6) NOT NULL, "amountAfter" DECIMAL(18,2) NOT NULL,
 "evidence" JSONB NOT NULL, "hash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("quantityDelta" <> 0),
 CHECK ("quantityAfter" = "quantityBefore" + "quantityDelta" AND "amountAfter" = "amountBefore" + "amountDelta"),
 CHECK ("quantityBefore" >= 0 AND "amountBefore" >= 0 AND "quantityAfter" >= 0 AND "amountAfter" >= 0),
 CHECK (("quantityAfter" > 0 OR "amountAfter" = 0) AND ("quantityDelta" > 0 AND "amountDelta" >= 0 OR "quantityDelta" < 0 AND "amountDelta" <= 0))
);
CREATE INDEX "MaterialStockValuationEvent_valuationId_createdAt_idx" ON "MaterialStockValuationEvent"("valuationId", "createdAt");
CREATE INDEX "MaterialStockValuationEvent_originMovementId_idx" ON "MaterialStockValuationEvent"("originMovementId");
CREATE UNIQUE INDEX "MaterialStockValuationEvent_valuationId_sequence_key" ON "MaterialStockValuationEvent"("valuationId", "sequence");
CREATE FUNCTION protect_stock_valuation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Stock valuation evidence is immutable';
END $$;
CREATE TRIGGER stock_valuation_event_immutable BEFORE UPDATE OR DELETE ON "MaterialStockValuationEvent" FOR EACH ROW EXECUTE FUNCTION protect_stock_valuation_history();
CREATE FUNCTION protect_stock_valuation_opening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Stock valuation opening cannot be deleted'; END IF;
 IF (to_jsonb(NEW) - 'quantity' - 'amount' - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'quantity' - 'amount' - 'version') THEN
  RAISE EXCEPTION 'Stock valuation opening and scope are immutable';
 END IF;
 IF NEW."version" <> OLD."version" + 1 OR NOT EXISTS (
  SELECT 1 FROM "MaterialStockValuationEvent" e WHERE e."valuationId" = OLD.id AND e."sequence" = NEW."version"
   AND e."quantityBefore" = OLD."quantity" AND e."amountBefore" = OLD."amount"
   AND e."quantityAfter" = NEW."quantity" AND e."amountAfter" = NEW."amount"
 ) THEN RAISE EXCEPTION 'Stock valuation balance requires the corresponding additive event'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_valuation_opening_immutable BEFORE UPDATE OR DELETE ON "MaterialStockValuation" FOR EACH ROW EXECUTE FUNCTION protect_stock_valuation_opening();
CREATE FUNCTION protect_stock_valuation_activation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."valuationEnabled" AND NOT NEW."valuationEnabled" THEN RAISE EXCEPTION 'Valued stock cannot discard its ledger'; END IF;
 IF OLD."valuationEnabled" AND (NEW."warehouseId", NEW."materialId", NEW."batchNumber") IS DISTINCT FROM (OLD."warehouseId", OLD."materialId", OLD."batchNumber") THEN RAISE EXCEPTION 'Valued stock identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_valuation_activation BEFORE UPDATE ON "MaterialStock" FOR EACH ROW EXECUTE FUNCTION protect_stock_valuation_activation();
CREATE FUNCTION protect_valued_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "MaterialStockValuationEvent" WHERE "movementId" = OLD.id) THEN RAISE EXCEPTION 'Valued stock movement is immutable; use additive corrections'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER valued_stock_movement_immutable BEFORE UPDATE OR DELETE ON "MaterialMovement" FOR EACH ROW EXECUTE FUNCTION protect_valued_stock_movement();
CREATE FUNCTION validate_stock_valuation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "MaterialStockValuation" v JOIN "MaterialMovement" m ON m.id = NEW."movementId"
  WHERE v.id = NEW."valuationId" AND NEW."sequence" = v."version" + 1
   AND NEW."quantityBefore" = v."quantity" AND NEW."amountBefore" = v."amount"
   AND m."stockId" = v."stockId" AND m."quantityDecimal" IS NOT NULL
   AND ABS(NEW."quantityDelta") = ABS(m."quantityDecimal")
   AND ABS(NEW."amountDelta") = m."totalValueDecimal"
   AND (m.type = 'Entrada' AND NEW."quantityDelta" > 0 OR m.type = 'Saída' AND NEW."quantityDelta" < 0 OR m.type = 'Ajuste' AND NEW."quantityDelta" = m."quantityDecimal")
 ) THEN RAISE EXCEPTION 'Stock valuation event must match its position and canonical movement'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_valuation_event_valid BEFORE INSERT ON "MaterialStockValuationEvent" FOR EACH ROW EXECUTE FUNCTION validate_stock_valuation_event();
CREATE FUNCTION validate_stock_valuation_committed_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "MaterialStockValuation" v WHERE v.id = NEW."valuationId" AND v."version" >= NEW."sequence") THEN
  RAISE EXCEPTION 'Stock valuation event and balance must commit together';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER stock_valuation_event_committed AFTER INSERT ON "MaterialStockValuationEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_stock_valuation_committed_balance();
