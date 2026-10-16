CREATE TYPE "PlanningJurisdiction" AS ENUM ('EXECUTIVE', 'LEGISLATIVE');
CREATE TYPE "PlanningInstrumentKind" AS ENUM ('PPA', 'LDO', 'LOA');
CREATE TYPE "PlanningLineKind" AS ENUM ('REVENUE', 'EXPENSE', 'TRANSFER');

ALTER TABLE "ProgramPPA" ADD COLUMN "origin" TEXT, ADD COLUMN "guidelines" TEXT,
  ADD COLUMN "targetAudience" TEXT, ADD COLUMN "financing" TEXT, ADD COLUMN "managerName" TEXT;
ALTER TABLE "ResourceSource" ADD COLUMN "tceCode" TEXT, ADD COLUMN "stnGroup" TEXT,
  ADD COLUMN "stnSpecification" TEXT, ADD COLUMN "stnDetail" TEXT, ADD COLUMN "referenceYear" INTEGER;
ALTER TABLE "RevenueNature" ADD COLUMN "degree" INTEGER CHECK ("degree" BETWEEN 1 AND 10),
  ADD COLUMN "shortCode" TEXT, ADD COLUMN "referenceYear" INTEGER;
CREATE UNIQUE INDEX "RevenueNature_shortCode_key" ON "RevenueNature"("shortCode");
CREATE TABLE "PlanningRevenueAllocation" (
  "id" TEXT PRIMARY KEY,
  "revenueNatureId" TEXT NOT NULL REFERENCES "RevenueNature"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "resourceSourceId" TEXT NOT NULL REFERENCES "ResourceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "percentage" DECIMAL(12,6) NOT NULL CHECK ("percentage" > 0 AND "percentage" <= 100)
);
CREATE UNIQUE INDEX "PlanningRevenueAllocation_revenueNatureId_resourceSourceId_key" ON "PlanningRevenueAllocation"("revenueNatureId", "resourceSourceId");

CREATE TABLE "PlanningEntityScope" (
  "governmentEntityId" TEXT PRIMARY KEY REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "jurisdiction" "PlanningJurisdiction" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlanningEntityUnit" (
  "budgetUnitId" TEXT PRIMARY KEY REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PlanningEntityUnit_governmentEntityId_idx" ON "PlanningEntityUnit"("governmentEntityId");

CREATE TABLE "PlanningInstrument" (
  "id" TEXT PRIMARY KEY,
  "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "PlanningInstrumentKind" NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startYear" INTEGER NOT NULL,
  "endYear" INTEGER NOT NULL,
  "revenueDegree" INTEGER NOT NULL DEFAULT 6,
  "expenseLevel" TEXT NOT NULL DEFAULT 'ELEMENT_SOURCE',
  "projectNumber" TEXT,
  "legalText" TEXT,
  "parentId" TEXT REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "multiYearPlanId" TEXT UNIQUE REFERENCES "MultiYearPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "budgetGuidelineId" TEXT UNIQUE REFERENCES "BudgetGuideline"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "annualBudgetLawId" TEXT UNIQUE REFERENCES "AnnualBudgetLaw"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "planning_instrument_years" CHECK (
    "startYear" BETWEEN 1900 AND 2200 AND
    (("kind" = 'PPA' AND "endYear" = "startYear" + 3) OR ("kind" <> 'PPA' AND "endYear" = "startYear"))
  ),
  CONSTRAINT "planning_instrument_degree" CHECK ("revenueDegree" BETWEEN 1 AND 10),
  CONSTRAINT "planning_instrument_level" CHECK ("expenseLevel" IN ('ELEMENT_SOURCE', 'SOURCE')),
  CONSTRAINT "planning_instrument_canonical" CHECK (
    ("kind" = 'PPA' AND "multiYearPlanId" IS NOT NULL AND "budgetGuidelineId" IS NULL AND "annualBudgetLawId" IS NULL AND "parentId" IS NULL) OR
    ("kind" = 'LDO' AND "multiYearPlanId" IS NULL AND "budgetGuidelineId" IS NOT NULL AND "annualBudgetLawId" IS NULL AND "parentId" IS NOT NULL) OR
    ("kind" = 'LOA' AND "multiYearPlanId" IS NULL AND "budgetGuidelineId" IS NULL AND "annualBudgetLawId" IS NOT NULL AND "parentId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "PlanningInstrument_governmentEntityId_kind_code_key" ON "PlanningInstrument"("governmentEntityId", "kind", "code");
CREATE INDEX "PlanningInstrument_governmentEntityId_kind_startYear_idx" ON "PlanningInstrument"("governmentEntityId", "kind", "startYear");

CREATE TABLE "PlanningBudgetLine" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "PlanningLineKind" NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "resourceSourceId" TEXT NOT NULL REFERENCES "ResourceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revenueNatureId" TEXT REFERENCES "RevenueNature"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expenseNatureId" TEXT REFERENCES "ExpenseNature"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "programId" TEXT REFERENCES "ProgramPPA"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actionId" TEXT REFERENCES "ActionPPA"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "functionCode" TEXT,
  "subfunctionCode" TEXT,
  "product" TEXT,
  "productUnit" TEXT,
  "physicalTarget" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "physicalActual" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "originalValue" DECIMAL(18,2) NOT NULL,
  "amendmentBlocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planning_line_values" CHECK ("originalValue" >= 0 AND "physicalTarget" >= 0 AND "physicalActual" >= 0),
  CONSTRAINT "planning_line_nature" CHECK (
    ("kind" = 'REVENUE' AND "revenueNatureId" IS NOT NULL AND "expenseNatureId" IS NULL) OR
    ("kind" = 'EXPENSE' AND "expenseNatureId" IS NOT NULL AND "revenueNatureId" IS NULL AND "programId" IS NOT NULL AND "actionId" IS NOT NULL) OR
    ("kind" = 'TRANSFER' AND "revenueNatureId" IS NULL AND "expenseNatureId" IS NULL)
  )
);
CREATE UNIQUE INDEX "PlanningBudgetLine_instrumentId_code_key" ON "PlanningBudgetLine"("instrumentId", "code");
CREATE INDEX "planning_line_scope_period" ON "PlanningBudgetLine"("instrumentId", "year", "kind", "budgetUnitId", "resourceSourceId");

CREATE TABLE "PlanningLineMovement" (
  "id" TEXT PRIMARY KEY,
  "lineId" TEXT NOT NULL REFERENCES "PlanningBudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "effectiveAt" DATE NOT NULL,
  "value" DECIMAL(18,2) NOT NULL CHECK ("value" <> 0),
  "reason" TEXT NOT NULL,
  "legalText" TEXT NOT NULL,
  "legalActNumber" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanningLineMovement_lineId_effectiveAt_createdAt_idx" ON "PlanningLineMovement"("lineId", "effectiveAt", "createdAt");

CREATE TABLE "PlanningHearing" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "heldAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL,
  "minutes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanningHearing_instrumentId_heldAt_idx" ON "PlanningHearing"("instrumentId", "heldAt");
CREATE TABLE "PlanningCommunityDemand" (
  "id" TEXT PRIMARY KEY,
  "hearingId" TEXT NOT NULL REFERENCES "PlanningHearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requesterName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "neighborhood" TEXT NOT NULL,
  "request" TEXT NOT NULL,
  "responsibleUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  "opinion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanningCommunityDemand_hearingId_status_idx" ON "PlanningCommunityDemand"("hearingId", "status");

CREATE TABLE "PlanningLegislativeAmendment" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "objective" TEXT NOT NULL,
  "justification" TEXT NOT NULL,
  "councilorId" TEXT NOT NULL REFERENCES "CamVereador"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "legalText" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PlanningLegislativeAmendment_instrumentId_number_key" ON "PlanningLegislativeAmendment"("instrumentId", "number");
CREATE TABLE "PlanningAmendmentItem" (
  "id" TEXT PRIMARY KEY,
  "amendmentId" TEXT NOT NULL REFERENCES "PlanningLegislativeAmendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lineId" TEXT NOT NULL REFERENCES "PlanningBudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "value" DECIMAL(18,2) NOT NULL CHECK ("value" <> 0),
  "sanctioned" BOOLEAN
);
CREATE UNIQUE INDEX "PlanningAmendmentItem_amendmentId_lineId_key" ON "PlanningAmendmentItem"("amendmentId", "lineId");

CREATE TABLE "PlanningCalculationMemory" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "normativeReference" TEXT NOT NULL,
  "methodology" TEXT NOT NULL,
  "assumptions" TEXT NOT NULL,
  "baseValue" DECIMAL(18,2) NOT NULL,
  "rate" DECIMAL(12,6) NOT NULL,
  "resultValue" DECIMAL(18,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanningCalculationMemory_instrumentId_idx" ON "PlanningCalculationMemory"("instrumentId");
CREATE TABLE "PlanningRevenueWaiver" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "PlanningInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "year" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "legalReference" TEXT NOT NULL,
  "modality" TEXT NOT NULL,
  "estimatedValue" DECIMAL(18,2) NOT NULL CHECK ("estimatedValue" >= 0),
  "compensation" TEXT NOT NULL,
  "compensationValue" DECIMAL(18,2) NOT NULL CHECK ("compensationValue" >= 0),
  "methodology" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlanningRevenueWaiver_instrumentId_year_idx" ON "PlanningRevenueWaiver"("instrumentId", "year");

-- Do not infer Executive/Legislative ownership for existing records.
-- All assignments are explicit, audited administration operations.

CREATE TABLE "CamAdvisor" (
  "id" TEXT PRIMARY KEY,
  "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "employeeId" TEXT UNIQUE REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cabinetId" TEXT NOT NULL REFERENCES "CamGabinete"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "role" TEXT NOT NULL,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt"),
  "isActive" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "CamAdvisor_personId_cabinetId_startsAt_key" ON "CamAdvisor"("personId", "cabinetId", "startsAt");
CREATE INDEX "CamAdvisor_cabinetId_isActive_idx" ON "CamAdvisor"("cabinetId", "isActive");

CREATE FUNCTION planning_validate_line_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity_id TEXT; unit_entity_id TEXT; first_year INTEGER; last_year INTEGER;
BEGIN
  SELECT "governmentEntityId", "startYear", "endYear" INTO entity_id, first_year, last_year
    FROM "PlanningInstrument" WHERE id = NEW."instrumentId" FOR SHARE;
  SELECT "governmentEntityId" INTO unit_entity_id FROM "PlanningEntityUnit" WHERE "budgetUnitId" = NEW."budgetUnitId" FOR SHARE;
  IF entity_id IS NULL OR unit_entity_id IS DISTINCT FROM entity_id THEN
    RAISE EXCEPTION 'Unidade não pertence à entidade da peça' USING ERRCODE = '23514', CONSTRAINT = 'planning_line_entity_scope';
  END IF;
  IF NEW.year < first_year OR NEW.year > last_year THEN
    RAISE EXCEPTION 'Ano fora da vigência da peça' USING ERRCODE = '23514', CONSTRAINT = 'planning_line_year_scope';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planning_line_scope BEFORE INSERT OR UPDATE ON "PlanningBudgetLine"
  FOR EACH ROW EXECUTE FUNCTION planning_validate_line_scope();

CREATE FUNCTION planning_validate_parent_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_entity TEXT; parent_kind "PlanningInstrumentKind"; first_year INTEGER; last_year INTEGER;
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    SELECT "governmentEntityId", kind, "startYear", "endYear" INTO parent_entity, parent_kind, first_year, last_year
      FROM "PlanningInstrument" WHERE id = NEW."parentId" FOR SHARE;
    IF parent_entity IS DISTINCT FROM NEW."governmentEntityId" OR
      NOT ((NEW.kind = 'LDO' AND parent_kind = 'PPA') OR (NEW.kind = 'LOA' AND parent_kind = 'LDO')) OR
      NEW."startYear" < first_year OR NEW."endYear" > last_year THEN
      RAISE EXCEPTION 'Cadeia orçamentária de entidade ou vigência divergente' USING ERRCODE = '23514', CONSTRAINT = 'planning_parent_scope';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planning_parent_scope BEFORE INSERT OR UPDATE ON "PlanningInstrument"
  FOR EACH ROW EXECUTE FUNCTION planning_validate_parent_scope();
