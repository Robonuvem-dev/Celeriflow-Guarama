ALTER TABLE "MaterialRequest" ADD COLUMN "sourceWarehouseId" TEXT;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_sourceWarehouseId_fkey"
  FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MaterialRequest_sourceWarehouseId_status_idx" ON "MaterialRequest"("sourceWarehouseId", "status");
