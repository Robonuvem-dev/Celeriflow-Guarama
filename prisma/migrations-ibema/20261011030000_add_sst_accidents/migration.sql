-- CAT is the stable S-2210 source. All children are append-only evidence.
CREATE TABLE "SstCat" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id"),
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id"), "submissionKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "occurredAt" TIMESTAMP(3) NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('TYPICAL','COMMUTE','DISEASE','INCIDENT')),
 "source" TEXT NOT NULL CHECK ("source" IN ('SST','PORTAL')), "data" JSONB NOT NULL,
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("budgetUnitId", "submissionKey")
);
CREATE INDEX "SstCat_scope_date" ON "SstCat"("budgetUnitId", "occurredAt", "id");
CREATE TABLE "SstCatEvidence" (
 "id" TEXT PRIMARY KEY, "catId" TEXT NOT NULL REFERENCES "SstCat"("id"),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('INVESTIGATION','TECHNICAL','MEDICAL','ATTENDANCE','HOMOLOGATION')),
 "version" INTEGER NOT NULL CHECK ("version" > 0), "clinical" BOOLEAN NOT NULL,
 "approved" BOOLEAN NOT NULL DEFAULT false, "personId" TEXT REFERENCES "Person"("id"),
 "professionalRoleId" TEXT REFERENCES "SstProfessionalRole"("id"),
 "data" JSONB NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("clinical" = ("kind" IN ('MEDICAL','ATTENDANCE','INVESTIGATION')))
);
CREATE UNIQUE INDEX "SstCat_one_revision" ON "SstCatEvidence"("catId","version","kind") WHERE "kind" <> 'ATTENDANCE';
CREATE TABLE "SstCatLedger" (
 "id" TEXT PRIMARY KEY, "catId" TEXT NOT NULL REFERENCES "SstCat"("id"),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('EXPENSE','REIMBURSEMENT')),
 "amount" DECIMAL(14,2) NOT NULL CHECK ("amount" > 0), "description" TEXT NOT NULL,
 "expenseId" TEXT REFERENCES "SstCatLedger"("id"),
 "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("kind" = 'EXPENSE' AND "expenseId" IS NULL) OR ("kind" = 'REIMBURSEMENT' AND "expenseId" IS NOT NULL))
);
-- Canonical Role has description but no structured duties. Extend it rather than clone it.
CREATE TABLE "SstRoleAttribute" ("id" TEXT PRIMARY KEY, "roleId" TEXT NOT NULL REFERENCES "Role"("id"), "description" TEXT NOT NULL, UNIQUE("roleId","description"));
CREATE TABLE "SstRestriction" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id"),
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id"), "professionalRoleId" TEXT NOT NULL REFERENCES "SstProfessionalRole"("id"),
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL CHECK ("endsAt" >= "startsAt"),
 "data" JSONB NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SstRestriction_scope_expiry" ON "SstRestriction"("budgetUnitId","endsAt","id");
CREATE TABLE "SstRestrictionFollowup" (
 "id" TEXT PRIMARY KEY, "restrictionId" TEXT NOT NULL REFERENCES "SstRestriction"("id"), "followedAt" TIMESTAMP(3) NOT NULL,
 "data" JSONB NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"("id"),
 "submissionKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SstRestrictionEmailOutbox" (
 "id" TEXT PRIMARY KEY, "restrictionId" TEXT NOT NULL UNIQUE REFERENCES "SstRestriction"("id"),
 "recipient" TEXT NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','SENDING','SENT','FAILED')),
 "providerReceipt" TEXT, "lastError" TEXT, "sentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("status" <> 'SENT' OR ("providerReceipt" IS NOT NULL AND "sentAt" IS NOT NULL))
);
CREATE FUNCTION sst_accident_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SST evidence is immutable'; END $$;
CREATE TRIGGER sst_cat_immutable BEFORE UPDATE OR DELETE ON "SstCat" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE TRIGGER sst_cat_evidence_immutable BEFORE UPDATE OR DELETE ON "SstCatEvidence" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE TRIGGER sst_cat_ledger_immutable BEFORE UPDATE OR DELETE ON "SstCatLedger" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE TRIGGER sst_restriction_immutable BEFORE UPDATE OR DELETE ON "SstRestriction" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE TRIGGER sst_followup_immutable BEFORE UPDATE OR DELETE ON "SstRestrictionFollowup" FOR EACH ROW EXECUTE FUNCTION sst_accident_immutable();
CREATE FUNCTION sst_cat_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM "SstCat" WHERE "id" = NEW."catId" FOR UPDATE;
 IF EXISTS(SELECT 1 FROM "SstCatEvidence" WHERE "catId"=NEW."catId" AND "kind"='HOMOLOGATION') THEN RAISE EXCEPTION 'Homologated CAT is closed'; END IF;
 IF NEW."kind" IN ('TECHNICAL','MEDICAL','HOMOLOGATION') AND NOT EXISTS(SELECT 1 FROM "SstCatEvidence" WHERE "catId"=NEW."catId" AND "kind"='INVESTIGATION' AND "version"=NEW."version") THEN RAISE EXCEPTION 'Investigation revision required'; END IF;
 IF NEW."kind"='HOMOLOGATION' AND (
  NEW."version" <> (SELECT MAX("version") FROM "SstCatEvidence" WHERE "catId"=NEW."catId" AND "kind"='INVESTIGATION') OR
  (SELECT COUNT(DISTINCT "kind") FROM "SstCatEvidence" WHERE "catId"=NEW."catId" AND "version"=NEW."version" AND "kind" IN ('TECHNICAL','MEDICAL') AND "approved") <> 2
 ) THEN RAISE EXCEPTION 'Current favorable technical and medical opinions required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_cat_evidence_guard BEFORE INSERT ON "SstCatEvidence" FOR EACH ROW EXECUTE FUNCTION sst_cat_evidence_guard();
CREATE FUNCTION sst_cat_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expense_amount numeric; reimbursed numeric;
BEGIN
 IF NEW."kind"='REIMBURSEMENT' THEN
  SELECT "amount" INTO expense_amount FROM "SstCatLedger" WHERE "id"=NEW."expenseId" AND "catId"=NEW."catId" AND "kind"='EXPENSE' FOR UPDATE;
  IF expense_amount IS NULL THEN RAISE EXCEPTION 'Expense from same CAT required'; END IF;
  SELECT COALESCE(SUM("amount"),0) INTO reimbursed FROM "SstCatLedger" WHERE "expenseId"=NEW."expenseId";
  IF reimbursed + NEW."amount" > expense_amount THEN RAISE EXCEPTION 'Reimbursement exceeds expense'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER sst_cat_ledger_guard BEFORE INSERT ON "SstCatLedger" FOR EACH ROW EXECUTE FUNCTION sst_cat_ledger_guard();
CREATE FUNCTION sst_restriction_followup_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restriction_start timestamp;
BEGIN
 SELECT "startsAt" INTO restriction_start FROM "SstRestriction" WHERE "id"=NEW."restrictionId" FOR UPDATE;
 IF NEW."followedAt" < restriction_start OR NEW."followedAt" > CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Invalid followup date'; END IF;
 IF EXISTS (SELECT 1 FROM "SstRestrictionFollowup" WHERE "restrictionId"=NEW."restrictionId" AND "data"->>'outcome'='RELEASE') THEN RAISE EXCEPTION 'Released restriction is closed'; END IF;
 IF NEW."data"->>'outcome' IS NULL OR NEW."data"->>'outcome' NOT IN ('MAINTAIN','RELEASE','REASSESS') THEN RAISE EXCEPTION 'Followup outcome required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_restriction_followup_guard BEFORE INSERT ON "SstRestrictionFollowup" FOR EACH ROW EXECUTE FUNCTION sst_restriction_followup_guard();
