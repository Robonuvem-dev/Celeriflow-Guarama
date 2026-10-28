-- Local-only prerequisites, replayed AFTER the complete historical SQL. No seed,
-- generated ORM metadata, guard disabling, DDL replacement or remote connection.
INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('setup-profile','SYSTEM_ADMINISTRATOR','Fixture','{}',CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id,nome,email,"perfilId","firebaseUid","updatedAt") VALUES ('setup-admin','Responsável','admin@email.com','setup-profile','fixture-auth',CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('setup-secretariat','Secretaria',CURRENT_TIMESTAMP);
INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('p0-current-exe','EXE','Executivo','PREFEITURA',CURRENT_TIMESTAMP),('p0-current-leg','LEG','Legislativo','CAMARA',CURRENT_TIMESTAMP);
INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES
 ('p0-current-exe-ug-1','EXE1','Executivo 1','setup-secretariat',CURRENT_TIMESTAMP),
 ('p0-current-exe-ug-2','EXE2','Executivo 2','setup-secretariat',CURRENT_TIMESTAMP),
 ('p0-current-leg-ug-1','LEG1','Legislativo 1','setup-secretariat',CURRENT_TIMESTAMP),
 ('p0-current-leg-ug-2','LEG2','Legislativo 2','setup-secretariat',CURRENT_TIMESTAMP);
INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('p0-current-exe-ug-1','p0-current-exe'),('p0-current-exe-ug-2','p0-current-exe'),('p0-current-leg-ug-1','p0-current-leg'),('p0-current-leg-ug-2','p0-current-leg');
INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES
 ('setup-year-exe',2026,'p0-current-exe','Preparação','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP),
 ('setup-year-leg',2026,'p0-current-leg','Preparação','2026-01-01','2026-12-31 23:59:59.999',CURRENT_TIMESTAMP);
-- 20261010130000_add_master_data_foundation already supplies bank_001 and
-- tax_iptu/tax_itbi/tax_issqn. Reuse those authoritative reference rows; the
-- production command resolves the bank ID by compe='001', never by fixture ID.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Bank" WHERE compe='001' AND status='ATIVO') THEN
  RAISE EXCEPTION 'Historical bank reference 001 missing or inactive';
 END IF;
 IF (SELECT count(*) FROM "Tax" WHERE id IN ('tax_iptu','tax_itbi','tax_issqn') AND "isActive") <> 3 THEN
  RAISE EXCEPTION 'Historical municipal tax references missing or inactive';
 END IF;
END $$;
INSERT INTO "PlanningCatalogVersion" (id,year,label,status,"sourceHash","normativeReference","createdById") VALUES
 ('p1-tce-pr-account-2026-1.0d',2026,'Referência contábil','DRAFT','824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a','Fixture documental','setup-admin'),
 ('p1-tce-pr-revenue-2026-1.0e',2026,'Referência de receitas','DRAFT','2ee071dfb6ecf33462ff4ea047445dd1122786c735bb46ac0b8008952b501e97','Fixture documental','setup-admin');
INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes)
SELECT 'p1-tce-pr-account-2026-1.0d:'||code,'p1-tce-pr-account-2026-1.0d','ACCOUNT',code,name,9,'official:'||code,
 jsonb_build_object('postingAllowed',true,'informationNature',nature,'balanceNature',balance,'sourceHash','824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a')
FROM (VALUES
 ('1.1.1.1.1.19.00.00.00.00.00.00','Bancos','P','D'),
 ('6.2.2.1.1.00.00.00.00.00.00.00','Crédito disponível','O','C'),
 ('6.2.2.1.3.01.00.00.00.00.00.00','Empenhado a liquidar','O','C'),
 ('6.2.2.1.3.03.00.00.00.00.00.00','Liquidado a pagar','O','C'),
 ('6.2.2.1.3.04.00.00.00.00.00.00','Empenhado pago','O','C'),
 ('6.2.2.1.3.05.00.00.00.00.00.00','Inscrito não processado','O','C'),
 ('6.2.2.1.3.07.00.00.00.00.00.00','Inscrito processado','O','C'),
 ('6.3.1.1.0.00.00.00.00.00.00.00','RAP não processado a liquidar','O','C'),
 ('6.3.1.3.0.00.00.00.00.00.00.00','RAP não processado liquidado','O','C'),
 ('6.3.1.4.0.00.00.00.00.00.00.00','RAP não processado pago','O','C'),
 ('6.3.2.1.0.00.00.00.00.00.00.00','RAP processado a pagar','O','C'),
 ('6.3.2.2.0.00.00.00.00.00.00.00','RAP processado pago','O','C')
) AS reference(code,name,nature,balance);
INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes)
SELECT 'p1-tce-pr-revenue-2026-1.0e:'||code,'p1-tce-pr-revenue-2026-1.0e','REVENUE',code,name,9,'official:'||code,'{"postingAllowed":true}'::jsonb
FROM (VALUES ('1.1.1.2.50.0.1.00.00.00.00.00','IPTU'),('1.1.1.2.53.0.1.00.00.00.00.00','ITBI'),('1.1.1.4.51.1.1.00.00.00.00.00','ISSQN')) AS reference(code,name);
INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES
 ('reference-control','p1-tce-pr-account-2026-1.0d','ACCOUNT','8.2.1.0','Controle',4,'reference-control','{"postingAllowed":true}'::jsonb),
 ('reference-closing','p1-tce-pr-account-2026-1.0d','ACCOUNT','5.3.0','Encerramento',3,'reference-closing','{"postingAllowed":true}'::jsonb),
 ('reference-false','p1-tce-pr-account-2026-1.0d','ACCOUNT','6.2.2.1.99','Não escritural',5,'reference-false','{"postingAllowed":false}'::jsonb),
 ('reference-string','p1-tce-pr-account-2026-1.0d','ACCOUNT','6.3.99','Texto não booleano',3,'reference-string','{"postingAllowed":"true"}'::jsonb),
 ('reference-null','p1-tce-pr-account-2026-1.0d','ACCOUNT','6.3.98','Null',3,'reference-null','{"postingAllowed":null}'::jsonb);
UPDATE "PlanningCatalogVersion" SET status='PUBLISHED' WHERE id IN ('p1-tce-pr-account-2026-1.0d','p1-tce-pr-revenue-2026-1.0e');
