import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { createTaxationDrizzleFixture } from "../../../../tests/helpers/taxation-drizzle-fixture";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { accessProfiles, users } from "@/db/schema/identity";
import { secretariats } from "@/db/schema/administration";
import { planningBudgetUnits } from "@/db/schema/planning-budget";
import { people } from "@/db/schema/people";
import { addresses, taxpayers } from "@/db/schema/registry";
import { taxes, taxAssessments } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import * as pageTables from "@/db/schema/taxation-pages";
import * as assessments from "./assessments";
import * as lookups from "./lookups";
import * as options from "./fiscal-options";
import * as engine from "./fiscal-engine";
import * as overview from "./overview";
import * as cards from "./cadastral-details";
import * as itbi from "./itbi";
import { listFiscalEntries, listPageTaxpayers } from "./registry";
import { listPageIntegrationEvents } from "./integration-events";
import { readEconomicProcessLinks } from "./economic-processes";
import { readAnnualBatchPage } from "./annual-batches";
import { readCollectionPage } from "./collection";
import { readActiveDebtPage, readVisibleDebtIds } from "./active-debt";
import { readDesifPage } from "./desif";
import { readDtePage } from "./dte";
import { readNfsePage } from "./nfse";
import { readSimplesPage } from "./simples";
import { readPageCertificateEvaluations, readPageServiceRequests } from "./operations";

// Central execution only: one fixture/process at a time. The shared helper uses
// the production Neon driver, pool five / ten transports, and historical SQL.
test("Tributação pages: catálogo independente, driver real, escopo e escalares", { timeout: 240_000 }, async t => {
  const fixture = await createTaxationDrizzleFixture();
  const database = fixture.connection.db;
  const naive = "2026-10-01 12:34:56.123";
  const instant = "2026-10-01T12:34:56.123Z";
  try {
    await t.test("projeções correspondem ao catálogo do histórico SQL, inclusive JSONB e precisão", async () => {
      const catalog = await database.execute<{ table_name: string; column_name: string; type: string; not_null: boolean }>(sql`
        SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`);
      for (const table of Object.values(pageTables)) {
        for (const column of Object.values(getTableColumns(table))) {
          const key = `${getTableName(table)}.${column.name}`;
          const physical = catalog.rows.find(row => row.table_name === getTableName(table) && row.column_name === column.name);
          assert.ok(physical, key);
          assert.equal(physical.not_null, column.notNull, key);
          assert.equal(physical.type.replace(/\s+/g, "").replace(/withouttimezone$/, ""), column.getSQLType().replace(/\s+/g, ""), key);
        }
      }
    });

    await t.test("todos os leitores executam SQL válido, inclusive UG vazia e listas sem IDs", async () => {
      assert.deepEqual(await overview.readTaxationDashboard(database), { taxpayersCount: 0, guidesCount: 0, economyCount: 0, paidTotal: null });
      const reads = [
        () => overview.listLicensePageRows(database), () => overview.listLicensePageRows(database, []),
        () => overview.listCertificatePageRows(database), () => overview.listDebtPageRows(database), () => overview.listEconomicPageRows(database),
        () => cards.readFiscalTaxpayerCard(database, "missing"), () => cards.readFiscalEconomicCard(database, "missing"),
        () => cards.readFiscalPropertyCard(database, "missing"), () => cards.listFiscalPropertyCards(database, []),
        () => cards.readFiscalPeoplePage(database, "123", 2),
        () => lookups.listFiscalNeighborhoods(database), () => lookups.listFiscalStreets(database),
        () => lookups.listFiscalTaxLabels(database, "name-id", true),
        () => lookups.listFiscalProperties(database, { landOnly: true, excludeId: "missing", filter: { query: "teste", status: "Ativo", streetId: "s", neighborhoodId: "n", propertyUse: "Residencial" } }),
        () => lookups.listFiscalProcessOptions(database, 100, true), () => lookups.listFiscalDocumentOptions(database, 100, true),
        () => lookups.listFiscalActorNames(database, []), () => lookups.listFiscalActiveUsers(database),
        () => lookups.listFiscalYears(database, "missing"), () => lookups.listFiscalRegistrations(database, { ids: [], active: true, order: true }),
        () => lookups.listFiscalSubjectOptions(database), () => options.listPageServiceActivities(database, true),
        () => options.listPageParameters(database, 10, true), () => options.listPageValuations(database),
        () => options.listPageValuationTaxes(database), () => options.listPageCbos(database), () => options.listPageSigningCertificates(database),
        () => assessments.listPageTaxes(database), () => assessments.listPageBenefitRules(database, new Date(instant)),
        () => listPageTaxpayers(database, { ids: [], active: true, companyOnly: true, order: "id", limit: 1 }),
        () => readPageServiceRequests(database), () => readPageCertificateEvaluations(database),
        () => engine.readEngineTaxpayers(database), () => engine.readPageCreditEvents(database, []),
        () => engine.readPageCollectionAgreements(database), () => engine.readPagePublishedAccounts(database),
        () => itbi.listPageItbiTypes(database, true), () => itbi.readPageItbiBuyers(database, "missing"), () => itbi.readPageItbiGrants(database, "missing"),
        () => readEconomicProcessLinks(database, "missing", { budgetUnitId: "ug-a", governmentEntityId: "ente-a" }),
        () => readCollectionPage(database, "missing"), () => readDtePage(database), () => readSimplesPage(database), () => readDesifPage(database),
      ];
      for (const read of reads) await read();
      for (const allowedBudgetUnitIds of [undefined, [], ["ug-a"]]) {
        await lookups.listFiscalPlanningUnits(database, allowedBudgetUnitIds, "entity-unit");
        await assessments.listPageAssessments(database, { allowedBudgetUnitIds, calendar: true, limit: 30 });
        await assessments.listPageGuides(database, allowedBudgetUnitIds, 30);
        assert.equal(await assessments.isPageAssessmentVisible(database, "missing", allowedBudgetUnitIds), false);
        await listFiscalEntries(database, { allowedBudgetUnitIds, entityType: "REAL_ESTATE", categories: ["PROPERTY_PROFILE"], status: "ATIVO", source: "INTERNO", recordedBy: new Date(instant), effectiveAt: new Date(instant), data: { governmentEntityId: "ente-a" }, order: "history", limit: 10 });
        await listPageIntegrationEvents(database, ["ACCOUNTING"], allowedBudgetUnitIds, true);
        await readAnnualBatchPage(database, "missing", allowedBudgetUnitIds, "teste", 2);
        await readActiveDebtPage(database, allowedBudgetUnitIds, []);
        await readNfsePage(database, allowedBudgetUnitIds);
        await itbi.listPageItbiDeclarations(database, { allowedBudgetUnitIds, order: "created-id", status: "EM_ANALISE" });
        await itbi.readPageItbiWorkspace(database, allowedBudgetUnitIds);
        await engine.readPageReversibleMovements(database, allowedBudgetUnitIds);
        await engine.readPageAccountingProfiles(database, allowedBudgetUnitIds);
        await engine.readPageFinancialLabels(database, allowedBudgetUnitIds);
        if (allowedBudgetUnitIds) {
          assert.deepEqual(await readVisibleDebtIds(database, allowedBudgetUnitIds), []);
          assert.deepEqual(await engine.readPageAssessmentIds(database, allowedBudgetUnitIds), []);
        }
      }
    });

    const [profile] = await database.insert(accessProfiles).values({ codigo: "TAXATION_PAGES", nome: "Leituras", permissoes: "{}" }).returning();
    await database.insert(users).values({ id: "page-actor", perfilId: profile.id, nome: "Operador", email: "taxation-pages@example.invalid" });
    await database.insert(people).values({ id: "page-person", fullName: "Ana Fiscal", cpf: "12345678901" });
    await database.insert(taxpayers).values({ id: "page-taxpayer", taxpayerType: "PF", personId: "page-person" });
    await database.insert(taxes).values({ id: "page-tax", name: "IPTU", taxType: "Imposto" });
    await database.insert(secretariats).values({ id: "page-secretariat", name: "Fazenda" });
    await database.insert(planningBudgetUnits).values([
      { id: "ug-a", code: "A", name: "UG A", secretariatId: "page-secretariat" },
      { id: "ug-b", code: "B", name: "UG B", secretariatId: "page-secretariat" },
    ]);

    await t.test("avaliações correlacionam cada tributo ao próprio mapeamento e preservam a linha sem vínculo", async () => {
      const before = await options.listPageValuationTaxes(database);
      await database.insert(taxes).values([
        { id: "valuation-tax-itbi", name: "ITBI", taxType: "Imposto" },
        { id: "valuation-tax-unmapped", name: "IPTU", taxType: "Imposto" },
      ]);
      await database.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('valuation-revenue','PAGE-VALUATION-REVENUE','Receita de avaliação',${naive}::timestamp)`);
      await database.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('valuation-resource','PAGE-VALUATION-RESOURCE','Recurso de avaliação',${naive}::timestamp)`);
      await database.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","budgetUnitId","updatedAt") VALUES
        ('valuation-bank-a','Banco A','001','PAGE-A','ug-a',${naive}::timestamp),
        ('valuation-bank-b','Banco B','002','PAGE-B','ug-b',${naive}::timestamp)`);
      await database.execute(sql`INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES
        ('valuation-mapping-a','page-tax','valuation-revenue','valuation-resource','valuation-bank-a',${naive}::timestamp),
        ('valuation-mapping-b','valuation-tax-itbi','valuation-revenue','valuation-resource','valuation-bank-b',${naive}::timestamp)`);
      const rows = await options.listPageValuationTaxes(database);
      assert.equal(rows.length, before.length + 2);
      assert.equal(rows.filter(row => row.id === "page-tax").length, 1);
      assert.equal(rows.filter(row => row.id === "valuation-tax-itbi").length, 1);
      assert.deepEqual(rows.find(row => row.id === "page-tax")?.financialMapping, { defaultBankAccount: { budgetUnitId: "ug-a" } });
      assert.deepEqual(rows.find(row => row.id === "valuation-tax-itbi")?.financialMapping, { defaultBankAccount: { budgetUnitId: "ug-b" } });
      assert.equal(rows.find(row => row.id === "valuation-tax-unmapped")?.financialMapping, null);
    });

    await t.test("JSONB purposes preserva arrays, objetos e JSON null; expiração é aplicada no SQL", async () => {
      await database.execute(sql`INSERT INTO "DigitalCertificate" (id,alias,"ownerName","credentialReference","certificatePem","trustedRootPem",subject,issuer,"serialNumber",fingerprint256,"validFrom","validTo",purposes,"createdByUsuarioId","updatedAt")
        SELECT id,id,'Titular','reference','pem','root','subject','issuer',id,id,'2000-01-01'::timestamp,
          CASE WHEN id='expired' THEN '2001-01-01'::timestamp ELSE '2199-01-01'::timestamp END,purposes,'page-actor',${naive}::timestamp
        FROM (VALUES ('ged','["GED",null]'::jsonb),('json-null','null'::jsonb),('object','{"GED":true,"optional":null}'::jsonb),('expired','["GED"]'::jsonb)) fixture(id,purposes)`);
      const rows = await options.listPageSigningCertificates(database);
      assert.deepEqual(rows.map(row => row.id).sort(), ["ged", "json-null", "object"]);
      assert.deepEqual(rows.find(row => row.id === "ged")?.purposes, ["GED", null]);
      assert.equal(rows.find(row => row.id === "json-null")?.purposes, null);
      assert.deepEqual(rows.find(row => row.id === "object")?.purposes, { GED: true, optional: null });
      assert.deepEqual(rows.filter(row => Array.isArray(row.purposes) && row.purposes.includes("GED")).map(row => row.id), ["ged"]);
    });

    await t.test("escopo distingue string/number/null JSON e leitores usam a transação recebida", async () => {
      for (const [id, snapshot] of [["assessment-a", { budgetUnitId: "ug-a" }], ["assessment-b", { budgetUnitId: "ug-b" }], ["assessment-number", { budgetUnitId: 1 }], ["assessment-null", null]] as const) {
        await database.insert(taxAssessments).values({ id, year: 2026, originalValue: 1, originalValueDecimal: new Decimal("1234567890123456.78"), taxId: "page-tax", taxpayerId: "page-taxpayer", calculationSnapshot: snapshot, createdAt: new Date(instant) });
      }
      assert.deepEqual((await engine.readPageAssessmentIds(database, ["ug-a"])), ["assessment-a"]);
      assert.equal((await assessments.listPageAssessments(database, { allowedBudgetUnitIds: [] })).length, 0);
      const row = (await assessments.listPageAssessments(database, { allowedBudgetUnitIds: ["ug-a"] }))[0];
      assert.equal(row.originalValueDecimal?.toFixed(2), "1234567890123456.78");
      assert.equal(row.createdAt.toISOString(), instant);
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.insert(taxRegistryEntries).values({ id: "transaction-only", entityType: "TAX", entityId: "page-tax", category: "PAGE_TEST", title: "Não publicado", data: { optional: null, budgetUnitId: "ug-a" } });
        const rows = await listFiscalEntries(tx, { id: "transaction-only", allowedBudgetUnitIds: ["ug-a"] });
        assert.deepEqual(rows.map(row => row.data), [{ optional: null, budgetUnitId: "ug-a" }]);
        throw new Error("rollback-page-test");
      }, { isolationLevel: "repeatable read" }), /rollback-page-test/);
      assert.equal((await listFiscalEntries(database, { id: "transaction-only" })).length, 0);
    });

    await t.test("dívida: some + every exclui lotes mistos/vazios e conserva eventos por processo", async () => {
      await database.execute(sql`INSERT INTO "ActiveDebt" (id,"originDebtType",year,"originalValue","updatedValue","taxpayerId","assessmentId","budgetUnitId","updatedAt") VALUES
        ('debt-a','IPTU',2026,1,1,'page-taxpayer','assessment-a',NULL,${naive}::timestamp),
        ('debt-b','IPTU',2026,1,1,'page-taxpayer','assessment-b','ug-b',${naive}::timestamp)`);
      for (const kind of ["visible", "mixed", "hidden", "empty"]) {
        await database.execute(sql`INSERT INTO "TaxDaPortfolio" (id,name,criteria,"createdByUsuarioId","updatedAt") VALUES (${kind},${kind},'{}'::jsonb,'page-actor',${naive}::timestamp)`);
        await database.execute(sql`INSERT INTO "TaxProtestBatch" (id,"batchNumber","fileContent","createdByUsuarioId","updatedAt") VALUES (${kind},${kind},'{}'::jsonb,'page-actor',${naive}::timestamp)`);
        await database.execute(sql`INSERT INTO "TaxExecutionBatch" (id,"batchNumber","internalProtocol","createdByUsuarioId","updatedAt") VALUES (${kind},${kind},${kind},'page-actor',${naive}::timestamp)`);
        for (const debtId of kind === "mixed" ? ["debt-a", "debt-b"] : kind === "visible" ? ["debt-a"] : kind === "hidden" ? ["debt-b"] : []) {
          const id = `${kind}-${debtId}`;
          await database.execute(sql`INSERT INTO "TaxDaPortfolioItem" (id,"portfolioId","activeDebtId","outstandingDecimal") VALUES (${id},${kind},${debtId},'1234567890123456.78')`);
          await database.execute(sql`INSERT INTO "TaxProtestItem" (id,"batchId","activeDebtId","updatedAt") VALUES (${id},${kind},${debtId},${naive}::timestamp)`);
          await database.execute(sql`INSERT INTO "TaxExecutionCase" (id,"batchId","activeDebtId","internalProtocol","caseSnapshot","createdByUsuarioId","nextHearingAt","updatedAt") VALUES (${id},${kind},${debtId},${id},'{}'::jsonb,'page-actor',${naive}::timestamp,${naive}::timestamp)`);
          await database.execute(sql`INSERT INTO "TaxExecutionEvent" (id,"caseId","eventType",description,"createdAt") SELECT ${id}||'-'||n,${id},'EVENT_'||n,'Evento '||n,${naive}::timestamp+n*interval '1 minute' FROM generate_series(1,9) n`);
        }
      }
      const ids = await readVisibleDebtIds(database, ["ug-a"]);
      assert.deepEqual(ids, ["debt-a"]);
      const scoped = await readActiveDebtPage(database, ["ug-a"], ids);
      assert.deepEqual(scoped.debts.map(row => row.id), ["debt-a"]);
      assert.deepEqual(scoped.portfolios.map(row => row.id), ["visible"]);
      assert.deepEqual(scoped.protestBatches.map(row => row.id), ["visible"]);
      assert.deepEqual(scoped.executionBatches.map(row => row.id), ["visible"]);
      assert.equal(scoped.portfolios[0].items[0].outstandingDecimal.toFixed(2), "1234567890123456.78");
      assert.equal(scoped.executionBatches[0].cases[0].nextHearingAt?.toISOString(), instant);
      assert.deepEqual(scoped.executionBatches[0].cases[0].events.map(row => row.eventType), ["EVENT_9", "EVENT_8", "EVENT_7", "EVENT_6", "EVENT_5", "EVENT_4"]);
      const empty = await readActiveDebtPage(database, [], []);
      assert.equal(empty.debts.length + empty.portfolios.length + empty.protestBatches.length + empty.executionBatches.length, 0);
      const unrestricted = await readActiveDebtPage(database, undefined, []);
      assert.equal(unrestricted.portfolios.length, 4);
      assert.equal(unrestricted.executionBatches.find(row => row.id === "mixed")?.cases.every(row => row.events.length === 6), true);
    });

    await t.test("SQL bruto decodifica datas aninhadas UTC e aplica limite de eventos por ação", async () => {
      await database.execute(sql`INSERT INTO "TaxCertificateEvaluation" (id,"taxpayerId",result,details,"evaluatedAt") VALUES ('evaluation','page-taxpayer','REGULAR','{"optional":null}'::jsonb,${naive}::timestamp)`);
      assert.equal((await readPageCertificateEvaluations(database))[0].evaluatedAt.toISOString(), instant);
      await database.execute(sql`INSERT INTO "TaxCollectionPortfolio" (id,name,"selectionSnapshot","createdByUsuarioId","updatedAt") VALUES ('collection','Carteira','{}'::jsonb,'page-actor',${naive}::timestamp)`);
      for (const id of ["action-a", "action-b"]) {
        await database.execute(sql`INSERT INTO "TaxCollectionAction" (id,"portfolioId","taxpayerId","actionType",modality,channel,"scheduledAt","createdByUsuarioId","updatedAt") VALUES (${id},'collection','page-taxpayer','AVISO','AMIGAVEL','DTE',${naive}::timestamp,'page-actor',${naive}::timestamp)`);
        await database.execute(sql`INSERT INTO "TaxCollectionActionEvent" (id,"actionId","eventType",description,"createdAt") SELECT ${id}||'-'||n,${id},'EVENT_'||n,'Evento '||n,${naive}::timestamp+n*interval '1 minute' FROM generate_series(1,8) n`);
      }
      const actions = (await readCollectionPage(database, "page-actor")).portfolios[0].actions;
      assert.equal(actions.length, 2);
      for (const action of actions) {
        assert.equal(action.scheduledAt.toISOString(), instant);
        assert.deepEqual(action.events.map(row => row.eventType), ["EVENT_8", "EVENT_7", "EVENT_6", "EVENT_5", "EVENT_4"]);
      }
    });

    await t.test("pessoas conserva contagem, offset de vinte, endereço e relações opcionais", async () => {
      await database.insert(addresses).values({ personId: "page-person", streetName: "Rua Fiscal" });
      for (let n = 0; n < 24; n++) await database.insert(taxpayers).values({ id: `extra-${n}`, taxpayerType: "PF", updatedAt: new Date(`2026-10-${String(n + 1).padStart(2, "0")}T00:00:00Z`) });
      const first = await cards.readFiscalPeoplePage(database, "", 1);
      const second = await cards.readFiscalPeoplePage(database, "", 2);
      assert.equal(first.total, 25);
      assert.equal(first.taxpayers.length, 20);
      assert.equal(second.total, 25);
      assert.equal(second.taxpayers.length, 5);
      assert.equal(new Set([...first.taxpayers, ...second.taxpayers].map(row => row.id)).size, 25);
      const found = await cards.readFiscalPeoplePage(database, "12345678901", 1);
      assert.equal(found.total, 1);
      assert.equal(found.taxpayers[0].person?.addresses[0].streetName, "Rua Fiscal");
      assert.equal(found.taxpayers[0].company, null);
      assert.deepEqual(found.taxpayers[0]._count, { realEstates: 0, economicRegistrations: 0, taxCaseLinks: 0 });
    });
  } finally { await fixture.close(); }
});
