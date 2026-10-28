import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { accountingPlans, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { municipalFiscalIndexDefinitions } from "../src/db/schema/finance-fiscal-indices";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { defineMunicipalFiscalIndex, readMunicipalFiscalIndex, type FiscalIndexDefinition } from "../src/lib/financeiro/fiscal-indices";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { withDatabaseTransaction } from "../src/db/transaction";

const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const cut = new Date("2026-01-31T23:59:59.999Z");
const composition: FiscalIndexDefinition = { numerator: [{ label: "Aplicação conciliada", accountIds: ["debito"], side: "DEBIT_NET", operation: "ADD" }], denominator: [{ label: "Base de cálculo conciliada", accountIds: ["credito"], side: "CREDIT_NET", operation: "ADD" }] };

test("Índices: mínimo só é avaliado com definição, base positiva e competência fechada; revisão preserva memória", async () => {
  const f = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const connection = transport.connection;
    const db = connection.db;
    await f.rules();
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await db.insert(accountingPlans).values({ id: "outro", code: "ISOLATED.OTHER", name: "Contrapartida não incluída na aplicação", type: "Ativo" });
    await postAccountingTransaction(connection, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-10T12:00:00Z"), history: "Fatos isolados para memória do índice", sourceModule: "FINANCEIRO", sourceType: "FISCAL_FIXTURE", idempotencyKey: "fiscal-facts", lines: [{ accountId: "debito", type: "Débito", value: "15.00" }, { accountId: "outro", type: "Débito", value: "85.00" }, { accountId: "credito", type: "Crédito", value: "100.00" }] });
    const read = () => withDatabaseTransaction(connection, tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through: cut }), { isolationLevel: "repeatable read" });
    assert.equal((await read()).status, "NOT_EVALUATED");
    const input = { financialYearId: "ano", code: "HEALTH_MINIMUM" as const, legalReference: "Composição explicitamente definida na fixture isolada", minimumPercentage: "15", effectiveFrom: new Date("2026-01-01"), reason: "Configuração da leitura isolada", definition: composition };
    const first = await defineMunicipalFiscalIndex(connection, actor, input);
    assert.equal((await read()).status, "NOT_EVALUATED");
    await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-01-01"), status: "FECHADO", closedAt: new Date(), closedByUsuarioId: actor.usuarioId });
    const evaluated = await read();
    assert.equal(evaluated.status, "REGULAR"); assert.equal(evaluated.percentage, "15.0000"); assert.equal(evaluated.definitionId, first.id);
    const next = await defineMunicipalFiscalIndex(connection, actor, { ...input, minimumPercentage: "20", reason: "Nova referência da fixture" });
    assert.equal(next.revision, 2); assert.equal((await read()).status, "IRREGULAR");
    assert.equal(evaluated.percentage, "15.0000"); assert.equal(evaluated.definitionId, first.id);
    await assert.rejects(db.update(municipalFiscalIndexDefinitions).set({ minimumPercentage: new Decimal("1") }).where(eq(municipalFiscalIndexDefinitions.id, first.id)));
  } finally { try { await transport?.close(); } finally { await f.close(); } }
});

test("Índices: sobreposição de componentes e acesso parcial não produzem regularidade", async () => {
  const f = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const connection = transport.connection;
    const db = connection.db;
    await f.rules();
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await postAccountingTransaction(connection, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-10T12:00:00Z"), history: "Fatos isolados", sourceModule: "FINANCEIRO", sourceType: "FISCAL_FIXTURE", idempotencyKey: "fiscal-overlap", lines: [{ accountId: "debito", type: "Débito", value: "100.00" }, { accountId: "credito", type: "Crédito", value: "100.00" }] });
    await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-01-01"), status: "FECHADO" });
    await defineMunicipalFiscalIndex(connection, actor, { financialYearId: "ano", code: "EDUCATION_MINIMUM", legalReference: "Definição isolada", minimumPercentage: "25", effectiveFrom: new Date("2026-01-01"), reason: "Conferência de sobreposição", definition: { ...composition, numerator: [composition.numerator[0], { ...composition.numerator[0], label: "Seleção duplicada" }] } });
    const result = await withDatabaseTransaction(connection, tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "EDUCATION_MINIMUM", through: cut }));
    assert.equal(result.status, "NOT_EVALUATED"); assert.equal(result.percentage, null); assert.ok(result.issues.some(issue => issue.includes("mais de um componente")));
    await assert.rejects(withDatabaseTransaction(connection, tx => readMunicipalFiscalIndex(tx, { ...actor, allowedBudgetUnitIds: ["ug"] }, { financialYearId: "ano", code: "EDUCATION_MINIMUM", through: cut })));
  } finally { try { await transport?.close(); } finally { await f.close(); } }
});

test("Índices: Câmara não recebe cálculo de mínimo municipal do Executivo", async () => {
  const f = await createPlanningAccountingFixture("LEGISLATIVE");
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const result = await withDatabaseTransaction(transport.connection, tx => readMunicipalFiscalIndex(tx, actor, { financialYearId: "ano", code: "HEALTH_MINIMUM", through: cut }));
    assert.equal(result.status, "NOT_EVALUATED"); assert.equal(result.percentage, null); assert.ok(result.issues.some(issue => issue.includes("Câmara")));
  } finally { try { await transport?.close(); } finally { await f.close(); } }
});
