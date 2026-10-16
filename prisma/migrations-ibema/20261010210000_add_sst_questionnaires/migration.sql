CREATE TABLE "SstQuestionnaireVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "questions" JSONB NOT NULL CHECK (jsonb_typeof("questions") = 'array' AND jsonb_array_length("questions") BETWEEN 1 AND 100),
  "submissionKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstQuestionnaireVersion_budgetUnitId_code_version_key" ON "SstQuestionnaireVersion"("budgetUnitId", "code", "version");
CREATE UNIQUE INDEX "SstQuestionnaireVersion_budgetUnitId_submissionKey_key" ON "SstQuestionnaireVersion"("budgetUnitId", "submissionKey");
CREATE INDEX "SstQuestionnaireVersion_budgetUnitId_createdAt_id_idx" ON "SstQuestionnaireVersion"("budgetUnitId", "createdAt", "id");
CREATE TABLE "SstAnamnesis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asoId" TEXT NOT NULL REFERENCES "SstAso"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "questionnaireVersionId" TEXT NOT NULL REFERENCES "SstQuestionnaireVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "answers" JSONB NOT NULL CHECK (jsonb_typeof("answers") = 'object'),
  "snapshot" JSONB NOT NULL,
  "revisionReason" TEXT NOT NULL CHECK ("revision" = 1 OR length(trim("revisionReason")) >= 10),
  "submissionKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstAnamnesis_asoId_revision_key" ON "SstAnamnesis"("asoId", "revision");
CREATE UNIQUE INDEX "SstAnamnesis_asoId_submissionKey_key" ON "SstAnamnesis"("asoId", "submissionKey");
CREATE FUNCTION "sst_questionnaire_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SST questionnaires and anamnesis records are immutable; create a new version or revision';
END;
$$;
CREATE TRIGGER "SstQuestionnaireVersion_immutable" BEFORE UPDATE OR DELETE ON "SstQuestionnaireVersion" FOR EACH ROW EXECUTE FUNCTION "sst_questionnaire_immutable"();
CREATE TRIGGER "SstAnamnesis_immutable" BEFORE UPDATE OR DELETE ON "SstAnamnesis" FOR EACH ROW EXECUTE FUNCTION "sst_questionnaire_immutable"();
CREATE FUNCTION "sst_anamnesis_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "budgetUnitId" FROM "SstAso" WHERE "id" = NEW."asoId") IS DISTINCT FROM
    (SELECT "budgetUnitId" FROM "SstQuestionnaireVersion" WHERE "id" = NEW."questionnaireVersionId") THEN
    RAISE EXCEPTION 'SST anamnesis questionnaire and ASO must belong to the same budget unit';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SstAnamnesis_scope" BEFORE INSERT ON "SstAnamnesis" FOR EACH ROW EXECUTE FUNCTION "sst_anamnesis_scope"();
