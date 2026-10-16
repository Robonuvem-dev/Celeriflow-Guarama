CREATE TABLE "SstEquipment" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "materialId" TEXT NOT NULL REFERENCES "Material"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('EPI','EPC')), "ca" TEXT NOT NULL,
 "caValidUntil" DATE, "validityDays" INTEGER NOT NULL CHECK ("validityDays">0),
 "reviewDays" INTEGER NOT NULL CHECK ("reviewDays">0),
 "supplierId" TEXT REFERENCES "Supplier"("id") ON DELETE RESTRICT,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 UNIQUE ("budgetUnitId","materialId"), CHECK ("kind" <> 'EPI' OR length("ca") > 0)
);
CREATE TABLE "SstEquipmentPolicy" (
 "budgetUnitId" TEXT PRIMARY KEY REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "integrateStock" BOOLEAN NOT NULL DEFAULT false, "updatedById" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SstEquipmentDelivery" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "deliveredAt" TIMESTAMP(3) NOT NULL, "integratedStock" BOOLEAN NOT NULL,
 "location" TEXT NOT NULL, "notes" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "biometricStatus" TEXT NOT NULL DEFAULT 'INTEGRATION_PENDING' CHECK ("biometricStatus" = 'INTEGRATION_PENDING')
);
CREATE TABLE "SstEquipmentDeliveryItem" (
 "id" TEXT PRIMARY KEY, "deliveryId" TEXT NOT NULL REFERENCES "SstEquipmentDelivery"("id") ON DELETE RESTRICT,
 "equipmentId" TEXT NOT NULL REFERENCES "SstEquipment"("id") ON DELETE RESTRICT,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "quantity" DOUBLE PRECISION NOT NULL CHECK ("quantity">0 AND "quantity"<='100000'::float8),
 "writtenOffQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("writtenOffQuantity">=0 AND "writtenOffQuantity"<="quantity"),
 "expiresAt" TIMESTAMP(3) NOT NULL, "nextReviewAt" TIMESTAMP(3) NOT NULL,
 "movementId" TEXT UNIQUE REFERENCES "MaterialMovement"("id") ON DELETE RESTRICT,
 "snapshot" JSONB NOT NULL, UNIQUE ("deliveryId","employeeId","equipmentId")
);
CREATE TABLE "SstEquipmentEvent" (
 "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "SstEquipmentDeliveryItem"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('REVIEW','WRITE_OFF')),
 "quantity" DOUBLE PRECISION NOT NULL CHECK ("quantity">=0), "occurredAt" TIMESTAMP(3) NOT NULL,
 "nextReviewAt" TIMESTAMP(3), "responsiblePersonId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT,
 "notes" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "submissionKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, UNIQUE ("submissionKey","itemId"),
 CHECK (("kind"='REVIEW' AND "nextReviewAt">"occurredAt" AND "quantity"=0) OR ("kind"='WRITE_OFF' AND "quantity">0 AND "nextReviewAt" IS NULL))
);
CREATE TABLE "SstEquipmentRequirement" (
 "id" TEXT PRIMARY KEY, "programGroupId" TEXT NOT NULL REFERENCES "SstProgramExposureGroup"("id") ON DELETE RESTRICT,
 "recommendation" TEXT NOT NULL, "equipmentId" TEXT NOT NULL REFERENCES "SstEquipment"("id") ON DELETE RESTRICT,
 "quantity" DOUBLE PRECISION NOT NULL CHECK ("quantity">0), "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("programGroupId","recommendation")
);
CREATE INDEX "SstEquipment_unit_created_idx" ON "SstEquipment"("budgetUnitId","createdAt","id");
CREATE INDEX "SstEquipmentDelivery_unit_date_idx" ON "SstEquipmentDelivery"("budgetUnitId","deliveredAt","id");
CREATE INDEX "SstEquipmentItem_employee_idx" ON "SstEquipmentDeliveryItem"("employeeId","equipmentId");
CREATE INDEX "SstEquipmentItem_review_idx" ON "SstEquipmentDeliveryItem"("nextReviewAt");
CREATE INDEX "SstEquipmentEvent_item_date_idx" ON "SstEquipmentEvent"("itemId","occurredAt");
-- Issued documents and event evidence are immutable; remaining balance/scheduling live on items.
CREATE FUNCTION sst_equipment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SST equipment evidence is immutable'; END $$;
CREATE TRIGGER sst_equipment_delivery_immutable BEFORE UPDATE OR DELETE ON "SstEquipmentDelivery" FOR EACH ROW EXECUTE FUNCTION sst_equipment_immutable();
CREATE TRIGGER sst_equipment_event_immutable BEFORE UPDATE OR DELETE ON "SstEquipmentEvent" FOR EACH ROW EXECUTE FUNCTION sst_equipment_immutable();
CREATE TRIGGER sst_equipment_catalog_immutable BEFORE UPDATE OR DELETE ON "SstEquipment" FOR EACH ROW EXECUTE FUNCTION sst_equipment_immutable();
CREATE TRIGGER sst_equipment_requirement_immutable BEFORE UPDATE OR DELETE ON "SstEquipmentRequirement" FOR EACH ROW EXECUTE FUNCTION sst_equipment_immutable();
CREATE FUNCTION sst_equipment_item_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SST equipment evidence is immutable'; END IF;
 IF (to_jsonb(NEW)-'writtenOffQuantity'-'nextReviewAt') IS DISTINCT FROM (to_jsonb(OLD)-'writtenOffQuantity'-'nextReviewAt') THEN
  RAISE EXCEPTION 'SST equipment item evidence is immutable';
 END IF;
 IF NEW."writtenOffQuantity" < OLD."writtenOffQuantity" THEN RAISE EXCEPTION 'SST usage write-off cannot be reversed by editing'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_equipment_item_evidence BEFORE UPDATE OR DELETE ON "SstEquipmentDeliveryItem" FOR EACH ROW EXECUTE FUNCTION sst_equipment_item_evidence();
