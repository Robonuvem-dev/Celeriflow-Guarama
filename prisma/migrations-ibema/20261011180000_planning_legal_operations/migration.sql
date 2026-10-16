ALTER TABLE "PlanningInstrument" ADD COLUMN "implantedAt" TIMESTAMP(3), ADD COLUMN "implantedById" TEXT;
CREATE UNIQUE INDEX planning_one_implanted_budget_entity_year ON "PlanningInstrument"("governmentEntityId","startYear") WHERE kind='LOA' AND "implantedAt" IS NOT NULL;
ALTER TABLE "PlanningBudgetLine" ADD COLUMN "amendmentBlockReason" TEXT, ADD COLUMN "amendmentBlockedById" TEXT, ADD COLUMN "amendmentBlockedAt" TIMESTAMP(3), ADD COLUMN "appropriationId" TEXT UNIQUE REFERENCES "BudgetAppropriation"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningBudgetLine" ADD COLUMN "originalPhysicalTarget" DECIMAL(18,4), ADD COLUMN "originalPhysicalActual" DECIMAL(18,4);
ALTER TABLE "PlanningBudgetLine" ADD COLUMN "reducedCode" TEXT;
CREATE UNIQUE INDEX "PlanningBudgetLine_instrumentId_reducedCode_key" ON "PlanningBudgetLine"("instrumentId","reducedCode");
ALTER TABLE "PlanningBudgetLine" ADD COLUMN "destinationEntityId" TEXT REFERENCES "GovernmentEntity"(id) ON DELETE RESTRICT, ADD COLUMN "transferDirection" TEXT;
-- Legacy transfers must be explicitly reconciled before deployment of this constraint.
ALTER TABLE "PlanningBudgetLine" ADD CONSTRAINT planning_transfer_counterparty CHECK(kind <> 'TRANSFER' OR ("destinationEntityId" IS NOT NULL AND "transferDirection" IN ('IN','OUT'))) NOT VALID;
ALTER TABLE "PlanningLegislativeAmendment" ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "decisionReason" TEXT, ADD COLUMN "effectiveAt" DATE, ADD COLUMN "appliedAt" TIMESTAMP(3), ADD COLUMN "legalActNumber" TEXT;
CREATE TABLE "PlanningVersion" (
 id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT,
 number INTEGER NOT NULL CHECK(number > 0), "effectiveAt" DATE NOT NULL, "legalActNumber" TEXT NOT NULL,
 reason TEXT NOT NULL, snapshot JSONB NOT NULL, hash TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("instrumentId",number));
CREATE INDEX "PlanningVersion_instrumentId_effectiveAt_idx" ON "PlanningVersion"("instrumentId","effectiveAt");
CREATE TABLE "PlanningPhysicalEvent" (
 id TEXT PRIMARY KEY, "lineId" TEXT NOT NULL REFERENCES "PlanningBudgetLine"(id) ON DELETE RESTRICT,
 "effectiveAt" DATE NOT NULL, target DECIMAL(18,4) NOT NULL CHECK(target>=0), actual DECIMAL(18,4) NOT NULL CHECK(actual>=0),
 reason TEXT NOT NULL, "submissionKey" TEXT NOT NULL UNIQUE, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PlanningPhysicalEvent_lineId_effectiveAt_createdAt_idx" ON "PlanningPhysicalEvent"("lineId","effectiveAt","createdAt");
CREATE TABLE "PlanningQuota" (
 id TEXT PRIMARY KEY, "lineId" TEXT NOT NULL REFERENCES "PlanningBudgetLine"(id) ON DELETE RESTRICT,
 month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12), kind TEXT NOT NULL DEFAULT 'EXPENSE' CHECK(kind IN ('REVENUE','EXPENSE')), "periodMonths" INTEGER NOT NULL DEFAULT 2 CHECK("periodMonths" IN (2,3,6)),
 planned DECIMAL(18,2) NOT NULL CHECK(planned>=0), consumed DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK(consumed>=0), blocked DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK(blocked>=0),
 "closedAt" TIMESTAMP(3), method TEXT NOT NULL, calculation JSONB NOT NULL,
 UNIQUE("lineId",month), CHECK(kind='REVENUE' OR consumed+blocked<=planned));
ALTER TABLE "PlanningQuota" ADD COLUMN "disbursementPlanned" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK("disbursementPlanned">=0), ADD COLUMN "disbursementPaid" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK("disbursementPaid">=0);
ALTER TABLE "PlanningQuota" ADD CONSTRAINT planning_cash_schedule_balance CHECK("disbursementPaid"<= "disbursementPlanned");
CREATE TABLE "PlanningQuotaEvent" (
 id TEXT PRIMARY KEY, "quotaId" TEXT NOT NULL REFERENCES "PlanningQuota"(id) ON DELETE RESTRICT,
 type TEXT NOT NULL, value DECIMAL(18,2) NOT NULL, reason TEXT NOT NULL, "submissionKey" TEXT NOT NULL UNIQUE,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PlanningQuotaEvent_quotaId_createdAt_idx" ON "PlanningQuotaEvent"("quotaId","createdAt");
ALTER TABLE "PlanningQuotaEvent" ADD COLUMN "originEventId" TEXT REFERENCES "PlanningQuotaEvent"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningQuotaEvent" ADD COLUMN "effectiveAt" DATE NOT NULL DEFAULT CURRENT_DATE;
CREATE TABLE "PlanningCreditBatch" (
 id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT,
 "creditRequestId" TEXT NOT NULL UNIQUE REFERENCES "CreditRequest"(id) ON DELETE RESTRICT,
 origin TEXT NOT NULL CHECK(origin IN ('CANCELLATION','SURPLUS','EXCESS','LOAN')),
 "originEvidence" TEXT NOT NULL, "originLimit" DECIMAL(18,2) NOT NULL CHECK("originLimit">=0),
 status TEXT NOT NULL DEFAULT 'DRAFT', "effectiveAt" DATE, "createdById" TEXT NOT NULL, "submissionKey" TEXT NOT NULL UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "PlanningCreditLine" (
 id TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "PlanningCreditBatch"(id) ON DELETE RESTRICT,
 "lineId" TEXT NOT NULL REFERENCES "PlanningBudgetLine"(id) ON DELETE RESTRICT,
 value DECIMAL(18,2) NOT NULL CHECK(value<>0), reserved DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK(reserved>=0),
 UNIQUE("batchId","lineId"));
CREATE TABLE "PlanningReportSnapshot" (
 id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT,
 "reportType" TEXT NOT NULL, filters JSONB NOT NULL, dataset JSONB NOT NULL, hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'GENERATED', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PlanningReportSnapshot_instrumentId_createdAt_idx" ON "PlanningReportSnapshot"("instrumentId","createdAt");
CREATE TABLE "PlanningIntegrationCommand" (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, "sourceId" TEXT NOT NULL, payload JSONB NOT NULL,
 "idempotencyKey" TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER planning_version_immutable BEFORE UPDATE OR DELETE ON "PlanningVersion" FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();
CREATE TRIGGER planning_physical_immutable BEFORE UPDATE OR DELETE ON "PlanningPhysicalEvent" FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();
CREATE TRIGGER planning_quota_event_immutable BEFORE UPDATE OR DELETE ON "PlanningQuotaEvent" FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();
-- Snapshot contents stay immutable; publication state belongs to the future adapter.
CREATE TRIGGER planning_report_immutable BEFORE UPDATE OR DELETE ON "PlanningReportSnapshot" FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();
CREATE TABLE "PlanningFiscalRule" (
 id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT,
 type TEXT NOT NULL, "normativeReference" TEXT NOT NULL, definition JSONB NOT NULL,
 "updatedById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE("instrumentId",type));
CREATE TABLE "PlanningPlannedWork" (
 id TEXT PRIMARY KEY, "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"(id) ON DELETE RESTRICT,
 title TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('WORK','CONSERVATION')), location TEXT NOT NULL,
 "legalReference" TEXT NOT NULL, year INTEGER NOT NULL, value DECIMAL(18,2) NOT NULL CHECK(value>=0),
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE FUNCTION planning_closed_line_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE piece_status TEXT;
BEGIN
 SELECT COALESCE(p.status,g.status,l.status) INTO piece_status FROM "PlanningInstrument" i
 LEFT JOIN "MultiYearPlan" p ON p.id=i."multiYearPlanId"
 LEFT JOIN "BudgetGuideline" g ON g.id=i."budgetGuidelineId"
 LEFT JOIN "AnnualBudgetLaw" l ON l.id=i."annualBudgetLawId" WHERE i.id=OLD."instrumentId";
 IF TG_OP='DELETE' THEN
   IF piece_status <> 'DRAFT' THEN RAISE EXCEPTION 'Closed planning original lines are immutable'; END IF;
   RETURN OLD;
 END IF;
 IF piece_status <> 'DRAFT' AND
 ROW(NEW.code,NEW."reducedCode",NEW.kind,NEW.year,NEW."instrumentId",NEW."budgetUnitId",NEW."resourceSourceId",NEW."revenueNatureId",NEW."expenseNatureId",NEW."programId",NEW."actionId",NEW."functionCode",NEW."subfunctionCode",NEW.product,NEW."productUnit",NEW."originalValue",NEW."destinationEntityId",NEW."transferDirection")
 IS DISTINCT FROM
 ROW(OLD.code,OLD."reducedCode",OLD.kind,OLD.year,OLD."instrumentId",OLD."budgetUnitId",OLD."resourceSourceId",OLD."revenueNatureId",OLD."expenseNatureId",OLD."programId",OLD."actionId",OLD."functionCode",OLD."subfunctionCode",OLD.product,OLD."productUnit",OLD."originalValue",OLD."destinationEntityId",OLD."transferDirection")
 THEN RAISE EXCEPTION 'Closed planning original classification/value is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER planning_closed_line_immutable BEFORE UPDATE OR DELETE ON "PlanningBudgetLine" FOR EACH ROW EXECUTE FUNCTION planning_closed_line_immutable();

CREATE FUNCTION planning_decided_amendment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Decided planning amendments are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER planning_decided_amendment_immutable BEFORE UPDATE OR DELETE ON "PlanningLegislativeAmendment" FOR EACH ROW EXECUTE FUNCTION planning_decided_amendment_immutable();
CREATE FUNCTION planning_decided_amendment_item_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE decision TEXT;
BEGIN
 SELECT status INTO decision FROM "PlanningLegislativeAmendment" WHERE id=OLD."amendmentId";
 IF decision <> 'DRAFT' THEN RAISE EXCEPTION 'Decided planning amendment items are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER planning_decided_amendment_item_immutable BEFORE UPDATE OR DELETE ON "PlanningAmendmentItem" FOR EACH ROW EXECUTE FUNCTION planning_decided_amendment_item_immutable();

-- Existing Finance editors cannot race a Planning sanction through the shared PPA tree.
CREATE FUNCTION planning_closed_program_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ppa_id TEXT; parent_id TEXT; piece_status TEXT;
BEGIN
 IF TG_TABLE_NAME='ProgramPPA' THEN
   ppa_id := CASE WHEN TG_OP='DELETE' THEN OLD."multiYearPlanId" ELSE NEW."multiYearPlanId" END;
 ELSIF TG_TABLE_NAME IN ('ActionPPA','ObjectivePPA') THEN
   parent_id := CASE WHEN TG_OP='DELETE' THEN OLD."programId" ELSE NEW."programId" END;
   SELECT "multiYearPlanId" INTO ppa_id FROM "ProgramPPA" WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='IndicatorPPA' THEN
   parent_id := CASE WHEN TG_OP='DELETE' THEN OLD."objectiveId" ELSE NEW."objectiveId" END;
   SELECT p."multiYearPlanId" INTO ppa_id FROM "ObjectivePPA" o JOIN "ProgramPPA" p ON p.id=o."programId" WHERE o.id=parent_id;
 ELSE
   parent_id := CASE WHEN TG_OP='DELETE' THEN OLD."actionId" ELSE NEW."actionId" END;
   SELECT p."multiYearPlanId" INTO ppa_id FROM "ActionPPA" a JOIN "ProgramPPA" p ON p.id=a."programId" WHERE a.id=parent_id;
 END IF;
 IF EXISTS (SELECT 1 FROM "PlanningInstrument" WHERE "multiYearPlanId"=ppa_id) THEN
   SELECT status INTO piece_status FROM "MultiYearPlan" WHERE id=ppa_id FOR SHARE;
   IF piece_status <> 'DRAFT' THEN RAISE EXCEPTION 'Planning-owned closed PPA structure requires a formal revision'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER planning_closed_program BEFORE INSERT OR UPDATE OR DELETE ON "ProgramPPA" FOR EACH ROW EXECUTE FUNCTION planning_closed_program_tree();
CREATE TRIGGER planning_closed_action BEFORE INSERT OR UPDATE OR DELETE ON "ActionPPA" FOR EACH ROW EXECUTE FUNCTION planning_closed_program_tree();
CREATE TRIGGER planning_closed_objective BEFORE INSERT OR UPDATE OR DELETE ON "ObjectivePPA" FOR EACH ROW EXECUTE FUNCTION planning_closed_program_tree();
CREATE TRIGGER planning_closed_indicator BEFORE INSERT OR UPDATE OR DELETE ON "IndicatorPPA" FOR EACH ROW EXECUTE FUNCTION planning_closed_program_tree();
CREATE TRIGGER planning_closed_goal BEFORE INSERT OR UPDATE OR DELETE ON "GoalPPA" FOR EACH ROW EXECUTE FUNCTION planning_closed_program_tree();
