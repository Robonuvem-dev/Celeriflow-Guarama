-- Extend the existing version registry; canonical records and historic IDs remain intact.
ALTER TABLE "PlanningCatalogEntry" DROP CONSTRAINT "PlanningCatalogEntry_kind_check";
ALTER TABLE "PlanningCatalogEntry" ADD CONSTRAINT "PlanningCatalogEntry_kind_check"
  CHECK (kind IN ('SOURCE', 'REVENUE', 'EXPENSE', 'ACCOUNT', 'CNAE', 'CBO', 'SERVICE'));
ALTER TABLE "PlanningCatalogEntry" DROP CONSTRAINT "PlanningCatalogEntry_degree_check";
ALTER TABLE "PlanningCatalogEntry" ADD CONSTRAINT "PlanningCatalogEntry_degree_check"
  CHECK (degree BETWEEN 1 AND 12);
CREATE INDEX "PlanningCatalogEntry_canonical_version_idx" ON "PlanningCatalogEntry" (kind, "canonicalId", "versionId");
