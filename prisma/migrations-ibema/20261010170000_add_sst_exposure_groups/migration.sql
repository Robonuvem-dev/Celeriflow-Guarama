CREATE TABLE "SstExposureGroup" (
  id TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL,
  "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[], "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "SstExposureGroup_budgetUnitId_code_key" ON "SstExposureGroup"("budgetUnitId", code);
CREATE INDEX "SstExposureGroup_budgetUnitId_isActive_startsAt_idx" ON "SstExposureGroup"("budgetUnitId", "isActive", "startsAt");
