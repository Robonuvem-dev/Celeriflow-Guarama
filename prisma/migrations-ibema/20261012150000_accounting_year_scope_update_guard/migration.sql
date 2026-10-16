-- Changing a transaction's year must run the same entity/unit validation as an insert.
DROP TRIGGER "AccountingTransaction_scope_guard" ON "AccountingTransaction";
CREATE TRIGGER "AccountingTransaction_scope_guard"
  BEFORE INSERT OR UPDATE OF "governmentEntityId", "budgetUnitId", "financialYearId"
  ON "AccountingTransaction"
  FOR EACH ROW EXECUTE FUNCTION accounting_transaction_scope_guard();
