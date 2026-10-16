ALTER TABLE "SstQuestionnaireVersion" ADD COLUMN "discipline" TEXT NOT NULL DEFAULT 'MEDICINE'
  CHECK ("discipline" IN ('MEDICINE','NURSING','PSYCHOLOGY','SOCIAL_WORK'));
CREATE TABLE "SstProfessionalRole" (
  "id" TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "usuarioId" TEXT REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "discipline" TEXT NOT NULL CHECK ("discipline" IN ('MEDICINE','NURSING','PSYCHOLOGY','SOCIAL_WORK')),
  "council" TEXT NOT NULL, "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL CHECK ("endsAt" >= "startsAt"),
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstProfessionalRole_person_discipline_start_key" ON "SstProfessionalRole"("budgetUnitId","personId","discipline","startsAt");
CREATE INDEX "SstProfessionalRole_budgetUnitId_discipline_isActive_idx" ON "SstProfessionalRole"("budgetUnitId","discipline","isActive");
CREATE TABLE "SstDisciplineGrant" (
  "id" TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "usuarioId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "discipline" TEXT NOT NULL CHECK ("discipline" IN ('MEDICINE','NURSING','PSYCHOLOGY','SOCIAL_WORK')),
  "canRead" BOOLEAN NOT NULL DEFAULT false, "canWrite" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CHECK (NOT "canWrite" OR "canRead")
);
CREATE UNIQUE INDEX "SstDisciplineGrant_usuarioId_budgetUnitId_discipline_key" ON "SstDisciplineGrant"("usuarioId","budgetUnitId","discipline");
CREATE TABLE "SstClinicalRecord" (
  "id" TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalRoleId" TEXT NOT NULL REFERENCES "SstProfessionalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "discipline" TEXT NOT NULL CHECK ("discipline" IN ('MEDICINE','NURSING','PSYCHOLOGY','SOCIAL_WORK')),
  "attendedAt" TIMESTAMP(3) NOT NULL, "occupationalContext" TEXT NOT NULL,
  "narrative" TEXT NOT NULL, "opinion" TEXT NOT NULL, "diagnosis" TEXT NOT NULL,
  "cidCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "requests" JSONB NOT NULL,
  "questionnaireVersionId" TEXT REFERENCES "SstQuestionnaireVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "questionnaireSnapshot" JSONB NOT NULL, "answers" JSONB NOT NULL, "snapshot" JSONB NOT NULL,
  "submissionKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstClinicalRecord_budgetUnitId_submissionKey_key" ON "SstClinicalRecord"("budgetUnitId","submissionKey");
CREATE INDEX "SstClinicalRecord_budgetUnitId_discipline_attendedAt_id_idx" ON "SstClinicalRecord"("budgetUnitId","discipline","attendedAt","id");
CREATE INDEX "SstClinicalRecord_personId_attendedAt_idx" ON "SstClinicalRecord"("personId","attendedAt");
CREATE TABLE "SstVaccination" (
  "id" TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalRoleId" TEXT NOT NULL REFERENCES "SstProfessionalRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "vaccineId" TEXT NOT NULL REFERENCES "Vaccine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "administeredAt" DATE NOT NULL, "doseNumber" INTEGER NOT NULL CHECK ("doseNumber" > 0), "lotNumber" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" = 'EXTERNAL_PROOF'), "occupationalContext" TEXT NOT NULL,
  "nextDoseAt" DATE CHECK ("nextDoseAt" > "administeredAt"), "snapshot" JSONB NOT NULL,
  "submissionKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstVaccination_budgetUnitId_submissionKey_key" ON "SstVaccination"("budgetUnitId","submissionKey");
CREATE INDEX "SstVaccination_budgetUnitId_administeredAt_id_idx" ON "SstVaccination"("budgetUnitId","administeredAt","id");
CREATE FUNCTION "sst_clinical_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SST clinical records are immutable; corrections require an additional record'; END;
$$;
CREATE TRIGGER "SstClinicalRecord_immutable" BEFORE UPDATE OR DELETE ON "SstClinicalRecord" FOR EACH ROW EXECUTE FUNCTION "sst_clinical_immutable"();
CREATE TRIGGER "SstVaccination_immutable" BEFORE UPDATE OR DELETE ON "SstVaccination" FOR EACH ROW EXECUTE FUNCTION "sst_clinical_immutable"();
CREATE FUNCTION "sst_professional_preserve"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SST professional history is immutable'; END IF;
  IF (to_jsonb(NEW) - 'isActive') IS DISTINCT FROM (to_jsonb(OLD) - 'isActive') OR NEW."isActive" <> false THEN
    RAISE EXCEPTION 'SST professional history is immutable; only inactivation is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SstProfessionalRole_preserve" BEFORE UPDATE OR DELETE ON "SstProfessionalRole" FOR EACH ROW EXECUTE FUNCTION "sst_professional_preserve"();
CREATE FUNCTION "sst_clinical_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role_record "SstProfessionalRole"%ROWTYPE; q "SstQuestionnaireVersion"%ROWTYPE;
BEGIN
  SELECT * INTO role_record FROM "SstProfessionalRole" WHERE "id" = NEW."professionalRoleId";
  IF role_record."budgetUnitId" IS DISTINCT FROM NEW."budgetUnitId" THEN RAISE EXCEPTION 'SST professional and record must belong to the same budget unit'; END IF;
  IF TG_TABLE_NAME = 'SstClinicalRecord' THEN
    IF role_record."discipline" IS DISTINCT FROM NEW."discipline" THEN RAISE EXCEPTION 'SST clinical discipline mismatch'; END IF;
    IF NEW."questionnaireVersionId" IS NOT NULL THEN
      SELECT * INTO q FROM "SstQuestionnaireVersion" WHERE "id" = NEW."questionnaireVersionId";
      IF q."budgetUnitId" IS DISTINCT FROM NEW."budgetUnitId" OR q."discipline" IS DISTINCT FROM NEW."discipline" THEN RAISE EXCEPTION 'SST questionnaire scope mismatch'; END IF;
    END IF;
  ELSIF role_record."discipline" NOT IN ('MEDICINE','NURSING') THEN RAISE EXCEPTION 'SST vaccination requires medicine or nursing'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SstClinicalRecord_scope" BEFORE INSERT ON "SstClinicalRecord" FOR EACH ROW EXECUTE FUNCTION "sst_clinical_scope"();
CREATE TRIGGER "SstVaccination_scope" BEFORE INSERT ON "SstVaccination" FOR EACH ROW EXECUTE FUNCTION "sst_clinical_scope"();
