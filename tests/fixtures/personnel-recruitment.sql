-- LOCAL TEST ONLY. Applied after all 156 historical migrations, independently
-- of the production mappings. Every historical FK/check/trigger remains active.
-- Physical timestamp-without-time-zone values are UTC in this application.
-- now() is timestamptz, so its implicit cast must use the same convention as
-- the typed column decoder; do not inherit initdb/the host's local time zone.
SET TIME ZONE 'UTC';
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,ativo,"updatedAt") VALUES
 ('recruitment-profile','RECRUITMENT_TEST','Recruitment fixture','{}',true,CURRENT_TIMESTAMP),
 ('recruitment-inactive-profile','RECRUITMENT_INACTIVE_TEST','Inactive fixture','{}',false,CURRENT_TIMESTAMP);
INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('recruitment-person','Identidade civil preservada',CURRENT_TIMESTAMP);
INSERT INTO "Employee" (id,name,"personId","updatedAt") VALUES ('recruitment-employee','Servidor candidato','recruitment-person',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId",ativo,"employeeId","updatedAt") VALUES
 ('recruitment-admin','Administrador','recruitment-admin@example.test','recruitment-profile',true,NULL,CURRENT_TIMESTAMP),
 ('recruitment-reviewer','Revisor','recruitment-reviewer@example.test','recruitment-profile',true,NULL,CURRENT_TIMESTAMP),
 ('recruitment-reviewer-2','Segundo revisor','recruitment-reviewer-2@example.test','recruitment-profile',true,NULL,CURRENT_TIMESTAMP),
 ('recruitment-candidate','Candidato externo','recruitment-candidate@example.test','recruitment-profile',true,NULL,CURRENT_TIMESTAMP),
 ('recruitment-candidate-2','Servidor candidato','recruitment-candidate-2@example.test','recruitment-profile',true,'recruitment-employee',CURRENT_TIMESTAMP),
 ('recruitment-inactive-user','Conta inativa','recruitment-inactive-user@example.test','recruitment-profile',false,NULL,CURRENT_TIMESTAMP),
 ('recruitment-inactive-profile-user','Perfil inativo','recruitment-inactive-profile-user@example.test','recruitment-inactive-profile',true,NULL,CURRENT_TIMESTAMP),
 ('recruitment-audit-fail','Falha tardia local','recruitment-audit-fail@example.test','recruitment-profile',true,NULL,CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt")
 SELECT 'recruitment-page-'||n,'Candidato paginação '||n,'recruitment-page-'||n||'@example.test','recruitment-profile',CURRENT_TIMESTAMP FROM generate_series(1,25) n;
INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES ('recruitment-instance','Município de teste','Município de teste','PR',CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('recruitment-secretariat','Secretaria RH',CURRENT_TIMESTAMP);
INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES
 ('recruitment-ug-a','RECRUIT-A','UG A','recruitment-secretariat',CURRENT_TIMESTAMP),
 ('recruitment-ug-b','RECRUIT-B','UG B','recruitment-secretariat',CURRENT_TIMESTAMP),
 ('recruitment-page-ug-a','RECRUIT-PAGE-A','UG paginação A','recruitment-secretariat',CURRENT_TIMESTAMP),
 ('recruitment-page-ug-b','RECRUIT-PAGE-B','UG paginação B','recruitment-secretariat',CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,status,scope,"isDemo","effectiveFrom","effectiveUntil","updatedAt") VALUES
 ('recruitment-set','recruitment-instance','RECRUITMENT','Recrutamento ativo','ATIVA','PRODUCAO',false,'2000-01-01',NULL,CURRENT_TIMESTAMP),
 ('recruitment-set-finite','recruitment-instance','RECRUITMENT_FINITE','Vigência finita','ATIVA','PRODUCAO',false,'2000-01-01','2199-01-01',CURRENT_TIMESTAMP),
 ('recruitment-set-draft','recruitment-instance','RECRUITMENT_DRAFT','Rascunho','RASCUNHO','PRODUCAO',false,'2000-01-01',NULL,CURRENT_TIMESTAMP),
 ('recruitment-set-future','recruitment-instance','RECRUITMENT_FUTURE','Vigência futura','ATIVA','PRODUCAO',false,'2199-01-01',NULL,CURRENT_TIMESTAMP),
 ('recruitment-set-expired','recruitment-instance','RECRUITMENT_EXPIRED','Vigência encerrada','ATIVA','PRODUCAO',false,'2000-01-01','2001-01-01',CURRENT_TIMESTAMP);
INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"personId","updatedAt") VALUES
 ('recruitment-document','Edital institucional','EDITAL','/fixture/notice.pdf','Válido',NULL,CURRENT_TIMESTAMP),
 ('recruitment-personal-document','Documento individual','EDITAL','/fixture/private.pdf','Válido','recruitment-person',CURRENT_TIMESTAMP),
 ('recruitment-invalid-document','Documento inválido','EDITAL','/fixture/invalid.pdf','Inválido',NULL,CURRENT_TIMESTAMP);
INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256",status) VALUES
 ('recruitment-final','recruitment-document',1,'/fixture/notice.pdf',repeat('a',64),'FINAL'),
 ('recruitment-signed','recruitment-document',2,'/fixture/notice-signed.pdf',repeat('b',64),'SIGNED'),
 ('recruitment-draft','recruitment-document',3,'/fixture/draft.pdf',repeat('c',64),'DRAFT'),
 ('recruitment-personal','recruitment-personal-document',1,'/fixture/private.pdf',repeat('d',64),'FINAL'),
 ('recruitment-invalid','recruitment-invalid-document',1,'/fixture/invalid.pdf',repeat('e',64),'FINAL');

-- Public selection matrix is defined from SQL literals, not a service export.
WITH policy AS (SELECT jsonb_build_object(
 'origin','EDITAL_RECRUTAMENTO','kind','CONCURSO','number','01/2026',
 'budgetUnitId','recruitment-ug-a','documentVersionId','recruitment-final',
 'instructions','Instruções integrais do edital de teste.',
 'startsAt','2000-01-01T00:00:00.000Z','endsAt','2199-01-01T00:00:00.000Z',
 'roles',jsonb_build_array(jsonb_build_object('code','ANALISTA','name','Analista','requirements','Formação superior')),
 'acceptance','Aceito integralmente os termos publicados.') AS value)
INSERT INTO "HrPayrollRule" (id,"ruleSetId",category,code,name,"valueType","isActive",value,"createdAt","updatedAt")
 SELECT 'recruitment-public-'||suffix,set_id,category,'PORTAL_EDITAL_PUBLIC_'||upper(suffix),'Edital '||suffix,value_type,active,
 CASE WHEN suffix='malformed' THEN '{}'::jsonb WHEN suffix='jsonnull' THEN 'null'::jsonb
 ELSE policy.value || patch::jsonb END,'2099-10-20 12:34:56.789',CURRENT_TIMESTAMP
 FROM policy CROSS JOIN (VALUES
 ('final','recruitment-set','PORTAL','JSON',true,'{}'),
 ('signed','recruitment-set','PORTAL','JSON',true,'{"documentVersionId":"recruitment-signed"}'),
 ('finite','recruitment-set-finite','PORTAL','JSON',true,'{}'),
 ('ended','recruitment-set','PORTAL','JSON',true,'{"endsAt":"2001-01-01T00:00:00.000Z"}'),
 ('upcoming','recruitment-set','PORTAL','JSON',true,'{"startsAt":"2198-01-01T00:00:00.000Z"}'),
 ('inactive','recruitment-set','PORTAL','JSON',false,'{}'),
 ('category','recruitment-set','OUTRO','JSON',true,'{}'),
 ('type','recruitment-set','PORTAL','TEXT',true,'{}'),
 ('malformed','recruitment-set','PORTAL','JSON',true,'{}'),
 ('jsonnull','recruitment-set','PORTAL','JSON',true,'{}'),
 ('draftset','recruitment-set-draft','PORTAL','JSON',true,'{}'),
 ('futureset','recruitment-set-future','PORTAL','JSON',true,'{}'),
 ('expiredset','recruitment-set-expired','PORTAL','JSON',true,'{}'),
 ('draftdoc','recruitment-set','PORTAL','JSON',true,'{"documentVersionId":"recruitment-draft"}'),
 ('personaldoc','recruitment-set','PORTAL','JSON',true,'{"documentVersionId":"recruitment-personal"}'),
 ('invaliddoc','recruitment-set','PORTAL','JSON',true,'{"documentVersionId":"recruitment-invalid"}'),
 ('missingdoc','recruitment-set','PORTAL','JSON',true,'{"documentVersionId":"recruitment-missing"}')
 ) AS cases(suffix,set_id,category,value_type,active,patch);

INSERT INTO "HrPayrollRule" (id,"ruleSetId",category,code,name,"valueType",value,"updatedAt") VALUES
 ('recruitment-page-notice','recruitment-set','PORTAL','PORTAL_EDITAL_PAGE','Paginação','JSON','{}',CURRENT_TIMESTAMP);
INSERT INTO "HrRecruitmentApplication" (id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,snapshot,"requestHash","createdAt","decidedAt")
 SELECT 'recruitment-page-application-'||lpad(n::text,2,'0'),'recruitment-page-notice','recruitment-page-'||n,
 lpad(n::text,11,'0'),'ANALISTA',n,
 CASE WHEN n=25 THEN 'null'::jsonb ELSE jsonb_build_object(
   'policy',jsonb_build_object('budgetUnitId',CASE WHEN n<=21 THEN to_jsonb('recruitment-page-ug-a'::text) WHEN n<=23 THEN to_jsonb('recruitment-page-ug-b'::text) ELSE '1'::jsonb END),
   'birthDate','2000-01-02','decimalText','90071992547409.93','optional',NULL) END,
 'historical-page-fixture','2099-10-20 12:34:56.789',CASE WHEN n=1 THEN '2099-10-21 12:34:56.789'::timestamp ELSE NULL END
 FROM generate_series(1,25) n;

-- Additive local fault injector: exercise rollback AFTER the mutation, when
-- audit insertion fails. No production guard or constraint is disabled/changed.
CREATE FUNCTION recruitment_fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."actorUsuarioId"='recruitment-audit-fail' THEN
  RAISE EXCEPTION 'recruitment fixture late audit failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recruitment_fixture_fail_audit BEFORE INSERT ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION recruitment_fixture_fail_audit();

-- The original decision uses PostgreSQL transaction time, not the application's
-- wall clock. Verify that exact value at the write, independently of the ORM
-- and without changing any historical decision/source guard.
CREATE FUNCTION recruitment_fixture_decision_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='RECEBIDA' AND NEW.status IN ('DEFERIDA','INDEFERIDA')
    AND NEW."decidedAt" IS DISTINCT FROM now()::timestamp(3) THEN
   RAISE EXCEPTION 'recruitment fixture decision must use transaction time';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recruitment_fixture_decision_time BEFORE UPDATE ON "HrRecruitmentApplication"
  FOR EACH ROW EXECUTE FUNCTION recruitment_fixture_decision_time();
