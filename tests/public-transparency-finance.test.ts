import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createProcessesPortalsDatabase } from "./helpers/processes-portals-database";
import { getPublicExpenses, getPublicRevenues } from "../src/lib/transparencia/portal-fiscal";
import { getPublicBiddings, getPublicContracts, getPublicFinancialReportSnapshot, getPublicFinancialReportSnapshots } from "../src/lib/transparencia/portal-public";
import { reconcilePublicAndInternalData, type ReadReconciliationRreo } from "../src/lib/transparencia/reconciliation-engine";
import { listPlanningPublications, publicPlanningPublicationResponse } from "../src/lib/transparencia/planning-publications";
import { authorizedTaxpayerIds, readTaxpayerAccount } from "../src/lib/portal-cidadao/tax-account";

test("PostgreSQL: projeções financeiras públicas, filtros e snapshots preservados", { timeout: 240_000 }, async t => {
  const { database, connection, close } = await createProcessesPortalsDatabase();
  const db = connection.db;
  const planningBytes = Buffer.from("Documento público de Planejamento para conferência.");
  const planningHash = createHash("sha256").update(planningBytes).digest("hex");
  try {
    await database.exec(`
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretariat','Saúde',now());
      INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('author','Autor de teste',now());
      INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('person-private','Maria da Silva','12345678901',now());
      INSERT INTO "Supplier" (id,"personId","updatedAt") VALUES ('supplier','person-private',now());
      INSERT INTO "Creditor" (id,name,document,"personId","updatedAt") VALUES ('creditor','Maria da Silva','12345678901','person-private',now());
      INSERT INTO "FinancialYear" (id,year,"startDate","endDate","updatedAt") VALUES ('year-open',2026,'2026-01-01','2026-12-31',now()),('year-closed',2025,'2025-01-01','2025-12-31',now());
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('unit','02.001','Fundo Municipal de Saúde','secretariat',now()),('other-unit','02.002','Educação','secretariat',now());
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('nature','3.3.90.30','Material de Consumo',now());
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('revenue-nature','1.1.1.3.03.1.1','Imposto sobre a Renda',now());
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('resource','500','Recursos não vinculados',now());
      INSERT INTO "BudgetAppropriation" (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","updatedAt") VALUES ('appropriation','02.001.10.301.0001.2001.3.3.90.30','year-open','unit','nature','resource',now()),('other-appropriation','02.002','year-open','other-unit','nature','resource',now());
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","budgetUnitId","updatedAt") VALUES ('bank','Banco de teste','0001','123-4','unit',now());
      INSERT INTO "PurchaseProcess" (id,number,object,type,modality,"estimatedValue","secretariatId","updatedAt") VALUES ('purchase','PROC-001/2026','Aquisição de materiais','Compra','Pregão',100,'secretariat',now());
      INSERT INTO "Contract" (id,number,object,"initialValue","updatedValue","startDate","endDate","processId","supplierId","secretariatId",status,"updatedAt") VALUES ('contract-internal-id','CT-001/2026','Aquisição de materiais',100,120,'2026-01-01','2026-12-31','purchase','supplier','secretariat','Vigente',now()),('draft-contract','CT-002/2026','Não publicar',100,120,'2026-01-01','2026-12-31','purchase','supplier','secretariat','Rascunho',now());
      INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('receipt-document','Documento fiscal','Fiscal','https://private.invalid/receipt',now());
      INSERT INTO "PurchaseReceipt" (id,number,"receivedAt","contractId","purchaseProcessId","documentId","receiverId","attesterId","idempotencyKey","sourceId","updatedAt") VALUES ('receipt','REC-2026-001','2026-01-31','contract-internal-id','purchase','receipt-document','author','author','receipt-key','receipt',now());
      INSERT INTO "Commitment" (id,number,date,value,"valueDecimal",history,"appropriationId","supplierId","creditorId","purchaseReceiptId",status,"updatedAt") VALUES ('internal-commitment-id','EMP-2026-001','2026-02-01',999,100,'Despesa pública','appropriation','supplier','creditor','receipt','Pago','2026-02-03'),('draft-commitment','EMP-2026-DRAFT','2026-02-01',900,900,'Não publicado','appropriation','supplier','creditor',NULL,'Rascunho',now()),('other-commitment','EMP-2026-OTHER','2026-02-01',700,700,'Outra UG','other-appropriation','supplier','creditor',NULL,'Pago',now());
      UPDATE "Commitment" SET date='2026-01-30' WHERE id='other-commitment';
      INSERT INTO "Settlement" (id,date,value,"valueDecimal","commitmentId","authorId",status,"updatedAt") VALUES ('settlement','2026-02-02',999,100,'internal-commitment-id','author','Liquidado',now()),('void-settlement','2026-02-03',900,900,'internal-commitment-id','author','Anulada',now());
      INSERT INTO "Payment" (id,"orderNumber",date,value,"valueDecimal","commitmentId","settlementId","bankAccountId","supplierId",status,"updatedAt") VALUES ('payment','OP-001','2026-02-03',999,100,'internal-commitment-id','settlement','bank','supplier','Pago',now()),('void-payment','OP-002','2026-02-04',900,900,'internal-commitment-id','settlement','bank','supplier','Anulada',now());
      INSERT INTO "Revenue" (id,date,"launchDate","collectionDate",value,"valueDecimal","revenueNatureId","resourceSourceId","bankAccountId",stage,classification,status,"updatedAt") VALUES ('internal-revenue-id','2026-02-01','2026-01-15','2026-02-01',999,250,'revenue-nature','resource','bank','ARRECADADA','ORCAMENTARIA','Arrecadada','2026-02-01'),('uncollected','2026-02-01',NULL,NULL,900,900,'revenue-nature','resource','bank','LANCADA','ORCAMENTARIA','Lançada',now()),('reducer','2026-02-01',NULL,NULL,12,12,'revenue-nature','resource','bank','ARRECADADA','REDUTORA','Arrecadada',now());
      UPDATE "Revenue" SET "financialYearId"='year-open';
      INSERT INTO "Bidding" (id,number,modality,status,"publicationDate","sessionDate","processId","updatedAt") VALUES ('bidding-internal-id','PE-010/2026','Pregão','Publicada','2026-01-10','2026-01-20','purchase',now()),('bidding-draft','PE-011/2026','Pregão','Rascunho','2026-01-10','2026-01-20','purchase',now()),('bidding-unpublished','PE-012/2026','Pregão','Publicada',NULL,'2026-01-20','purchase',now());
      INSERT INTO "AnnualAccountingClose" (id,"financialYearId",status,"closedAt","updatedAt") VALUES ('annual-close','year-closed','ENCERRADO','2026-02-01',now());
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('rreo','RREO','PUBLIC_FINANCIAL_REPORT:year-open:RREO','https://public.invalid/rreo','Publicado',now()),('open-balance','Balanço aberto','PUBLIC_FINANCIAL_REPORT:year-open:BALANCO_PATRIMONIAL','https://public.invalid/open','Publicado',now()),('closed-balance','Balanço encerrado','PUBLIC_FINANCIAL_REPORT:year-closed:BALANCO_ORCAMENTARIO','https://public.invalid/closed','Publicado',now()),('draft-report','RGF em elaboração','PUBLIC_FINANCIAL_REPORT:year-open:RGF','https://private.invalid/draft','Rascunho',now());
      INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256",status,"finalizedAt") VALUES ('rreo-v1','rreo',1,'https://public.invalid/rreo-v1','hash-rreo-v1','FINAL','2026-02-01'),('rreo-v2','rreo',2,'https://public.invalid/rreo-v2','hash-rreo-v2','SIGNED','2026-03-01'),('rreo-v3','rreo',3,'https://private.invalid/rreo-v3','hash-rreo-v3','DRAFT','2026-04-01'),('open-v1','open-balance',1,'https://public.invalid/open','hash-open','FINAL','2026-03-01'),('closed-v1','closed-balance',1,'https://public.invalid/closed','hash-closed','FINAL','2026-02-02'),('draft-v1','draft-report',1,'https://private.invalid/draft','hash-draft','FINAL','2026-02-01');
      INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('planning-entity','EXEC','Prefeitura de teste','PREFEITURA',now()),('planning-other-entity','LEG','Câmara de teste','CAMARA',now());
      INSERT INTO "MultiYearPlan" (id,code,name,"startYear","endYear","updatedAt") VALUES ('planning-ppa','PPA-2026','PPA Executivo',2026,2029,now()),('planning-other-ppa','PPA-2025','PPA Legislativo',2025,2028,now());
      INSERT INTO "BudgetGuideline" (id,"financialYearId","multiYearPlanId","updatedAt") VALUES ('planning-ldo','year-open','planning-ppa',now()),('planning-other-ldo','year-closed','planning-other-ppa',now());
      INSERT INTO "AnnualBudgetLaw" (id,"lawNumber","financialYearId","budgetGuidelineId","totalRevenue","totalExpense","updatedAt") VALUES ('planning-loa','LOA 2026','year-open','planning-ldo',100,100,now()),('planning-other-loa','LOA 2025','year-closed','planning-other-ldo',100,100,now());
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","multiYearPlanId","createdById","updatedAt") VALUES ('planning-ppa-instrument','planning-entity','PPA','PPA-2026','PPA Executivo',2026,2029,'planning-ppa','actor',now()),('planning-other-ppa-instrument','planning-other-entity','PPA','PPA-2025','PPA Legislativo',2025,2028,'planning-other-ppa','actor',now());
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","budgetGuidelineId","parentId","createdById","updatedAt") VALUES ('planning-ldo-instrument','planning-entity','LDO','LDO-2026','LDO Executivo',2026,2026,'planning-ldo','planning-ppa-instrument','actor',now()),('planning-other-ldo-instrument','planning-other-entity','LDO','LDO-2025','LDO Legislativo',2025,2025,'planning-other-ldo','planning-other-ppa-instrument','actor',now());
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","annualBudgetLawId","parentId","createdById","updatedAt") VALUES ('planning-instrument','planning-entity','LOA','LOA-2026','LOA 2026',2026,2026,'planning-loa','planning-ldo-instrument','actor',now()),('planning-other-instrument','planning-other-entity','LOA','LOA-2025','LOA 2025',2025,2025,'planning-other-loa','planning-other-ldo-instrument','actor',now());
      INSERT INTO "PlanningReportSnapshot" (id,"instrumentId","reportType",filters,dataset,hash,"createdById") SELECT 'planning-snapshot-'||n,'planning-instrument','LOA','{}','{}','snapshot-hash','actor' FROM generate_series(1,21) n;
      INSERT INTO "PlanningReportSnapshot" (id,"instrumentId","reportType",filters,dataset,hash,"createdById") VALUES ('planning-other-snapshot','planning-other-instrument','LOA','{}','{}','other-snapshot-hash','actor');
      INSERT INTO "PlanningReportPublication" (id,"snapshotId",format,"publicKey",status,"fileUrl","fileHash",filename,"contentType",title,"requestedById",reason,"publishedAt","updatedAt") SELECT 'planning-publication-'||n,'planning-snapshot-'||n,'CSV','planning-key-'||lpad(n::text,3,'0'),'PUBLISHED','https://public.invalid/planning','${planningHash}','loa.csv','text/csv','LOA para conferência '||n,'actor','Publicação de teste','2026-01-01',now() FROM generate_series(1,21) n;
      INSERT INTO "PlanningReportPublication" (id,"snapshotId",format,"publicKey",status,"fileUrl","fileHash",filename,"contentType",title,"requestedById",reason,"publishedAt","updatedAt") VALUES ('planning-withdrawn','planning-snapshot-1','PDF','withdrawn-key','WITHDRAWN','https://private.invalid/withdrawn','${planningHash}','loa.pdf','application/pdf','Não publicar','actor','Retirado','2026-01-01',now()),('planning-pending','planning-snapshot-2','PDF','pending-key','PENDING',NULL,NULL,'loa.pdf','application/pdf','Não publicar','actor','Em geração',NULL,now()),('planning-other','planning-other-snapshot','CSV','other-key','PUBLISHED','https://public.invalid/other','${planningHash}','loa.csv','text/csv','Outro ente e exercício','actor','Publicado','2025-01-01',now());
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('citizen-profile','CITIZEN','Cidadão','{}',now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('citizen-owner','Titular','citizen@example.test','citizen-profile',now());
      INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('taxpayer-private','Pessoa Física','person-private',now());
      INSERT INTO "TaxpayerPortalAccess" (id,"usuarioId","taxpayerId",scopes,"grantedByUsuarioId","grantedAt") VALUES ('taxpayer-grant','citizen-owner','taxpayer-private','["EXTRATO","DAM","IMOVEL","EMPRESA","CERTIDOES","ALVARAS","DIVIDA","PARCELAMENTO"]','citizen-owner','2026-01-01');
      INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('tax','Imposto municipal','Imposto',now());
      INSERT INTO "TaxAssessment" (id,year,"originalValue","originalValueDecimal","assessmentNumber","taxId","taxpayerId","updatedAt") VALUES ('assessment-exact',2026,1,90071992547409.96,'LAN-EXACT','tax','taxpayer-private',now()),('assessment-unknown',2026,100,100,'LAN-UNKNOWN','tax','taxpayer-private',now()),('assessment-prior',2025,50,50,'LAN-PRIOR','tax','taxpayer-private',now());
      INSERT INTO "TaxGuide" (id,"totalValue","totalValueDecimal","guideNumber","dueDate","assessmentId","updatedAt") VALUES ('tax-guide-exact',1,90071992547409.96,'DAM-EXACT','2026-12-01','assessment-exact',now()),('tax-guide-unknown',100,100,'DAM-UNKNOWN','2026-12-01','assessment-unknown',now());
      INSERT INTO "TaxPayment" (id,"amountPaid","amountPaidDecimal",status,"paymentDate","paymentMethod","guideId","updatedAt") VALUES ('tax-payment-one',0.1,0.10,'Confirmado','2026-02-01','PIX','tax-guide-exact',now()),('tax-payment-two',0.2,0.20,'Confirmado','2026-02-02','PIX','tax-guide-exact',now()),('tax-payment-void',900,900,'Estornado','2026-02-02','PIX','tax-guide-exact',now()),('tax-payment-unknown',50,NULL,'Confirmado','2026-02-01','PIX','tax-guide-unknown',now());
      INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,"updatedAt") VALUES ('tax-compensation','TAX_ASSESSMENT','assessment-exact','CREDIT_MOVEMENT','Compensação','{"operation":"COMPENSAR","amount":"0.03"}','EFETIVADO',now());
      INSERT INTO "RealEstate" (id,"municipalInsc","streetName",number,"landArea","builtArea","taxpayerId","updatedAt") VALUES ('taxpayer-estate','IM-001','Rua de teste','10',123.4,12,'taxpayer-private',now());
    `);

    await t.test("projeta despesa pública sem identificadores internos ou dados pessoais", async () => {
      const result = await getPublicExpenses(db, { year: 2026, budgetUnitCode: "02.001", resourceSourceCode: "500" });
      assert.equal(result.total, 1);
      const [row] = result.data;
      assert.equal(row.supplierName, "PESSOA FÍSICA");
      assert.equal(row.supplierDocumentMasked, "***.456.789-**");
      assert.equal(row.committedValue, 100);
      assert.equal(row.settledValue, 100);
      assert.equal(row.paidValue, 100);
      assert.equal(row.paidPaymentCount, 1);
      assert.equal(row.receiptNumber, "REC-2026-001");
      assert.equal(row.receiptDate?.toISOString(), "2026-01-31T00:00:00.000Z");
      assert.equal("id" in row, false);
      assert.equal("history" in row, false);
      assert.ok(!JSON.stringify(result).includes("Maria da Silva") && !JSON.stringify(result).includes("internal-commitment-id"));
      assert.equal((await getPublicExpenses(db, { budgetUnitCode: "missing" })).total, 0);
      assert.equal((await getPublicExpenses(db, { search: "EMP%" })).total, 0);
      assert.equal((await getPublicExpenses(db, { expenseNatureCode: "3.3.90.30", pageSize: 1, page: 2 })).data[0].number, "EMP-2026-OTHER");
    });

    await t.test("projeta receita arrecadada com classificação, fonte e unidade disponíveis", async () => {
      const result = await getPublicRevenues(db, { year: 2026, revenueClassification: "ORCAMENTARIA", budgetUnitCode: "02.001" });
      assert.equal(result.total, 1);
      const [row] = result.data;
      assert.equal(row.classification, "ORCAMENTARIA");
      assert.equal(row.resourceSourceCode, "500");
      assert.equal(row.budgetUnitCode, "02.001");
      assert.equal(row.value, 250);
      assert.equal("id" in row, false);
      assert.equal((await getPublicRevenues(db, { search: "Imposto", revenueClassification: "REDUTORA" })).data[0].value, 12);
      assert.equal((await getPublicRevenues(db, { year: 2025 })).total, 0);
    });

    await t.test("lista apenas snapshots publicados e impede balanços antes do encerramento anual", async () => {
      const reports = await getPublicFinancialReportSnapshots(db);
      assert.deepEqual(reports.map(report => `${report.year}:${report.type}:v${report.version}`), ["2026:RREO:v2", "2025:BALANCO_ORCAMENTARIO:v1"]);
      assert.equal((await getPublicFinancialReportSnapshot(db, { year: 2026, reportType: "RREO" }))?.fileUrl, "https://public.invalid/rreo-v2");
      assert.equal((await getPublicFinancialReportSnapshot(db, { year: 2026, reportType: "RREO", version: 1 }))?.versionNumber, 1);
      assert.equal(await getPublicFinancialReportSnapshot(db, { year: 2026, reportType: "RREO", version: 3 }), null);
      assert.equal(await getPublicFinancialReportSnapshot(db, { year: 2026, reportType: "BALANCO_PATRIMONIAL" }), null);
      assert.equal(await getPublicFinancialReportSnapshot(db, { year: 2026, reportType: "RGF" }), null);
    });

    await t.test("projeta contratos e licitações sem ids internos, rascunhos ou identificação de pessoa física", async () => {
      const [contracts, biddings] = await Promise.all([getPublicContracts(db), getPublicBiddings(db)]);
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].supplier.name, "PESSOA FÍSICA");
      assert.equal(contracts[0].supplier.documentMasked, "***.456.789-**");
      assert.equal("id" in contracts[0], false);
      assert.equal(biddings.length, 1);
      assert.equal(biddings[0].processNumber, "PROC-001/2026");
      assert.equal("id" in biddings[0], false);
      assert.ok(!JSON.stringify({ contracts, biddings }).includes("Maria da Silva"));
    });

    await t.test("reconcilia com o leitor canônico no mesmo executor e detecta um centavo", async () => {
      const readInternal: ReadReconciliationRreo = async (executor, filter) => {
        assert.equal(executor, db);
        assert.equal(filter.financialYearId, "year-open");
        return { expenseSummary: [{ committedValue: "800.00", settledValue: "100.00", paidValue: "100.00" }], revenueSummary: [{ realizedValue: "238.00" }] };
      };
      const matched = await reconcilePublicAndInternalData(db, "year-open", readInternal);
      assert.equal(matched.isReconciled, true);
      assert.equal(matched.divergenceTotal, 0);
      assert.equal(matched.checks[3].publicValue, 238);
      const mismatched = await reconcilePublicAndInternalData(db, "year-open", async (executor, filter) => {
        const internal = await readInternal(executor, filter);
        return { ...internal, expenseSummary: [{ ...internal.expenseSummary[0], paidValue: "100.01" }] };
      });
      assert.equal(mismatched.isReconciled, false);
      assert.equal(mismatched.divergenceTotal, 0.01);
      assert.equal(mismatched.checks[2].status, "DIVERGENCE");
      await assert.rejects(reconcilePublicAndInternalData(db, "missing", readInternal), /Exercício financeiro não encontrado/);
    });

    await t.test("Planejamento público preserva recorte, paginação e integridade do arquivo", async () => {
      const first = await listPlanningPublications(db, { year: 2026, entity: "prefeitura", page: 1 });
      const last = await listPlanningPublications(db, { year: 2026, entity: "prefeitura", page: 999 });
      assert.equal(first.total, 21);
      assert.equal(first.records.length, 20);
      assert.equal(last.page, 2);
      assert.equal(last.records.length, 1);
      assert.equal(last.records[0].url, "/api/transparencia/planejamento/planning-key-021");
      assert.equal(last.records[0].hash, planningHash);
      assert.equal(last.records[0].completeness, "Documento para conferência — leiaute não homologado");
      assert.equal((await listPlanningPublications(db, { entity: "%" })).total, 0);
      assert.equal((await listPlanningPublications(db, { year: 2025 })).total, 1);
      assert.ok(!JSON.stringify(first).includes("snapshot-hash") && !JSON.stringify(first).includes("fileUrl"));
      const source = { async get(url: string) { assert.equal(url, "https://public.invalid/planning"); return planningBytes; } };
      const response = await publicPlanningPublicationResponse(db, "planning-key-001", source);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Report-File-SHA256"), planningHash);
      assert.equal(response.headers.get("X-Planning-Completeness"), "REVIEW_COPY_NOT_STATUTORY");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), planningBytes);
      assert.equal((await publicPlanningPublicationResponse(db, "planning-key-001", { async get() { return Buffer.from("Arquivo alterado"); } })).status, 423);
      assert.equal((await publicPlanningPublicationResponse(db, "withdrawn-key", source)).status, 404);
      assert.equal((await publicPlanningPublicationResponse(db, "pending-key", source)).status, 404);
      assert.equal((await publicPlanningPublicationResponse(db, "unknown-key", source)).status, 404);
      await database.exec('ALTER TABLE "PlanningReportPublication" RENAME TO "FixturePlanningPublication"');
      try {
        assert.deepEqual(await listPlanningPublications(db, { page: 5 }), { total: 0, page: 1, records: [] });
      } finally {
        await database.exec('ALTER TABLE "FixturePlanningPublication" RENAME TO "PlanningReportPublication"');
      }
    });

    await t.test("conta do contribuinte exige titularidade vigente e preserva centavos e pagamento desconhecido", async () => {
      assert.deepEqual(await authorizedTaxpayerIds(db, "citizen-owner", "DAM"), ["taxpayer-private"]);
      assert.deepEqual(await authorizedTaxpayerIds(db, "citizen-owner", "ITBI"), []);
      await assert.rejects(readTaxpayerAccount(db, "stranger", "taxpayer-private"), /Sem vínculo vigente/);
      const account = await readTaxpayerAccount(db, "citizen-owner", "taxpayer-private", 2026);
      assert.equal(account.statement.length, 2);
      const exact = account.statement.find(row => row.id === "assessment-exact")!;
      assert.equal(exact.total, "90071992547409.96");
      assert.equal(exact.paid, "0.30");
      assert.equal(exact.remaining, "90071992547409.63");
      const unknown = account.statement.find(row => row.id === "assessment-unknown")!;
      assert.equal(unknown.paid, null);
      assert.equal(unknown.remaining, null);
      assert.equal(account.properties[0].district, "Não informado");
      assert.equal(account.properties[0].landArea, 123.4);
      await database.exec(`UPDATE "TaxpayerPortalAccess" SET scopes='[]' WHERE id='taxpayer-grant'`);
      const restricted = await readTaxpayerAccount(db, "citizen-owner", "taxpayer-private");
      assert.deepEqual(restricted.statement, []);
      assert.deepEqual(restricted.properties, []);
      await database.exec(`UPDATE "TaxpayerPortalAccess" SET scopes='["DAM"]',"grantedAt"='2100-01-01' WHERE id='taxpayer-grant'`);
      assert.deepEqual(await authorizedTaxpayerIds(db, "citizen-owner", "DAM"), []);
      await assert.rejects(readTaxpayerAccount(db, "citizen-owner", "taxpayer-private"), /Sem vínculo vigente/);
      await database.exec(`UPDATE "TaxpayerPortalAccess" SET "grantedAt"='2026-01-01',"revokedAt"=now() WHERE id='taxpayer-grant'`);
      assert.deepEqual(await authorizedTaxpayerIds(db, "citizen-owner", "DAM"), []);
      await assert.rejects(readTaxpayerAccount(db, "citizen-owner", "taxpayer-private"), /Sem vínculo vigente/);
    });
  } finally {
    await close();
  }
});
