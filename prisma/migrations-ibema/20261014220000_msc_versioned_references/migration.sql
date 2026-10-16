-- Extend the existing classification registry without changing municipal editions or balances.
ALTER TABLE "PlanningCatalogEntry" DROP CONSTRAINT "PlanningCatalogEntry_kind_check";
ALTER TABLE "PlanningCatalogEntry" ADD CONSTRAINT "PlanningCatalogEntry_kind_check"
  CHECK (kind IN (
    'SOURCE', 'REVENUE', 'EXPENSE', 'ACCOUNT', 'CNAE', 'CBO', 'SERVICE',
    'MSC_ACCOUNT', 'MSC_PO', 'MSC_FP', 'MSC_DC', 'MSC_FR', 'MSC_CO',
    'MSC_NR', 'MSC_ND', 'MSC_FUNCTION', 'MSC_SUBFUNCTION',
    'MSC_MAPPING_ACCOUNT', 'MSC_MAPPING_SOURCE', 'MSC_MAPPING_REVENUE',
    'MSC_MAPPING_EXPENSE', 'MSC_REPORTING_SCOPE'
  ));
