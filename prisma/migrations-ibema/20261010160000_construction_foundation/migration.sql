CREATE TABLE "ConstructionCatalogEntry" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('PERMIT_TYPE','PURPOSE','CONSTRUCTION_TYPE','SUBDIVISION_TYPE','INSPECTION_TYPE')),
 "name" TEXT NOT NULL, "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ConstructionCatalogEntry_kind_name_key" ON "ConstructionCatalogEntry"("kind","name");
CREATE UNIQUE INDEX "ConstructionCatalogEntry_kind_normalized_name_key" ON "ConstructionCatalogEntry"("kind",lower(btrim("name")));
CREATE INDEX "ConstructionCatalogEntry_kind_isActive_name_idx" ON "ConstructionCatalogEntry"("kind","isActive","name");
CREATE TABLE "ConstructionConfigVersion" (
 "id" TEXT PRIMARY KEY, "version" INTEGER NOT NULL CHECK ("version" > 0), "freeRevisions" INTEGER NOT NULL CHECK ("freeRevisions" >= 0),
 "correctionDays" INTEGER NOT NULL CHECK ("correctionDays" > 0), "checkPropertyDebts" BOOLEAN NOT NULL, "subjectIds" TEXT[] NOT NULL,
 "areaWeights" JSONB NOT NULL, "instructions" TEXT NOT NULL, "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionConfigVersion_version_key" ON "ConstructionConfigVersion"("version");
CREATE FUNCTION "construction_config_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Published construction configurations are immutable';
END;
$$;
CREATE TRIGGER "ConstructionConfigVersion_immutable" BEFORE UPDATE OR DELETE ON "ConstructionConfigVersion" FOR EACH ROW EXECUTE FUNCTION "construction_config_immutable"();
CREATE TABLE "ConstructionStaffRole" (
 "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" TEXT NOT NULL CHECK ("role" IN ('ANALYST','INSPECTOR','MANAGER')), "startsAt" DATE NOT NULL, "endsAt" DATE,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE UNIQUE INDEX "ConstructionStaffRole_employeeId_departmentId_role_startsAt_key" ON "ConstructionStaffRole"("employeeId","departmentId","role","startsAt");
CREATE INDEX "ConstructionStaffRole_employeeId_isActive_startsAt_endsAt_idx" ON "ConstructionStaffRole"("employeeId","isActive","startsAt","endsAt");
CREATE TABLE "ConstructionCase" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL, "processId" TEXT NOT NULL REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "configurationId" TEXT NOT NULL REFERENCES "ConstructionConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "category" TEXT NOT NULL CHECK ("category" IN ('BUILDING','SUBDIVISION')), "locationType" TEXT NOT NULL CHECK ("locationType" IN ('URBAN','RURAL')),
 "regularization" BOOLEAN NOT NULL DEFAULT false, "catalogSnapshot" JSONB NOT NULL,
 "existingArea" DECIMAL(14,4) NOT NULL CHECK ("existingArea" >= 0), "expandedArea" DECIMAL(14,4) NOT NULL CHECK ("expandedArea" >= 0),
 "irregularArea" DECIMAL(14,4) NOT NULL CHECK ("irregularArea" >= 0), "renovationArea" DECIMAL(14,4) NOT NULL CHECK ("renovationArea" >= 0),
 "demolitionArea" DECIMAL(14,4) NOT NULL CHECK ("demolitionArea" >= 0), "totalArea" DECIMAL(14,4) NOT NULL CHECK ("totalArea" >= 0),
 "calculationSnapshot" JSONB NOT NULL, "assignedEmployeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ConstructionCase_processId_key" ON "ConstructionCase"("processId");
CREATE UNIQUE INDEX "ConstructionCase_requestKey_key" ON "ConstructionCase"("requestKey");
CREATE TABLE "ConstructionCaseProperty" (
 "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "realEstateId" TEXT NOT NULL REFERENCES "RealEstate"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "cadastralSnapshot" JSONB NOT NULL
);
CREATE UNIQUE INDEX "ConstructionCaseProperty_caseId_realEstateId_key" ON "ConstructionCaseProperty"("caseId","realEstateId");
INSERT INTO "ConstructionCatalogEntry" ("id","kind","name","updatedAt") VALUES
 ('construction-type-01','CONSTRUCTION_TYPE','Concreto superior',CURRENT_TIMESTAMP),
 ('construction-type-02','CONSTRUCTION_TYPE','Concreto médio',CURRENT_TIMESTAMP),
 ('construction-type-03','CONSTRUCTION_TYPE','Alvenaria superior',CURRENT_TIMESTAMP),
 ('construction-type-04','CONSTRUCTION_TYPE','Alvenaria média',CURRENT_TIMESTAMP),
 ('construction-type-05','CONSTRUCTION_TYPE','Alvenaria simples',CURRENT_TIMESTAMP),
 ('construction-type-06','CONSTRUCTION_TYPE','Madeira dupla',CURRENT_TIMESTAMP),
 ('construction-type-07','CONSTRUCTION_TYPE','Madeira simples',CURRENT_TIMESTAMP),
 ('construction-type-08','CONSTRUCTION_TYPE','Madeira bruta',CURRENT_TIMESTAMP),
 ('construction-type-09','CONSTRUCTION_TYPE','Mista simples',CURRENT_TIMESTAMP),
 ('construction-type-10','CONSTRUCTION_TYPE','Mista média',CURRENT_TIMESTAMP),
 ('construction-type-11','CONSTRUCTION_TYPE','Precária',CURRENT_TIMESTAMP),
 ('construction-type-12','CONSTRUCTION_TYPE','Área aberta',CURRENT_TIMESTAMP),
 ('construction-type-13','CONSTRUCTION_TYPE','Box',CURRENT_TIMESTAMP),
 ('construction-type-14','CONSTRUCTION_TYPE','Garagem',CURRENT_TIMESTAMP),
 ('construction-permit-01','PERMIT_TYPE','Construção',CURRENT_TIMESTAMP),
 ('construction-permit-02','PERMIT_TYPE','Ampliação',CURRENT_TIMESTAMP),
 ('construction-permit-03','PERMIT_TYPE','Demolição',CURRENT_TIMESTAMP),
 ('construction-permit-04','PERMIT_TYPE','Reforma',CURRENT_TIMESTAMP),
 ('construction-purpose-01','PURPOSE','Residencial',CURRENT_TIMESTAMP),
 ('construction-purpose-02','PURPOSE','Comercial',CURRENT_TIMESTAMP),
 ('construction-purpose-03','PURPOSE','Industrial',CURRENT_TIMESTAMP),
 ('construction-purpose-04','PURPOSE','Prestação de serviço',CURRENT_TIMESTAMP),
 ('construction-purpose-05','PURPOSE','Templo',CURRENT_TIMESTAMP),
 ('construction-purpose-06','PURPOSE','Mista',CURRENT_TIMESTAMP),
 ('construction-subdivision-01','SUBDIVISION_TYPE','Loteamento',CURRENT_TIMESTAMP),
 ('construction-subdivision-02','SUBDIVISION_TYPE','Desmembramento',CURRENT_TIMESTAMP);
