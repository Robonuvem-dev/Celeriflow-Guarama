ALTER TABLE "PlanningInstrument" ADD COLUMN "expenseDegree" INTEGER NOT NULL DEFAULT 6 CHECK("expenseDegree" BETWEEN 1 AND 10), ADD COLUMN "catalogVersionId" TEXT;
ALTER TABLE "PlanningBudgetLine" ADD COLUMN "classificationSnapshot" JSONB;
ALTER TABLE "PlanningPlannedWork" ADD COLUMN "startsAt" DATE, ADD COLUMN "conservationValue" NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK("conservationValue">=0), ADD COLUMN "newProjectsValue" NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK("newProjectsValue">=0);
ALTER TABLE "PlanningCalculationMemory" ADD COLUMN year INTEGER, ADD COLUMN calculation JSONB;
ALTER TABLE "PlanningRevenueWaiver" ADD COLUMN "taxId" TEXT REFERENCES "Tax"(id) ON DELETE RESTRICT, ADD COLUMN "originKey" TEXT, ADD COLUMN "realizedValue" NUMERIC(18,2), ADD COLUMN "realizedThrough" DATE;
ALTER TABLE "PlanningImportBatch" ADD COLUMN "sourceYear" INTEGER, ADD COLUMN "realizedStage" TEXT, ADD COLUMN mapping JSONB;
ALTER TABLE "PlanningImportBatch" DROP CONSTRAINT "PlanningImportBatch_mode_check";
ALTER TABLE "PlanningImportBatch" ADD CHECK(mode IN ('STRUCTURE','VALUES','REALIZED'));
CREATE TABLE "PlanningCatalogVersion" (id TEXT PRIMARY KEY, year INTEGER NOT NULL, label TEXT NOT NULL, "normativeReference" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(year,"sourceHash"));
CREATE TABLE "PlanningCatalogEntry" (id TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "PlanningCatalogVersion"(id) ON DELETE RESTRICT, kind TEXT NOT NULL CHECK(kind IN ('SOURCE','REVENUE','EXPENSE')), code TEXT NOT NULL, name TEXT NOT NULL, "parentCode" TEXT, degree INTEGER NOT NULL CHECK(degree BETWEEN 1 AND 10), "canonicalId" TEXT NOT NULL, attributes JSONB NOT NULL, UNIQUE("versionId",kind,code), UNIQUE("versionId",kind,"canonicalId"));
ALTER TABLE "PlanningInstrument" ADD FOREIGN KEY("catalogVersionId") REFERENCES "PlanningCatalogVersion"(id) ON DELETE RESTRICT;
CREATE TABLE "PlanningInstrumentSource" (id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT, "resourceSourceId" TEXT NOT NULL REFERENCES "ResourceSource"(id) ON DELETE RESTRICT, "catalogEntryId" TEXT REFERENCES "PlanningCatalogEntry"(id) ON DELETE RESTRICT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("instrumentId","resourceSourceId"));
CREATE TABLE "PlanningAnnualProgram" (id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT, "programId" TEXT NOT NULL REFERENCES "ProgramPPA"(id) ON DELETE RESTRICT, year INTEGER NOT NULL, priority TEXT, UNIQUE("instrumentId","programId",year));
CREATE TABLE "PlanningLegislativeLink" (id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT, "propositionId" TEXT REFERENCES "CamProposicao"(id) ON DELETE RESTRICT, "lawId" TEXT REFERENCES "CamLei"(id) ON DELETE RESTRICT, reference TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("instrumentId",reference));
CREATE FUNCTION planning_catalog_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published TEXT;
BEGIN
 IF TG_TABLE_NAME='PlanningCatalogVersion' THEN
  IF OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published planning catalog is immutable'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW."versionId" IS DISTINCT FROM OLD."versionId" THEN RAISE EXCEPTION 'Planning classification version is immutable'; END IF;
  SELECT status INTO published FROM "PlanningCatalogVersion" WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW."versionId" ELSE OLD."versionId" END;
  IF published='PUBLISHED' THEN RAISE EXCEPTION 'Published planning classification is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER planning_catalog_version_immutable BEFORE UPDATE OR DELETE ON "PlanningCatalogVersion" FOR EACH ROW EXECUTE FUNCTION planning_catalog_immutable();
CREATE TRIGGER planning_catalog_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON "PlanningCatalogEntry" FOR EACH ROW EXECUTE FUNCTION planning_catalog_immutable();
ALTER TABLE "PlanningBudgetLine" DROP CONSTRAINT "planning_line_nature";
ALTER TABLE "PlanningBudgetLine" ADD CONSTRAINT "planning_line_nature" CHECK((kind='REVENUE' AND "revenueNatureId" IS NOT NULL AND "expenseNatureId" IS NULL) OR (kind='EXPENSE' AND "revenueNatureId" IS NULL AND "programId" IS NOT NULL AND "actionId" IS NOT NULL) OR(kind='TRANSFER' AND "revenueNatureId" IS NULL AND "expenseNatureId" IS NULL));
CREATE FUNCTION planning_expense_level_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE level TEXT; piece_kind "PlanningInstrumentKind";
BEGIN
 SELECT "expenseLevel",kind INTO level,piece_kind FROM "PlanningInstrument" WHERE id=NEW."instrumentId";
 IF NEW.kind='EXPENSE' AND NEW."expenseNatureId" IS NULL AND (level<>'SOURCE' OR piece_kind='LOA') THEN RAISE EXCEPTION 'Expense element required for this instrument'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER planning_expense_level BEFORE INSERT OR UPDATE ON "PlanningBudgetLine" FOR EACH ROW EXECUTE FUNCTION planning_expense_level_guard();
CREATE FUNCTION planning_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE piece_status TEXT;
BEGIN
 SELECT COALESCE(p.status,g.status,l.status) INTO piece_status FROM "PlanningInstrument" i LEFT JOIN "MultiYearPlan" p ON p.id=i."multiYearPlanId" LEFT JOIN "BudgetGuideline" g ON g.id=i."budgetGuidelineId" LEFT JOIN "AnnualBudgetLaw" l ON l.id=i."annualBudgetLawId" WHERE i.id=OLD."instrumentId";
 IF piece_status<>'DRAFT' AND NEW."classificationSnapshot" IS DISTINCT FROM OLD."classificationSnapshot" THEN RAISE EXCEPTION 'Closed original planning classification is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER planning_classification_preserved BEFORE UPDATE ON "PlanningBudgetLine" FOR EACH ROW EXECUTE FUNCTION planning_classification_guard();
CREATE FUNCTION planning_source_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."catalogEntryId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PlanningCatalogEntry" e JOIN "PlanningInstrument" i ON i.id=NEW."instrumentId" WHERE e.id=NEW."catalogEntryId" AND e.kind='SOURCE' AND e."canonicalId"=NEW."resourceSourceId" AND e."versionId"=i."catalogVersionId") THEN RAISE EXCEPTION 'Source binding outside the instrument classification'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER planning_source_binding BEFORE INSERT OR UPDATE ON "PlanningInstrumentSource" FOR EACH ROW EXECUTE FUNCTION planning_source_binding_guard();
CREATE OR REPLACE FUNCTION planning_closed_program_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ppa_id TEXT; parent_id TEXT; piece_status TEXT;
BEGIN
 IF TG_TABLE_NAME='ProgramPPA' THEN ppa_id:=CASE WHEN TG_OP='DELETE' THEN OLD."multiYearPlanId" ELSE NEW."multiYearPlanId" END;
 ELSIF TG_TABLE_NAME IN ('ActionPPA','ObjectivePPA') THEN
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD."programId" ELSE NEW."programId" END;
  SELECT "multiYearPlanId" INTO ppa_id FROM "ProgramPPA" WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='IndicatorPPA' THEN
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD."objectiveId" ELSE NEW."objectiveId" END;
  SELECT p."multiYearPlanId" INTO ppa_id FROM "ObjectivePPA" o JOIN "ProgramPPA" p ON p.id=o."programId" WHERE o.id=parent_id;
 ELSE
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD."actionId" ELSE NEW."actionId" END;
  SELECT p."multiYearPlanId" INTO ppa_id FROM "ActionPPA" a JOIN "ProgramPPA" p ON p.id=a."programId" WHERE a.id=parent_id;
 END IF;
 IF EXISTS(SELECT 1 FROM "PlanningInstrument" WHERE "multiYearPlanId"=ppa_id) THEN
  SELECT status INTO piece_status FROM "MultiYearPlan" WHERE id=ppa_id FOR SHARE;
  IF piece_status<>'DRAFT' AND current_setting('planning.formal_revision_ppa',true) IS DISTINCT FROM ppa_id THEN RAISE EXCEPTION 'Planning-owned closed PPA structure requires a formal revision'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
