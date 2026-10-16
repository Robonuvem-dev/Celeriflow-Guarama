-- Exact money is authoritative; legacy Float columns remain compatibility projections.
ALTER TABLE "PayrollItem" ADD COLUMN "valueDecimal" DECIMAL(18,2);
ALTER TABLE "Payroll" ADD COLUMN "totalValueDecimal" DECIMAL(24,2);
CREATE TABLE "SstBenefitPayrollScope" (
 "payrollId" TEXT PRIMARY KEY REFERENCES "Payroll"(id) ON DELETE RESTRICT,
 "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT,
 "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id) ON DELETE RESTRICT,
 competence TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("budgetUnitId",competence)
);
CREATE TRIGGER sst_payroll_scope_immutable BEFORE UPDATE OR DELETE ON "SstBenefitPayrollScope" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE FUNCTION sst_payroll_scope_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pay "Payroll"%ROWTYPE; month_start DATE; month_next DATE;
BEGIN
 SELECT * INTO pay FROM "Payroll" WHERE id=NEW."payrollId" FOR UPDATE;
 IF pay.status<>'Aberta' OR pay.type<>'Mensal' OR pay.competence<>NEW.competence THEN RAISE EXCEPTION 'Open monthly canonical payroll scope required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=NEW."budgetUnitId" AND "governmentEntityId"=NEW."governmentEntityId") THEN RAISE EXCEPTION 'Verified payroll UG/entity mapping required'; END IF;
 month_start:=to_date('01/'||NEW.competence,'DD/MM/YYYY'); month_next:=(month_start+interval '1 month')::date;
 IF EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."payrollId"=pay.id AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" f WHERE f."employeeId"=i."employeeId" AND f."budgetUnitId"=NEW."budgetUnitId" AND f."governmentEntityId"=NEW."governmentEntityId" AND NOT f.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=month_start AND f."endsAt">=month_next)) THEN RAISE EXCEPTION 'Existing payroll items outside verified functional scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_scope_integrity BEFORE INSERT ON "SstBenefitPayrollScope" FOR EACH ROW EXECUTE FUNCTION sst_payroll_scope_integrity();
CREATE TABLE "SstBenefitPayrollMapping" (
 id TEXT PRIMARY KEY, "planId" TEXT NOT NULL REFERENCES "SstHealthPlan"(id) ON DELETE RESTRICT,
 "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL CHECK ("endsAt">="startsAt"),
 "monthlyRubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"(id) ON DELETE RESTRICT,
 "monthlyEventId" TEXT NOT NULL REFERENCES "PayrollEvent"(id) ON DELETE RESTRICT,
 "extraordinaryRubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"(id) ON DELETE RESTRICT,
 "extraordinaryEventId" TEXT NOT NULL REFERENCES "PayrollEvent"(id) ON DELETE RESTRICT,
 "refundRubricId" TEXT REFERENCES "HrPayrollRubric"(id) ON DELETE RESTRICT,
 "refundEventId" TEXT REFERENCES "PayrollEvent"(id) ON DELETE RESTRICT,
 "contractReference" TEXT NOT NULL CHECK(length(trim("contractReference"))>=3), "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("planId","startsAt"), CHECK ("monthlyRubricId"<>"extraordinaryRubricId"),
 CHECK ("monthlyEventId"<>"extraordinaryEventId"), CHECK (("refundRubricId" IS NULL)=("refundEventId" IS NULL))
);
CREATE TABLE "SstBenefitPayrollOrigin" (
 id TEXT PRIMARY KEY, "entryId" TEXT NOT NULL UNIQUE REFERENCES "SstBenefitEntry"(id) ON DELETE RESTRICT,
 "payrollItemId" TEXT NOT NULL UNIQUE REFERENCES "PayrollItem"(id) ON DELETE RESTRICT,
 "functionalPeriodId" TEXT NOT NULL REFERENCES "HrEmployeeFunctionalPeriod"(id) ON DELETE RESTRICT,
 "mappingId" TEXT REFERENCES "SstBenefitPayrollMapping"(id) ON DELETE RESTRICT,
 "rubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"(id) ON DELETE RESTRICT,
 snapshot JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SstBenefitCancellation" (
 id TEXT PRIMARY KEY, "entryId" TEXT NOT NULL UNIQUE REFERENCES "SstBenefitEntry"(id) ON DELETE RESTRICT,
 "compensationEntryId" TEXT NOT NULL UNIQUE REFERENCES "SstBenefitEntry"(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(trim(reason))>=10), "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER sst_payroll_mapping_immutable BEFORE UPDATE OR DELETE ON "SstBenefitPayrollMapping" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE TRIGGER sst_payroll_origin_immutable BEFORE UPDATE OR DELETE ON "SstBenefitPayrollOrigin" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE TRIGGER sst_benefit_cancellation_immutable BEFORE UPDATE OR DELETE ON "SstBenefitCancellation" FOR EACH ROW EXECUTE FUNCTION sst_benefit_immutable();
CREATE FUNCTION sst_payroll_mapping_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('SST_PAYROLL_MAPPING:'||NEW."planId"));
 IF EXISTS(SELECT 1 FROM "SstBenefitPayrollMapping" WHERE "planId"=NEW."planId" AND "startsAt"<=NEW."endsAt" AND "endsAt">=NEW."startsAt") THEN RAISE EXCEPTION 'Payroll mapping periods overlap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_mapping_period BEFORE INSERT ON "SstBenefitPayrollMapping" FOR EACH ROW EXECUTE FUNCTION sst_payroll_mapping_period();

CREATE FUNCTION sst_payroll_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_payroll TEXT; state TEXT;
BEGIN
 target_payroll := CASE WHEN TG_OP='INSERT' THEN NEW."payrollId" ELSE OLD."payrollId" END;
 SELECT status INTO state FROM "Payroll" WHERE id=target_payroll FOR UPDATE;
 IF state<>'Aberta' THEN RAISE EXCEPTION 'PAYROLL_CLOSED'; END IF;
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" WHERE "payrollItemId"=OLD.id) THEN RAISE EXCEPTION 'SST payroll item immutable; append compensatory ledger'; END IF;
 IF TG_OP='UPDATE' AND NEW."payrollId"<>OLD."payrollId" THEN
   SELECT status INTO state FROM "Payroll" WHERE id=NEW."payrollId" FOR UPDATE;
   IF state<>'Aberta' THEN RAISE EXCEPTION 'PAYROLL_CLOSED'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM "SstBenefitPayrollScope" ps JOIN "Payroll" p ON p.id=ps."payrollId" WHERE ps."payrollId"=NEW."payrollId" AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" f WHERE f."employeeId"=NEW."employeeId" AND f."budgetUnitId"=ps."budgetUnitId" AND f."governmentEntityId"=ps."governmentEntityId" AND NOT f.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=to_date('01/'||p.competence,'DD/MM/YYYY') AND f."endsAt">=(to_date('01/'||p.competence,'DD/MM/YYYY')+interval '1 month'))) THEN RAISE EXCEPTION 'Payroll item outside verified functional scope'; END IF;
 IF NEW."valueDecimal" IS NOT NULL AND (NEW."valueDecimal"<0 OR NEW.value::text::numeric<>NEW."valueDecimal") THEN RAISE EXCEPTION 'FLOAT_PROJECTION_UNSAFE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_item_guard BEFORE INSERT OR UPDATE OR DELETE ON "PayrollItem" FOR EACH ROW EXECUTE FUNCTION sst_payroll_item_guard();

CREATE FUNCTION sst_payroll_header_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_total NUMERIC;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "SstBenefitPayrollScope" WHERE "payrollId"=OLD.id) THEN
   IF (NEW.competence,NEW.type) IS DISTINCT FROM (OLD.competence,OLD.type) THEN RAISE EXCEPTION 'Payroll verified scope competence immutable'; END IF;
   IF OLD.status='Aberta' AND NEW.status<>'Aberta' AND EXISTS(SELECT 1 FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "SstHealthPlan" hp ON hp.id=b."planId" JOIN "SstBenefitPayrollScope" ps ON ps."payrollId"=OLD.id AND ps."budgetUnitId"=hp."budgetUnitId" WHERE e.competence=OLD.competence AND NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o WHERE o."entryId"=e.id AND EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i.id=o."payrollItemId" AND i."payrollId"=OLD.id))) THEN RAISE EXCEPTION 'UNPOSTED_CANONICAL_BENEFITS_REQUIRE_RECONCILIATION'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" WHERE i."payrollId"=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payroll with canonical origins cannot be deleted'; END IF;
   IF (NEW.competence,NEW.type) IS DISTINCT FROM (OLD.competence,OLD.type) THEN RAISE EXCEPTION 'Payroll origin competence immutable'; END IF;
   IF OLD.status<>'Aberta' AND (NEW.status,NEW."totalValue",NEW."totalValueDecimal") IS DISTINCT FROM (OLD.status,OLD."totalValue",OLD."totalValueDecimal") AND NOT(OLD.status='Fechada' AND NEW.status='Paga' AND NEW."totalValue"=OLD."totalValue" AND NEW."totalValueDecimal"=OLD."totalValueDecimal") THEN RAISE EXCEPTION 'Closed origin payroll requires compensatory open competence'; END IF;
   SELECT COALESCE(SUM(CASE e.type WHEN 'Desconto' THEN -COALESCE(i."valueDecimal",i.value::text::numeric) WHEN 'Vencimento' THEN COALESCE(i."valueDecimal",i.value::text::numeric) ELSE 0 END),0) INTO expected_total FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=OLD.id;
   IF NEW."totalValueDecimal" IS DISTINCT FROM expected_total OR NEW."totalValue"::text::numeric IS DISTINCT FROM expected_total THEN RAISE EXCEPTION 'Authoritative payroll total does not match canonical items'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_header_guard BEFORE UPDATE OR DELETE ON "Payroll" FOR EACH ROW EXECUTE FUNCTION sst_payroll_header_guard();
CREATE FUNCTION sst_payroll_event_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.type,NEW.code) IS DISTINCT FROM (OLD.type,OLD.code) AND EXISTS(SELECT 1 FROM "PayrollItem" i JOIN "SstBenefitPayrollOrigin" o ON o."payrollItemId"=i.id WHERE i."eventId"=OLD.id) THEN RAISE EXCEPTION 'Canonical origin event code/type immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_payroll_event_origin_guard BEFORE UPDATE ON "PayrollEvent" FOR EACH ROW EXECUTE FUNCTION sst_payroll_event_origin_guard();

CREATE FUNCTION sst_recalculate_payroll(payroll_id TEXT) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE state TEXT; total NUMERIC;
BEGIN
 SELECT status INTO state FROM "Payroll" WHERE id=payroll_id FOR UPDATE;
 IF state IS NULL THEN RAISE EXCEPTION 'PAYROLL_NOT_FOUND'; END IF;
 IF state<>'Aberta' THEN RAISE EXCEPTION 'PAYROLL_CLOSED'; END IF;
 IF EXISTS(SELECT 1 FROM "PayrollItem" WHERE "payrollId"=payroll_id AND "valueDecimal" IS NULL AND (value::text IN ('NaN','Infinity','-Infinity') OR value<0 OR value::text::numeric<>round(value::text::numeric,2))) THEN RAISE EXCEPTION 'LEGACY_FLOAT_PRECISION_UNSUPPORTED'; END IF;
 SELECT COALESCE(SUM(CASE e.type WHEN 'Desconto' THEN -COALESCE(i."valueDecimal",i.value::text::numeric) WHEN 'Vencimento' THEN COALESCE(i."valueDecimal",i.value::text::numeric) ELSE 0 END),0) INTO total FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=payroll_id;
 IF total::double precision::text::numeric<>total THEN RAISE EXCEPTION 'FLOAT_TOTAL_PROJECTION_UNSAFE'; END IF;
 UPDATE "Payroll" SET "totalValueDecimal"=total,"totalValue"=total::double precision,"updatedAt"=CURRENT_TIMESTAMP WHERE id=payroll_id;
 RETURN total;
END $$;

-- This is the canonical, transactional posting API: source amounts only, no name/formula guesses.
CREATE FUNCTION sst_post_benefit(entry_id TEXT,payroll_id TEXT,operation_id TEXT,actor_id TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE charge "SstBenefitEntry"%ROWTYPE; beneficiary "SstBenefitBeneficiary"%ROWTYPE; plan "SstHealthPlan"%ROWTYPE;
 pay "Payroll"%ROWTYPE; mapping "SstBenefitPayrollMapping"%ROWTYPE; rubric "HrPayrollRubric"%ROWTYPE; rules "HrPayrollRuleSet"%ROWTYPE;
 functional "HrEmployeeFunctionalPeriod"%ROWTYPE; regime "HrEmploymentRegime"%ROWTYPE; event "PayrollEvent"%ROWTYPE; policy "HrCalculationPolicy"%ROWTYPE;
 employee_id TEXT; existing_item TEXT; existing_payroll TEXT; month_start DATE; month_next DATE; rubric_id TEXT; event_id TEXT; category TEXT; cnt INTEGER; origin_kind TEXT; source_snapshot JSONB; employee_net NUMERIC;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'));
 SELECT * INTO charge FROM "SstBenefitEntry" WHERE id=entry_id FOR UPDATE;
 IF charge.id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('ENTRY_NOT_FOUND')); END IF;
 SELECT * INTO beneficiary FROM "SstBenefitBeneficiary" WHERE id=charge."beneficiaryId";
 SELECT * INTO plan FROM "SstHealthPlan" WHERE id=beneficiary."planId";
 SELECT "employeeId" INTO employee_id FROM "PayrollBenefit" WHERE id=beneficiary."payrollBenefitId";
 -- Same lock as RH history corrections; approvals cannot race regime/UG revisions.
 PERFORM pg_advisory_xact_lock(hashtext('HR_FUNCTIONAL:'||employee_id));
 SELECT * INTO pay FROM "Payroll" WHERE id=payroll_id FOR UPDATE;
 IF pay.id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PAYROLL_NOT_FOUND')); END IF;
 SELECT i.id,i."payrollId" INTO existing_item,existing_payroll FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" WHERE o."entryId"=entry_id;
 IF existing_item IS NOT NULL THEN
   IF existing_payroll<>payroll_id THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('ENTRY_ALREADY_POSTED_TO_OTHER_PAYROLL')); END IF;
   RETURN jsonb_build_object('status','ALREADY_POSTED','payrollItemId',existing_item,'entryId',entry_id,'blockers','[]'::jsonb);
 END IF;
 IF pay.status<>'Aberta' THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PAYROLL_CLOSED')); END IF;
 IF pay.type<>'Mensal' OR pay.competence<>charge.competence THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PAYROLL_COMPETENCE_OR_TYPE_MISMATCH')); END IF;
 IF EXISTS(SELECT 1 FROM "ConfiguracaoModulo" WHERE codigo='RH' AND ativo=false) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('RH_MODULE_INACTIVE')); END IF;
 month_start:=to_date('01/'||charge.competence,'DD/MM/YYYY'); month_next:=(month_start+interval '1 month')::date;
 SELECT COUNT(*) INTO cnt FROM "HrEmployeeFunctionalPeriod" f WHERE f."employeeId"=employee_id AND f."budgetUnitId"=plan."budgetUnitId" AND NOT f.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=month_start AND f."endsAt">=month_next;
 IF cnt<>1 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('FULL_COMPETENCE_FUNCTIONAL_HISTORY_REQUIRED')); END IF;
 SELECT * INTO functional FROM "HrEmployeeFunctionalPeriod" f WHERE f."employeeId"=employee_id AND f."budgetUnitId"=plan."budgetUnitId" AND NOT f.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=month_start AND f."endsAt">=month_next;
 IF NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollScope" WHERE "payrollId"=payroll_id AND "budgetUnitId"=plan."budgetUnitId" AND "governmentEntityId"=functional."governmentEntityId" AND competence=charge.competence) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED')); END IF;
 SELECT * INTO regime FROM "HrEmploymentRegime" WHERE id=functional."employmentRegimeId" FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtext('SST_PAYROLL_MAPPING:'||plan.id));
 SELECT * INTO mapping FROM "SstBenefitPayrollMapping" WHERE "planId"=plan.id AND "startsAt"<=month_start AND "endsAt">=month_next-1;
 IF charge.kind='REFUND' THEN
   SELECT kind INTO origin_kind FROM "SstBenefitEntry" WHERE id=charge."refundOfId";
   IF NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" WHERE "entryId"=charge."refundOfId") THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('REFUND_CHARGE_NOT_POSTED')); END IF;
   rubric_id:=mapping."refundRubricId"; event_id:=mapping."refundEventId";
   category:=origin_kind;
 ELSE
   category:=charge.kind;
   IF charge.kind='MONTHLY' THEN rubric_id:=COALESCE(mapping."monthlyRubricId",plan."monthlyRubricId"); event_id:=COALESCE(mapping."monthlyEventId",plan."monthlyEventId");
   ELSE rubric_id:=COALESCE(mapping."extraordinaryRubricId",plan."extraordinaryRubricId"); event_id:=COALESCE(mapping."extraordinaryEventId",plan."extraordinaryEventId"); END IF;
 END IF;
 IF rubric_id IS NULL OR event_id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXPLICIT_RUBRIC_EVENT_MAPPING_REQUIRED')); END IF;
 IF EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."payrollId"=payroll_id AND i."employeeId"=employee_id AND i."eventId"=event_id AND NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o WHERE o."payrollItemId"=i.id)) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('UNLINKED_LEGACY_BENEFIT_ITEMS_REQUIRE_RECONCILIATION')); END IF;
 SELECT * INTO rubric FROM "HrPayrollRubric" WHERE id=rubric_id FOR SHARE;
 SELECT * INTO event FROM "PayrollEvent" WHERE id=event_id FOR SHARE;
  IF NOT COALESCE(rubric."isActive",false) OR NOT COALESCE(event."isActive",false) OR rubric."calculationMethod"<>'MANUAL' OR rubric.type<>(CASE WHEN charge.kind='REFUND' THEN 'PROVENTO' ELSE 'DESCONTO' END) OR event.type<>(CASE WHEN charge.kind='REFUND' THEN 'Vencimento' ELSE 'Desconto' END) OR event.formula IS NOT NULL AND trim(event.formula)<>'' THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('MAPPING_TYPE_OR_AMOUNT_POLICY_INVALID')); END IF;
 SELECT * INTO rules FROM "HrPayrollRuleSet" WHERE id=rubric."ruleSetId" FOR SHARE;
 IF NOT COALESCE(regime."isActive",false) OR regime."ruleSetId"<>rules.id OR rules.status<>'ATIVA' OR rules.scope<>'PRODUCAO' OR rules."isDemo" OR rules."approvedAt" IS NULL OR rules."effectiveFrom">month_start OR rules."effectiveUntil" IS NOT NULL AND rules."effectiveUntil"<month_next-1 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('APPROVED_PRODUCTION_REGIME_RULE_SET_REQUIRED')); END IF;
 SELECT * INTO policy FROM "HrCalculationPolicy" WHERE "ruleSetId"=rules.id FOR SHARE;
 IF policy.id IS NULL OR policy.currency<>'BRL' OR policy."roundingScale"<>2 OR policy."negativeNetPayPolicy" NOT IN ('BLOQUEAR','PERMITIR') THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('CANONICAL_CALCULATION_POLICY_REQUIRED')); END IF;
 IF EXISTS(SELECT 1 FROM "PayrollItem" WHERE "payrollId"=payroll_id AND "valueDecimal" IS NULL AND (value::text IN ('NaN','Infinity','-Infinity') OR value<0 OR value::text::numeric<>round(value::text::numeric,2))) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('LEGACY_FLOAT_PRECISION_UNSUPPORTED')); END IF;
 SELECT COALESCE(SUM(CASE ev.type WHEN 'Desconto' THEN -COALESCE(i."valueDecimal",i.value::text::numeric) WHEN 'Vencimento' THEN COALESCE(i."valueDecimal",i.value::text::numeric) ELSE 0 END),0) INTO employee_net FROM "PayrollItem" i JOIN "PayrollEvent" ev ON ev.id=i."eventId" WHERE i."payrollId"=payroll_id AND i."employeeId"=employee_id;
 IF policy."negativeNetPayPolicy"='BLOQUEAR' AND employee_net-charge.amount<0 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('NEGATIVE_NET_PAY_BLOCKED_BY_CANONICAL_POLICY')); END IF;
 IF abs(charge.amount)::double precision::text::numeric<>abs(charge.amount) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('FLOAT_PROJECTION_UNSAFE')); END IF;
 -- Validate all existing items before adding anything; failed recalculation aborts atomically.
 PERFORM sst_recalculate_payroll(payroll_id);
 source_snapshot:=jsonb_build_object('entryId',charge.id,'beneficiaryId',beneficiary.id,'dependentId',beneficiary."dependentId",'employeeId',employee_id,'signedAmount',charge.amount::text,'competence',charge.competence,'category',category,'rubric',to_jsonb(rubric),'event',to_jsonb(event),'ruleSet',to_jsonb(rules),'calculationPolicy',to_jsonb(policy),'regime',to_jsonb(regime),'functionalPeriodId',functional.id,'governmentEntityId',functional."governmentEntityId",'mappingId',mapping.id,'contractReference',COALESCE(mapping."contractReference",plan."contractReference"));
 INSERT INTO "PayrollItem" (id,"payrollId","employeeId","eventId",value,"valueDecimal",reference,"createdAt","updatedAt") VALUES (operation_id||':item',payroll_id,employee_id,event_id,abs(charge.amount)::double precision,abs(charge.amount),'SST:'||charge.id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "SstBenefitPayrollOrigin" (id,"entryId","payrollItemId","functionalPeriodId","mappingId","rubricId",snapshot,"createdById") VALUES (operation_id,charge.id,operation_id||':item',functional.id,mapping.id,rubric.id,source_snapshot,actor_id);
 PERFORM sst_recalculate_payroll(payroll_id);
 INSERT INTO "AuditEvent" (id,"actorUsuarioId","eventType","targetType","targetId","createdAt") VALUES(operation_id||':audit',actor_id,'ADMINISTRATIVE_MUTATION','SST_BENEFIT_PAYROLL_ORIGIN',operation_id,CURRENT_TIMESTAMP);
 RETURN jsonb_build_object('status','POSTED','payrollItemId',operation_id||':item','entryId',charge.id,'blockers','[]'::jsonb);
END $$;

CREATE FUNCTION sst_origin_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "PayrollBenefit" pb ON pb.id=b."payrollBenefitId" JOIN "PayrollItem" i ON i.id=NEW."payrollItemId" JOIN "Payroll" p ON p.id=i."payrollId" JOIN "PayrollEvent" ev ON ev.id=i."eventId" JOIN "HrEmployeeFunctionalPeriod" f ON f.id=NEW."functionalPeriodId" JOIN "SstHealthPlan" hp ON hp.id=b."planId" WHERE e.id=NEW."entryId" AND i."employeeId"=pb."employeeId" AND f."employeeId"=pb."employeeId" AND f."budgetUnitId"=hp."budgetUnitId" AND p.status='Aberta' AND p.competence=e.competence AND i."valueDecimal"=abs(e.amount) AND ev.type=CASE WHEN e.kind='REFUND' THEN 'Vencimento' ELSE 'Desconto' END) THEN RAISE EXCEPTION 'Invalid canonical payroll origin'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_origin_integrity BEFORE INSERT ON "SstBenefitPayrollOrigin" FOR EACH ROW EXECUTE FUNCTION sst_origin_integrity();
CREATE FUNCTION sst_compensation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "SstBenefitEntry" r JOIN "SstBenefitPayrollOrigin" o ON o."entryId"=r.id WHERE r.id=NEW."compensationEntryId" AND r.kind='REFUND' AND r."refundOfId"=NEW."entryId") THEN RAISE EXCEPTION 'Cancellation requires posted compensatory refund'; END IF;
 IF EXISTS(SELECT 1 FROM "SstBenefitEntry" r WHERE r."refundOfId"=NEW."entryId" AND NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o WHERE o."entryId"=r.id)) OR (SELECT COALESCE(-SUM(r.amount),0) FROM "SstBenefitEntry" r WHERE r."refundOfId"=NEW."entryId")<>(SELECT amount FROM "SstBenefitEntry" WHERE id=NEW."entryId") THEN RAISE EXCEPTION 'Cancellation requires fully reconciled posted refunds'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_compensation_integrity BEFORE INSERT ON "SstBenefitCancellation" FOR EACH ROW EXECUTE FUNCTION sst_compensation_integrity();
