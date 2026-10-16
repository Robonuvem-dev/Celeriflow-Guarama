-- Depends on immutable RH history (070000) and canonical decimal payroll/scope (090000).
-- No default tariff, inferred salary formula, live backfill or payment status mutation.
CREATE TABLE "SstLeavePayrollScopeEvidence" (
 id TEXT PRIMARY KEY, "payrollId" TEXT NOT NULL REFERENCES "SstBenefitPayrollScope"("payrollId") ON DELETE RESTRICT,
 "certificateId" TEXT NOT NULL REFERENCES "SstMedicalCertificate"(id) ON DELETE RESTRICT,
 "sourceReference" TEXT NOT NULL CHECK(length(trim("sourceReference"))>=10), "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER sst_leave_scope_evidence_immutable BEFORE UPDATE OR DELETE ON "SstLeavePayrollScopeEvidence" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TABLE "SstLeavePayrollRuleVersion" (
 id TEXT PRIMARY KEY, "ruleId" TEXT NOT NULL REFERENCES "HrPayrollRule"(id) ON DELETE RESTRICT,
 "ruleSetId" TEXT NOT NULL REFERENCES "HrPayrollRuleSet"(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL, snapshot JSONB NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("ruleId",fingerprint)
);
CREATE TABLE "SstLeavePayrollOrigin" (
 id TEXT PRIMARY KEY, "sourceKey" TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('POST','REVERSAL')),
 "certificateId" TEXT NOT NULL REFERENCES "SstMedicalCertificate"(id) ON DELETE RESTRICT,
 "assessmentId" TEXT REFERENCES "SstMedicalAssessment"(id) ON DELETE RESTRICT,
 "decisionRevisionId" TEXT REFERENCES "SstCertificateDecisionRevision"(id) ON DELETE RESTRICT,
 "leaveId" TEXT NOT NULL REFERENCES "Leave"(id) ON DELETE RESTRICT,
 "functionalPeriodId" TEXT NOT NULL REFERENCES "HrEmployeeFunctionalPeriod"(id) ON DELETE RESTRICT,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT,
 "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT,
 "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id) ON DELETE RESTRICT,
 "payrollId" TEXT NOT NULL REFERENCES "Payroll"(id) ON DELETE RESTRICT,
 "payrollItemId" TEXT NOT NULL UNIQUE REFERENCES "PayrollItem"(id) ON DELETE RESTRICT,
 competence TEXT NOT NULL, "ruleVersionId" TEXT NOT NULL REFERENCES "SstLeavePayrollRuleVersion"(id) ON DELETE RESTRICT,
 "rubricId" TEXT NOT NULL REFERENCES "HrPayrollRubric"(id) ON DELETE RESTRICT,
 "reversesId" TEXT UNIQUE REFERENCES "SstLeavePayrollOrigin"(id) ON DELETE RESTRICT,
 "attestedMinutes" NUMERIC(24,10) NOT NULL CHECK("attestedMinutes">0), coverage TSMULTIRANGE NOT NULL,
 "amountDecimal" NUMERIC(18,2) NOT NULL CHECK("amountDecimal">0), "eventType" TEXT NOT NULL CHECK("eventType" IN ('Desconto','Vencimento')),
 snapshot JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(("assessmentId" IS NULL) <> ("decisionRevisionId" IS NULL)), CHECK((kind='REVERSAL')=("reversesId" IS NOT NULL))
);
CREATE INDEX sst_leave_origin_worker_competence ON "SstLeavePayrollOrigin"("employeeId",competence,kind);
CREATE TRIGGER sst_leave_rule_version_immutable BEFORE UPDATE OR DELETE ON "SstLeavePayrollRuleVersion" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();
CREATE TRIGGER sst_leave_origin_immutable BEFORE UPDATE OR DELETE ON "SstLeavePayrollOrigin" FOR EACH ROW EXECUTE FUNCTION sst_foundational_immutable();

CREATE FUNCTION sst_post_certificate_leave(certificate_id TEXT,payroll_id TEXT,rule_id TEXT,operation_id TEXT,actor_id TEXT,reverse_origin_id TEXT DEFAULT NULL,reverse_reason TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE cert "SstMedicalCertificate"%ROWTYPE; leave_row "Leave"%ROWTYPE; functional "HrEmployeeFunctionalPeriod"%ROWTYPE;
 pay "Payroll"%ROWTYPE; regime "HrEmploymentRegime"%ROWTYPE; rule "HrPayrollRule"%ROWTYPE; rules "HrPayrollRuleSet"%ROWTYPE;
 rubric "HrPayrollRubric"%ROWTYPE; event "PayrollEvent"%ROWTYPE; calc_policy "HrCalculationPolicy"%ROWTYPE;
 original "SstLeavePayrollOrigin"%ROWTYPE; existing "SstLeavePayrollOrigin"%ROWTYPE;
 policy JSONB; monetary JSONB; frozen JSONB; fp TEXT; version_id TEXT; decision_id TEXT; assessment_id TEXT; origin_key TEXT;
 rubric_id TEXT; event_id TEXT; source_leave_id TEXT; expected_type TEXT; ranges TSMULTIRANGE; minutes NUMERIC; amount NUMERIC; rate NUMERIC; net NUMERIC;
 month_start TIMESTAMP; month_next TIMESTAMP; clipped_start TIMESTAMP; clipped_end TIMESTAMP; source_employee TEXT; cnt INTEGER;
BEGIN
 -- Ordering matches clinical decision changes, then F7 global lock and RH history lock.
 SELECT * INTO cert FROM "SstMedicalCertificate" WHERE id=certificate_id FOR UPDATE;
 IF cert.id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('CERTIFICATE_NOT_FOUND')); END IF;
 source_employee:=cert."employeeId";
 PERFORM pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'));
 PERFORM pg_advisory_xact_lock(hashtext('HR_FUNCTIONAL:'||source_employee));
 SELECT * INTO pay FROM "Payroll" WHERE id=payroll_id FOR UPDATE;
 IF pay.id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PAYROLL_NOT_FOUND')); END IF;
 IF pay.competence !~ '^(0[1-9]|1[0-2])/[2-9][0-9]{3}$' OR pay.type<>'Mensal' THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('MONTHLY_COMPETENCE_REQUIRED')); END IF;
 month_start:=to_date('01/'||pay.competence,'DD/MM/YYYY')::timestamp;
 month_next:=month_start+interval '1 month';
 IF reverse_origin_id IS NULL THEN
   IF cert.status<>'APPROVED' OR cert."leaveId" IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('APPROVED_LINKED_LEAVE_REQUIRED')); END IF;
   SELECT * INTO leave_row FROM "Leave" WHERE id=cert."leaveId";
   IF leave_row.status<>'Ativa' OR leave_row."employeeId"<>source_employee OR leave_row."startDate"<>cert."startsAt" OR leave_row."endDate"<>cert."endsAt" THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('CANONICAL_LEAVE_PERIOD_MISMATCH')); END IF;
   source_leave_id:=leave_row.id;
   SELECT id INTO decision_id FROM "SstCertificateDecisionRevision" WHERE "certificateId"=cert.id AND decision='APPROVED' AND "newLeaveId"=leave_row.id ORDER BY revision DESC LIMIT 1;
   IF decision_id IS NULL THEN SELECT id INTO assessment_id FROM "SstMedicalAssessment" WHERE "certificateId"=cert.id AND decision='APPROVED' ORDER BY "assessedAt",id LIMIT 1; END IF;
   IF decision_id IS NULL AND assessment_id IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('IMMUTABLE_APPROVED_DECISION_REQUIRED')); END IF;
   origin_key:=cert.id||':'||COALESCE(decision_id,assessment_id)||':'||leave_row.id||':'||pay.competence;
 ELSE
   SELECT * INTO original FROM "SstLeavePayrollOrigin" WHERE id=reverse_origin_id AND kind='POST' AND "certificateId"=cert.id;
   IF original.id IS NULL OR length(trim(COALESCE(reverse_reason,'')))<10 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('POSTED_ORIGIN_AND_REVERSAL_REASON_REQUIRED')); END IF;
   source_leave_id:=original."leaveId"; decision_id:=original."decisionRevisionId"; assessment_id:=original."assessmentId";
   SELECT * INTO leave_row FROM "Leave" WHERE id=source_leave_id;
   origin_key:='REVERSE:'||original.id;
 END IF;
 SELECT * INTO existing FROM "SstLeavePayrollOrigin" WHERE "sourceKey"=origin_key;
 IF existing.id IS NOT NULL THEN
   IF existing."payrollId"<>payroll_id THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('SOURCE_ALREADY_POSTED_TO_OTHER_PAYROLL')); END IF;
   IF NOT EXISTS(SELECT 1 FROM "SstLeavePayrollRuleVersion" WHERE id=existing."ruleVersionId" AND "ruleId"=rule_id) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('REPLAY_RULE_MISMATCH')); END IF;
   RETURN jsonb_build_object('status','ALREADY_POSTED','originId',existing.id,'payrollItemId',existing."payrollItemId",'amount',existing."amountDecimal"::text,'blockers','[]'::jsonb);
 END IF;
 IF pay.status<>'Aberta' THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PAYROLL_CLOSED')); END IF;
 IF EXISTS(SELECT 1 FROM "ConfiguracaoModulo" WHERE codigo IN ('RH','SST') AND ativo=false) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('MODULE_INACTIVE')); END IF;
 SELECT * INTO functional FROM "HrEmployeeFunctionalPeriod" f WHERE f."employeeId"=source_employee AND f."budgetUnitId"=cert."budgetUnitId" AND NOT f.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=f.id) AND f."startsAt"<=month_start AND f."endsAt">=month_next;
 IF functional.id IS NULL OR NOT EXISTS(SELECT 1 FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=functional."budgetUnitId" AND "governmentEntityId"=functional."governmentEntityId") THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('VERIFIED_FULL_COMPETENCE_HISTORY_REQUIRED')); END IF;
 IF NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollScope" WHERE "payrollId"=payroll_id AND "budgetUnitId"=cert."budgetUnitId" AND "governmentEntityId"=functional."governmentEntityId" AND competence=pay.competence) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED')); END IF;
 IF reverse_origin_id IS NULL AND NOT EXISTS(SELECT 1 FROM "SstCertificateFunctionalSource" s WHERE s."certificateId"=cert.id AND s."functionalPeriodId"=functional.id AND functional."startsAt"<=cert."startsAt" AND functional."endsAt">=cert."endsAt") THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('ISSUED_FUNCTIONAL_SOURCE_MISMATCH')); END IF;
 IF reverse_origin_id IS NOT NULL AND (original."budgetUnitId"<>functional."budgetUnitId" OR original."governmentEntityId"<>functional."governmentEntityId") THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('COMPENSATION_ENTITY_MISMATCH')); END IF;
 SELECT * INTO regime FROM "HrEmploymentRegime" WHERE id=functional."employmentRegimeId" FOR SHARE;
 SELECT * INTO rule FROM "HrPayrollRule" WHERE id=rule_id FOR SHARE;
 SELECT * INTO rules FROM "HrPayrollRuleSet" WHERE id=rule."ruleSetId" FOR SHARE;
 IF NOT COALESCE(rule."isActive",false) OR rule.category<>'CALCULO' OR rule."valueType"<>'JSON' OR NOT COALESCE(regime."isActive",false) OR rule."ruleSetId"<>regime."ruleSetId" OR rules.status<>'ATIVA' OR rules.scope<>'PRODUCAO' OR rules."isDemo" OR rules."approvedAt" IS NULL OR rules."approvedAt">CURRENT_TIMESTAMP OR rules."effectiveFrom">month_start OR rules."effectiveUntil" IS NOT NULL AND rules."effectiveUntil"<month_next THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('APPROVED_PRODUCTION_REGIME_RULE_REQUIRED')); END IF;
 policy:=rule.value; monetary:=policy->'calculation';
 IF policy->>'originKind' IS DISTINCT FROM 'SST_CERTIFICATE_LEAVE' OR policy->>'effect' IS DISTINCT FROM 'CANONICAL_CALCULATION_REQUIRED' OR jsonb_typeof(policy->'employmentRegimeIds') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'leaveTypes') IS DISTINCT FROM 'array' OR NOT COALESCE(policy->'employmentRegimeIds' ? regime.id,false) OR NOT COALESCE(policy->'leaveTypes' ? leave_row.type,false) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('REGIME_LEAVE_RULE_SCOPE_MISMATCH')); END IF;
 IF jsonb_typeof(monetary) IS DISTINCT FROM 'object' OR monetary->'version' IS DISTINCT FROM '1'::jsonb OR monetary->>'mode' IS DISTINCT FROM 'RATE_PER_ATTESTED_MINUTE' OR monetary->>'currency' IS DISTINCT FROM 'BRL' OR monetary->'rounding'->>'mode' IS DISTINCT FROM 'HALF_UP' OR monetary->'rounding'->'scale' IS DISTINCT FROM '2'::jsonb OR jsonb_typeof(monetary->'rateBRLPerMinute') IS DISTINCT FROM 'string' OR NOT COALESCE(monetary->>'rateBRLPerMinute' ~ '^[0-9]{1,10}(\.[0-9]{1,8})?$',false) OR length(trim(COALESCE(monetary->>'sourceReference','')))<10 OR length(trim(COALESCE(rule."legalReference",'')))<3 OR monetary->>'legalReference' IS DISTINCT FROM rule."legalReference" THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('APPROVED_MONETARY_CALCULATION_REQUIRED')); END IF;
 rate:=(monetary->>'rateBRLPerMinute')::numeric;
 IF rate<=0 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXPLICIT_POSITIVE_RATE_REQUIRED')); END IF;
 SELECT * INTO calc_policy FROM "HrCalculationPolicy" WHERE "ruleSetId"=rules.id FOR SHARE;
 IF calc_policy.id IS NULL OR calc_policy.currency<>'BRL' OR calc_policy."roundingMode"<>'HALF_UP' OR calc_policy."roundingScale"<>2 OR calc_policy."negativeNetPayPolicy" NOT IN ('BLOQUEAR','PERMITIR') THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('MATCHING_CANONICAL_CURRENCY_ROUNDING_REQUIRED')); END IF;
 IF reverse_origin_id IS NULL THEN
   rubric_id:=policy->>'rubricId'; event_id:=policy->>'eventId';
   clipped_start:=GREATEST(cert."startsAt",month_start AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC');
   clipped_end:=LEAST(cert."endsAt",month_next AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC');
   IF clipped_start>=clipped_end THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('LEAVE_OUTSIDE_COMPETENCE')); END IF;
   SELECT range_agg(tsrange(GREATEST(s."startsAt",clipped_start),LEAST(s."endsAt",clipped_end),'[)')) INTO ranges FROM "SstPlannedShift" s WHERE s."employeeId"=source_employee AND s."budgetUnitId"=cert."budgetUnitId" AND s."startsAt"<clipped_end AND s."endsAt">clipped_start;
   IF ranges IS NULL THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('PLANNED_SHIFT_SOURCE_MISSING')); END IF;
   IF EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o WHERE o.kind='POST' AND o."employeeId"=source_employee AND o.competence=pay.competence AND o.coverage && ranges AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" r WHERE r."reversesId"=o.id)) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('OVERLAPPING_ATTESTED_ORIGIN_REQUIRES_RECONCILIATION')); END IF;
   SELECT SUM(EXTRACT(EPOCH FROM upper(r)-lower(r))::numeric/60) INTO minutes FROM unnest(ranges) r;
   amount:=round(rate*minutes,2);
 ELSE
   IF policy->'reversal'->>'legalReference' IS DISTINCT FROM rule."legalReference" THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('APPROVED_REVERSAL_MAPPING_REQUIRED')); END IF;
   rubric_id:=policy->'reversal'->>'rubricId'; event_id:=policy->'reversal'->>'eventId';
   ranges:=original.coverage; minutes:=original."attestedMinutes"; amount:=original."amountDecimal";
   expected_type:=CASE original."eventType" WHEN 'Desconto' THEN 'Vencimento' ELSE 'Desconto' END;
 END IF;
 IF amount<=0 OR amount>=10000000000000000 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('ROUNDED_AMOUNT_ZERO_OR_OUT_OF_RANGE')); END IF;
 SELECT * INTO rubric FROM "HrPayrollRubric" WHERE id=rubric_id FOR SHARE;
 SELECT * INTO event FROM "PayrollEvent" WHERE id=event_id FOR SHARE;
 IF NOT COALESCE(rubric."isActive",false) OR rubric."ruleSetId"<>rules.id OR rubric."calculationMethod"<>'MANUAL' OR NOT COALESCE(event."isActive",false) OR rubric.type NOT IN ('DESCONTO','PROVENTO') OR event.type<>(CASE rubric.type WHEN 'DESCONTO' THEN 'Desconto' ELSE 'Vencimento' END) OR COALESCE(trim(event.formula),'')<>'' OR reverse_origin_id IS NOT NULL AND event.type<>expected_type THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXPLICIT_COMPATIBLE_RUBRIC_EVENT_REQUIRED')); END IF;
 IF EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."employeeId"=source_employee AND i."eventId"=event_id AND i."payrollId"=payroll_id AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o WHERE o."payrollItemId"=i.id)) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('EXISTING_CALCULATED_EVENT_REQUIRES_RECONCILIATION')); END IF;
 IF reverse_origin_id IS NULL AND EXISTS(SELECT 1 FROM "Payroll" p JOIN "PayrollItem" i ON i."payrollId"=p.id WHERE p.competence=pay.competence AND p.status IN ('Fechada','Paga') AND i."employeeId"=source_employee) THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('CLOSED_COMPETENCE_RECONCILIATION_REQUIRED')); END IF;
 SELECT COALESCE(SUM(CASE e.type WHEN 'Desconto' THEN -COALESCE(i."valueDecimal",i.value::text::numeric) WHEN 'Vencimento' THEN COALESCE(i."valueDecimal",i.value::text::numeric) ELSE 0 END),0) INTO net FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=payroll_id AND i."employeeId"=source_employee;
 IF calc_policy."negativeNetPayPolicy"='BLOQUEAR' AND net+(CASE event.type WHEN 'Desconto' THEN -amount ELSE amount END)<0 THEN RETURN jsonb_build_object('status','BLOCKED','blockers',jsonb_build_array('NEGATIVE_NET_PAY_BLOCKED_BY_CANONICAL_POLICY')); END IF;
 IF amount::double precision::text::numeric<>amount THEN RAISE EXCEPTION 'FLOAT_PROJECTION_UNSAFE'; END IF;
 -- All writes happen only after validation; any error in recalculation/integrity rolls back the transaction.
 PERFORM sst_recalculate_payroll(payroll_id);
 frozen:=jsonb_build_object('rule',to_jsonb(rule),'ruleSet',to_jsonb(rules),'calculationPolicy',to_jsonb(calc_policy),'rubric',to_jsonb(rubric),'event',to_jsonb(event),'regime',to_jsonb(regime));
 fp:=md5(frozen::text); version_id:=rule.id||':'||fp;
 IF EXISTS(SELECT 1 FROM "SstLeavePayrollRuleVersion" WHERE id=version_id AND snapshot IS DISTINCT FROM frozen) THEN RAISE EXCEPTION 'Frozen monetary rule fingerprint collision'; END IF;
 INSERT INTO "SstLeavePayrollRuleVersion" (id,"ruleId","ruleSetId",fingerprint,snapshot,"createdById") VALUES(version_id,rule.id,rules.id,fp,frozen,actor_id) ON CONFLICT("ruleId",fingerprint) DO NOTHING;
 INSERT INTO "PayrollItem" (id,"payrollId","employeeId","eventId",value,"valueDecimal",reference,"createdAt","updatedAt") VALUES(operation_id||':item',payroll_id,source_employee,event.id,amount::double precision,amount,'SST_LEAVE:'||operation_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO "SstLeavePayrollOrigin" (id,"sourceKey",kind,"certificateId","assessmentId","decisionRevisionId","leaveId","functionalPeriodId","employeeId","budgetUnitId","governmentEntityId","payrollId","payrollItemId",competence,"ruleVersionId","rubricId","reversesId","attestedMinutes",coverage,"amountDecimal","eventType",snapshot,"createdById") VALUES(operation_id,origin_key,CASE WHEN reverse_origin_id IS NULL THEN 'POST' ELSE 'REVERSAL' END,cert.id,assessment_id,decision_id,source_leave_id,functional.id,source_employee,cert."budgetUnitId",functional."governmentEntityId",payroll_id,operation_id||':item',pay.competence,version_id,rubric.id,reverse_origin_id,minutes,ranges,amount,event.type,jsonb_build_object('sourceKey',origin_key,'sourceReference',monetary->>'sourceReference','legalReference',rule."legalReference",'calculation',monetary,'reversalReason',reverse_reason,'originalOriginId',reverse_origin_id,'amountBRL',amount::text,'attestedMinutes',minutes::text,'coverage',ranges::text),actor_id);
 PERFORM sst_recalculate_payroll(payroll_id);
 INSERT INTO "AuditEvent" (id,"actorUsuarioId","eventType","targetType","targetId","createdAt") VALUES(operation_id||':audit',actor_id,'ADMINISTRATIVE_MUTATION','SST_LEAVE_PAYROLL_ORIGIN',operation_id,CURRENT_TIMESTAMP);
 RETURN jsonb_build_object('status','POSTED','originId',operation_id,'payrollItemId',operation_id||':item','amount',amount::text,'blockers','[]'::jsonb);
END $$;

CREATE FUNCTION sst_leave_origin_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config JSONB; covered_minutes NUMERIC;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "PayrollItem" i JOIN "Payroll" p ON p.id=i."payrollId" JOIN "PayrollEvent" e ON e.id=i."eventId" JOIN "SstBenefitPayrollScope" s ON s."payrollId"=p.id JOIN "HrEmployeeFunctionalPeriod" f ON f.id=NEW."functionalPeriodId" JOIN "SstMedicalCertificate" c ON c.id=NEW."certificateId" AND c."employeeId"=NEW."employeeId" AND c."budgetUnitId"=NEW."budgetUnitId" JOIN "Leave" l ON l.id=NEW."leaveId" AND l."employeeId"=NEW."employeeId" WHERE i.id=NEW."payrollItemId" AND i."payrollId"=NEW."payrollId" AND i."employeeId"=NEW."employeeId" AND i."valueDecimal"=NEW."amountDecimal" AND e.type=NEW."eventType" AND p.status='Aberta' AND p.competence=NEW.competence AND s."budgetUnitId"=NEW."budgetUnitId" AND s."governmentEntityId"=NEW."governmentEntityId" AND f."employeeId"=NEW."employeeId" AND f."budgetUnitId"=NEW."budgetUnitId" AND f."governmentEntityId"=NEW."governmentEntityId") THEN RAISE EXCEPTION 'Invalid canonical Leave payroll origin'; END IF;
 IF NEW."assessmentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "SstMedicalAssessment" WHERE id=NEW."assessmentId" AND "certificateId"=NEW."certificateId" AND decision='APPROVED') OR NEW."decisionRevisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "SstCertificateDecisionRevision" WHERE id=NEW."decisionRevisionId" AND "certificateId"=NEW."certificateId" AND decision='APPROVED' AND "newLeaveId"=NEW."leaveId") THEN RAISE EXCEPTION 'Immutable approved decision origin required'; END IF;
 IF NEW.kind='REVERSAL' AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o WHERE o.id=NEW."reversesId" AND o.kind='POST' AND o."certificateId"=NEW."certificateId" AND o."amountDecimal"=NEW."amountDecimal" AND o.coverage=NEW.coverage AND o."eventType"<>NEW."eventType") THEN RAISE EXCEPTION 'Exact compensatory origin required'; END IF;
 IF NEW.kind='POST' THEN
   SELECT snapshot->'rule'->'value'->'calculation' INTO config FROM "SstLeavePayrollRuleVersion" WHERE id=NEW."ruleVersionId";
   SELECT SUM(EXTRACT(EPOCH FROM upper(r)-lower(r))::numeric/60) INTO covered_minutes FROM unnest(NEW.coverage) r;
   IF config->>'mode' IS DISTINCT FROM 'RATE_PER_ATTESTED_MINUTE' OR config->>'currency' IS DISTINCT FROM 'BRL' OR NOT COALESCE(config->>'rateBRLPerMinute' ~ '^[0-9]{1,10}(\.[0-9]{1,8})?$',false) OR NEW."attestedMinutes" IS DISTINCT FROM round(covered_minutes,10) OR NEW."amountDecimal" IS DISTINCT FROM round((config->>'rateBRLPerMinute')::numeric*covered_minutes,2) THEN RAISE EXCEPTION 'Amount must match exact frozen approved monetary calculation'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sst_leave_origin_integrity BEFORE INSERT ON "SstLeavePayrollOrigin" FOR EACH ROW EXECUTE FUNCTION sst_leave_origin_integrity();
CREATE FUNCTION sst_leave_payroll_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" WHERE "payrollItemId"=OLD.id) THEN RAISE EXCEPTION 'Leave payroll item immutable; append approved compensation'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER sst_leave_payroll_item_guard BEFORE UPDATE OR DELETE ON "PayrollItem" FOR EACH ROW EXECUTE FUNCTION sst_leave_payroll_item_guard();
CREATE FUNCTION sst_leave_payroll_header_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected NUMERIC;
BEGIN
 IF EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" WHERE "payrollId"=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payroll with Leave origins cannot be deleted'; END IF;
  IF (NEW.competence,NEW.type) IS DISTINCT FROM (OLD.competence,OLD.type) THEN RAISE EXCEPTION 'Leave payroll competence immutable'; END IF;
  IF OLD.status<>'Aberta' AND (NEW.status,NEW."totalValue",NEW."totalValueDecimal") IS DISTINCT FROM (OLD.status,OLD."totalValue",OLD."totalValueDecimal") AND NOT(OLD.status='Fechada' AND NEW.status='Paga' AND NEW."totalValue"=OLD."totalValue" AND NEW."totalValueDecimal"=OLD."totalValueDecimal") THEN RAISE EXCEPTION 'Closed Leave payroll requires compensatory open competence'; END IF;
  SELECT COALESCE(SUM(CASE e.type WHEN 'Desconto' THEN -COALESCE(i."valueDecimal",i.value::text::numeric) WHEN 'Vencimento' THEN COALESCE(i."valueDecimal",i.value::text::numeric) ELSE 0 END),0) INTO expected FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=OLD.id;
  IF NEW."totalValueDecimal" IS DISTINCT FROM expected OR NEW."totalValue"::text::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Authoritative Leave payroll total mismatch'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER sst_leave_payroll_header_guard BEFORE UPDATE OR DELETE ON "Payroll" FOR EACH ROW EXECUTE FUNCTION sst_leave_payroll_header_guard();
CREATE FUNCTION sst_leave_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF (NEW.code,NEW.type) IS DISTINCT FROM (OLD.code,OLD.type) AND EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" WHERE i."eventId"=OLD.id) THEN RAISE EXCEPTION 'Leave origin event code/type immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER sst_leave_event_guard BEFORE UPDATE ON "PayrollEvent" FOR EACH ROW EXECUTE FUNCTION sst_leave_event_guard();
CREATE FUNCTION sst_leave_decision_financial_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF (NEW.status,NEW."leaveId") IS DISTINCT FROM (OLD.status,OLD."leaveId") AND EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o WHERE o."certificateId"=OLD.id AND o.kind='POST' AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" r WHERE r."reversesId"=o.id)) THEN RAISE EXCEPTION 'Active Leave financial origins require approved compensation before decision change'; END IF; RETURN NEW; END $$;
CREATE TRIGGER sst_leave_decision_financial_guard BEFORE UPDATE ON "SstMedicalCertificate" FOR EACH ROW EXECUTE FUNCTION sst_leave_decision_financial_guard();
