-- LOCAL TEST ONLY, after all 156 historical migrations. Independent SQL input;
-- historical references, FK/check/immutability guards and writers stay active.
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('ext-profile','EXTERNAL_OPERATIONS_TEST','Fixture','{}',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES
 ('ext-actor','Operador','ext-actor@example.test','ext-profile',CURRENT_TIMESTAMP),
 ('ext-partner','Convenente','ext-partner@example.test','ext-profile',CURRENT_TIMESTAMP),
 ('ext-partner-2','Segundo convenente','ext-partner-2@example.test','ext-profile',CURRENT_TIMESTAMP),
 ('ext-fail-actor','Falha local','ext-fail@example.test','ext-profile',CURRENT_TIMESTAMP),
 ('ext-outsider','Outra conta','ext-outsider@example.test','ext-profile',CURRENT_TIMESTAMP);
INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES ('ext-instance','Município de teste','Município de teste','PR',CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('ext-secretariat-a','Secretaria A',CURRENT_TIMESTAMP),('ext-secretariat-b','Secretaria B',CURRENT_TIMESTAMP);
INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ext-ug-a','EXTERNAL-A','UG A','ext-secretariat-a',CURRENT_TIMESTAMP),('ext-ug-b','EXTERNAL-B','UG B','ext-secretariat-b',CURRENT_TIMESTAMP);
INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('ext-entity','EXTERNAL-TEST','Ente de teste','MUNICIPIO',CURRENT_TIMESTAMP);
INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES ('ext-mapping','ext-ug-b','ext-entity','Fixture SQL independente','ext-actor');
INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('ext-person-a','Titular A',CURRENT_TIMESTAMP),('ext-person-b','Titular B',CURRENT_TIMESTAMP);
INSERT INTO "Employee" (id,name,"personId","secretariatId","isActive","updatedAt") VALUES
 ('ext-employee-a','Titular A','ext-person-a','ext-secretariat-a',true,CURRENT_TIMESTAMP),
 ('ext-employee-b','Titular B','ext-person-b','ext-secretariat-b',true,CURRENT_TIMESTAMP),
 ('ext-employee-inactive','Titular inativo',NULL,'ext-secretariat-a',false,CURRENT_TIMESTAMP);
INSERT INTO "Role" (id,name,"updatedAt") VALUES ('ext-role','Analista',CURRENT_TIMESTAMP);
INSERT INTO "Supplier" (id,"personId",status,"updatedAt") VALUES ('ext-supplier','ext-person-b','Ativo',CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,status,scope,"isDemo","effectiveFrom","effectiveUntil","legalReference","updatedAt") VALUES
 ('ext-set','ext-instance','EXTERNAL','Ativo','ATIVA','DEMONSTRACAO',true,'2000-01-01','2199-01-01','Ato de teste',CURRENT_TIMESTAMP),
 ('ext-set-draft','ext-instance','EXTERNAL_DRAFT','Rascunho','RASCUNHO','DEMONSTRACAO',true,'2000-01-01',NULL,'Ato de teste',CURRENT_TIMESTAMP),
 ('ext-set-expired','ext-instance','EXTERNAL_EXPIRED','Encerrado','ATIVA','DEMONSTRACAO',true,'2000-01-01','2001-01-01','Ato de teste',CURRENT_TIMESTAMP);
INSERT INTO "HrEmploymentRegime" (id,"ruleSetId",code,name,"employmentNature","isActive","updatedAt") VALUES
 ('ext-regime','ext-set','EFETIVO','Efetivo','EFETIVO',true,CURRENT_TIMESTAMP),
 ('ext-regime-inactive','ext-set','INATIVO','Inativo','EFETIVO',false,CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRubric" (id,"ruleSetId",code,name,type,"calculationMethod","isActive","updatedAt") VALUES
 ('ext-rubric-food','ext-set','FOOD','Alimentação','PROVENTO','MANUAL',true,CURRENT_TIMESTAMP),
 ('ext-rubric-transport','ext-set','VT','Transporte','DESCONTO','MANUAL',true,CURRENT_TIMESTAMP),
 ('ext-rubric-partner','ext-set','PARTNER','Convenente','DESCONTO','MANUAL',true,CURRENT_TIMESTAMP),
 ('ext-rubric-formula','ext-set','FORMULA','Fórmula','PROVENTO','FORMULA_CONTROLADA',true,CURRENT_TIMESTAMP),
 ('ext-rubric-inactive','ext-set','INACTIVE','Inativa','PROVENTO','MANUAL',false,CURRENT_TIMESTAMP);
INSERT INTO "HrEmploymentContract" (id,"employeeId",registration,"regimeId","roleId","workLocation","admittedAt",salary,status,version,details,"updatedAt") VALUES
 ('ext-contract-a','ext-employee-a','EXT-A','ext-regime','ext-role','Sede','2000-01-01',1000,'ATIVO',1,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-second','ext-employee-a','EXT-SECOND','ext-regime','ext-role','Sede','2000-01-01',800,'ATIVO',2,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-b','ext-employee-b','EXT-B','ext-regime','ext-role','Sede','2000-01-01',1000,'ATIVO',1,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-inactive-employee','ext-employee-inactive','EXT-INACTIVE-EMPLOYEE','ext-regime','ext-role','Sede','2000-01-01',1000,'ATIVO',1,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-ended','ext-employee-a','EXT-ENDED','ext-regime','ext-role','Sede','2000-01-01',1000,'ENCERRADO',1,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-inactive-regime','ext-employee-a','EXT-INACTIVE-REGIME','ext-regime-inactive','ext-role','Sede','2000-01-01',1000,'ATIVO',1,'{}',CURRENT_TIMESTAMP),
 ('ext-contract-no-revision','ext-employee-a','EXT-NO-REVISION','ext-regime','ext-role','Sede','2000-01-01',1000,'ATIVO',1,'{}',CURRENT_TIMESTAMP);
-- The revision's dates/Decimal are explicit, independent of Drizzle encoding.
INSERT INTO "HrEmploymentRevision" (id,"contractId",version,"effectiveFrom",snapshot,"actorId",reason)
 SELECT 'ext-revision:'||c.id,c.id,1,'2000-01-01',
 jsonb_build_object('id',c.id,'employeeId',c."employeeId",'registration',c.registration,'regimeId',c."regimeId",'roleId',c."roleId",'departmentId',NULL,'costCenterId',NULL,'workLocation','Sede','salaryLevel',NULL,'admittedAt','2000-01-01T00:00:00.000Z','appointedAt',NULL,'swornAt',NULL,'endsAt',NULL,'monthlyHours',220,'salary',CASE WHEN c.id='ext-contract-second' THEN '500.00' ELSE '1000.00' END,'status',c.status,'version',1,'details',jsonb_build_object('legalReference','Ato de ingresso','metadata',NULL)),
 'ext-actor','Admissão histórica' FROM "HrEmploymentContract" c WHERE c.id LIKE 'ext-contract-%' AND c.id<>'ext-contract-no-revision';
INSERT INTO "HrEmploymentRevision" (id,"contractId",version,"effectiveFrom",snapshot,"actorId",reason)
 SELECT 'ext-revision:future','ext-contract-second',2,'2199-01-01',snapshot||'{"salary":"800.00","version":2}'::jsonb,'ext-actor','Revisão futura preservada' FROM "HrEmploymentRevision" WHERE id='ext-revision:ext-contract-second';
INSERT INTO "BenefitConfig" (id,name,type,"baseValue","isActive","updatedAt") VALUES
 ('ext-food-config','Alimentação','Vale Alimentação',0,true,CURRENT_TIMESTAMP),
 ('ext-custom-config','Individual','Vale Alimentação',0,true,CURRENT_TIMESTAMP),
 ('ext-vt-config','Transporte','Vale Transporte',0,true,CURRENT_TIMESTAMP),
 ('ext-disabled-config','Inativo','Vale Alimentação',0,false,CURRENT_TIMESTAMP),
 ('ext-duplicate-config','Duplicado','Vale Alimentação',0,true,CURRENT_TIMESTAMP);
INSERT INTO "PayrollBenefit" (id,"employeeId","benefitConfigId","customValue",status,"updatedAt") VALUES
 ('ext-food','ext-employee-a','ext-food-config',NULL,'Ativo',CURRENT_TIMESTAMP),
 ('ext-food-inactive','ext-employee-a','ext-food-config',NULL,'Inativo',CURRENT_TIMESTAMP),
 ('ext-custom','ext-employee-a','ext-custom-config',102.35,'Ativo',CURRENT_TIMESTAMP),
 ('ext-vt','ext-employee-a','ext-vt-config',NULL,'Ativo',CURRENT_TIMESTAMP),
 ('ext-disabled','ext-employee-a','ext-disabled-config',NULL,'Ativo',CURRENT_TIMESTAMP),
 ('ext-duplicate-1','ext-employee-a','ext-duplicate-config',NULL,'Ativo',CURRENT_TIMESTAMP),
 ('ext-duplicate-2','ext-employee-a','ext-duplicate-config',NULL,'Ativo',CURRENT_TIMESTAMP);
INSERT INTO "Vacation" (id,"employeeId","acquisitionStart","acquisitionEnd","enjoymentStart","enjoymentEnd",status,"updatedAt") VALUES
 ('ext-vacation','ext-employee-a','2025-01-01','2025-12-31','2026-11-02','2026-11-06','Programada',CURRENT_TIMESTAMP),
 ('ext-vacation-null','ext-employee-a','2026-01-01','2026-12-31',NULL,NULL,'A vencer',CURRENT_TIMESTAMP);
INSERT INTO "Leave" (id,"employeeId",type,"startDate","endDate",status,"updatedAt") VALUES
 ('ext-leave','ext-employee-a','Licença','2026-11-04','2026-11-10','Ativa',CURRENT_TIMESTAMP),
 ('ext-leave-ignored','ext-employee-a','Outro tipo','2026-11-01','2026-11-30','Ativa',CURRENT_TIMESTAMP),
 ('ext-leave-inactive','ext-employee-a','Licença','2026-11-01','2026-11-30','Encerrada',CURRENT_TIMESTAMP);
WITH base AS (SELECT '{"kind":"ALIMENTACAO","benefitConfigId":"ext-food-config","rubricCode":"FOOD","posting":"PROVENTO","dailyValue":"10.01","weekdays":[1,2,3,4,5],"excludeVacation":true,"excludeLeaveTypes":["Licença"],"allowCustomMonthlyValue":false}'::jsonb AS policy)
INSERT INTO "HrPayrollRule" (id,"ruleSetId",code,name,category,"valueType",value,"isActive","updatedAt")
 SELECT 'ext-benefit-'||suffix,set_id,'BENEFIT_'||upper(suffix),'Benefício '||suffix,'CALCULO','JSON',base.policy||patch::jsonb,active,CURRENT_TIMESTAMP FROM base CROSS JOIN (VALUES
 ('food','ext-set',true,'{}'),
 ('custom','ext-set',true,'{"benefitConfigId":"ext-custom-config","allowCustomMonthlyValue":true}'),
 ('customblocked','ext-set',true,'{"benefitConfigId":"ext-custom-config"}'),
 ('transport','ext-set',true,'{"kind":"TRANSPORTE","benefitConfigId":"ext-vt-config","rubricCode":"VT","posting":"DESCONTO","dailyValue":"100.00","maxEmployeeDiscountRate":"6","excludeVacation":false,"excludeLeaveTypes":[]}'),
 ('disabled','ext-set',true,'{"benefitConfigId":"ext-disabled-config"}'),
 ('duplicate','ext-set',true,'{"benefitConfigId":"ext-duplicate-config"}'),
 ('formula','ext-set',true,'{"rubricCode":"FORMULA"}'),
 ('wrongtype','ext-set',true,'{"rubricCode":"VT"}'),
 ('inactive','ext-set',false,'{}'),('draftset','ext-set-draft',true,'{}'),('expiredset','ext-set-expired',true,'{}')
 ) AS cases(suffix,set_id,active,patch);

INSERT INTO "Payroll" (id,competence,type,status,"updatedAt") VALUES
 ('ext-reference','10/2026','Mensal','Fechada',CURRENT_TIMESTAMP),
 ('ext-reference-other','10/2026','Mensal','Aberta',CURRENT_TIMESTAMP),
 ('ext-payroll','11/2026','Mensal','Aberta',CURRENT_TIMESTAMP),
 ('ext-payroll-december','12/2026','Mensal','Aberta',CURRENT_TIMESTAMP),
 ('ext-payroll-other','11/2026','Mensal','Aberta',CURRENT_TIMESTAMP);
-- Scope is created while the payroll is open, then closed legally.
INSERT INTO "SstBenefitPayrollScope" ("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES
 ('ext-reference-other','ext-ug-b','ext-entity','10/2026','ext-actor'),('ext-payroll-other','ext-ug-b','ext-entity','11/2026','ext-actor');
UPDATE "Payroll" SET status='Fechada' WHERE id='ext-reference-other';
INSERT INTO "HrPayrollRun" (id,"payrollId","requestKey",mode,scope,status,"ruleSetId",snapshot,gross,deductions,net,employer,"actorId") VALUES
 ('ext-source-run','ext-reference','ext-source-run','OFICIAL','DEMONSTRACAO','FECHADA','ext-set','{}',1000,0,1000,0,'ext-actor'),
 ('ext-source-run-other','ext-reference-other','ext-source-run-other','OFICIAL','DEMONSTRACAO','FECHADA','ext-set','{}',1000,0,1000,0,'ext-actor');
INSERT INTO "HrPayrollStatement" (id,"runId","contractId",snapshot,gross,deductions,net,employer) VALUES
 ('ext-statement','ext-source-run','ext-contract-a','{"contract":{"movements":[]},"consignmentMargin":{"policy":{"origin":"MARGEM_CONSIGNAVEL","remunerationRubricCodes":["SALARIO"],"compulsoryDeductionRubricCodes":[],"consignmentRubricCodes":["PARTNER"],"legalReference":"Ato de margem"},"rate":"50","remuneration":"1000.00","compulsoryDeductions":"0.00","base":"1000.00","limit":"500.00","used":"0.00","available":"500.00","excess":"0.00","contractIds":["ext-contract-a","ext-contract-second"],"memory":[]}}',1000,0,1000,0);
INSERT INTO "HrPayrollRule" (id,"ruleSetId",code,name,category,"valueType",value,"updatedAt") VALUES
 ('ext-consignment-rule','ext-set','CONSIGNMENT','Consignação','CALCULO','JSON','{"origin":"CONSIGNACAO_CONTRATOS","maxInstallments":12,"referenceValidityMonths":12,"supplierIds":["ext-supplier"],"legalReference":"Ato de consignação"}',CURRENT_TIMESTAMP);
WITH base AS (SELECT '{"origin":"DESCONTOS_CONVENENTES","budgetUnitId":"ext-ug-a","actorUserIds":["ext-partner","ext-partner-2","ext-fail-actor"],"supplierId":"ext-supplier","contractIds":["ext-contract-a","ext-contract-second","ext-contract-b","ext-contract-inactive-employee","ext-contract-ended"],"sourceRunId":"ext-source-run","consignmentRuleId":"ext-consignment-rule","rubricCode":"PARTNER","payrollIds":["ext-payroll","ext-payroll-december","ext-payroll-other"],"instructions":"Orientações integrais do convênio."}'::jsonb AS policy)
INSERT INTO "HrPayrollRule" (id,"ruleSetId",code,name,category,"valueType",value,"isActive","updatedAt")
 SELECT 'ext-grant-'||suffix,set_id,'PORTAL_PARTNER_'||upper(suffix),label,category,'JSON',CASE WHEN suffix='malformed' THEN 'null'::jsonb ELSE base.policy||patch::jsonb END,active,CURRENT_TIMESTAMP
 FROM base CROSS JOIN (VALUES
 ('main','ext-set','PORTAL',true,'Alpha convênio','{}'),
 ('wrongunit','ext-set','PORTAL',true,'Zulu unidade','{"budgetUnitId":"ext-ug-b"}'),
 ('wrongreference','ext-set','PORTAL',true,'Zulu referência','{"sourceRunId":"ext-source-run-other"}'),
 ('inactive','ext-set','PORTAL',false,'Inativo','{}'),('category','ext-set','OUTRO',true,'Categoria','{}'),
 ('draftset','ext-set-draft','PORTAL',true,'Rascunho','{}'),('expiredset','ext-set-expired','PORTAL',true,'Encerrado','{}'),
 ('malformed','ext-set','PORTAL',true,'JSON null','{}'),('otheractor','ext-set','PORTAL',true,'Outra conta','{"actorUserIds":["ext-outsider"]}')
 ) AS cases(suffix,set_id,category,active,label,patch);

-- Additive local fault injectors, all AFTER prerequisite validation. These
-- exercise real transaction rollback without relaxing any historical guard.
CREATE FUNCTION ext_fixture_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."sourceKey"='IMPORTACAO:audit-fail' OR (NEW."eventType"='DESCONTO_CONVENENTE_RESERVADO' AND NEW.payload->>'actorId'='ext-fail-actor') THEN RAISE EXCEPTION 'external fixture late event failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ext_fixture_fail_event BEFORE INSERT ON "HrIntegrationEvent" FOR EACH ROW EXECUTE FUNCTION ext_fixture_fail_event();
CREATE FUNCTION ext_fixture_fail_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."actorId"='ext-fail-actor' AND NEW."sourceKey" LIKE 'BENEFICIO:%' THEN RAISE EXCEPTION 'external fixture late movement failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ext_fixture_fail_movement BEFORE INSERT ON "HrMovement" FOR EACH ROW EXECUTE FUNCTION ext_fixture_fail_movement();
CREATE FUNCTION ext_fixture_fail_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."actorId"='ext-fail-actor' AND NEW.kind='LANCAMENTO' THEN RAISE EXCEPTION 'external fixture late posting failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ext_fixture_fail_posting BEFORE INSERT ON "HrConsignmentEntry" FOR EACH ROW EXECUTE FUNCTION ext_fixture_fail_posting();
