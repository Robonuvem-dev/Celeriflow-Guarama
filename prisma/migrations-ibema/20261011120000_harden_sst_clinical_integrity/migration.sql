-- Additive hardening: never edit the already deployed clinical foundation.
ALTER TABLE "SstProfessionalRole" ADD CONSTRAINT "SstProfessionalRole_finite_dates_check"
  CHECK (isfinite("startsAt") AND isfinite("endsAt"));
ALTER TABLE "SstClinicalRecord" ADD CONSTRAINT "SstClinicalRecord_finite_date_check"
  CHECK (isfinite("attendedAt"));
ALTER TABLE "SstVaccination" ADD CONSTRAINT "SstVaccination_finite_dates_check"
  CHECK (isfinite("administeredAt") AND ("nextDoseAt" IS NULL OR isfinite("nextDoseAt")));
-- Annual/booster cycles can legitimately reuse a dose number on another date.
CREATE UNIQUE INDEX "SstVaccination_person_vaccine_dose_date_key"
  ON "SstVaccination"("personId","vaccineId","doseNumber","administeredAt");
CREATE OR REPLACE FUNCTION "sst_clinical_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role_record "SstProfessionalRole"%ROWTYPE; q "SstQuestionnaireVersion"%ROWTYPE; civil_day DATE;
BEGIN
  SELECT * INTO role_record FROM "SstProfessionalRole" WHERE "id" = NEW."professionalRoleId" FOR SHARE;
  IF NOT FOUND OR NOT role_record."isActive" THEN RAISE EXCEPTION 'SST professional must be active'; END IF;
  IF role_record."usuarioId" IS DISTINCT FROM NEW."createdById" THEN RAISE EXCEPTION 'SST professional must belong to the recording actor'; END IF;
  IF TG_TABLE_NAME = 'SstClinicalRecord' THEN
    civil_day := ((NEW."attendedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date;
  ELSE
    civil_day := NEW."administeredAt";
  END IF;
  IF civil_day < role_record."startsAt" OR civil_day > role_record."endsAt" THEN RAISE EXCEPTION 'SST professional validity mismatch'; END IF;
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
