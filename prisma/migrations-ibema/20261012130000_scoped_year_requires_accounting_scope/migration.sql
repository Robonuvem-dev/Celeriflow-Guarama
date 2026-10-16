CREATE OR REPLACE FUNCTION accounting_transaction_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  year_entity_id TEXT;
BEGIN
  SELECT "governmentEntityId" INTO year_entity_id
  FROM "FinancialYear" WHERE id = NEW."financialYearId";

  IF year_entity_id IS NOT NULL AND NEW."governmentEntityId" IS NULL THEN
    RAISE EXCEPTION 'Accounting transaction in an entity-scoped financial year must identify entity and budget unit';
  END IF;
  IF NEW."governmentEntityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlanningEntityUnit" u
    WHERE u."governmentEntityId" = NEW."governmentEntityId"
      AND u."budgetUnitId" = NEW."budgetUnitId"
  ) THEN
    RAISE EXCEPTION 'Accounting transaction unit is not bound to its government entity';
  END IF;
  IF NEW."governmentEntityId" IS NOT NULL AND year_entity_id IS DISTINCT FROM NEW."governmentEntityId" THEN
    RAISE EXCEPTION 'Accounting transaction entity does not match its financial year';
  END IF;
  RETURN NEW;
END;
$$;
