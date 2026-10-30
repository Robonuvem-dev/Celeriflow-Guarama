CREATE TABLE "AssetCatalogRecord" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 1900 AND 2200),
  "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT,
  "details" JSONB NOT NULL CHECK (jsonb_typeof("details") = 'object'),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AssetCatalogRecord_scope_code_key" ON "AssetCatalogRecord"("kind", "year", "departmentId", "code");
CREATE TABLE "MaterialRequestRevision" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "MaterialRequest"("id") ON DELETE RESTRICT,
  "operation" TEXT NOT NULL,
  "previousStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
