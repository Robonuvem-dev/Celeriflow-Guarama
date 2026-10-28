import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { readPlanningRclExecution } from "../src/lib/planejamento/fiscal-execution";
import { and, eq } from "drizzle-orm";
import { governmentEntities } from "../src/db/schema/master-data";
import { financialYears } from "../src/db/schema/finance-years";
import { monthlyAccountingCloses } from "../src/db/schema/finance-accounting";

test("RCL não utiliza fechamentos da Câmara nem de exercícios legados para comprovar histórico da Prefeitura", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    const now = new Date();
    const cutoff = now.toISOString().slice(0, 10);
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1)));
    await f.db.insert(governmentEntities).values({ id: "camara-rcl", code: "CM-RCL", name: "Câmara Municipal", type: "CAMARA", status: "ATIVA" });
    for (const year of [...new Set(months.map(month => month.getUTCFullYear()))]) {
      const [executive] = await f.db.select().from(financialYears).where(and(eq(financialYears.year, year), eq(financialYears.governmentEntityId, "ente"))).limit(1);
      const [legislature] = await f.db.insert(financialYears).values({ year, governmentEntityId: "camara-rcl", status: "Aberto", startDate: new Date(`${year}-01-01`), endDate: new Date(`${year}-12-31`) }).returning();
      const local = executive ?? (await f.db.insert(financialYears).values({ year, governmentEntityId: "ente", status: "Aberto", startDate: new Date(`${year}-01-01`), endDate: new Date(`${year}-12-31`) }).returning())[0];
      for (const month of months.filter(month => month.getUTCFullYear() === year)) {
        await f.db.insert(monthlyAccountingCloses).values({ financialYearId: legislature.id, competence: month, status: "FECHADO" });
        if (month.getTime() !== from.getTime()) await f.db.insert(monthlyAccountingCloses).values({ financialYearId: local.id, competence: month, status: "FECHADO" });
      }
    }
    const references = [{ budgetUnitId: "ug", resourceSourceId: "livre", revenueNature: { id: "receita" } }];
    const result = await readPlanningRclExecution(f.context, "ente", references, cutoff);
    assert.equal(result.status, "INCOMPLETE");
    assert.equal(result.total, null);
    assert.ok(result.rows.some(row => "situação" in row && row.competência === from.toISOString().slice(0, 7) && row.situação === "Histórico/fechamento não confirmado"));
    await assert.rejects(readPlanningRclExecution(f.context, "ente", [{ ...references[0], budgetUnitId: "UG-ALHEIA" }], cutoff), /fora da entidade/);
  } finally { await f.close(); }
});

test("RCL recusa corte parcial mesmo com as 12 competências do ente marcadas como fechadas", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    const [prior] = await f.db.insert(financialYears).values({ year: 2025, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") }).returning();
    for (let at = 0; at < 12; at++) {
      const competence = new Date(Date.UTC(2025, 1 + at, 1));
      await f.db.insert(monthlyAccountingCloses).values({ financialYearId: competence.getUTCFullYear() === 2025 ? prior.id : "ano", competence, status: "FECHADO" });
    }
    const result = await readPlanningRclExecution(f.context, "ente", [{ budgetUnitId: "ug", resourceSourceId: "livre", revenueNature: { id: "receita" } }], "2026-01-15");
    assert.equal(result.status, "INCOMPLETE"); assert.equal(result.total, null);
    assert.ok(result.rows.some(row => "situação" in row && row.situação === "Corte não encerra competência mensal completa"));
  } finally { await f.close(); }
});
