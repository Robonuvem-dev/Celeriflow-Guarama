-- LOCAL TEST ONLY: prerequisites following the complete 156 historical SQL files.
-- Reference Bank/Tax/IBEMA entities remain exactly as those migrations seeded them.
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('municipal-profile','SYSTEM_ADMINISTRATOR','Municipal fixture','{}',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('municipal-admin','Fixture','municipal-setup@example.test','municipal-profile',CURRENT_TIMESTAMP);
INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,status,"updatedAt") VALUES ('municipal-instance','Aurora das Veredas','Aurora das Veredas','MG','Ativa',CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('municipal-travel-secretariat','Viagens',CURRENT_TIMESTAMP);
INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('municipal-travel-exe','AURORA-EXEC','Executivo Aurora','PREFEITURA',CURRENT_TIMESTAMP),('municipal-travel-leg','AURORA-LEG','Legislativo Aurora','CAMARA',CURRENT_TIMESTAMP);
INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('municipal-travel-exe-1','FIX-EXE1','Executivo 1','municipal-travel-secretariat',CURRENT_TIMESTAMP),('municipal-travel-exe-2','FIX-EXE2','Executivo 2','municipal-travel-secretariat',CURRENT_TIMESTAMP),('municipal-travel-leg-1','FIX-LEG1','Legislativo 1','municipal-travel-secretariat',CURRENT_TIMESTAMP);
INSERT INTO "PlanningEntityUnit" ("governmentEntityId","budgetUnitId") VALUES ('municipal-travel-exe','municipal-travel-exe-1'),('municipal-travel-exe','municipal-travel-exe-2'),('municipal-travel-leg','municipal-travel-leg-1');
INSERT INTO "PlanningCatalogVersion" (id,year,label,status,"sourceHash","normativeReference","createdById") VALUES ('p1-tce-pr-account-2026-1.0d',2026,'Referência','DRAFT','824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a','Fixture documental','municipal-admin');
INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes)
SELECT 'municipal-reference:'||code,'p1-tce-pr-account-2026-1.0d','ACCOUNT',code,name,9,'official:'||code,
 jsonb_build_object('postingAllowed',true,'informationNature',nature,'balanceNature',balance,'effectiveFrom','2026-01-01','effectiveUntil','2026-12-31','sourceHash','824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a')
FROM (VALUES
 ('7.9.1.2.1.00.00.00.00.00.00.00','Controle de adiantamentos','C','D'),
 ('8.9.1.2.1.01.00.00.00.00.00.00','Adiantamentos pendentes','C','C'),
 ('8.9.1.2.1.02.00.00.00.00.00.00','Adiantamentos apresentados','C','C'),
 ('8.9.1.2.1.03.00.00.00.00.00.00','Adiantamentos aprovados','C','C'),
 ('8.9.1.2.1.04.00.00.00.00.00.00','Adiantamentos glosados','C','C'),
 ('2.1.1.1.1.01.02.00.00.00.00.00','Pessoal a pagar','P','C'),
 ('2.1.1.1.1.01.03.00.00.00.00.00','Pessoal a pagar 13º','P','C'),
 ('2.1.1.4.1.01.01.00.00.00.00.00','Contribuições a pagar','P','C'),
 ('3.1.1.1.1.01.21.00.00.00.00.00','Remuneração','P','D'),
 ('3.1.1.1.1.01.22.00.00.00.00.00','Remuneração 13º','P','D'),
 ('3.1.2.2.1.01.00.00.00.00.00.00','Contribuições patronais','P','D')
) AS reference(code,name,nature,balance);
UPDATE "PlanningCatalogVersion" SET status='PUBLISHED' WHERE id='p1-tce-pr-account-2026-1.0d';
