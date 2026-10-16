ALTER TABLE "Asset" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");
CREATE TABLE "EquipmentCustody" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serialNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Em uso',
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "materialId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "responsibleId" TEXT NOT NULL,
  "stockMovementId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentCustody_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentCustody_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentCustody_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentCustody_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentCustody_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "MaterialMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EquipmentCustody_code_key" ON "EquipmentCustody"("code");
CREATE INDEX "EquipmentCustody_departmentId_status_idx" ON "EquipmentCustody"("departmentId", "status");
CREATE INDEX "EquipmentCustody_responsibleId_idx" ON "EquipmentCustody"("responsibleId");
CREATE INDEX "EquipmentCustody_stockMovementId_idx" ON "EquipmentCustody"("stockMovementId");
