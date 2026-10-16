ALTER TABLE "SocialBenefit" ADD COLUMN "dispensingMode" TEXT NOT NULL DEFAULT 'QUANTITY', ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "quotaControlled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "maxPerRequest" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "authorizerEmployeeId" TEXT;
ALTER TABLE "SocialBenefit" ADD CONSTRAINT "SocialBenefit_configuration_check" CHECK ("dispensingMode" IN ('QUANTITY','VALUE') AND "maxPerRequest" > 0);
CREATE TABLE "SocialBenefitStock" (
 "id" TEXT NOT NULL PRIMARY KEY, "benefitId" TEXT NOT NULL REFERENCES "SocialBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" INTEGER NOT NULL DEFAULT 0 CHECK ("quantity" >= 0), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SocialBenefitStock_benefitId_unitId_key" ON "SocialBenefitStock"("benefitId","unitId");
CREATE TABLE "SocialBenefitStockMovement" (
 "id" TEXT NOT NULL PRIMARY KEY, "benefitId" TEXT NOT NULL REFERENCES "SocialBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL, "direction" TEXT NOT NULL CHECK ("direction" IN ('IN','OUT')), "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
 "supplierName" TEXT, "invoiceNumber" TEXT, "invoiceDate" DATE, "invoiceValue" DECIMAL(14,2), "requestItemId" TEXT,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocialBenefitStockMovement_requestItemId_key" ON "SocialBenefitStockMovement"("requestItemId");
CREATE INDEX "SocialBenefitStockMovement_benefitId_unitId_createdAt_idx" ON "SocialBenefitStockMovement"("benefitId","unitId","createdAt");
CREATE TABLE "SocialBenefitQuota" (
 "id" TEXT NOT NULL PRIMARY KEY, "benefitId" TEXT NOT NULL REFERENCES "SocialBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL, "total" INTEGER NOT NULL CHECK ("total" > 0), "consumed" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SocialBenefitQuota_period_check" CHECK ("endsAt" >= "startsAt"),
 CONSTRAINT "SocialBenefitQuota_balance_check" CHECK ("consumed" >= 0 AND "consumed" <= "total")
);
CREATE INDEX "SocialBenefitQuota_benefitId_unitId_startsAt_endsAt_idx" ON "SocialBenefitQuota"("benefitId","unitId","startsAt","endsAt");
CREATE TABLE "SocialBenefitRequest" (
 "id" TEXT NOT NULL PRIMARY KEY, "familyId" TEXT NOT NULL REFERENCES "SocialFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "personId" TEXT, "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "cancelledAt" TIMESTAMP(3), "cancellationReason" TEXT
);
CREATE INDEX "SocialBenefitRequest_unitId_createdAt_idx" ON "SocialBenefitRequest"("unitId","createdAt");
CREATE TABLE "SocialBenefitRequestItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "SocialBenefitRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "benefitId" TEXT NOT NULL REFERENCES "SocialBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "value" DECIMAL(14,2), "status" TEXT NOT NULL DEFAULT 'PENDING',
 "approvalRequired" BOOLEAN NOT NULL, "dispensingMode" TEXT NOT NULL CHECK ("dispensingMode" IN ('QUANTITY','VALUE')), "quotaControlled" BOOLEAN NOT NULL, "authorizerEmployeeId" TEXT, "evaluatedBy" TEXT, "evaluatedAt" TIMESTAMP(3), "assessment" TEXT,
 "deliveredBy" TEXT, "deliveredAt" TIMESTAMP(3), "deliveryReason" TEXT,
 CONSTRAINT "SocialBenefitRequestItem_status_check" CHECK ("status" IN ('PENDING','APPROVED','DENIED','DELIVERED','CANCELLED')),
 CONSTRAINT "SocialBenefitRequestItem_value_check" CHECK ("value" IS NULL OR "value" > 0),
 CONSTRAINT "SocialBenefitRequestItem_delivery_check" CHECK ("status" <> 'DELIVERED' OR ("deliveredAt" IS NOT NULL AND (NOT "approvalRequired" OR "evaluatedAt" IS NOT NULL)))
);
CREATE INDEX "SocialBenefitRequestItem_status_authorizerEmployeeId_idx" ON "SocialBenefitRequestItem"("status","authorizerEmployeeId");
