CREATE TABLE "HrFunctionalRecord" (
  "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL,
  "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT,
  "contractId" TEXT REFERENCES "HrEmploymentContract"("id") ON DELETE RESTRICT,
  "key" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ATIVO', "version" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" IS NULL OR "endsAt">="startsAt"), CHECK ("version">0),
  CHECK ("status" IN ('ATIVO','ENCERRADO','CANCELADO')),
  CHECK (jsonb_typeof("data")='object')
);
CREATE INDEX "HrFunctionalRecord_holder_period_idx" ON "HrFunctionalRecord"("employeeId","kind","startsAt");
CREATE TABLE "HrPersonalRevision" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL, "snapshot" JSONB NOT NULL,
  "actorId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrPersonalRevision_holder_effective_key" UNIQUE ("employeeId","effectiveFrom")
);
CREATE FUNCTION hr_personal_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Revisões cadastrais são imutáveis; registre nova vigência.'; END;
$$;
CREATE TRIGGER "HrPersonalRevision_immutable" BEFORE UPDATE OR DELETE ON "HrPersonalRevision" FOR EACH ROW EXECUTE FUNCTION hr_personal_revision_immutable();

-- Opening observations are current facts, never synthetic historic competencies.
CREATE FUNCTION hr_capture_personal_observation(holder_id TEXT, origin TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed JSONB; prior JSONB; at_time TIMESTAMP(3);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('RH:employee:'||holder_id));
  SELECT jsonb_build_object('employee',to_jsonb(e),'person',to_jsonb(p),
    'addresses',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "Address" a WHERE a."personId"=e."personId"),'[]'::jsonb),
    'documents',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "Document" d WHERE d."personId"=e."personId"),'[]'::jsonb),
    'dependents',coalesce((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('person',(SELECT to_jsonb(dp) FROM "Person" dp WHERE dp.id=d."personId")) ORDER BY d.id) FROM "Dependent" d WHERE d."employeeId"=e.id),'[]'::jsonb),
    'functionalIdentification',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f."startsAt",f.id) FROM "HrFunctionalRecord" f WHERE f."employeeId"=e.id AND f.kind='IDENTIFICACAO_TRABALHISTA'),'[]'::jsonb)) INTO observed
    FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" WHERE e.id=holder_id;
  IF observed IS NULL THEN RETURN; END IF;
  SELECT snapshot INTO prior FROM "HrPersonalRevision" WHERE "employeeId"=holder_id ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1;
  IF prior IS NOT DISTINCT FROM observed THEN RETURN; END IF;
  SELECT greatest(clock_timestamp()::timestamp(3),coalesce(max("effectiveFrom")+interval '1 millisecond',clock_timestamp()::timestamp(3))) INTO at_time FROM "HrPersonalRevision" WHERE "employeeId"=holder_id;
  INSERT INTO "HrPersonalRevision" (id,"employeeId","effectiveFrom",snapshot,"actorId",reason)
    VALUES (gen_random_uuid()::text,holder_id,at_time,observed,coalesce(nullif(current_setting('celeriflow.actor_id',true),''),'SISTEMA_BANCO'),origin);
END; $$;
CREATE FUNCTION hr_observe_central_personal_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_row JSONB; new_row JSONB; holder RECORD;
BEGIN
  IF TG_OP<>'INSERT' THEN old_row=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN new_row=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='HrFunctionalRecord' AND coalesce(new_row->>'kind',old_row->>'kind')<>'IDENTIFICACAO_TRABALHISTA' THEN RETURN coalesce(NEW,OLD); END IF;
  FOR holder IN SELECT e.id FROM "Employee" e WHERE
    (TG_TABLE_NAME='Employee' AND e.id IN (old_row->>'id',new_row->>'id')) OR
    (TG_TABLE_NAME='Person' AND (e."personId" IN (old_row->>'id',new_row->>'id') OR EXISTS(SELECT 1 FROM "Dependent" d WHERE d."employeeId"=e.id AND d."personId" IN (old_row->>'id',new_row->>'id')))) OR
    (TG_TABLE_NAME IN ('Address','Document','Dependent') AND (e."personId" IN (old_row->>'personId',new_row->>'personId') OR e.id IN (old_row->>'employeeId',new_row->>'employeeId'))) OR
    (TG_TABLE_NAME='HrFunctionalRecord' AND e.id IN (old_row->>'employeeId',new_row->>'employeeId'))
    ORDER BY e.id
  LOOP PERFORM hr_capture_personal_observation(holder.id,TG_TABLE_NAME||' — '||TG_OP||' — '||TG_WHEN); END LOOP;
  RETURN coalesce(NEW,OLD);
END; $$;
CREATE TRIGGER "Employee_hr_before" BEFORE UPDATE OR DELETE ON "Employee" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Employee_hr_after" AFTER INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Person_hr_before" BEFORE UPDATE OR DELETE ON "Person" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Person_hr_after" AFTER INSERT OR UPDATE ON "Person" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Address_hr_before" BEFORE UPDATE OR DELETE ON "Address" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Address_hr_after" AFTER INSERT OR UPDATE OR DELETE ON "Address" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Document_hr_before" BEFORE UPDATE OR DELETE ON "Document" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Document_hr_after" AFTER INSERT OR UPDATE OR DELETE ON "Document" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Dependent_hr_before" BEFORE UPDATE OR DELETE ON "Dependent" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "Dependent_hr_after" AFTER INSERT OR UPDATE OR DELETE ON "Dependent" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
CREATE TRIGGER "HrFunctionalRecord_identification_after" AFTER INSERT OR UPDATE ON "HrFunctionalRecord" FOR EACH ROW EXECUTE FUNCTION hr_observe_central_personal_change();
SELECT hr_capture_personal_observation(id,'Abertura do histórico cadastral observado') FROM "Employee" ORDER BY id;

CREATE TABLE "HrReferenceRevision" (
  sequence BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,"referenceId" TEXT NOT NULL,kind TEXT NOT NULL,
  operation TEXT NOT NULL,"beforeValue" JSONB,"afterValue" JSONB,"actorId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX "HrReferenceRevision_reference_created_idx" ON "HrReferenceRevision"("referenceId","createdAt");
CREATE INDEX "HrReferenceRevision_kind_created_sequence_idx" ON "HrReferenceRevision"(kind,"createdAt",sequence);
CREATE FUNCTION hr_observe_reference_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "HrReferenceRevision" ("referenceId",kind,operation,"beforeValue","afterValue","actorId") VALUES
    (coalesce(NEW.id,OLD.id),coalesce(NEW.kind,OLD.kind),TG_OP,CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,coalesce(nullif(current_setting('celeriflow.actor_id',true),''),'SISTEMA_BANCO'));
  RETURN coalesce(NEW,OLD);
END; $$;
CREATE TRIGGER "HrReferenceRecord_history" AFTER INSERT OR UPDATE OR DELETE ON "HrReferenceRecord" FOR EACH ROW EXECUTE FUNCTION hr_observe_reference_change();
CREATE TRIGGER "HrReferenceRevision_immutable" BEFORE UPDATE OR DELETE ON "HrReferenceRevision" FOR EACH ROW EXECUTE FUNCTION hr_personal_revision_immutable();
INSERT INTO "HrReferenceRevision" ("referenceId",kind,operation,"afterValue","actorId") SELECT id,kind,'ABERTURA',to_jsonb(r),'SISTEMA_BANCO' FROM "HrReferenceRecord" r ORDER BY id;

-- Configuration openings are observations made now, never backdated to declared validity.
INSERT INTO "HrReferenceRevision" ("referenceId",kind,operation,"afterValue","actorId")
SELECT id,kind,'ABERTURA_CONFIGURACAO',state,'SISTEMA_BANCO' FROM (
  SELECT r.id,'HR_PAYROLL_RULE_SET' kind,to_jsonb(r) state FROM "HrPayrollRuleSet" r
  UNION ALL SELECT r.id,'HR_PAYROLL_RULE',to_jsonb(r) FROM "HrPayrollRule" r
  UNION ALL SELECT r.id,'HR_VACATION_POLICY',to_jsonb(r) FROM "HrVacationPolicy" r
  UNION ALL SELECT r.id,'HR_SOCIAL_SECURITY_SCHEME',to_jsonb(r) FROM "HrSocialSecurityScheme" r
  UNION ALL SELECT r.id,'HR_SOCIAL_SECURITY_BAND',to_jsonb(r) FROM "HrSocialSecurityBand" r
  UNION ALL SELECT r.id,'HR_PAYROLL_RUBRIC',to_jsonb(r)||jsonb_build_object('incidences',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i."incidenceType",i.id) FROM "HrPayrollRubricIncidence" i WHERE i."rubricId"=r.id),'[]'::jsonb)) FROM "HrPayrollRubric" r
) configuration_openings ORDER BY kind,id;

CREATE FUNCTION hr_observe_payroll_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE holder_id TEXT; entity_kind TEXT; before_state JSONB; after_state JSONB;
BEGIN
  IF TG_TABLE_NAME='HrPayrollRubricIncidence' THEN
    holder_id=coalesce(NEW."rubricId",OLD."rubricId"); entity_kind='HR_PAYROLL_RUBRIC';
    SELECT to_jsonb(r)||jsonb_build_object('incidences',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i."incidenceType",i.id) FROM "HrPayrollRubricIncidence" i WHERE i."rubricId"=r.id),'[]'::jsonb)) INTO after_state FROM "HrPayrollRubric" r WHERE r.id=holder_id;
    IF after_state IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
  ELSE
    holder_id=coalesce(NEW.id,OLD.id);
    entity_kind=CASE TG_TABLE_NAME WHEN 'HrPayrollRuleSet' THEN 'HR_PAYROLL_RULE_SET' WHEN 'HrPayrollRule' THEN 'HR_PAYROLL_RULE' WHEN 'HrVacationPolicy' THEN 'HR_VACATION_POLICY' WHEN 'HrSocialSecurityScheme' THEN 'HR_SOCIAL_SECURITY_SCHEME' WHEN 'HrSocialSecurityBand' THEN 'HR_SOCIAL_SECURITY_BAND' ELSE 'HR_PAYROLL_RUBRIC' END;
    IF TG_OP<>'INSERT' THEN before_state=to_jsonb(OLD); END IF;
    IF TG_OP<>'DELETE' THEN after_state=to_jsonb(NEW); END IF;
    IF TG_TABLE_NAME='HrPayrollRubric' AND after_state IS NOT NULL THEN
      after_state=after_state||jsonb_build_object('incidences',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i."incidenceType",i.id) FROM "HrPayrollRubricIncidence" i WHERE i."rubricId"=holder_id),'[]'::jsonb));
    END IF;
  END IF;
  INSERT INTO "HrReferenceRevision" ("referenceId",kind,operation,"beforeValue","afterValue","actorId") VALUES (holder_id,entity_kind,'CONFIGURACAO_'||TG_OP,before_state,after_state,coalesce(nullif(current_setting('celeriflow.actor_id',true),''),'SISTEMA_BANCO'));
  RETURN coalesce(NEW,OLD);
END; $$;
CREATE TRIGGER "HrPayrollRuleSet_history" AFTER INSERT OR UPDATE OR DELETE ON "HrPayrollRuleSet" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrPayrollRule_history" AFTER INSERT OR UPDATE OR DELETE ON "HrPayrollRule" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrVacationPolicy_history" AFTER INSERT OR UPDATE OR DELETE ON "HrVacationPolicy" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrPayrollRubric_history" AFTER INSERT OR UPDATE OR DELETE ON "HrPayrollRubric" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrPayrollRubricIncidence_history" AFTER INSERT OR UPDATE OR DELETE ON "HrPayrollRubricIncidence" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrSocialSecurityScheme_history" AFTER INSERT OR UPDATE OR DELETE ON "HrSocialSecurityScheme" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();
CREATE TRIGGER "HrSocialSecurityBand_history" AFTER INSERT OR UPDATE OR DELETE ON "HrSocialSecurityBand" FOR EACH ROW EXECUTE FUNCTION hr_observe_payroll_configuration();

CREATE FUNCTION hr_observe_functional_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "HrReferenceRevision" ("referenceId",kind,operation,"beforeValue","afterValue","actorId") VALUES
    (coalesce(NEW.id,OLD.id),'HR_FUNCTIONAL_RECORD',TG_OP,CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,coalesce(nullif(current_setting('celeriflow.actor_id',true),''),'SISTEMA_BANCO'));
  RETURN coalesce(NEW,OLD);
END; $$;
CREATE TRIGGER "HrFunctionalRecord_history" AFTER INSERT OR UPDATE OR DELETE ON "HrFunctionalRecord" FOR EACH ROW EXECUTE FUNCTION hr_observe_functional_record();

CREATE SEQUENCE "HrTimeCertificate_number_seq";
CREATE TABLE "HrTimeCertificate" (
  id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,"requestKey" TEXT NOT NULL UNIQUE,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT,"referenceDate" TIMESTAMP(3) NOT NULL,
  issuer TEXT NOT NULL,responsible TEXT NOT NULL,purpose TEXT NOT NULL,"legalReference" TEXT NOT NULL,"actorId" TEXT NOT NULL,
  snapshot JSONB NOT NULL,"snapshotHash" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "HrTimeCertificate_immutable" BEFORE UPDATE OR DELETE ON "HrTimeCertificate" FOR EACH ROW EXECUTE FUNCTION hr_personal_revision_immutable();

CREATE SEQUENCE "HrRetirementAssessment_number_seq";
CREATE TABLE "HrRetirementAssessment" (
  id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,"requestKey" TEXT NOT NULL UNIQUE,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT,
  "contractId" TEXT NOT NULL REFERENCES "HrEmploymentContract"(id) ON DELETE RESTRICT,
  "referenceDate" TIMESTAMP(3) NOT NULL,"ruleId" TEXT NOT NULL,
  issuer TEXT NOT NULL,responsible TEXT NOT NULL,"legalReference" TEXT NOT NULL,"actorId" TEXT NOT NULL,
  amount TEXT NOT NULL CHECK(amount ~ '^[0-9]+[.][0-9]{2}$'),snapshot JSONB NOT NULL,"snapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "HrRetirementAssessment_immutable" BEFORE UPDATE OR DELETE ON "HrRetirementAssessment" FOR EACH ROW EXECUTE FUNCTION hr_personal_revision_immutable();

CREATE TABLE "HrPayrollAccountingEvidence" (
  id TEXT PRIMARY KEY,"runId" TEXT NOT NULL UNIQUE REFERENCES "HrPayrollRun"(id) ON DELETE RESTRICT,"requestKey" TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,responsible TEXT NOT NULL,reason TEXT NOT NULL,"actorId" TEXT NOT NULL,
  snapshot JSONB NOT NULL,"snapshotHash" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "HrPayrollAccountingEvidence_immutable" BEFORE UPDATE OR DELETE ON "HrPayrollAccountingEvidence" FOR EACH ROW EXECUTE FUNCTION hr_personal_revision_immutable();
