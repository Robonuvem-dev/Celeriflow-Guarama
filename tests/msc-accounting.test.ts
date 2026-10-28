import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import JSZip from "jszip";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { JsonObject, JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingEntries, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { reconciliationBankAccounts } from "../src/db/schema/finance-reconciliation";
import { financialYears } from "../src/db/schema/finance-years";
import { governmentEntities } from "../src/db/schema/master-data";
import { planningBudgetUnits, planningEntityUnits } from "../src/db/schema/planning-budget";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-legal";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { captureMscReference2026, configureMscMapping, configureMscReportingScope } from "../src/lib/financeiro/msc-configuration";
import { composeMscLineDimensions } from "../src/lib/financeiro/msc-line-dimensions";
import { resolveAccountingReversalLineDimensions } from "../src/lib/financeiro/accounting-source-dimensions";
import { generateMunicipalMscArchive } from "../src/lib/financeiro/msc-export";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { financeDatabaseError } from "./helpers/finance-database-error";

const capture = readFileSync("docs/poc-p0/fontes/MSC_STN_2026_20260708.json", "utf8").replaceAll("\r\n", "\n");
const referenceId = "msc-reference:stn:2026:20260708";
const reference = (type: string, code: string) => `${referenceId}:${type}:${code}`;
const decision = "Decisão municipal documentada para classificação por origem e vigência.";
function jsonObject(value: JsonValue | undefined): JsonObject {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value;
}

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`MSC versionada, sucessão e estorno preservam memória (${jurisdiction})`, async () => {
    const fixture = await createPlanningAccountingFixture(jurisdiction);
    const transport = await connectFinanceDrizzleFixture(fixture.pg);
    try {
      await fixture.rules();
      const { connection } = transport;
      const db = connection.db;
      const context: AppContext = fixture.context;
      assert.equal(await captureMscReference2026(transport.connection, context, capture), referenceId);
      assert.equal(await captureMscReference2026(transport.connection, context, capture.replaceAll("\n", "\r\n")), referenceId);
      await assert.rejects(captureMscReference2026(transport.connection, context, capture + " "), /divergente/);
      await assert.rejects(db.update(planningCatalogEntries).set({ name: "Alterada" }).where(eq(planningCatalogEntries.id, reference("FR", "1500"))), financeDatabaseError(/immutable/));
      const scope = { governmentEntityId: "ente", budgetUnitId: "ug", financialYearId: "ano", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", reason: decision };
      const po = jurisdiction === "EXECUTIVE" ? "10131" : "20231";
      const accountInput = { ...scope, kind: "ACCOUNT", canonicalId: "debito", referenceEntryId: reference("ACCOUNT", "111110100"), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true };
      const accountMapping = await configureMscMapping(transport.connection, context, accountInput);
      assert.equal(await configureMscMapping(transport.connection, context, accountInput), accountMapping);
      await assert.rejects(configureMscMapping(transport.connection, context, { ...accountInput, reason: decision + " Outra edição." }), /sobreposto/);
      await assert.rejects(configureMscMapping(transport.connection, context, { ...accountInput, poEntryId: reference("PO", po === "10131" ? "20231" : "10131") }), /Poder/);
      await assert.rejects(configureMscMapping(transport.connection, context, { ...accountInput, fpEntryId: reference("FP", "2") }), /FP/);
      const sourceInput = { ...scope, kind: "SOURCE", canonicalId: "livre", referenceEntryId: reference("FR", "1500") };
      const originalSourceMapping = await configureMscMapping(transport.connection, context, sourceInput);
      const origin = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: { externalCode: "1500" } };
      const january = await withDatabaseTransaction(connection, tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-01-15") }, "debito", origin));
      assert.equal(january?.status, "DOCUMENTED");
      assert.deepEqual(january?.information, { PO: po, FP: "1", FR: "1500" });
      const successor = await configureMscMapping(transport.connection, context, { ...sourceInput, effectiveFrom: "2026-02-01", predecessorEntryId: originalSourceMapping, referenceEntryId: reference("FR", "2500") });
      const old = await withDatabaseTransaction(connection, tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-01-31") }, "debito", origin));
      const newer = await withDatabaseTransaction(connection, tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-02-01") }, "debito", origin));
      assert.equal(jsonObject(old?.information).FR, "1500");
      assert.equal(jsonObject(newer?.information).FR, "2500");
      assert.ok(JSON.stringify(newer?.dimensionMappings).includes(successor));
      const incomplete = await withDatabaseTransaction(connection, tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-02-01") }, "debito", { ...origin, resourceSourceId: "vinculada" }));
      assert.equal(incomplete?.status, "NOT_RECONCILED");
      assert.deepEqual(incomplete?.missingInformationTypes, ["FR"]);
      const concurrent = await Promise.allSettled([
        configureMscMapping(transport.connection, context, { ...sourceInput, canonicalId: "vinculada", reason: decision + " Primeira proposta concorrente." }),
        configureMscMapping(transport.connection, context, { ...sourceInput, canonicalId: "vinculada", referenceEntryId: reference("FR", "2500"), reason: decision + " Segunda proposta concorrente." }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
      assert.equal((await db.select({ total: count() }).from(planningCatalogEntries).where(and(eq(planningCatalogEntries.kind, "MSC_MAPPING_SOURCE"), eq(planningCatalogEntries.canonicalId, "vinculada"))))[0].total, 1);
      await withDatabaseTransaction(connection, async tx => {
        await tx.insert(accountingTransactions).values({ id: "original", date: new Date("2026-01-15"), financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", authorUsuarioId: "ana", status: "POSTADO", history: "Origem documental" });
        await tx.insert(accountingEntries).values({ id: "original-line", transactionId: "original", accountId: "debito", date: new Date("2026-01-15"), type: "Débito", value: 1, valueDecimal: new Decimal("1.00"), history: "Origem documental", authorId: "servidora-ana", classificationSnapshot: { dimensions: { ...origin, msc: january } } });
      });
      const reversal = await withDatabaseTransaction(connection, async tx => {
        const dimensions = await resolveAccountingReversalLineDimensions(tx, { ...scope, date: new Date("2026-03-01") }, "original", "debito", "Crédito", "original-line");
        assert.deepEqual(dimensions.sourceClassification, { externalCode: "1500" });
        return composeMscLineDimensions(tx, { ...scope, date: new Date("2026-03-01") }, "debito", dimensions);
      });
      assert.deepEqual(reversal, january);
      await assert.rejects(db.update(accountingEntries).set({ classificationSnapshot: {} }).where(eq(accountingEntries.id, "original-line")), financeDatabaseError(/immutable/));
      // Exercise the real producer as well as the composition helper: dimensions must reach persisted lines.
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      await db.insert(reconciliationBankAccounts).values({ id: "bank", bankName: "Conta municipal da fixture", agency: "0001", accountNumber: "00001-0", budgetUnitId: "ug", resourceSourceId: "livre", accountingPlanId: "debito" });
      await withDatabaseTransaction(connection, async tx => {
        await tx.insert(planningCatalogVersions).values({ id: "municipal-accounts", year: 2026, label: "Edição municipal documentada", normativeReference: decision, sourceHash: "municipal-accounts-source", createdById: "ana" });
        await tx.insert(planningCatalogEntries).values([
          ...[["debito", "111110100", "D"], ["credito", "211110101", "C"]].map(([canonicalId, code, balanceNature]) => ({ versionId: "municipal-accounts", kind: "ACCOUNT", canonicalId, code, name: canonicalId, degree: 9, attributes: { ...scope, operational: true, pocOnly: false, postingAllowed: true, balanceNature } })),
          { versionId: "municipal-accounts", kind: "SOURCE", canonicalId: "livre", code: "1500", name: "Recursos correntes", degree: 4, attributes: { ...scope, operational: true, pocOnly: false } },
        ]);
      });
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "municipal-accounts"));
      await configureMscMapping(transport.connection, context, { ...scope, kind: "ACCOUNT", canonicalId: "credito", referenceEntryId: reference("ACCOUNT", "211110101"), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true });
      const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
      const posting = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-15"), history: "Partida municipal canônica", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "bank", idempotencyKey: "municipal-origin", lines: [{ accountId: "debito", type: "Débito" as const, value: "1.00" }, { accountId: "credito", type: "Crédito" as const, value: "1.00" }] };
      const persisted = await postAccountingTransaction(connection, actor, posting);
      const originalLines = await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, persisted.id));
      for (const line of originalLines) {
        const dims = jsonObject(jsonObject(line.classificationSnapshot).dimensions);
        assert.equal(dims.governmentEntityId, "ente");
        assert.equal(dims.resourceSourceId, "livre");
        assert.equal(jsonObject(jsonObject(dims.msc).information).FR, "1500");
      }
      const reversed = await postAccountingTransaction(connection, actor, { ...posting, date: new Date("2026-03-01"), history: "Estorno municipal canônico", idempotencyKey: "municipal-reversal", reversalOfId: persisted.id, lines: originalLines.map(line => ({ accountId: line.accountId!, type: line.type === "Débito" ? "Crédito" as const : "Débito" as const, value: "1.00", originalEntryId: line.id })) });
      for (const line of await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, reversed.id))) {
        const memory = jsonObject(line.classificationSnapshot);
        const originalLine = originalLines.find(original => original.id === memory.originalEntryId)!;
        assert.deepEqual(jsonObject(memory.dimensions).msc, jsonObject(jsonObject(originalLine.classificationSnapshot).dimensions).msc);
      }
      assert.equal((await postAccountingTransaction(connection, actor, posting)).id, persisted.id);
      const restrictedContext = { ...context, user: { ...context.user, profileCode: "ACCOUNTANT", allowedBudgetUnitIds: [], permissions: JSON.stringify({ modules: { FINANCEIRO: { update: true } } }) } };
      await assert.rejects(configureMscMapping(transport.connection, restrictedContext, accountInput), /acesso|permiss|autoriz/i);
    } finally { try { await transport.close(); } finally { await fixture.close(); } }
  });
}

test("MSC agrega Prefeitura/Câmara com PO distintos, Decimal e competência fechada", async () => {
  const fixture = await createPlanningAccountingFixture();
  const transport = await connectFinanceDrizzleFixture(fixture.pg);
  try {
    await fixture.rules();
    const { connection } = transport;
    const db = connection.db;
    const context: AppContext = fixture.context;
    await captureMscReference2026(transport.connection, context, capture);
    await db.insert(governmentEntities).values({ id: "camara", code: "CM", name: "Câmara Municipal", type: "CAMARA", status: "ATIVA", parentId: "ente" });
    await db.insert(planningBudgetUnits).values({ id: "ug-camara", code: "03.01", name: "Câmara", secretariatId: "secretaria" });
    await db.insert(planningEntityUnits).values({ governmentEntityId: "camara", budgetUnitId: "ug-camara" });
    await db.insert(financialYears).values({ id: "ano-camara", year: 2026, governmentEntityId: "camara", status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") });
    const reporting = { governmentEntityId: "ente", financialYearId: "ano", institutionCode: "4109756EX", entityIds: ["ente", "camara"], reason: decision };
    await assert.rejects(configureMscReportingScope(transport.connection, context, { ...reporting, entityIds: ["ente"] }), /todos/);
    const scopeId = await configureMscReportingScope(transport.connection, context, reporting);
    assert.equal(await configureMscReportingScope(transport.connection, context, reporting), scopeId);
    for (const [entityId, unitId, yearId, po] of [["ente", "ug", "ano", "10131"], ["camara", "ug-camara", "ano-camara", "20231"]]) {
      const scope = { governmentEntityId: entityId, budgetUnitId: unitId, financialYearId: yearId, effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", reason: decision };
      await configureMscMapping(transport.connection, context, { ...scope, kind: "SOURCE", canonicalId: "livre", referenceEntryId: reference("FR", "1500") });
      for (const [accountId, code] of [["debito", "111110100"], ["credito", "211110101"]]) await configureMscMapping(transport.connection, context, { ...scope, kind: "ACCOUNT", canonicalId: accountId, referenceEntryId: reference("ACCOUNT", code), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true });
      const seed = async (suffix: string, date: string, value: string, eventType: string) => {
        await withDatabaseTransaction(connection, async tx => {
          const transactionId = `${entityId}:${suffix}`;
          const entries = await Promise.all(["debito", "credito"].map(async accountId => {
            const msc = await composeMscLineDimensions(tx, { ...scope, date: new Date(date) }, accountId, { resourceSourceId: "livre" });
            return { transactionId, accountId, date: new Date(date), type: accountId === "debito" ? "Débito" : "Crédito", value: Number(value), valueDecimal: new Decimal(value), history: suffix, authorId: "servidora-ana", classificationSnapshot: { dimensions: { governmentEntityId: entityId, budgetUnitId: unitId, msc } } };
          }));
          await tx.insert(accountingTransactions).values({ id: transactionId, date: new Date(date), financialYearId: yearId, governmentEntityId: entityId, budgetUnitId: unitId, authorUsuarioId: "ana", history: suffix, status: "POSTADO", eventType });
          await tx.insert(accountingEntries).values(entries);
        });
      };
      await seed("opening", "2026-01-01", "1.00", "ACCOUNTING_YEAR_OPENING");
      await seed("receipt", "2026-01-20", entityId === "ente" ? "0.10" : "0.20", "DOCUMENTED_EVENT");
    }
    const input = { reportingScopeEntryId: scopeId, period: "2026-01" };
    const actor = { usuarioId: "ana" };
    await assert.rejects(generateMunicipalMscArchive(transport.connection, { ...actor, allowedBudgetUnitIds: ["ug"] }, input), /todas as UGs/);
    await assert.rejects(generateMunicipalMscArchive(transport.connection, actor, input), /fechada/);
    for (const yearId of ["ano", "ano-camara"]) await db.insert(monthlyAccountingCloses).values({ financialYearId: yearId, competence: new Date("2026-01-01"), status: "FECHADO" });
    const archive = await generateMunicipalMscArchive(transport.connection, actor, input);
    const zip = await JSZip.loadAsync(archive.bytes);
    const csv = await Object.values(zip.files)[0].async("string");
    assert.equal(csv, archive.csv);
    assert.ok(csv.startsWith("4109756EX;2026-01;"));
    assert.ok(csv.includes("IC6;TIPO6;Valor;Tipo_valor;Natureza_valor"));
    assert.ok(csv.includes("10131;PO;1;FP;1500;FR"));
    assert.ok(csv.includes("20231;PO;1;FP;1500;FR"));
    assert.ok(csv.includes("1.10;ending_balance;D"));
    assert.ok(csv.includes("1.20;ending_balance;C"));
    assert.equal(archive.sourceEntryCount, 8);
    assert.equal(archive.csvHash.length, 64);
    assert.equal((await db.select({ total: count() }).from(financialAuditLogs).where(eq(financialAuditLogs.action, "MSC_FILE_GENERATED")))[0].total, 1);
    const [entry] = await db.select({ id: accountingEntries.id }).from(accountingEntries).limit(1);
    assert.ok(entry);
    await db.update(accountingEntries).set({ valueDecimal: new Decimal("9.99") }).where(eq(accountingEntries.id, entry.id));
    await assert.rejects(generateMunicipalMscArchive(transport.connection, actor, input), /balanceada/);
  } finally { try { await transport.close(); } finally { await fixture.close(); } }
});
