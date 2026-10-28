import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import type { JsonValue } from "../src/db/json";
import { hrCalculationPolicies, hrEmploymentRegimes, hrPayrollRubricIncidences, hrPayrollRubrics, hrPayrollRules, hrPayrollRuleSets, hrSocialSecurityBands, hrSocialSecuritySchemes, hrVacationPolicies } from "../src/db/schema/personnel-configuration";
import { payrollEvents } from "../src/db/schema/personnel-workforce";
import { getOrCreateHrConfigurationInstance } from "../src/lib/rh/payroll-configuration";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
const code = "RH_ENGINE_DEMO_2026";
const legalReference = "DEMONSTRAÇÃO SINTÉTICA. Valores não são oficiais nem autorizam recolhimento ou remessa.";

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", code, creates: ["conjunto demonstrativo", "política", "rubricas", "previdência sintética", "regime", "mapeamento de eventos"], createsEmployees: false, createsUsers: false, createsPayrolls: false, grantsPermissions: false }, null, 2));
    return;
  }
  const result = await withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('RH_ENGINE_DEMO_SEED'))`);
    const instance = await getOrCreateHrConfigurationInstance(tx);
    const effectiveFrom = new Date("2026-01-01T00:00:00Z");
    const [existing] = await tx.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.configuracaoInstanciaId, instance.id), eq(hrPayrollRuleSets.code, code), eq(hrPayrollRuleSets.effectiveFrom, effectiveFrom))).limit(1);
    if (existing && (!existing.isDemo || existing.scope !== "DEMONSTRACAO")) throw new Error("Código existente não é demonstrativo; não foi alterado.");
    const set = existing || (await tx.insert(hrPayrollRuleSets).values({ configuracaoInstanciaId: instance.id, code, name: "Motor RH/Folha — parâmetros sintéticos 2026", status: "ATIVA", scope: "DEMONSTRACAO", isDemo: true, effectiveFrom, effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), legalReference }).returning())[0];
    await tx.insert(hrCalculationPolicies).values({ ruleSetId: set.id, roundingMode: "HALF_UP", roundingScale: 2, movementCutoffDay: 20, negativeNetPayPolicy: "BLOQUEAR", freezeOnClose: true, legalReference }).onConflictDoNothing({ target: hrCalculationPolicies.ruleSetId });
    await tx.insert(hrSocialSecuritySchemes).values({ ruleSetId: set.id, code: "RGPS_SINTETICO", name: "RGPS — tabela fictícia de demonstração", regime: "RGPS", employeeCalculationMethod: "PROGRESSIVA", ceilingValue: new Decimal("4000.00"), employerContributionRate: new Decimal("20"), legalReference }).onConflictDoNothing({ target: [hrSocialSecuritySchemes.ruleSetId, hrSocialSecuritySchemes.code] });
    const [scheme] = await tx.select().from(hrSocialSecuritySchemes).where(and(eq(hrSocialSecuritySchemes.ruleSetId, set.id), eq(hrSocialSecuritySchemes.code, "RGPS_SINTETICO"))).limit(1);
    await tx.insert(hrSocialSecurityBands).values([{ socialSecuritySchemeId: scheme.id, sequence: 1, lowerLimit: new Decimal("0"), upperLimit: new Decimal("1000"), employeeRate: new Decimal("5") }, { socialSecuritySchemeId: scheme.id, sequence: 2, lowerLimit: new Decimal("1000"), upperLimit: null, employeeRate: new Decimal("10") }]).onConflictDoNothing();
    await tx.insert(hrVacationPolicies).values({ ruleSetId: set.id, code: "FERIAS_SINTETICAS", name: "Férias — política fictícia de demonstração", employmentNature: "CLT", acquisitionMonths: 12, concessionMonths: 12, entitlementDays: 30, maxSplits: 3, minFirstSplitDays: 14, minOtherSplitDays: 5, additionalPayRate: new Decimal("33.333333"), allowsCashAbono: true, maxCashAbonoDays: 10, requiresApproval: true, legalReference }).onConflictDoNothing({ target: [hrVacationPolicies.ruleSetId, hrVacationPolicies.code] });
    const [vacation] = await tx.select().from(hrVacationPolicies).where(and(eq(hrVacationPolicies.ruleSetId, set.id), eq(hrVacationPolicies.code, "FERIAS_SINTETICAS"))).limit(1);
    await tx.insert(hrEmploymentRegimes).values({ ruleSetId: set.id, code: "CLT_SINTETICO", name: "Contrato — regime fictício de demonstração", employmentNature: "CLT", defaultMonthlyHours: 220, socialSecuritySchemeId: scheme.id, vacationPolicyId: vacation.id, legalReference }).onConflictDoNothing({ target: [hrEmploymentRegimes.ruleSetId, hrEmploymentRegimes.code] });
    const [regime] = await tx.select().from(hrEmploymentRegimes).where(and(eq(hrEmploymentRegimes.ruleSetId, set.id), eq(hrEmploymentRegimes.code, "CLT_SINTETICO"))).limit(1);
    await tx.insert(hrPayrollRubrics).values({ ruleSetId: set.id, code: "VENCIMENTO", name: "Vencimento demonstrativo", type: "PROVENTO", calculationMethod: "FORMULA_CONTROLADA", formulaExpression: "SALARIO_BASE * DIAS / 30", priority: 10, legalReference }).onConflictDoNothing({ target: [hrPayrollRubrics.ruleSetId, hrPayrollRubrics.code] });
    const [salary] = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, set.id), eq(hrPayrollRubrics.code, "VENCIMENTO"))).limit(1);
    await tx.insert(hrPayrollRubricIncidences).values(["RGPS", "IRRF"].map(incidenceType => ({ rubricId: salary.id, incidenceType, isIncluded: true }))).onConflictDoNothing();
    await tx.insert(hrPayrollRubrics).values({ ruleSetId: set.id, code: "VARIAVEL", name: "Movimento demonstrativo", type: "PROVENTO", calculationMethod: "MANUAL", priority: 20, legalReference }).onConflictDoNothing({ target: [hrPayrollRubrics.ruleSetId, hrPayrollRubrics.code] });
    const eventMapping: Record<string, string> = {};
    for (const [rubricCode, eventType] of [["VENCIMENTO", "Vencimento"], ["VARIAVEL", "Vencimento"], ["PREVIDENCIA_RGPS_SINTETICO", "Desconto"], ["IRRF", "Desconto"]]) {
      await tx.insert(payrollEvents).values({ code: `RH_ENGINE_DEMO_${rubricCode}`, name: `DEMONSTRAÇÃO · ${rubricCode}`, type: eventType, isActive: true }).onConflictDoNothing({ target: payrollEvents.code });
      const [event] = await tx.select().from(payrollEvents).where(eq(payrollEvents.code, `RH_ENGINE_DEMO_${rubricCode}`)).limit(1);
      if (event.type !== eventType || event.formula?.trim()) throw new Error("Evento demonstrativo existente foi alterado; revise antes de repetir o seed.");
      eventMapping[rubricCode] = event.id;
    }
    const rules: { code: string; name: string; valueType: string; value: JsonValue }[] = [
      { code: "FOLHA_EVENTOS", name: "Mapeamento explícito de eventos demonstrativos", valueType: "JSON", value: eventMapping },
      { code: "IRRF_FAIXAS", name: "IRRF fictício de demonstração", valueType: "JSON", value: [{ lowerLimit: "0", upperLimit: "1000", employeeRate: "0" }, { lowerLimit: "1000", upperLimit: null, employeeRate: "10" }] },
      { code: "IRRF_DEDUCAO_DEPENDENTE", name: "Dedução fictícia por dependente", valueType: "CURRENCY", value: "100.00" },
      { code: "PREVIDENCIA_BASE_PATRONAL_RGPS_SINTETICO", name: "Base patronal sem teto — demonstração", valueType: "TEXT", value: "SEM_TETO" },
    ];
    for (const rule of rules) await tx.insert(hrPayrollRules).values({ ...rule, ruleSetId: set.id, category: "CALCULO", legalReference, isActive: true }).onConflictDoNothing({ target: [hrPayrollRules.ruleSetId, hrPayrollRules.code] });
    return { ruleSetId: set.id, regimeId: regime.id, scope: set.scope, createdEmployees: 0, createdUsers: 0, createdPayrolls: 0 };
  }, { timeoutMs: 60000 });
  console.log(JSON.stringify({ mode: "DEMO_PARAMETERS_ONLY", ...result }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Seed demonstrativo não concluído."); process.exitCode = 1; }).finally(() => connection.pool.end());
