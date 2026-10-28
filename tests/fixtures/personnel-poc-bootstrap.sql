-- LOCAL TEST ONLY. Prerequisites after all 156 immutable historical migrations.
-- No production table/constraint/guard is replaced, disabled or synthesized.
SET TIME ZONE 'UTC';
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES
 ('poc-bootstrap-profile','PERSONNEL_POC_BOOTSTRAP_TEST','POC bootstrap fixture','{}',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES
 ('poc-bootstrap-actor','Operador da fixture','poc-bootstrap-actor@example.test','poc-bootstrap-profile',CURRENT_TIMESTAMP),
 ('poc-bootstrap-other','Segundo operador da fixture','poc-bootstrap-other@example.test','poc-bootstrap-profile',CURRENT_TIMESTAMP),
 ('poc-bootstrap-fail-audit','Falha local de auditoria','poc-bootstrap-fail-audit@example.test','poc-bootstrap-profile',CURRENT_TIMESTAMP),
 ('poc-bootstrap-fail-contract','Falha local de revisão','poc-bootstrap-fail-contract@example.test','poc-bootstrap-profile',CURRENT_TIMESTAMP);

-- Fail after every installation row has been attempted, at the final event.
CREATE FUNCTION poc_bootstrap_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sourceKey" LIKE 'POC:PARAMETROS:%' AND current_setting('transaction_timeout')::interval <> interval '60 seconds' THEN
  RAISE EXCEPTION 'poc bootstrap installation must retain the 60 second transaction';
 END IF;
 IF NEW."sourceKey" LIKE 'POC:PARAMETROS:%' AND NEW.payload->>'actorId'='poc-bootstrap-fail-audit' THEN
  RAISE EXCEPTION 'poc bootstrap fixture late audit failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER poc_bootstrap_fixture_audit_failure BEFORE INSERT ON "HrIntegrationEvent"
 FOR EACH ROW EXECUTE FUNCTION poc_bootstrap_fixture_audit_failure();

-- The ninth payroll fails after roles, people, employees and eight payrolls.
CREATE FUNCTION poc_bootstrap_fixture_dataset_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id LIKE 'rh-poc-payroll-v1-%' AND current_setting('transaction_timeout')::interval <> interval '60 seconds' THEN
  RAISE EXCEPTION 'poc bootstrap dataset must retain the 60 second transaction';
 END IF;
 IF NEW.id='rh-poc-payroll-v1-12-2026-8' THEN
  RAISE EXCEPTION 'poc bootstrap fixture late dataset failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER poc_bootstrap_fixture_dataset_failure BEFORE INSERT ON "Payroll"
 FOR EACH ROW EXECUTE FUNCTION poc_bootstrap_fixture_dataset_failure();

-- The third contract's revision fails after two contracts/revisions/invites.
CREATE FUNCTION poc_bootstrap_fixture_contract_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.snapshot->>'registration' LIKE 'POC-V1-%' AND current_setting('transaction_timeout')::interval <> interval '60 seconds' THEN
  RAISE EXCEPTION 'poc bootstrap contract writer must compose the same 60 second transaction';
 END IF;
 IF NEW."actorId"='poc-bootstrap-fail-contract' AND NEW.snapshot->>'registration'='POC-V1-3' THEN
  RAISE EXCEPTION 'poc bootstrap fixture late revision failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER poc_bootstrap_fixture_contract_failure BEFORE INSERT ON "HrEmploymentRevision"
 FOR EACH ROW EXECUTE FUNCTION poc_bootstrap_fixture_contract_failure();
