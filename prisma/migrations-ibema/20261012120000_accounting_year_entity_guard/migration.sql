CREATE OR REPLACE FUNCTION accounting_transaction_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."governmentEntityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlanningEntityUnit" u
    WHERE u."governmentEntityId" = NEW."governmentEntityId"
      AND u."budgetUnitId" = NEW."budgetUnitId"
  ) THEN
    RAISE EXCEPTION 'Accounting transaction unit is not bound to its government entity';
  END IF;
  IF NEW."governmentEntityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FinancialYear" y
    WHERE y.id = NEW."financialYearId"
      AND y."governmentEntityId" = NEW."governmentEntityId"
  ) THEN
    RAISE EXCEPTION 'Accounting transaction entity does not match its financial year';
  END IF;
  RETURN NEW;
END;
$$;
