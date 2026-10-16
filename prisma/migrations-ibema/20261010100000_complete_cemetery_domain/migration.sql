-- EXE-27 / 1.1661-1.1686: domínio operacional de cemitérios.
ALTER TABLE "TaxCemetery"
  ADD COLUMN IF NOT EXISTS "observations" TEXT;

ALTER TABLE "TaxFuneralHome"
  ADD COLUMN IF NOT EXISTS "ownershipType" TEXT NOT NULL DEFAULT 'PRIVADA';

ALTER TABLE "TaxGrave"
  ADD COLUMN IF NOT EXISTS "lotId" TEXT,
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ownerTaxpayerId" TEXT,
  ADD COLUMN IF NOT EXISTS "additionalData" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "TaxDeceased"
  ADD COLUMN IF NOT EXISTS "deceasedTaxpayerId" TEXT,
  ADD COLUMN IF NOT EXISTS "declarantTaxpayerId" TEXT,
  ADD COLUMN IF NOT EXISTS "unidentified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "deathDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estateApplied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TaxBurialMovement"
  ADD COLUMN IF NOT EXISTS "destinationType" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "toOssuaryId" TEXT;

CREATE TABLE IF NOT EXISTS "CemeteryChapel" (
  "id" TEXT NOT NULL,
  "cemeteryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "personTaxpayerId" TEXT,
  "responsibleTaxpayerId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryChapel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryOssuary" (
  "id" TEXT NOT NULL,
  "cemeteryId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "ownerTaxpayerId" TEXT,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "occupantCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryOssuary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryLot" (
  "id" TEXT NOT NULL,
  "cemeteryId" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "ownerTaxpayerId" TEXT NOT NULL,
  "graveLimit" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'LIVRE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "additionalData" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryIdentificationField" (
  "id" TEXT NOT NULL,
  "cemeteryId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "valueType" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryIdentificationField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryProcess" (
  "id" TEXT NOT NULL,
  "receiptCode" TEXT NOT NULL,
  "processType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "burialType" TEXT,
  "deceasedId" TEXT NOT NULL,
  "cemeteryId" TEXT,
  "graveId" TEXT,
  "chapelId" TEXT,
  "funeralHomeId" TEXT,
  "declarantTaxpayerId" TEXT NOT NULL,
  "declarantDebtSnapshot" JSONB NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "performedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryProcess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryAttachment" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdByUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CemeteryAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryChangeHistory" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CemeteryChangeHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CemeteryFeeRule" (
  "id" TEXT NOT NULL,
  "cemeteryId" TEXT,
  "eventType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "formula" TEXT NOT NULL,
  "baseAmount" DECIMAL(18,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CemeteryFeeRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryChapel_cemeteryId_name_key" ON "CemeteryChapel"("cemeteryId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryOssuary_cemeteryId_code_key" ON "CemeteryOssuary"("cemeteryId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryLot_cemeteryId_identifier_key" ON "CemeteryLot"("cemeteryId", "identifier");
CREATE INDEX IF NOT EXISTS "CemeteryLot_cemeteryId_active_status_idx" ON "CemeteryLot"("cemeteryId", "active", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryIdentificationField_cemeteryId_targetType_fieldKey_key" ON "CemeteryIdentificationField"("cemeteryId", "targetType", "fieldKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryProcess_receiptCode_key" ON "CemeteryProcess"("receiptCode");
CREATE INDEX IF NOT EXISTS "CemeteryProcess_processType_status_scheduledAt_idx" ON "CemeteryProcess"("processType", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "CemeteryProcess_deceasedId_createdAt_idx" ON "CemeteryProcess"("deceasedId", "createdAt");
CREATE INDEX IF NOT EXISTS "CemeteryProcess_cemeteryId_scheduledAt_idx" ON "CemeteryProcess"("cemeteryId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "CemeteryProcess_funeralHomeId_scheduledAt_idx" ON "CemeteryProcess"("funeralHomeId", "scheduledAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CemeteryAttachment_targetType_targetId_documentId_key" ON "CemeteryAttachment"("targetType", "targetId", "documentId");
CREATE INDEX IF NOT EXISTS "CemeteryAttachment_targetType_targetId_idx" ON "CemeteryAttachment"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "CemeteryChangeHistory_targetType_targetId_createdAt_idx" ON "CemeteryChangeHistory"("targetType", "targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "CemeteryFeeRule_eventType_active_validFrom_idx" ON "CemeteryFeeRule"("eventType", "active", "validFrom");
CREATE INDEX IF NOT EXISTS "TaxGrave_lotId_active_idx" ON "TaxGrave"("lotId", "active");

DO $$ BEGIN
  ALTER TABLE "CemeteryChapel" ADD CONSTRAINT "CemeteryChapel_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryOssuary" ADD CONSTRAINT "CemeteryOssuary_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryLot" ADD CONSTRAINT "CemeteryLot_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryIdentificationField" ADD CONSTRAINT "CemeteryIdentificationField_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TaxGrave" ADD CONSTRAINT "TaxGrave_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CemeteryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryProcess" ADD CONSTRAINT "CemeteryProcess_deceasedId_fkey" FOREIGN KEY ("deceasedId") REFERENCES "TaxDeceased"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryProcess" ADD CONSTRAINT "CemeteryProcess_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryProcess" ADD CONSTRAINT "CemeteryProcess_graveId_fkey" FOREIGN KEY ("graveId") REFERENCES "TaxGrave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryProcess" ADD CONSTRAINT "CemeteryProcess_chapelId_fkey" FOREIGN KEY ("chapelId") REFERENCES "CemeteryChapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryAttachment" ADD CONSTRAINT "CemeteryAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CemeteryFeeRule" ADD CONSTRAINT "CemeteryFeeRule_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "TaxCemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TaxBurialMovement" ADD CONSTRAINT "TaxBurialMovement_toOssuaryId_fkey" FOREIGN KEY ("toOssuaryId") REFERENCES "CemeteryOssuary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
