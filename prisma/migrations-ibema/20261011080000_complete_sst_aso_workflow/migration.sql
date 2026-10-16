-- Additive workflow: issued ASOs and applied migrations remain immutable.
CREATE TABLE "SstAsoFlowSource" (
  "asoId" TEXT PRIMARY KEY REFERENCES "SstAso"(id) ON DELETE RESTRICT,
  "anamnesisId" TEXT NOT NULL UNIQUE REFERENCES "SstAnamnesis"(id) ON DELETE RESTRICT,
  "physicianRoleId" TEXT NOT NULL REFERENCES "SstProfessionalRole"(id) ON DELETE RESTRICT,
  "functionalPeriodId" TEXT REFERENCES "HrEmployeeFunctionalPeriod"(id) ON DELETE RESTRICT
);
CREATE TABLE "SstAsoFlowSettings" (
  "budgetUnitId" TEXT PRIMARY KEY REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT,
  "suggestedResults" TEXT[] NOT NULL DEFAULT '{}',
  "vacationWarningDays" INTEGER NOT NULL DEFAULT 0 CHECK ("vacationWarningDays" BETWEEN 0 AND 365),
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Vacation has acquisition dates, but no canonical concession deadline. RH must
-- explicitly record that deadline and its source; SST never invents +12 months.
CREATE TABLE "HrVacationConcessionSource" (
  "vacationId" TEXT PRIMARY KEY REFERENCES "Vacation"(id) ON DELETE RESTRICT,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT,
  "functionalPeriodId" TEXT NOT NULL REFERENCES "HrEmployeeFunctionalPeriod"(id) ON DELETE RESTRICT,
  "expiresAt" DATE NOT NULL,
  "sourceReference" TEXT NOT NULL CHECK (length("sourceReference") >= 10),
  "acquisitionStart" TIMESTAMP(3) NOT NULL,
  "acquisitionEnd" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SstAsoCorrection" (
  id TEXT PRIMARY KEY,
  "asoId" TEXT NOT NULL REFERENCES "SstAso"(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('ANNULMENT','RECTIFICATION')),
  "replacementAsoId" TEXT UNIQUE REFERENCES "SstAso"(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(reason) >= 10),
  "requestHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("asoId"),
  CHECK ((kind='ANNULMENT' AND "replacementAsoId" IS NULL) OR (kind='RECTIFICATION' AND "replacementAsoId" IS NOT NULL AND "replacementAsoId"<>"asoId"))
);
CREATE TABLE "SstAsoDocument" (
  id TEXT PRIMARY KEY,
  "asoId" TEXT NOT NULL REFERENCES "SstAso"(id) ON DELETE RESTRICT,
  "examId" TEXT REFERENCES "SstOccupationalExam"(id) ON DELETE RESTRICT,
  "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('GENERATED','ORIGIN')),
  "requestHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (kind <> 'GENERATED' OR "examId" IS NULL)
);
CREATE UNIQUE INDEX "SstAsoDocument_generated_key" ON "SstAsoDocument" ("asoId") WHERE kind='GENERATED';
CREATE FUNCTION sst_aso_flow_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ASO workflow evidence is immutable'; END $$;
CREATE TRIGGER "SstAsoFlowSource_immutable" BEFORE UPDATE OR DELETE ON "SstAsoFlowSource" FOR EACH ROW EXECUTE FUNCTION sst_aso_flow_immutable();
CREATE TRIGGER "SstAsoCorrection_immutable" BEFORE UPDATE OR DELETE ON "SstAsoCorrection" FOR EACH ROW EXECUTE FUNCTION sst_aso_flow_immutable();
CREATE TRIGGER "SstAsoDocument_immutable" BEFORE UPDATE OR DELETE ON "SstAsoDocument" FOR EACH ROW EXECUTE FUNCTION sst_aso_flow_immutable();
CREATE TRIGGER "HrVacationConcessionSource_immutable" BEFORE UPDATE OR DELETE ON "HrVacationConcessionSource" FOR EACH ROW EXECUTE FUNCTION sst_aso_flow_immutable();
CREATE FUNCTION sst_aso_flow_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SstAso" a JOIN "SstAnamnesis" n ON n.id=NEW."anamnesisId" JOIN "SstProfessionalRole" r ON r.id=NEW."physicianRoleId" JOIN "SstQuestionnaireVersion" q ON q.id=n."questionnaireVersionId"
    WHERE a.id=NEW."asoId" AND n."asoId"=a.id AND n.revision=1 AND q."budgetUnitId"=a."budgetUnitId" AND q.discipline='MEDICINE'
    AND r."budgetUnitId"=a."budgetUnitId" AND r."personId"=a."examinerPersonId" AND r.discipline='MEDICINE' AND r.council=a."examinerCouncil" AND r."isActive" AND a."performedAt" BETWEEN r."startsAt" AND r."endsAt"
    AND ((a."employeeId" IS NULL AND NEW."functionalPeriodId" IS NULL) OR EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=NEW."functionalPeriodId" AND p."employeeId"=a."employeeId" AND p."budgetUnitId"=a."budgetUnitId" AND NOT p.voided AND ((p."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date<=a."performedAt" AND ((p."endsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date>a."performedAt" AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" s WHERE s."supersedesId"=p.id))))
  THEN RAISE EXCEPTION 'Invalid pre-emission ASO source'; END IF;
  IF EXISTS (SELECT 1 FROM "SstOccupationalExam" e JOIN "SstAso" a ON a.id=e."asoId" WHERE a.id=NEW."asoId" AND NOT EXISTS (
    SELECT 1 FROM "SstProfessionalRole" r WHERE r."budgetUnitId"=a."budgetUnitId" AND r."personId"=e."professionalPersonId" AND r.council=e."professionalCouncil" AND r."isActive" AND e."performedAt" BETWEEN r."startsAt" AND r."endsAt"
    AND r.discipline=COALESCE(e.snapshot->>'professionalDiscipline','MEDICINE')
    AND ((e.kind IN ('CLINICO','TOXICOLOGICO') AND r.discipline='MEDICINE') OR (e.kind='COMPLEMENTAR' AND r.discipline IN ('MEDICINE','NURSING','PSYCHOLOGY')))))
  THEN RAISE EXCEPTION 'Invalid examination professional qualification'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SstAsoFlowSource_validate" BEFORE INSERT ON "SstAsoFlowSource" FOR EACH ROW EXECUTE FUNCTION sst_aso_flow_validate();
CREATE FUNCTION sst_aso_requires_flow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SstAsoFlowSource" WHERE "asoId"=NEW.id) THEN RAISE EXCEPTION 'New ASO requires transactional pre-emission anamnesis'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "SstAso_requires_flow" AFTER INSERT ON "SstAso" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sst_aso_requires_flow();
CREATE FUNCTION sst_aso_document_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."examId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SstOccupationalExam" WHERE id=NEW."examId" AND "asoId"=NEW."asoId") THEN RAISE EXCEPTION 'Exam document belongs to another ASO'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SstAsoDocument_validate" BEFORE INSERT ON "SstAsoDocument" FOR EACH ROW EXECUTE FUNCTION sst_aso_document_validate();
CREATE FUNCTION sst_aso_correction_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('SST_ASO_CORRECTION_CHAIN'));
  IF NEW.kind='RECTIFICATION' AND NOT EXISTS (SELECT 1 FROM "SstAso" a JOIN "SstAso" r ON r.id=NEW."replacementAsoId" WHERE a.id=NEW."asoId" AND a."personId"=r."personId" AND a."employeeId" IS NOT DISTINCT FROM r."employeeId" AND a."budgetUnitId"=r."budgetUnitId" AND r."createdAt">=a."createdAt" AND NOT EXISTS (SELECT 1 FROM "SstAsoCorrection" c WHERE c."asoId"=r.id OR c."replacementAsoId"=r.id)) THEN RAISE EXCEPTION 'Invalid ASO replacement or cycle'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SstAsoCorrection_validate" BEFORE INSERT ON "SstAsoCorrection" FOR EACH ROW EXECUTE FUNCTION sst_aso_correction_validate();
