import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { defineMunicipalFiscalIndex, readMunicipalFiscalIndex, type FiscalIndexDefinition } from "../src/lib/financeiro/fiscal-indices";
import { postAccountingTransaction } from "../src/lib/financeiro";

const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const cut = new Date("2026-01-31T23:59:59.999Z");
const composition: FiscalIndexDefinition = { numerator: [{ label: "Aplicação conciliada", accountIds: ["debito"], side: "DEBIT_NET", operation: "ADD" }], denominator: [{ label: "Base de cálculo conciliada", accountIds: ["credito"], side: "CREDIT_NET", operation: "ADD" }] };

test("Índices: mínimo só é avaliado com definição, base positiva e competência fechada; revisão preserva memória", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.rules();
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await f.db.accountingPlan.create({ data: { id: "outro", code: "ISOLATED.OTHER", name: "Contrapartida não incluída na aplicação", type: "Ativo" } });
    await postAccountingTransaction(f.db, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-10T12:00:00Z"), history: "Fatos isolados para memória do índice", sourceModule: "FINANCEIRO", sourceType: "FISCAL_FIXTURE", idempotencyKey: "fiscal-facts", lines: [{ accountId: "debito", type: "Débito", value: "15.00" }, { accountId: "outro", type: "Débito", value: "85.00" }, { accountId: "credito", type: "Crédito", value: "100.00" }] });
    const read = () => f.db.$transaction(tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through: cut }));
    assert.equal((await read()).status, "NOT_EVALUATED");
    const input = { financialYearId: "ano", code: "HEALTH_MINIMUM" as const, legalReference: "Composição explicitamente definida na fixture isolada", minimumPercentage: "15", effectiveFrom: new Date("2026-01-01"), reason: "Configuração da leitura isolada", definition: composition };
    const first = await defineMunicipalFiscalIndex(f.db, actor, input);
    assert.equal((await read()).status, "NOT_EVALUATED");
    await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-01-01"), status: "FECHADO", closedAt: new Date(), closedByUsuarioId: actor.usuarioId } });
    const evaluated = await read();
    assert.equal(evaluated.status, "REGULAR"); assert.equal(evaluated.percentage, "15.0000"); assert.equal(evaluated.definitionId, first.id);
    const next = await defineMunicipalFiscalIndex(f.db, actor, { ...input, minimumPercentage: "20", reason: "Nova referência da fixture" });
    assert.equal(next.revision, 2); assert.equal((await read()).status, "IRREGULAR");
    assert.equal(evaluated.percentage, "15.0000"); assert.equal(evaluated.definitionId, first.id);
    await assert.rejects(f.db.municipalFiscalIndexDefinition.update({ where: { id: first.id }, data: { minimumPercentage: "1" } }));
  } finally { await f.close(); }
});

test("Índices: sobreposição de componentes e acesso parcial não produzem regularidade", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.rules();
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await postAccountingTransaction(f.db, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-10T12:00:00Z"), history: "Fatos isolados", sourceModule: "FINANCEIRO", sourceType: "FISCAL_FIXTURE", idempotencyKey: "fiscal-overlap", lines: [{ accountId: "debito", type: "Débito", value: "100.00" }, { accountId: "credito", type: "Crédito", value: "100.00" }] });
    await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-01-01"), status: "FECHADO" } });
    await defineMunicipalFiscalIndex(f.db, actor, { financialYearId: "ano", code: "EDUCATION_MINIMUM", legalReference: "Definição isolada", minimumPercentage: "25", effectiveFrom: new Date("2026-01-01"), reason: "Conferência de sobreposição", definition: { ...composition, numerator: [composition.numerator[0], { ...composition.numerator[0], label: "Seleção duplicada" }] } });
    const result = await f.db.$transaction(tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "EDUCATION_MINIMUM", through: cut }));
    assert.equal(result.status, "NOT_EVALUATED"); assert.equal(result.percentage, null); assert.ok(result.issues.some(issue => issue.includes("mais de um componente")));
    await assert.rejects(f.db.$transaction(tx => readMunicipalFiscalIndex(tx, { ...actor, allowedBudgetUnitIds: ["ug"] }, { financialYearId: "ano", code: "EDUCATION_MINIMUM", through: cut })));
  } finally { await f.close(); }
});

test("Índices: Câmara não recebe cálculo de mínimo municipal do Executivo", async () => {
  const f = await createPlanningAccountingFixture("LEGISLATIVE");
  try {
    const result = await f.db.$transaction(tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through: cut }));
    assert.equal(result.status, "NOT_EVALUATED"); assert.equal(result.percentage, null); assert.ok(result.issues.some(issue => issue.includes("Câmara")));
  } finally { await f.close(); }
});
