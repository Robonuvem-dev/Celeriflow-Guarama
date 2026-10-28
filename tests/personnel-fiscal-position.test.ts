import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { financialYears } from "../src/db/schema/finance-years";
import { accountingPlans, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { definePersonnelFiscalComposition, readPersonnelFiscalPosition } from "../src/lib/financeiro/personnel-fiscal";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { generateRGF } from "../src/lib/financeiro/relatorios-legais";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P7: pessoal/RCL usa 12 competências do ente, composição aditiva e limite próprio (${jurisdiction})`, async () => {
    const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
    process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
    const f = await createPlanningAccountingFixture(jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      await f.rules();
      await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
      const [priorYear] = await db.insert(financialYears).values({ governmentEntityId: "ente", year: 2025, status: "Aberto", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") }).returning();
      const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
      const cut = new Date("2026-01-31T23:59:59.999Z");
      const positionInput = { financialYearId: "ano", through: cut, budgetUnitIds: actor.allowedBudgetUnitIds };
      assert.equal((await readPersonnelFiscalPosition(connection, positionInput)).status, "NOT_EVALUATED");
      const definition = { personnel: [{ label: "Pessoal por competência", accountIds: ["debito"], side: "DEBIT_NET" as const, operation: "ADD" as const, sourceTypes: ["PERSONNEL_FIXTURE"] }], adjustedRcl: [{ label: "RCL ajustada por competência", accountIds: ["credito"], side: "CREDIT_NET" as const, operation: "ADD" as const, sourceTypes: ["RCL_FIXTURE"] }] };
      const config = { financialYearId: "ano", effectiveFrom: "2026-01-01", legalReference: "Composição e limites da fixture isolada", legalLimit: jurisdiction === "LEGISLATIVE" ? "6" : "54", prudentialLimit: jurisdiction === "LEGISLATIVE" ? "5.7" : "51.3", alertLimit: jurisdiction === "LEGISLATIVE" ? "5.4" : "48.6", definition, reason: "Composição explícita da apuração isolada" };
      const first = await definePersonnelFiscalComposition(connection, actor, config);
      await db.insert(accountingPlans).values({ id: "fiscal-counter", code: "FISCAL.COUNTER", name: "Contrapartida da fixture", type: "Ativo" });
      for (const year of [priorYear.id, "ano"]) {
        await postAccountingTransaction(connection, actor, { financialYearId: year, governmentEntityId: "ente", budgetUnitId: "ug", date: new Date(year === "ano" ? "2026-01-10" : "2025-02-10"), history: "Competência de pessoal", sourceType: "PERSONNEL_FIXTURE", idempotencyKey: `personnel-${year}`, lines: [{ accountId: "debito", type: "Débito", value: "5.00" }, { accountId: "fiscal-counter", type: "Crédito", value: "5.00" }] });
        await postAccountingTransaction(connection, actor, { financialYearId: year, governmentEntityId: "ente", budgetUnitId: "ug", date: new Date(year === "ano" ? "2026-01-10" : "2025-02-10"), history: "Competência da RCL", sourceType: "RCL_FIXTURE", idempotencyKey: `rcl-${year}`, lines: [{ accountId: "fiscal-counter", type: "Débito", value: "50.00" }, { accountId: "credito", type: "Crédito", value: "50.00" }] });
      }
      for (let at = 0; at < 12; at++) {
        const competence = new Date(Date.UTC(2025, 1 + at, 1));
        await db.insert(monthlyAccountingCloses).values({ financialYearId: competence.getUTCFullYear() === 2025 ? priorYear.id : "ano", competence, status: "FECHADO" });
      }
      const evaluated = await readPersonnelFiscalPosition(connection, positionInput);
      assert.equal(evaluated.percentage, "10.0000");
      assert.equal(evaluated.personnel, "10.00");
      assert.equal(evaluated.adjustedRcl, "100.00");
      assert.equal(evaluated.status, jurisdiction === "LEGISLATIVE" ? "EXCEDIDO" : "REGULAR");
      assert.equal(evaluated.definitionId, first.id);
      assert.equal(evaluated.rows.reduce((count, row) => count + row.entryIds.length, 0), 4);
      assert.equal((await generateRGF(connection, { financialYearId: "ano", endDate: cut, budgetUnitIds: actor.allowedBudgetUnitIds })).percentualAtingido, 10);
      assert.equal((await readPersonnelFiscalPosition(connection, { ...positionInput, through: new Date("2026-01-15T23:59:59.999Z") })).status, "NOT_EVALUATED");
      await assert.rejects(readPersonnelFiscalPosition(connection, { ...positionInput, budgetUnitIds: ["ug"] }), /todas as UGs/);
      await assert.rejects(f.pg.query('UPDATE "MunicipalPersonnelFiscalDefinition" SET "legalLimit"=1 WHERE id=$1', [first.id]), /aditiva/);
      const duplicated = await definePersonnelFiscalComposition(connection, actor, { ...config, definition: { ...definition, personnel: [...definition.personnel, { ...definition.personnel[0], label: "Seleção duplicada" }] } });
      assert.equal(duplicated.revision, 2);
      const invalid = await readPersonnelFiscalPosition(connection, positionInput);
      assert.equal(invalid.status, "NOT_EVALUATED"); assert.equal(invalid.percentage, null);
      assert.ok(invalid.issues.some(issue => issue.includes("duplicada")));
    } finally {
      try { await finance?.close(); } finally {
        try { await f.close(); } finally {
          if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
        }
      }
    }
  });
}
