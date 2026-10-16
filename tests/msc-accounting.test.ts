import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import JSZip from "jszip";
import { Prisma } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { captureMscReference2026, configureMscMapping, configureMscReportingScope } from "../src/lib/financeiro/msc-configuration";
import { composeMscLineDimensions } from "../src/lib/financeiro/msc-line-dimensions";
import { resolveAccountingReversalLineDimensions } from "../src/lib/financeiro/accounting-source-dimensions";
import { generateMunicipalMscArchive } from "../src/lib/financeiro/msc-export";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";

const capture = readFileSync("docs/poc-p0/fontes/MSC_STN_2026_20260708.json", "utf8").replaceAll("\r\n", "\n");
const referenceId = "msc-reference:stn:2026:20260708";
const reference = (type: string, code: string) => `${referenceId}:${type}:${code}`;
const decision = "Decisão municipal documentada para classificação por origem e vigência.";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`MSC versionada, sucessão e estorno preservam memória (${jurisdiction})`, async () => {
    const fixture = await createPlanningAccountingFixture(jurisdiction);
    try {
      await fixture.rules();
      const context = fixture.context as unknown as AppContext;
      assert.equal(await captureMscReference2026(context, capture), referenceId);
      assert.equal(await captureMscReference2026(context, capture.replaceAll("\n", "\r\n")), referenceId);
      await assert.rejects(captureMscReference2026(context, capture + " "), /divergente/);
      await assert.rejects(fixture.db.planningCatalogEntry.update({ where: { id: reference("FR", "1500") }, data: { name: "Alterada" } }), /immutable/);
      const scope = { governmentEntityId: "ente", budgetUnitId: "ug", financialYearId: "ano", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", reason: decision };
      const po = jurisdiction === "EXECUTIVE" ? "10131" : "20231";
      const accountInput = { ...scope, kind: "ACCOUNT", canonicalId: "debito", referenceEntryId: reference("ACCOUNT", "111110100"), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true };
      const accountMapping = await configureMscMapping(context, accountInput);
      assert.equal(await configureMscMapping(context, accountInput), accountMapping);
      await assert.rejects(configureMscMapping(context, { ...accountInput, reason: decision + " Outra edição." }), /sobreposto/);
      await assert.rejects(configureMscMapping(context, { ...accountInput, poEntryId: reference("PO", po === "10131" ? "20231" : "10131") }), /Poder/);
      await assert.rejects(configureMscMapping(context, { ...accountInput, fpEntryId: reference("FP", "2") }), /FP/);
      const sourceInput = { ...scope, kind: "SOURCE", canonicalId: "livre", referenceEntryId: reference("FR", "1500") };
      const originalSourceMapping = await configureMscMapping(context, sourceInput);
      const origin = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: { externalCode: "1500" } };
      const january = await fixture.db.$transaction(tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-01-15") }, "debito", origin));
      assert.equal(january?.status, "DOCUMENTED");
      assert.deepEqual(january?.information, { PO: po, FP: "1", FR: "1500" });
      const successor = await configureMscMapping(context, { ...sourceInput, effectiveFrom: "2026-02-01", predecessorEntryId: originalSourceMapping, referenceEntryId: reference("FR", "2500") });
      const old = await fixture.db.$transaction(tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-01-31") }, "debito", origin));
      const newer = await fixture.db.$transaction(tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-02-01") }, "debito", origin));
      assert.equal((old?.information as Prisma.InputJsonObject).FR, "1500");
      assert.equal((newer?.information as Prisma.InputJsonObject).FR, "2500");
      assert.ok(JSON.stringify(newer?.dimensionMappings).includes(successor));
      const incomplete = await fixture.db.$transaction(tx => composeMscLineDimensions(tx, { ...scope, date: new Date("2026-02-01") }, "debito", { ...origin, resourceSourceId: "vinculada" }));
      assert.equal(incomplete?.status, "NOT_RECONCILED");
      assert.deepEqual(incomplete?.missingInformationTypes, ["FR"]);
      const concurrent = await Promise.allSettled([
        configureMscMapping(context, { ...sourceInput, canonicalId: "vinculada", reason: decision + " Primeira proposta concorrente." }),
        configureMscMapping(context, { ...sourceInput, canonicalId: "vinculada", referenceEntryId: reference("FR", "2500"), reason: decision + " Segunda proposta concorrente." }),
      ]);
      assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
      assert.equal(await fixture.db.planningCatalogEntry.count({ where: { kind: "MSC_MAPPING_SOURCE", canonicalId: "vinculada" } }), 1);
      await fixture.db.accountingTransaction.create({ data: { id: "original", date: new Date("2026-01-15"), financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", authorUsuarioId: "ana", status: "POSTADO", history: "Origem documental", entries: { create: { id: "original-line", accountId: "debito", date: new Date("2026-01-15"), type: "Débito", value: 1, valueDecimal: "1.00", history: "Origem documental", authorId: "servidora-ana", classificationSnapshot: { dimensions: { ...origin, msc: january } } } } } });
      const reversal = await fixture.db.$transaction(async tx => {
        const dimensions = await resolveAccountingReversalLineDimensions(tx, { ...scope, date: new Date("2026-03-01") }, "original", "debito", "Crédito", "original-line");
        assert.deepEqual(dimensions.sourceClassification, { externalCode: "1500" });
        return composeMscLineDimensions(tx, { ...scope, date: new Date("2026-03-01") }, "debito", dimensions);
      });
      assert.deepEqual(reversal, january);
      await assert.rejects(fixture.db.accountingEntry.update({ where: { id: "original-line" }, data: { classificationSnapshot: {} } }), /immutable/);
      // Exercise the real producer as well as the composition helper: dimensions must reach persisted lines.
      await fixture.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      await fixture.db.bankAccount.create({ data: { id: "bank", bankName: "Conta municipal da fixture", agency: "0001", accountNumber: "00001-0", budgetUnitId: "ug", resourceSourceId: "livre", accountingPlanId: "debito" } });
      await fixture.db.planningCatalogVersion.create({ data: { id: "municipal-accounts", year: 2026, label: "Edição municipal documentada", normativeReference: decision, sourceHash: "municipal-accounts-source", createdById: "ana", entries: { create: [
        ...[["debito", "111110100", "D"], ["credito", "211110101", "C"]].map(([canonicalId, code, balanceNature]) => ({ kind: "ACCOUNT", canonicalId, code, name: canonicalId, degree: 9, attributes: { ...scope, operational: true, pocOnly: false, postingAllowed: true, balanceNature } })),
        { kind: "SOURCE", canonicalId: "livre", code: "1500", name: "Recursos correntes", degree: 4, attributes: { ...scope, operational: true, pocOnly: false } },
      ] } } });
      await fixture.db.planningCatalogVersion.update({ where: { id: "municipal-accounts" }, data: { status: "PUBLISHED" } });
      await configureMscMapping(context, { ...scope, kind: "ACCOUNT", canonicalId: "credito", referenceEntryId: reference("ACCOUNT", "211110101"), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true });
      const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
      const posting = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-15"), history: "Partida municipal canônica", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "bank", idempotencyKey: "municipal-origin", lines: [{ accountId: "debito", type: "Débito" as const, value: "1.00" }, { accountId: "credito", type: "Crédito" as const, value: "1.00" }] };
      const persisted = await postAccountingTransaction(fixture.db, actor, posting);
      const originalLines = await fixture.db.accountingEntry.findMany({ where: { transactionId: persisted.id } });
      for (const line of originalLines) {
        const dims = (line.classificationSnapshot as Prisma.JsonObject).dimensions as Prisma.JsonObject;
        assert.equal(dims.governmentEntityId, "ente");
        assert.equal(dims.resourceSourceId, "livre");
        assert.equal(((dims.msc as Prisma.JsonObject).information as Prisma.JsonObject).FR, "1500");
      }
      const reversed = await postAccountingTransaction(fixture.db, actor, { ...posting, date: new Date("2026-03-01"), history: "Estorno municipal canônico", idempotencyKey: "municipal-reversal", reversalOfId: persisted.id, lines: originalLines.map(line => ({ accountId: line.accountId!, type: line.type === "Débito" ? "Crédito" as const : "Débito" as const, value: "1.00", originalEntryId: line.id })) });
      for (const line of await fixture.db.accountingEntry.findMany({ where: { transactionId: reversed.id } })) {
        const memory = line.classificationSnapshot as Prisma.JsonObject;
        const originalLine = originalLines.find(original => original.id === memory.originalEntryId)!;
        assert.deepEqual((memory.dimensions as Prisma.JsonObject).msc, ((originalLine.classificationSnapshot as Prisma.JsonObject).dimensions as Prisma.JsonObject).msc);
      }
      assert.equal((await postAccountingTransaction(fixture.db, actor, posting)).id, persisted.id);
      const restrictedContext = { ...context, user: { ...context.user, profileCode: "ACCOUNTANT", allowedBudgetUnitIds: [], permissions: JSON.stringify({ modules: { FINANCEIRO: { update: true } } }) } };
      await assert.rejects(configureMscMapping(restrictedContext, accountInput), /acesso|permiss|autoriz/i);
    } finally { await fixture.close(); }
  });
}

test("MSC agrega Prefeitura/Câmara com PO distintos, Decimal e competência fechada", async () => {
  const fixture = await createPlanningAccountingFixture();
  try {
    await fixture.rules();
    const context = fixture.context as unknown as AppContext;
    await captureMscReference2026(context, capture);
    await fixture.db.governmentEntity.create({ data: { id: "camara", code: "CM", name: "Câmara Municipal", type: "CAMARA", status: "ATIVA", parentId: "ente" } });
    await fixture.db.budgetUnit.create({ data: { id: "ug-camara", code: "03.01", name: "Câmara", secretariatId: "secretaria" } });
    await fixture.db.planningEntityUnit.create({ data: { governmentEntityId: "camara", budgetUnitId: "ug-camara" } });
    await fixture.db.financialYear.create({ data: { id: "ano-camara", year: 2026, governmentEntityId: "camara", status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const reporting = { governmentEntityId: "ente", financialYearId: "ano", institutionCode: "4109756EX", entityIds: ["ente", "camara"], reason: decision };
    await assert.rejects(configureMscReportingScope(context, { ...reporting, entityIds: ["ente"] }), /todos/);
    const scopeId = await configureMscReportingScope(context, reporting);
    assert.equal(await configureMscReportingScope(context, reporting), scopeId);
    for (const [entityId, unitId, yearId, po] of [["ente", "ug", "ano", "10131"], ["camara", "ug-camara", "ano-camara", "20231"]]) {
      const scope = { governmentEntityId: entityId, budgetUnitId: unitId, financialYearId: yearId, effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", reason: decision };
      await configureMscMapping(context, { ...scope, kind: "SOURCE", canonicalId: "livre", referenceEntryId: reference("FR", "1500") });
      for (const [accountId, code] of [["debito", "111110100"], ["credito", "211110101"]]) await configureMscMapping(context, { ...scope, kind: "ACCOUNT", canonicalId: accountId, referenceEntryId: reference("ACCOUNT", code), poEntryId: reference("PO", po), fpEntryId: reference("FP", "1"), omitCo: true });
      const seed = async (suffix: string, date: string, value: string, eventType: string) => {
        const entries = await fixture.db.$transaction(async tx => Promise.all(["debito", "credito"].map(async accountId => {
          const msc = await composeMscLineDimensions(tx, { ...scope, date: new Date(date) }, accountId, { resourceSourceId: "livre" });
          return { accountId, date: new Date(date), type: accountId === "debito" ? "Débito" : "Crédito", value: Number(value), valueDecimal: value, history: suffix, authorId: "servidora-ana", classificationSnapshot: { dimensions: { governmentEntityId: entityId, budgetUnitId: unitId, msc } } };
        })));
        await fixture.db.accountingTransaction.create({ data: { id: `${entityId}:${suffix}`, date: new Date(date), financialYearId: yearId, governmentEntityId: entityId, budgetUnitId: unitId, authorUsuarioId: "ana", history: suffix, status: "POSTADO", eventType, entries: { create: entries } } });
      };
      await seed("opening", "2026-01-01", "1.00", "ACCOUNTING_YEAR_OPENING");
      await seed("receipt", "2026-01-20", entityId === "ente" ? "0.10" : "0.20", "DOCUMENTED_EVENT");
    }
    const input = { reportingScopeEntryId: scopeId, period: "2026-01" };
    const actor = { usuarioId: "ana" };
    await assert.rejects(generateMunicipalMscArchive(fixture.db, { ...actor, allowedBudgetUnitIds: ["ug"] }, input), /todas as UGs/);
    await assert.rejects(generateMunicipalMscArchive(fixture.db, actor, input), /fechada/);
    for (const yearId of ["ano", "ano-camara"]) await fixture.db.monthlyAccountingClose.create({ data: { financialYearId: yearId, competence: new Date("2026-01-01"), status: "FECHADO" } });
    const archive = await generateMunicipalMscArchive(fixture.db, actor, input);
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
    assert.equal(await fixture.db.financialAuditLog.count({ where: { action: "MSC_FILE_GENERATED" } }), 1);
    const entry = await fixture.db.accountingEntry.findFirstOrThrow();
    await fixture.db.accountingEntry.update({ where: { id: entry.id }, data: { valueDecimal: "9.99" } });
    await assert.rejects(generateMunicipalMscArchive(fixture.db, actor, input), /balanceada/);
  } finally { await fixture.close(); }
});
