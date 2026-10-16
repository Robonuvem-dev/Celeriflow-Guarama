CREATE TABLE "SstOccupationalProgram" (
  id TEXT PRIMARY KEY,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  code TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('LTCAT','PGR','PCMSO')),
  version INTEGER NOT NULL CHECK (version > 0), "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL CHECK ("endsAt" >= "startsAt"),
  "responsiblePersonId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "responsibleCouncil" TEXT NOT NULL, "responsibleSnapshot" JSONB NOT NULL, content JSONB NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SstOccupationalProgram_budgetUnitId_code_kind_version_key" ON "SstOccupationalProgram"("budgetUnitId", code, kind, version);
CREATE INDEX "SstOccupationalProgram_budgetUnitId_kind_startsAt_idx" ON "SstOccupationalProgram"("budgetUnitId", kind, "startsAt");
CREATE TABLE "SstProgramExposureGroup" (
  id TEXT PRIMARY KEY,
  "programId" TEXT NOT NULL REFERENCES "SstOccupationalProgram"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "groupId" TEXT NOT NULL REFERENCES "SstExposureGroup"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "groupSnapshot" JSONB NOT NULL, risks JSONB NOT NULL, exams JSONB NOT NULL
);
CREATE UNIQUE INDEX "SstProgramExposureGroup_programId_groupId_key" ON "SstProgramExposureGroup"("programId", "groupId");
CREATE FUNCTION "sst_program_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Occupational program versions are immutable; register a new version';
END;
$$;
CREATE TRIGGER "SstOccupationalProgram_immutable" BEFORE UPDATE OR DELETE ON "SstOccupationalProgram" FOR EACH ROW EXECUTE FUNCTION "sst_program_version_immutable"();
CREATE TRIGGER "SstProgramExposureGroup_immutable" BEFORE UPDATE OR DELETE ON "SstProgramExposureGroup" FOR EACH ROW EXECUTE FUNCTION "sst_program_version_immutable"();
