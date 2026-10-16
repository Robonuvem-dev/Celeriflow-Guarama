CREATE TABLE "SstAso" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "candidateReference" TEXT,
  "programGroupId" TEXT NOT NULL REFERENCES "SstProgramExposureGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "examinerPersonId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "examinerCouncil" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ADMISSIONAL','PERIODICO','RETORNO_TRABALHO','MUDANCA_RISCOS','DEMISSIONAL','LICENCA_SEM_VENCIMENTOS','MONITORACAO')),
  "result" TEXT NOT NULL CHECK ("result" IN ('APTO','INAPTO','APTO_RESTRICOES','APTO_RECOMENDACOES','INAPTO_TEMPORARIO')),
  "performedAt" DATE NOT NULL,
  "validUntil" DATE NOT NULL CHECK ("validUntil" >= "performedAt"),
  "recommendations" TEXT NOT NULL,
  "expectedExamCount" INTEGER NOT NULL CHECK ("expectedExamCount" BETWEEN 1 AND 100),
  "snapshot" JSONB NOT NULL,
  "submissionKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SstAso_subject_check" CHECK ("employeeId" IS NOT NULL OR ("kind" = 'ADMISSIONAL' AND length(trim("candidateReference")) > 0 AND "candidateReference" IS NOT NULL))
);
CREATE UNIQUE INDEX "SstAso_budgetUnitId_submissionKey_key" ON "SstAso"("budgetUnitId", "submissionKey");
CREATE INDEX "SstAso_budgetUnitId_validUntil_id_idx" ON "SstAso"("budgetUnitId", "validUntil", "id");
CREATE INDEX "SstAso_personId_performedAt_idx" ON "SstAso"("personId", "performedAt");
CREATE TABLE "SstOccupationalExam" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asoId" TEXT NOT NULL REFERENCES "SstAso"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('CLINICO','COMPLEMENTAR','TOXICOLOGICO')),
  "source" TEXT NOT NULL CHECK ("source" IN ('REALIZADO','APRESENTADO')),
  "performedAt" DATE NOT NULL,
  "validUntil" DATE NOT NULL CHECK ("validUntil" >= "performedAt"),
  "result" TEXT NOT NULL,
  "professionalPersonId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalCouncil" TEXT NOT NULL,
  "laboratoryCompanyId" TEXT REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reportNumber" TEXT,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "SstOccupationalExam_toxicology_check" CHECK ("kind" <> 'TOXICOLOGICO' OR ("laboratoryCompanyId" IS NOT NULL AND "reportNumber" IS NOT NULL AND length(trim("reportNumber")) > 0))
);
CREATE INDEX "SstOccupationalExam_asoId_idx" ON "SstOccupationalExam"("asoId");
CREATE FUNCTION "sst_aso_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SST issued ASO and exam records are immutable; corrections require a dedicated rectification flow';
END;
$$;
CREATE TRIGGER "SstAso_immutable" BEFORE UPDATE OR DELETE ON "SstAso" FOR EACH ROW EXECUTE FUNCTION "sst_aso_immutable"();
CREATE TRIGGER "SstOccupationalExam_immutable" BEFORE UPDATE OR DELETE ON "SstOccupationalExam" FOR EACH ROW EXECUTE FUNCTION "sst_aso_immutable"();
CREATE FUNCTION "sst_aso_exam_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent "SstAso"%ROWTYPE;
  parent_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'SstAso' THEN parent_id := NEW."id"; ELSE parent_id := NEW."asoId"; END IF;
  SELECT * INTO parent FROM "SstAso" WHERE "id" = parent_id FOR UPDATE;
  IF (SELECT count(*) FROM "SstOccupationalExam" WHERE "asoId" = parent_id) <> parent."expectedExamCount"
    OR NOT EXISTS (SELECT 1 FROM "SstOccupationalExam" WHERE "asoId" = parent_id AND "kind" = 'CLINICO'
      AND "professionalPersonId" = parent."examinerPersonId" AND "professionalCouncil" = parent."examinerCouncil" AND "performedAt" = parent."performedAt")
    OR EXISTS (SELECT 1 FROM "SstOccupationalExam" WHERE "asoId" = parent_id AND ("performedAt" > parent."performedAt" OR "validUntil" < parent."performedAt")) THEN
    RAISE EXCEPTION 'SST ASO requires its complete, valid and immutable exam set';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "SstAso_exam_integrity" AFTER INSERT ON "SstAso" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sst_aso_exam_integrity"();
CREATE CONSTRAINT TRIGGER "SstOccupationalExam_integrity" AFTER INSERT ON "SstOccupationalExam" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "sst_aso_exam_integrity"();
