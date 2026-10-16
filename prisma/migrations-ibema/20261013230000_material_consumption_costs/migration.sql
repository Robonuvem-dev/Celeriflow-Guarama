-- Decimal memory applies only to new facts; legacy rows are not backfilled.
ALTER TABLE "MaterialMovement" ADD COLUMN "quantityDecimal" NUMERIC(18,6), ADD COLUMN "unitValueDecimal" NUMERIC(18,6), ADD COLUMN "totalValueDecimal" NUMERIC(18,2);
ALTER TABLE "MaterialMovement" ADD CONSTRAINT "MaterialMovement_decimal_values" CHECK (
  ("quantityDecimal" IS NULL OR "quantityDecimal"<>0) AND ("unitValueDecimal" IS NULL OR "unitValueDecimal">=0)
  AND ("totalValueDecimal" IS NULL OR ("quantityDecimal" IS NOT NULL AND "unitValueDecimal" IS NOT NULL AND "totalValueDecimal"=ROUND(ABS("quantityDecimal")*"unitValueDecimal",2)))
);
CREATE TABLE "MunicipalCostSourceReduction" (
  "id" TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "MunicipalCostSource"("id") ON DELETE RESTRICT,
  "date" TIMESTAMP(3) NOT NULL, "amount" NUMERIC(18,2) NOT NULL CHECK ("amount">0),
  "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MunicipalCostSourceReduction_sourceId_date_idx" ON "MunicipalCostSourceReduction"("sourceId","date");
CREATE TRIGGER municipal_cost_reduction_immutable BEFORE UPDATE OR DELETE ON "MunicipalCostSourceReduction" FOR EACH ROW EXECUTE FUNCTION municipal_cost_history_guard();
CREATE FUNCTION municipal_cost_reduction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin "MunicipalCostSource"%ROWTYPE; reduced NUMERIC; allocated NUMERIC;
BEGIN
  SELECT * INTO origin FROM "MunicipalCostSource" WHERE id=NEW."sourceId" FOR UPDATE;
  SELECT COALESCE(SUM(amount),0) INTO reduced FROM "MunicipalCostSourceReduction" WHERE "sourceId"=origin.id;
  SELECT COALESCE(SUM(a.amount),0) INTO allocated FROM "MunicipalCostAllocation" a JOIN "MunicipalCostMovement" m ON m.id=a."movementId" WHERE m."sourceId"=origin.id;
  IF origin.status<>'ACTIVE' OR NEW.date<origin."expenseDate" OR origin.amount-reduced-NEW.amount<allocated THEN RAISE EXCEPTION 'Redução exige origem ativa, data posterior e apropriações dentro do novo teto'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_reduction_integrity BEFORE INSERT ON "MunicipalCostSourceReduction" FOR EACH ROW EXECUTE FUNCTION municipal_cost_reduction_guard();
CREATE FUNCTION municipal_cost_reduced_ceiling_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin_id TEXT; ceiling NUMERIC; allocated NUMERIC;
BEGIN
  SELECT "sourceId" INTO origin_id FROM "MunicipalCostMovement" WHERE id=NEW."movementId";
  SELECT amount-COALESCE((SELECT SUM(amount) FROM "MunicipalCostSourceReduction" WHERE "sourceId"=origin_id),0) INTO ceiling FROM "MunicipalCostSource" WHERE id=origin_id FOR UPDATE;
  SELECT COALESCE(SUM(a.amount),0) INTO allocated FROM "MunicipalCostAllocation" a JOIN "MunicipalCostMovement" m ON m.id=a."movementId" WHERE m."sourceId"=origin_id;
  IF allocated+NEW.amount>ceiling THEN RAISE EXCEPTION 'Apropriação excede origem líquida das devoluções'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_reduced_ceiling BEFORE INSERT ON "MunicipalCostAllocation" FOR EACH ROW EXECUTE FUNCTION municipal_cost_reduced_ceiling_guard();
CREATE FUNCTION municipal_material_cost_memory_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MunicipalCostSource" WHERE "sourceType" IN ('STOCK_CONSUMPTION','IMMEDIATE_MATERIAL') AND "sourceId" IN (OLD.id, OLD."returnedMovementId", OLD."reversedMovementId"))
    OR EXISTS (SELECT 1 FROM "MunicipalCostSourceReduction" WHERE "snapshot"->'evidence'->>'correctionMovementId'=OLD.id)
  THEN RAISE EXCEPTION 'Movimento utilizado em custos conserva memória; registre correção aditiva'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_material_cost_memory BEFORE UPDATE OR DELETE ON "MaterialMovement" FOR EACH ROW EXECUTE FUNCTION municipal_material_cost_memory_guard();
