-- LOCAL TEST ONLY, after the complete immutable migration history.
-- Related records and actors are real; historical constraints/triggers stay active.
SET TIME ZONE 'UTC';
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES
 ('workforce-profile','WORKFORCE_TEST','Regressão RH','{}',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES
 ('actor','Operador','actor@workforce.example.test','workforce-profile',CURRENT_TIMESTAMP),
 ('another-actor','Segundo operador','another@workforce.example.test','workforce-profile',CURRENT_TIMESTAMP),
 ('other-actor','Terceiro operador','other@workforce.example.test','workforce-profile',CURRENT_TIMESTAMP),
 ('rh-actor','Revisor RH','reviewer@workforce.example.test','workforce-profile',CURRENT_TIMESTAMP),
 ('intruder','Outra conta','intruder@workforce.example.test','workforce-profile',CURRENT_TIMESTAMP);
INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES
 ('instance','Município isolado de teste','Município isolado de teste','PR',CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretariat','Secretaria de teste',CURRENT_TIMESTAMP);
INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('source','WORKFORCE','Recurso de teste',CURRENT_TIMESTAMP);
INSERT INTO "Person" (id,"fullName",cpf,status,"updatedAt") VALUES ('person','Servidor demonstrativo','00000000000','Ativo',CURRENT_TIMESTAMP);
INSERT INTO "Employee" (id,name,"personId","isActive","updatedAt") VALUES ('employee','Servidor demonstrativo','person',true,CURRENT_TIMESTAMP);
INSERT INTO "Role" (id,name,"isActive","updatedAt") VALUES ('role','Cargo',true,CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,status,scope,"effectiveFrom","effectiveUntil","isDemo","updatedAt") VALUES
 ('set','instance','DEMO','Demonstração','ATIVA','DEMONSTRACAO','2025-01-01','2026-12-31T23:59:59.999',true,CURRENT_TIMESTAMP);
INSERT INTO "HrCalculationPolicy" (id,"ruleSetId","roundingMode","roundingScale","negativeNetPayPolicy","updatedAt") VALUES
 ('policy','set','HALF_UP',2,'BLOQUEAR',CURRENT_TIMESTAMP);
INSERT INTO "HrSocialSecurityScheme" (id,"ruleSetId",code,name,regime,"employeeCalculationMethod","ceilingValue","employerContributionRate","isActive","updatedAt") VALUES
 ('scheme','set','RGPS_DEMO','Previdência demonstrativa','RGPS','PROGRESSIVA',2000,20,true,CURRENT_TIMESTAMP);
INSERT INTO "HrSocialSecurityBand" (id,"socialSecuritySchemeId",sequence,"lowerLimit","upperLimit","employeeRate","updatedAt") VALUES
 ('band','scheme',1,0,NULL,10,CURRENT_TIMESTAMP);
INSERT INTO "HrVacationPolicy" (id,"ruleSetId",code,name,"employmentNature","acquisitionMonths","concessionMonths","entitlementDays","maxSplits","minFirstSplitDays","minOtherSplitDays","allowsCashAbono","maxCashAbonoDays","isActive","updatedAt") VALUES
 ('vacation-policy','set','FERIAS','Férias demonstrativas','CLT',12,12,30,3,14,5,true,10,true,CURRENT_TIMESTAMP);
INSERT INTO "HrEmploymentRegime" (id,"ruleSetId",code,name,"employmentNature","socialSecuritySchemeId","vacationPolicyId","isActive","updatedAt") VALUES
 ('regime','set','CLT','CLT demonstrativo','CLT','scheme','vacation-policy',true,CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRubric" (id,"ruleSetId",code,name,type,"calculationMethod","formulaExpression","isActive",priority,"updatedAt") VALUES
 ('rubric','set','SALARIO','Salário','PROVENTO','FORMULA_CONTROLADA','SALARIO_BASE * DIAS / 30',true,1,CURRENT_TIMESTAMP),
 ('extra','set','EXTRA','Extra','PROVENTO','MANUAL',NULL,true,2,CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRubricIncidence" (id,"rubricId","incidenceType","isIncluded","updatedAt") VALUES ('inc','rubric','RGPS',true,CURRENT_TIMESTAMP);
INSERT INTO "PayrollEvent" (id,code,name,type,"isActive","updatedAt") VALUES
 ('event-salary','SALARIO','Salário','Vencimento',true,CURRENT_TIMESTAMP),
 ('event-extra','EXTRA','Extra','Vencimento',true,CURRENT_TIMESTAMP),
 ('event-social','PREVIDENCIA_RGPS_DEMO','Previdência','Desconto',true,CURRENT_TIMESTAMP);
INSERT INTO "HrPayrollRule" (id,"ruleSetId",code,name,category,"valueType",value,"isActive","updatedAt") VALUES
 ('mapping','set','FOLHA_EVENTOS','Mapeamento','CALCULO','JSON','{"SALARIO":"event-salary","EXTRA":"event-extra","PREVIDENCIA_RGPS_DEMO":"event-social"}',true,CURRENT_TIMESTAMP),
 ('employer-basis','set','PREVIDENCIA_BASE_PATRONAL_RGPS_DEMO','Base patronal demonstrativa','CALCULO','TEXT','"TETO_SERVIDOR"',true,CURRENT_TIMESTAMP);
INSERT INTO "Payroll" (id,competence,type,status,"totalValue","updatedAt") VALUES ('payroll','10/2026','Mensal','Aberta',0,CURRENT_TIMESTAMP);
-- Clinical provenance assertions need an actual clinical chain under the FKs.
INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('workforce-health-unit','Unidade clínica de teste','UBS',CURRENT_TIMESTAMP);
INSERT INTO "Patient" (id,"personId","updatedAt") VALUES ('workforce-patient','person',CURRENT_TIMESTAMP);
INSERT INTO "HealthProfessional" (id,"employeeId","updatedAt") VALUES ('workforce-professional','employee',CURRENT_TIMESTAMP);
INSERT INTO "MedicalRecord" (id,"patientId","professionalId","unitId","updatedAt") VALUES
 ('synthetic-record','workforce-patient','workforce-professional','workforce-health-unit',CURRENT_TIMESTAMP);
