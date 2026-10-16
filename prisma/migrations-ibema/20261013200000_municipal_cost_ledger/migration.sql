CREATE TABLE "MunicipalCostPolicy" (
  "id" TEXT PRIMARY KEY, "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT,
  "effectiveFrom" DATE NOT NULL, "enabled" BOOLEAN NOT NULL, "sourceTypes" JSONB NOT NULL,
  "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MunicipalCostPolicy_scope" ON "MunicipalCostPolicy"("governmentEntityId","effectiveFrom","createdAt");
CREATE TABLE "MunicipalCostObject" (
  "id" TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT,
  "budgetUnitId" TEXT REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL, "description" TEXT NOT NULL, "detailedDescription" TEXT NOT NULL,
  "parentId" TEXT REFERENCES "MunicipalCostObject"("id") ON DELETE RESTRICT,
  "sourceKey" TEXT NOT NULL, "sourceSnapshot" JSONB NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("financialYearId","code"), UNIQUE("financialYearId","sourceKey")
);
CREATE INDEX "MunicipalCostObject_scope" ON "MunicipalCostObject"("financialYearId","budgetUnitId","parentId");
CREATE TABLE "MunicipalCostItem" (
  "id" TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT,
  "identifier" TEXT NOT NULL, "description" TEXT NOT NULL, "detailedDescription" TEXT NOT NULL,
  "identificationClass" TEXT NOT NULL, "behavior" TEXT NOT NULL CHECK ("behavior" IN ('FIXED','VARIABLE')),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("financialYearId","identifier")
);
CREATE TABLE "MunicipalCostObjectItem" (
  "id" TEXT PRIMARY KEY, "objectId" TEXT NOT NULL REFERENCES "MunicipalCostObject"("id") ON DELETE RESTRICT,
  "itemId" TEXT NOT NULL REFERENCES "MunicipalCostItem"("id") ON DELETE RESTRICT,
  "copiedFromId" TEXT REFERENCES "MunicipalCostObjectItem"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("objectId","itemId")
);
CREATE TABLE "MunicipalCostRule" (
  "id" TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "selector" JSONB NOT NULL, "shares" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0, "effectiveFrom" DATE NOT NULL, "effectiveUntil" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "retiredAt" TIMESTAMP(3), "retirementReason" TEXT, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom")
);
CREATE INDEX "MunicipalCostRule_scope" ON "MunicipalCostRule"("financialYearId","budgetUnitId","sourceType","effectiveFrom");
CREATE TABLE "MunicipalCostSource" (
  "id" TEXT PRIMARY KEY, "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"("id") ON DELETE RESTRICT,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
  "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "expenseDate" TIMESTAMP(3) NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL CHECK ("amount" > 0), "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("sourceType","sourceId")
);
CREATE INDEX "MunicipalCostSource_scope" ON "MunicipalCostSource"("financialYearId","budgetUnitId","expenseDate");
CREATE TABLE "MunicipalCostMovement" (
  "id" TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "MunicipalCostSource"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ALLOCATION','REVERSAL','RESTORATION')),
  "date" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "referenceMovementId" TEXT UNIQUE REFERENCES "MunicipalCostMovement"("id") ON DELETE RESTRICT,
  "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("kind"='ALLOCATION') = ("referenceMovementId" IS NULL))
);
CREATE INDEX "MunicipalCostMovement_source" ON "MunicipalCostMovement"("sourceId","date");
CREATE TABLE "MunicipalCostAllocation" (
  "id" TEXT PRIMARY KEY, "movementId" TEXT NOT NULL REFERENCES "MunicipalCostMovement"("id") ON DELETE RESTRICT,
  "objectId" TEXT NOT NULL REFERENCES "MunicipalCostObject"("id") ON DELETE RESTRICT,
  "itemId" TEXT NOT NULL REFERENCES "MunicipalCostItem"("id") ON DELETE RESTRICT,
  "amount" NUMERIC(18,2) NOT NULL CHECK ("amount" <> 0), UNIQUE("movementId","objectId","itemId")
);

-- As tabelas são novas; não há alteração/backfill de fatos municipais anteriores.
CREATE FUNCTION municipal_cost_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity TEXT; unit_entity TEXT;
BEGIN
  SELECT "governmentEntityId" INTO entity FROM "FinancialYear" WHERE id=NEW."financialYearId";
  IF entity IS NULL THEN RAISE EXCEPTION 'Custos exige exercício com entidade conciliada'; END IF;
  IF NEW."budgetUnitId" IS NOT NULL THEN
    SELECT "governmentEntityId" INTO unit_entity FROM "PlanningEntityUnit" WHERE "budgetUnitId"=NEW."budgetUnitId";
    IF unit_entity IS DISTINCT FROM entity THEN RAISE EXCEPTION 'UG de custos não pertence ao exercício'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_object_scope BEFORE INSERT OR UPDATE ON "MunicipalCostObject" FOR EACH ROW EXECUTE FUNCTION municipal_cost_scope_guard();
CREATE TRIGGER municipal_cost_source_scope BEFORE INSERT OR UPDATE ON "MunicipalCostSource" FOR EACH ROW EXECUTE FUNCTION municipal_cost_scope_guard();
CREATE TRIGGER municipal_cost_rule_scope BEFORE INSERT OR UPDATE ON "MunicipalCostRule" FOR EACH ROW EXECUTE FUNCTION municipal_cost_scope_guard();

CREATE FUNCTION municipal_cost_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Histórico de custos é aditivo; registre movimento corretivo'; END $$;
CREATE TRIGGER municipal_cost_movement_immutable BEFORE UPDATE OR DELETE ON "MunicipalCostMovement" FOR EACH ROW EXECUTE FUNCTION municipal_cost_history_guard();
CREATE TRIGGER municipal_cost_allocation_immutable BEFORE UPDATE OR DELETE ON "MunicipalCostAllocation" FOR EACH ROW EXECUTE FUNCTION municipal_cost_history_guard();
CREATE TRIGGER municipal_cost_policy_immutable BEFORE UPDATE OR DELETE ON "MunicipalCostPolicy" FOR EACH ROW EXECUTE FUNCTION municipal_cost_history_guard();

CREATE FUNCTION municipal_cost_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src "MunicipalCostSource"%ROWTYPE; mov "MunicipalCostMovement"%ROWTYPE;
        obj "MunicipalCostObject"%ROWTYPE; item "MunicipalCostItem"%ROWTYPE; position NUMERIC;
BEGIN
  SELECT * INTO mov FROM "MunicipalCostMovement" WHERE id=NEW."movementId";
  SELECT * INTO src FROM "MunicipalCostSource" WHERE id=mov."sourceId" FOR UPDATE;
  SELECT * INTO obj FROM "MunicipalCostObject" WHERE id=NEW."objectId";
  SELECT * INTO item FROM "MunicipalCostItem" WHERE id=NEW."itemId";
  IF src.status <> 'ACTIVE' OR obj."financialYearId" IS DISTINCT FROM src."financialYearId" OR item."financialYearId" IS DISTINCT FROM src."financialYearId"
     OR (obj."budgetUnitId" IS NOT NULL AND obj."budgetUnitId" IS DISTINCT FROM src."budgetUnitId")
     OR NOT EXISTS (SELECT 1 FROM "MunicipalCostObjectItem" WHERE "objectId"=obj.id AND "itemId"=item.id)
  THEN RAISE EXCEPTION 'Par objeto/item não pertence ao escopo ativo da origem'; END IF;
  IF (mov.kind='REVERSAL') IS DISTINCT FROM (NEW.amount < 0) THEN RAISE EXCEPTION 'Sinal do custo diverge do tipo do movimento'; END IF;
  IF NEW.amount > 0 AND (NOT obj."isActive" OR NOT item."isActive") THEN RAISE EXCEPTION 'Novo custo exige objeto e item ativos'; END IF;
  SELECT COALESCE(SUM(a.amount),0) INTO position FROM "MunicipalCostAllocation" a JOIN "MunicipalCostMovement" m ON m.id=a."movementId" WHERE m."sourceId"=src.id;
  IF position + NEW.amount < 0 OR position + NEW.amount > src.amount THEN RAISE EXCEPTION 'Custo excede teto ou posição da origem'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_allocation_integrity BEFORE INSERT ON "MunicipalCostAllocation" FOR EACH ROW EXECUTE FUNCTION municipal_cost_allocation_guard();

CREATE FUNCTION municipal_cost_source_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Origem de custo é imutável'; END IF;
  IF NEW.status NOT IN ('ACTIVE','CANCELLED') OR (OLD.status='CANCELLED' AND NEW.status<>'CANCELLED') THEN RAISE EXCEPTION 'Origem cancelada não pode ser reativada'; END IF;
  IF NEW.status='CANCELLED' AND EXISTS (
    SELECT 1 FROM "MunicipalCostAllocation" a JOIN "MunicipalCostMovement" m ON m.id=a."movementId" WHERE m."sourceId"=NEW.id HAVING SUM(a.amount) <> 0
  ) THEN RAISE EXCEPTION 'Origem cancelada possui custo apropriado'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_source_history BEFORE UPDATE ON "MunicipalCostSource" FOR EACH ROW EXECUTE FUNCTION municipal_cost_source_history_guard();

CREATE FUNCTION municipal_cost_correction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "MunicipalCostMovement"%ROWTYPE;
BEGIN
  IF NEW."referenceMovementId" IS NOT NULL THEN
    SELECT * INTO previous FROM "MunicipalCostMovement" WHERE id=NEW."referenceMovementId";
    IF previous."sourceId" IS DISTINCT FROM NEW."sourceId" OR previous.date > NEW.date OR (NEW.kind='REVERSAL') = (previous.kind='REVERSAL') THEN RAISE EXCEPTION 'Correção de custo não corresponde à cadeia de origem'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_correction_integrity BEFORE INSERT ON "MunicipalCostMovement" FOR EACH ROW EXECUTE FUNCTION municipal_cost_correction_guard();

CREATE TRIGGER municipal_cost_source_no_delete BEFORE DELETE ON "MunicipalCostSource" FOR EACH ROW EXECUTE FUNCTION municipal_cost_history_guard();
CREATE FUNCTION municipal_cost_rule_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['isActive','retiredAt','retirementReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['isActive','retiredAt','retirementReason'])
     OR NOT OLD."isActive" OR NEW."isActive" OR NEW."retiredAt" IS NULL OR NULLIF(BTRIM(NEW."retirementReason"),'') IS NULL
  THEN RAISE EXCEPTION 'Regra de custo preserva definição; inative com fundamento e crie outra vigência'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER municipal_cost_rule_history BEFORE UPDATE ON "MunicipalCostRule" FOR EACH ROW EXECUTE FUNCTION municipal_cost_rule_history_guard();
