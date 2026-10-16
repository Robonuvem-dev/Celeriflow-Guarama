-- Additive fleet functionality. Existing identities, patrimony triggers and history are preserved.
ALTER TABLE "FleetWorkOrder" ALTER COLUMN "planId" DROP NOT NULL;
ALTER TABLE "FleetUsage" ADD COLUMN "driverId" TEXT, ADD COLUMN "tripId" TEXT UNIQUE, ADD COLUMN "meterType" TEXT NOT NULL DEFAULT 'HODOMETRO';
ALTER TABLE "FleetExpense" ADD COLUMN "supplierId" TEXT REFERENCES "Supplier"("id"), ADD COLUMN "supplierName" TEXT, ADD COLUMN "contractId" TEXT REFERENCES "Contract"("id"), ADD COLUMN "purchaseProcessId" TEXT REFERENCES "PurchaseProcess"("id");
ALTER TABLE "FleetOccurrence" ADD COLUMN "latitude" DECIMAL(10,7), ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "FleetOccurrence" ADD CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));

CREATE TABLE "FleetCatalogVersion" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "reference" TEXT NOT NULL, "sourceReference" TEXT NOT NULL, "sha256" TEXT NOT NULL, "complete" BOOLEAN NOT NULL DEFAULT false, "published" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("kind","reference","sha256"));
CREATE TABLE "FleetCatalogEntry" ("id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "FleetCatalogVersion"("id"), "code" TEXT NOT NULL, "name" TEXT NOT NULL, "details" JSONB NOT NULL, UNIQUE ("versionId","code"));
CREATE TABLE "FleetMachineType" ("id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "fields" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "FleetUnitControl" (
 "unitId" TEXT PRIMARY KEY REFERENCES "FleetUnit"("id"), "species" TEXT, "color" TEXT, "fuelType" TEXT, "tankCapacity" DECIMAL(14,3),
 "meterType" TEXT NOT NULL DEFAULT 'HODOMETRO', "currentReading" DECIMAL(14,3), "expectedConsumption" DECIMAL(14,3), "tolerancePercent" DECIMAL(9,3) NOT NULL DEFAULT 10,
 "costCenterId" TEXT REFERENCES "CostCenter"("id"), "acquisitionDate" DATE, "fipeModelId" TEXT REFERENCES "FleetCatalogEntry"("id"), "machineTypeId" TEXT REFERENCES "FleetMachineType"("id"), "machineValues" JSONB NOT NULL DEFAULT '{}',
 "fixedRouteId" TEXT REFERENCES "FleetRoute"("id"), "allowedLicenseCategories" JSONB NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("meterType" IN ('HODOMETRO','HORIMETRO','SEM_MARCADOR')), CHECK ("currentReading" IS NULL OR "currentReading" >= 0), CHECK ("tankCapacity" IS NULL OR "tankCapacity" > 0), CHECK ("tolerancePercent" BETWEEN 0 AND 100)
);
CREATE TABLE "FleetDriver" (
 "id" TEXT PRIMARY KEY, "personId" TEXT NOT NULL UNIQUE REFERENCES "Person"("id"), "employeeId" TEXT UNIQUE REFERENCES "Employee"("id"), "departmentId" TEXT NOT NULL REFERENCES "Department"("id"), "outsourced" BOOLEAN NOT NULL DEFAULT false,
 "cnhNumber" TEXT NOT NULL UNIQUE, "cnhCategories" JSONB NOT NULL, "cnhExpiresAt" DATE NOT NULL, "suspensionUntil" DATE, "active" BOOLEAN NOT NULL DEFAULT true,
 "pointLimit" INTEGER NOT NULL DEFAULT 20, "pointWindowMonths" INTEGER NOT NULL DEFAULT 12, "policyReference" TEXT NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("pointLimit" > 0 AND "pointWindowMonths" > 0)
);
CREATE TABLE "FleetDestination" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "city" TEXT NOT NULL, "address" TEXT, "distance" DECIMAL(14,3), "departmentId" TEXT NOT NULL REFERENCES "Department"("id"), "active" BOOLEAN NOT NULL DEFAULT true, UNIQUE ("departmentId","name","city"));
CREATE TABLE "FleetBooking" (
 "id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "driverId" TEXT REFERENCES "FleetDriver"("id"), "routeId" TEXT REFERENCES "FleetRoute"("id"), "destinationId" TEXT REFERENCES "FleetDestination"("id"),
 "kind" TEXT NOT NULL, "purpose" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'AGENDADO', "previousId" TEXT UNIQUE REFERENCES "FleetBooking"("id"), "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "FleetBooking_unitId_startsAt_endsAt_status_idx" ON "FleetBooking"("unitId","startsAt","endsAt","status");
CREATE INDEX "FleetBooking_driverId_startsAt_endsAt_status_idx" ON "FleetBooking"("driverId","startsAt","endsAt","status");
CREATE TABLE "FleetTrip" (
 "id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "driverId" TEXT NOT NULL REFERENCES "FleetDriver"("id"), "bookingId" TEXT UNIQUE REFERENCES "FleetBooking"("id"), "routeId" TEXT REFERENCES "FleetRoute"("id"),
 "destination" TEXT NOT NULL, "purpose" TEXT NOT NULL, "departedAt" TIMESTAMP(3) NOT NULL, "returnedAt" TIMESTAMP(3), "meterType" TEXT NOT NULL, "startReading" DECIMAL(14,3), "endReading" DECIMAL(14,3), "checklist" JSONB NOT NULL,
 "driverSnapshot" JSONB NOT NULL, "routeSnapshot" TEXT, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), CHECK ("returnedAt" IS NULL OR "returnedAt" >= "departedAt"), CHECK ("endReading" IS NULL OR "endReading" >= "startReading")
);
CREATE INDEX "FleetTrip_unitId_returnedAt_idx" ON "FleetTrip"("unitId","returnedAt");
CREATE INDEX "FleetTrip_driverId_returnedAt_idx" ON "FleetTrip"("driverId","returnedAt");
CREATE UNIQUE INDEX "FleetTrip_one_open_unit" ON "FleetTrip"("unitId") WHERE "returnedAt" IS NULL;
CREATE UNIQUE INDEX "FleetTrip_one_open_driver" ON "FleetTrip"("driverId") WHERE "returnedAt" IS NULL;
ALTER TABLE "FleetUsage" ADD FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id"), ADD FOREIGN KEY ("tripId") REFERENCES "FleetTrip"("id");
CREATE TABLE "FleetGateEvent" ("id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "tripId" TEXT NOT NULL REFERENCES "FleetTrip"("id"), "driverId" TEXT NOT NULL REFERENCES "FleetDriver"("id"), "kind" TEXT NOT NULL CHECK ("kind" IN ('SAIDA','ENTRADA')), "reading" DECIMAL(14,3), "occurredAt" TIMESTAMP(3) NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), UNIQUE ("tripId","kind"));
CREATE INDEX "FleetGateEvent_unitId_occurredAt_idx" ON "FleetGateEvent"("unitId","occurredAt");
CREATE TABLE "FleetProvider" ("id" TEXT PRIMARY KEY, "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id"), "kind" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, UNIQUE ("supplierId","kind"));
CREATE TABLE "FleetFuelAgreement" (
 "id" TEXT PRIMARY KEY, "contractId" TEXT NOT NULL REFERENCES "Contract"("id"), "purchaseItemId" TEXT NOT NULL REFERENCES "PurchaseProcessItem"("id"), "providerId" TEXT NOT NULL REFERENCES "FleetProvider"("id"), "fuelType" TEXT NOT NULL,
 "contracted" DECIMAL(14,3) NOT NULL, "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0, "consumed" DECIMAL(14,3) NOT NULL DEFAULT 0, "unitPrice" DECIMAL(18,6), "evidenceVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"("id"), "snapshot" JSONB NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, UNIQUE ("contractId","purchaseItemId","fuelType"), CHECK ("contracted" > 0 AND "reserved" >= 0 AND "consumed" >= 0 AND "reserved" + "consumed" <= "contracted")
);
CREATE TABLE "FleetFuelQuota" ("id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "period" TEXT NOT NULL, "limit" DECIMAL(14,3) NOT NULL CHECK ("limit" > 0), UNIQUE ("unitId","period"));
CREATE TABLE "FleetAuthorization" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "driverId" TEXT REFERENCES "FleetDriver"("id"), "providerId" TEXT REFERENCES "FleetProvider"("id"), "agreementId" TEXT REFERENCES "FleetFuelAgreement"("id"),
 "contractId" TEXT REFERENCES "Contract"("id"), "purchaseProcessId" TEXT REFERENCES "PurchaseProcess"("id"), "stockId" TEXT REFERENCES "MaterialStock"("id"), "materialName" TEXT, "origin" TEXT NOT NULL, "workOrderId" TEXT UNIQUE REFERENCES "FleetWorkOrder"("id"),
 "authorizedQuantity" DECIMAL(14,3), "authorizedAmount" DECIMAL(18,2), "actualQuantity" DECIMAL(14,3), "actualAmount" DECIMAL(18,2), "reading" DECIMAL(14,3), "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'EMITIDA', "validUntil" TIMESTAMP(3) NOT NULL,
 "tokenHash" TEXT, "capabilityRevision" INTEGER NOT NULL DEFAULT 0, "consumptionId" TEXT UNIQUE REFERENCES "FleetConsumption"("id"), "expenseId" TEXT UNIQUE REFERENCES "FleetExpense"("id"), "evidenceVersionId" TEXT REFERENCES "DocumentVersion"("id"),
 "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "executedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), CHECK ("actualQuantity" IS NULL OR "actualQuantity" > 0 AND "actualQuantity" <= "authorizedQuantity"), CHECK ("actualAmount" IS NULL OR "actualAmount" >= 0 AND ("authorizedAmount" IS NULL OR "actualAmount" <= "authorizedAmount"))
);
CREATE INDEX "FleetAuthorization_unitId_issuedAt_status_idx" ON "FleetAuthorization"("unitId","issuedAt","status");
CREATE TABLE "FleetWorkshopReport" ("id" TEXT PRIMARY KEY, "authorizationId" TEXT NOT NULL REFERENCES "FleetAuthorization"("id"), "providerId" TEXT NOT NULL REFERENCES "FleetProvider"("id"), "performed" TEXT NOT NULL, "parts" TEXT, "amount" DECIMAL(18,2), "status" TEXT NOT NULL DEFAULT 'RECEBIDO', "evidenceVersionId" TEXT REFERENCES "DocumentVersion"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "FleetWorkshopReport_authorizationId_status_idx" ON "FleetWorkshopReport"("authorizationId","status");
CREATE UNIQUE INDEX "FleetWorkshopReport_one_received" ON "FleetWorkshopReport"("authorizationId") WHERE "status" IN ('RECEBIDO','CONFERIDO');
CREATE TABLE "FleetComponent" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "identifier" TEXT NOT NULL UNIQUE, "brand" TEXT NOT NULL, "specification" TEXT NOT NULL, "expectedLife" DECIMAL(14,3), "status" TEXT NOT NULL DEFAULT 'ESTOQUE', "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"));
CREATE TABLE "FleetComponentInstallation" (
 "id" TEXT PRIMARY KEY, "componentId" TEXT NOT NULL REFERENCES "FleetComponent"("id"), "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "position" TEXT NOT NULL, "installedAt" TIMESTAMP(3) NOT NULL, "removedAt" TIMESTAMP(3), "installReading" DECIMAL(14,3), "removeReading" DECIMAL(14,3),
 "reason" TEXT NOT NULL, "cost" DECIMAL(18,2), "stockMovementId" TEXT UNIQUE REFERENCES "MaterialMovement"("id"), "expenseId" TEXT UNIQUE REFERENCES "FleetExpense"("id"), "workOrderId" TEXT REFERENCES "FleetWorkOrder"("id"), "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), CHECK ("removedAt" IS NULL OR "removedAt" >= "installedAt")
);
CREATE INDEX "FleetComponentInstallation_unitId_position_removedAt_idx" ON "FleetComponentInstallation"("unitId","position","removedAt");
CREATE UNIQUE INDEX "FleetComponentInstallation_one_current_component" ON "FleetComponentInstallation"("componentId") WHERE "removedAt" IS NULL;
CREATE UNIQUE INDEX "FleetComponentInstallation_one_current_position" ON "FleetComponentInstallation"("unitId","position") WHERE "removedAt" IS NULL;
CREATE TABLE "FleetFine" (
 "id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "driverId" TEXT REFERENCES "FleetDriver"("id"), "ctbEntryId" TEXT NOT NULL REFERENCES "FleetCatalogEntry"("id"), "ctbSnapshot" JSONB NOT NULL,
 "aitNumber" TEXT NOT NULL UNIQUE, "city" TEXT NOT NULL, "occurredAt" DATE NOT NULL, "dueAt" DATE NOT NULL, "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0), "points" INTEGER NOT NULL CHECK ("points" >= 0), "status" TEXT NOT NULL DEFAULT 'PENDENTE',
 "reason" TEXT, "evidenceVersionId" TEXT REFERENCES "DocumentVersion"("id"), "createdById" TEXT NOT NULL REFERENCES "Usuario"("id")
);
CREATE INDEX "FleetFine_unitId_occurredAt_status_idx" ON "FleetFine"("unitId","occurredAt","status");
CREATE INDEX "FleetFine_driverId_occurredAt_status_idx" ON "FleetFine"("driverId","occurredAt","status");
CREATE TABLE "FleetFinePayment" ("id" TEXT PRIMARY KEY, "fineId" TEXT NOT NULL REFERENCES "FleetFine"("id"), "paidAt" DATE NOT NULL, "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0), "proofVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"("id"), "financialPaymentId" TEXT REFERENCES "Payment"("id"), "reversedAt" TIMESTAMP(3), "reason" TEXT NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), "expenseId" TEXT UNIQUE REFERENCES "FleetExpense"("id"));
CREATE TABLE "FleetClaim" ("id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "occurrenceId" TEXT NOT NULL UNIQUE REFERENCES "FleetOccurrence"("id"), "policyDocumentId" TEXT REFERENCES "FleetDocument"("id"), "policySnapshot" JSONB NOT NULL, "responsibility" TEXT NOT NULL, "workshopProviderId" TEXT REFERENCES "FleetProvider"("id"), "parties" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'ABERTO', "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "FleetAttachment" ("id" TEXT PRIMARY KEY, "unitId" TEXT NOT NULL REFERENCES "FleetUnit"("id"), "ownerType" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id"), "versionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id"), "pathname" TEXT NOT NULL UNIQUE, "filename" TEXT NOT NULL, "size" INTEGER NOT NULL, "mimeType" TEXT NOT NULL, "ownerActorId" TEXT NOT NULL REFERENCES "Usuario"("id"), "withdrawnAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "DocumentClass" ("id","code","label","signaturePolicy","isActive","createdAt","updatedAt") VALUES ('fleet-evidence-class','FLEET_EVIDENCE','Anexo de Frota','INTERNAL_ALLOWED',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;
CREATE INDEX "FleetAttachment_unitId_ownerType_createdAt_idx" ON "FleetAttachment"("unitId","ownerType","createdAt");
CREATE TABLE "FleetControlEvent" ("id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "actorId" TEXT NOT NULL REFERENCES "Usuario"("id"), "payloadHash" TEXT NOT NULL, "operation" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "unitId" TEXT REFERENCES "FleetUnit"("id"), "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "FleetControlEvent_unitId_createdAt_idx" ON "FleetControlEvent"("unitId","createdAt");
CREATE TABLE "FleetSequence" ("id" TEXT PRIMARY KEY, "year" INTEGER NOT NULL, "kind" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 1, UNIQUE ("year","kind"));
CREATE TABLE "FleetExternalThrottle" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "windowEndsAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "FleetExternalEvent" ("requestId" TEXT PRIMARY KEY, "providerId" TEXT NOT NULL REFERENCES "FleetProvider"("id"), "authorizationId" TEXT NOT NULL REFERENCES "FleetAuthorization"("id"), "payloadHash" TEXT NOT NULL, "kind" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE FUNCTION "fleet_control_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Histórico de Frota é imutável'; END $$;
CREATE TRIGGER "FleetControlEvent_immutable" BEFORE UPDATE OR DELETE ON "FleetControlEvent" FOR EACH ROW EXECUTE FUNCTION "fleet_control_immutable"();
CREATE TRIGGER "FleetGateEvent_immutable" BEFORE UPDATE OR DELETE ON "FleetGateEvent" FOR EACH ROW EXECUTE FUNCTION "fleet_control_immutable"();
CREATE TRIGGER "FleetExternalEvent_immutable" BEFORE UPDATE OR DELETE ON "FleetExternalEvent" FOR EACH ROW EXECUTE FUNCTION "fleet_control_immutable"();
CREATE TRIGGER "FleetCatalogEntry_immutable" BEFORE UPDATE OR DELETE ON "FleetCatalogEntry" FOR EACH ROW EXECUTE FUNCTION "fleet_control_immutable"();
