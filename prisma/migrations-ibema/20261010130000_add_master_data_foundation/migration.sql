BEGIN;

CREATE TABLE "Family" (
  "id" TEXT NOT NULL,
  "code" TEXT,
  "responsiblePersonId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ATIVA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyMember" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "kinship" TEXT,
  "isRepresentative" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernmentEntity" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "cnpj" TEXT,
  "companyId" TEXT,
  "parentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ATIVA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernmentEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalText" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "governmentLevel" TEXT NOT NULL,
  "issuingBody" TEXT NOT NULL,
  "publicationDate" TIMESTAMP(3),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'VIGENTE',
  "governmentEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalText_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalTextVersion" (
  "id" TEXT NOT NULL,
  "legalTextId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "summary" TEXT,
  "publicationDate" TIMESTAMP(3),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'VIGENTE',
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalTextVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalTextRelation" (
  "id" TEXT NOT NULL,
  "sourceLegalTextId" TEXT NOT NULL,
  "targetLegalTextId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalTextRelation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalReportSigner" (
  "id" TEXT NOT NULL,
  "personId" TEXT,
  "employeeId" TEXT,
  "governmentEntityId" TEXT,
  "signingRole" TEXT NOT NULL,
  "reportTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "signatureOrder" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalReportSigner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bank" (
  "id" TEXT NOT NULL,
  "compe" TEXT NOT NULL,
  "ispb" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Currency" (
  "id" TEXT NOT NULL,
  "isoCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
  "status" TEXT NOT NULL DEFAULT 'ATIVA',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "State" (
  "id" TEXT NOT NULL,
  "uf" TEXT NOT NULL,
  "ibgeCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "City" (
  "id" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "ibgeCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ATIVA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankBranch" (
  "id" TEXT NOT NULL,
  "bankId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cnpj" TEXT,
  "cityId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ATIVA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterDataConsistencyRun" (
  "id" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EM_EXECUCAO',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MasterDataConsistencyRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterDataConsistencyIssue" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "issueType" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ABERTA',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MasterDataConsistencyIssue_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SocialFamily" ADD COLUMN "masterFamilyId" TEXT;
ALTER TABLE "HealthFamily" ADD COLUMN "masterFamilyId" TEXT;
ALTER TABLE "CamLei" ADD COLUMN "legalTextId" TEXT;
ALTER TABLE "CostCenter"
  ADD COLUMN "governmentEntityId" TEXT,
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "secretariatId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "administrativeUnitId" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "bankId" TEXT, ADD COLUMN "bankBranchId" TEXT;
ALTER TABLE "Tax"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "governmentLevel" TEXT,
  ADD COLUMN "revenueNature" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveUntil" TIMESTAMP(3),
  ADD COLUMN "description" TEXT;
ALTER TABLE "CatalogItem"
  ADD COLUMN "productKind" TEXT NOT NULL DEFAULT 'MATERIAL',
  ADD COLUMN "specification" TEXT,
  ADD COLUMN "externalCode" TEXT;
ALTER TABLE "Neighborhood" ADD COLUMN "cityId" TEXT, ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Ativo';
ALTER TABLE "Street" ADD COLUMN "cityId" TEXT;
ALTER TABLE "Address" ADD COLUMN "streetId" TEXT;
ALTER TABLE "RealEstate" ADD COLUMN "streetId" TEXT;
ALTER TABLE "Warehouse"
  ADD COLUMN "cityId" TEXT,
  ADD COLUMN "neighborhoodId" TEXT,
  ADD COLUMN "streetId" TEXT;
ALTER TABLE "HealthProfessional" ADD COLUMN "cboId" TEXT;

CREATE UNIQUE INDEX "Family_code_key" ON "Family"("code");
CREATE INDEX "Family_responsiblePersonId_status_idx" ON "Family"("responsiblePersonId", "status");
CREATE UNIQUE INDEX "FamilyMember_familyId_personId_key" ON "FamilyMember"("familyId", "personId");
CREATE INDEX "FamilyMember_personId_status_idx" ON "FamilyMember"("personId", "status");
CREATE UNIQUE INDEX "GovernmentEntity_code_key" ON "GovernmentEntity"("code");
CREATE UNIQUE INDEX "GovernmentEntity_cnpj_key" ON "GovernmentEntity"("cnpj");
CREATE UNIQUE INDEX "GovernmentEntity_companyId_key" ON "GovernmentEntity"("companyId");
CREATE INDEX "GovernmentEntity_parentId_status_idx" ON "GovernmentEntity"("parentId", "status");
CREATE INDEX "GovernmentEntity_type_status_idx" ON "GovernmentEntity"("type", "status");
CREATE UNIQUE INDEX "LegalText_type_number_governmentLevel_issuingBody_key" ON "LegalText"("type", "number", "governmentLevel", "issuingBody");
CREATE INDEX "LegalText_status_effectiveFrom_effectiveUntil_idx" ON "LegalText"("status", "effectiveFrom", "effectiveUntil");
CREATE INDEX "LegalText_governmentEntityId_idx" ON "LegalText"("governmentEntityId");
CREATE UNIQUE INDEX "LegalTextVersion_documentId_key" ON "LegalTextVersion"("documentId");
CREATE UNIQUE INDEX "LegalTextVersion_legalTextId_versionNumber_key" ON "LegalTextVersion"("legalTextId", "versionNumber");
CREATE INDEX "LegalTextVersion_legalTextId_status_idx" ON "LegalTextVersion"("legalTextId", "status");
CREATE UNIQUE INDEX "LegalTextRelation_sourceLegalTextId_targetLegalTextId_relationType_key" ON "LegalTextRelation"("sourceLegalTextId", "targetLegalTextId", "relationType");
CREATE INDEX "LegalTextRelation_targetLegalTextId_relationType_idx" ON "LegalTextRelation"("targetLegalTextId", "relationType");
CREATE INDEX "LegalReportSigner_governmentEntityId_status_effectiveFrom_effectiveUntil_idx" ON "LegalReportSigner"("governmentEntityId", "status", "effectiveFrom", "effectiveUntil");
CREATE INDEX "LegalReportSigner_personId_idx" ON "LegalReportSigner"("personId");
CREATE INDEX "LegalReportSigner_employeeId_idx" ON "LegalReportSigner"("employeeId");
CREATE UNIQUE INDEX "Bank_compe_key" ON "Bank"("compe");
CREATE UNIQUE INDEX "Bank_ispb_key" ON "Bank"("ispb");
CREATE UNIQUE INDEX "Currency_isoCode_key" ON "Currency"("isoCode");
CREATE UNIQUE INDEX "Currency_single_default_key" ON "Currency"(("isDefault")) WHERE "isDefault" = true;
CREATE UNIQUE INDEX "State_uf_key" ON "State"("uf");
CREATE UNIQUE INDEX "State_ibgeCode_key" ON "State"("ibgeCode");
CREATE UNIQUE INDEX "City_ibgeCode_key" ON "City"("ibgeCode");
CREATE UNIQUE INDEX "City_stateId_name_key" ON "City"("stateId", "name");
CREATE INDEX "City_stateId_status_idx" ON "City"("stateId", "status");
CREATE UNIQUE INDEX "BankBranch_bankId_code_key" ON "BankBranch"("bankId", "code");
CREATE INDEX "BankBranch_cityId_status_idx" ON "BankBranch"("cityId", "status");
CREATE INDEX "MasterDataConsistencyRun_area_runType_startedAt_idx" ON "MasterDataConsistencyRun"("area", "runType", "startedAt");
CREATE INDEX "MasterDataConsistencyRun_status_startedAt_idx" ON "MasterDataConsistencyRun"("status", "startedAt");
CREATE INDEX "MasterDataConsistencyIssue_runId_status_severity_idx" ON "MasterDataConsistencyIssue"("runId", "status", "severity");
CREATE INDEX "MasterDataConsistencyIssue_area_recordType_recordId_idx" ON "MasterDataConsistencyIssue"("area", "recordType", "recordId");
CREATE UNIQUE INDEX "SocialFamily_masterFamilyId_key" ON "SocialFamily"("masterFamilyId");
CREATE UNIQUE INDEX "HealthFamily_masterFamilyId_key" ON "HealthFamily"("masterFamilyId");
CREATE UNIQUE INDEX "CamLei_legalTextId_key" ON "CamLei"("legalTextId");
CREATE INDEX "CostCenter_governmentEntityId_idx" ON "CostCenter"("governmentEntityId");
CREATE INDEX "CostCenter_parentId_idx" ON "CostCenter"("parentId");
CREATE INDEX "CostCenter_secretariatId_idx" ON "CostCenter"("secretariatId");
CREATE INDEX "CostCenter_departmentId_idx" ON "CostCenter"("departmentId");
CREATE INDEX "CostCenter_administrativeUnitId_idx" ON "CostCenter"("administrativeUnitId");
CREATE INDEX "BankAccount_bankId_idx" ON "BankAccount"("bankId");
CREATE INDEX "BankAccount_bankBranchId_idx" ON "BankAccount"("bankBranchId");
CREATE UNIQUE INDEX "Tax_code_key" ON "Tax"("code");
CREATE INDEX "Neighborhood_cityId_name_idx" ON "Neighborhood"("cityId", "name");
CREATE INDEX "Street_cityId_name_idx" ON "Street"("cityId", "name");
CREATE INDEX "Warehouse_cityId_idx" ON "Warehouse"("cityId");
CREATE INDEX "Warehouse_neighborhoodId_idx" ON "Warehouse"("neighborhoodId");
CREATE INDEX "Warehouse_streetId_idx" ON "Warehouse"("streetId");
CREATE INDEX "HealthProfessional_cboId_idx" ON "HealthProfessional"("cboId");
CREATE INDEX "Material_catalogItemId_idx" ON "Material"("catalogItemId");

ALTER TABLE "Family" ADD CONSTRAINT "Family_responsiblePersonId_fkey" FOREIGN KEY ("responsiblePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernmentEntity" ADD CONSTRAINT "GovernmentEntity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernmentEntity" ADD CONSTRAINT "GovernmentEntity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalText" ADD CONSTRAINT "LegalText_governmentEntityId_fkey" FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalTextVersion" ADD CONSTRAINT "LegalTextVersion_legalTextId_fkey" FOREIGN KEY ("legalTextId") REFERENCES "LegalText"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalTextVersion" ADD CONSTRAINT "LegalTextVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalTextRelation" ADD CONSTRAINT "LegalTextRelation_sourceLegalTextId_fkey" FOREIGN KEY ("sourceLegalTextId") REFERENCES "LegalText"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalTextRelation" ADD CONSTRAINT "LegalTextRelation_targetLegalTextId_fkey" FOREIGN KEY ("targetLegalTextId") REFERENCES "LegalText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_governmentEntityId_fkey" FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankBranch" ADD CONSTRAINT "BankBranch_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankBranch" ADD CONSTRAINT "BankBranch_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MasterDataConsistencyIssue" ADD CONSTRAINT "MasterDataConsistencyIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MasterDataConsistencyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialFamily" ADD CONSTRAINT "SocialFamily_masterFamilyId_fkey" FOREIGN KEY ("masterFamilyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthFamily" ADD CONSTRAINT "HealthFamily_masterFamilyId_fkey" FOREIGN KEY ("masterFamilyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CamLei" ADD CONSTRAINT "CamLei_legalTextId_fkey" FOREIGN KEY ("legalTextId") REFERENCES "LegalText"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_governmentEntityId_fkey" FOREIGN KEY ("governmentEntityId") REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_secretariatId_fkey" FOREIGN KEY ("secretariatId") REFERENCES "Secretariat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_administrativeUnitId_fkey" FOREIGN KEY ("administrativeUnitId") REFERENCES "AdministrativeUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankBranchId_fkey" FOREIGN KEY ("bankBranchId") REFERENCES "BankBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Neighborhood" ADD CONSTRAINT "Neighborhood_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Street" ADD CONSTRAINT "Street_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_streetId_fkey" FOREIGN KEY ("streetId") REFERENCES "Street"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RealEstate" ADD CONSTRAINT "RealEstate_streetId_fkey" FOREIGN KEY ("streetId") REFERENCES "Street"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_streetId_fkey" FOREIGN KEY ("streetId") REFERENCES "Street"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthProfessional" ADD CONSTRAINT "HealthProfessional_cboId_fkey" FOREIGN KEY ("cboId") REFERENCES "HealthCbo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_identity_check"
CHECK (("personId" IS NOT NULL AND "employeeId" IS NULL) OR ("personId" IS NULL AND "employeeId" IS NOT NULL));

ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_period_check"
CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom");

ALTER TABLE "LegalReportSigner" ADD CONSTRAINT "LegalReportSigner_signature_order_check"
CHECK ("signatureOrder" > 0);

ALTER TABLE "Currency" ADD CONSTRAINT "Currency_decimal_places_check"
CHECK ("decimalPlaces" BETWEEN 0 AND 6);

INSERT INTO "State" ("id", "uf", "ibgeCode", "name", "status", "createdAt", "updatedAt")
VALUES ('state_pr_41', 'PR', '41', 'Paraná', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("ibgeCode") DO UPDATE SET "uf" = EXCLUDED."uf", "name" = EXCLUDED."name", "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "City" ("id", "stateId", "ibgeCode", "name", "status", "createdAt", "updatedAt")
SELECT 'city_ibema_4109757', "id", '4109757', 'Ibema', 'ATIVA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "State" WHERE "ibgeCode" = '41'
ON CONFLICT ("ibgeCode") DO UPDATE SET "stateId" = EXCLUDED."stateId", "name" = EXCLUDED."name", "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "GovernmentEntity" ("id", "code", "name", "type", "status", "createdAt", "updatedAt") VALUES
  ('entity_executivo_ibema', 'EXECUTIVO_IBEMA', 'Prefeitura Municipal de Ibema', 'PREFEITURA', 'ATIVA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('entity_camara_ibema', 'CAMARA_IBEMA', 'Câmara Municipal de Ibema', 'CAMARA', 'ATIVA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "type" = EXCLUDED."type", "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Currency" ("id", "isoCode", "name", "symbol", "decimalPlaces", "status", "isDefault", "createdAt", "updatedAt")
VALUES ('currency_brl', 'BRL', 'Real brasileiro', 'R$', 2, 'ATIVA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("isoCode") DO UPDATE SET "name" = EXCLUDED."name", "symbol" = EXCLUDED."symbol", "decimalPlaces" = EXCLUDED."decimalPlaces", "status" = EXCLUDED."status", "isDefault" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Bank" ("id", "compe", "ispb", "name", "shortName", "status", "createdAt", "updatedAt") VALUES
  ('bank_001', '001', '00000000', 'Banco do Brasil S.A.', 'Banco do Brasil', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bank_104', '104', '00360305', 'Caixa Econômica Federal', 'Caixa', 'ATIVO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("compe") DO UPDATE SET "ispb" = EXCLUDED."ispb", "name" = EXCLUDED."name", "shortName" = EXCLUDED."shortName", "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "HealthCbo" ("id", "code", "description", "isActive", "createdAt", "updatedAt") VALUES
  ('cbo_411010', '411010', 'Assistente administrativo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cbo_252305', '252305', 'Secretário executivo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Tax" SET "code" = 'IPTU', "governmentLevel" = COALESCE("governmentLevel", 'MUNICIPAL'), "revenueNature" = COALESCE("revenueNature", 'IMPOSTO_SOBRE_PATRIMONIO'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (SELECT "id" FROM "Tax" WHERE "code" IS NULL AND regexp_replace(upper("name"), '[^A-Z0-9]', '', 'g') = 'IPTU' ORDER BY "createdAt", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "Tax" WHERE "code" = 'IPTU');
UPDATE "Tax" SET "code" = 'ISSQN', "governmentLevel" = COALESCE("governmentLevel", 'MUNICIPAL'), "revenueNature" = COALESCE("revenueNature", 'IMPOSTO_SOBRE_SERVICOS'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (SELECT "id" FROM "Tax" WHERE "code" IS NULL AND regexp_replace(upper("name"), '[^A-Z0-9]', '', 'g') IN ('ISS', 'ISSQN') ORDER BY "createdAt", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "Tax" WHERE "code" = 'ISSQN');
UPDATE "Tax" SET "code" = 'ITBI', "governmentLevel" = COALESCE("governmentLevel", 'MUNICIPAL'), "revenueNature" = COALESCE("revenueNature", 'IMPOSTO_SOBRE_TRANSMISSAO'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (SELECT "id" FROM "Tax" WHERE "code" IS NULL AND regexp_replace(upper("name"), '[^A-Z0-9]', '', 'g') = 'ITBI' ORDER BY "createdAt", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "Tax" WHERE "code" = 'ITBI');

INSERT INTO "Tax" ("id", "name", "taxType", "isActive", "code", "governmentLevel", "revenueNature", "createdAt", "updatedAt") VALUES
  ('tax_iptu', 'IPTU', 'Imposto', true, 'IPTU', 'MUNICIPAL', 'IMPOSTO_SOBRE_PATRIMONIO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tax_issqn', 'ISSQN', 'Imposto', true, 'ISSQN', 'MUNICIPAL', 'IMPOSTO_SOBRE_SERVICOS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tax_itbi', 'ITBI', 'Imposto', true, 'ITBI', 'MUNICIPAL', 'IMPOSTO_SOBRE_TRANSMISSAO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "Tax" SET
  "taxType" = 'Imposto',
  "governmentLevel" = COALESCE("governmentLevel", 'MUNICIPAL'),
  "revenueNature" = CASE "code"
    WHEN 'IPTU' THEN COALESCE("revenueNature", 'IMPOSTO_SOBRE_PATRIMONIO')
    WHEN 'ISSQN' THEN COALESCE("revenueNature", 'IMPOSTO_SOBRE_SERVICOS')
    WHEN 'ITBI' THEN COALESCE("revenueNature", 'IMPOSTO_SOBRE_TRANSMISSAO')
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('IPTU', 'ISSQN', 'ITBI');

UPDATE "Neighborhood" SET "cityId" = (SELECT "id" FROM "City" WHERE "ibgeCode" = '4109757')
WHERE "cityId" IS NULL
  AND upper(btrim("city")) = 'IBEMA'
  AND translate(upper(btrim("state")), 'ÁÀÂÃÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC') IN ('PR', 'PARANA');
UPDATE "Street" SET "cityId" = (SELECT "id" FROM "City" WHERE "ibgeCode" = '4109757')
WHERE "cityId" IS NULL
  AND upper(btrim("city")) = 'IBEMA'
  AND translate(upper(btrim("state")), 'ÁÀÂÃÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC') IN ('PR', 'PARANA');

UPDATE "HealthProfessional" hp SET "cboId" = cbo."id"
FROM "HealthCbo" cbo
WHERE hp."cboId" IS NULL AND hp."cbo" IS NOT NULL
  AND regexp_replace(hp."cbo", '[^0-9]', '', 'g') = regexp_replace(cbo."code", '[^0-9]', '', 'g');

INSERT INTO "Family" ("id", "code", "responsiblePersonId", "status", "createdAt", "updatedAt")
SELECT 'fam_' || substr(md5('social:' || sf."id"), 1, 21), sf."familyCode", sf."representativeId",
  CASE WHEN upper(sf."status") = 'ATIVO' THEN 'ATIVA' ELSE 'INATIVA' END, sf."createdAt", CURRENT_TIMESTAMP
FROM "SocialFamily" sf;

UPDATE "SocialFamily" sf SET "masterFamilyId" = 'fam_' || substr(md5('social:' || sf."id"), 1, 21)
WHERE sf."masterFamilyId" IS NULL;

INSERT INTO "FamilyMember" ("id", "familyId", "personId", "kinship", "isRepresentative", "status", "createdAt", "updatedAt")
SELECT 'fmr_' || substr(md5('representative:' || sf."id"), 1, 21), sf."masterFamilyId", sf."representativeId", 'RESPONSAVEL', true, 'ATIVO', sf."createdAt", CURRENT_TIMESTAMP
FROM "SocialFamily" sf
ON CONFLICT ("familyId", "personId") DO UPDATE SET "isRepresentative" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "FamilyMember" ("id", "familyId", "personId", "kinship", "isRepresentative", "status", "createdAt", "updatedAt")
SELECT 'fmm_' || substr(md5('social-member:' || sm."id"), 1, 21), sf."masterFamilyId", sm."personId", sm."kinship", sm."personId" = sf."representativeId", 'ATIVO', sm."createdAt", CURRENT_TIMESTAMP
FROM "SocialFamilyMember" sm
JOIN "SocialFamily" sf ON sf."id" = sm."familyId"
ON CONFLICT ("familyId", "personId") DO UPDATE SET
  "kinship" = COALESCE("FamilyMember"."kinship", EXCLUDED."kinship"),
  "isRepresentative" = "FamilyMember"."isRepresentative" OR EXCLUDED."isRepresentative",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH unique_family AS (
  SELECT "responsiblePersonId", min("id") AS "familyId"
  FROM "Family"
  WHERE "responsiblePersonId" IS NOT NULL
  GROUP BY "responsiblePersonId"
  HAVING count(*) = 1
), unique_health_profile AS (
  SELECT "responsiblePersonId", min("id") AS "healthFamilyId"
  FROM "HealthFamily"
  WHERE "responsiblePersonId" IS NOT NULL AND "masterFamilyId" IS NULL
  GROUP BY "responsiblePersonId"
  HAVING count(*) = 1
)
UPDATE "HealthFamily" hf SET "masterFamilyId" = uf."familyId", "updatedAt" = CURRENT_TIMESTAMP
FROM unique_health_profile uh
JOIN unique_family uf ON uf."responsiblePersonId" = uh."responsiblePersonId"
WHERE hf."id" = uh."healthFamilyId";

COMMIT;
