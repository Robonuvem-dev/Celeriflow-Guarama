import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getOrCreateHrConfigurationInstance } from "../src/lib/rh/payroll-configuration";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
const code = "RH_ENGINE_DEMO_2026";
const legalReference = "DEMONSTRAÇÃO SINTÉTICA. Valores não são oficiais nem autorizam recolhimento ou remessa.";

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", code, creates: ["conjunto demonstrativo", "política", "rubricas", "previdência sintética", "regime", "mapeamento de eventos"], createsEmployees: false, createsUsers: false, createsPayrolls: false, grantsPermissions: false }, null, 2));
    return;
  }
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('RH_ENGINE_DEMO_SEED'))`;
    const instance = await getOrCreateHrConfigurationInstance(tx);
    const effectiveFrom = new Date("2026-01-01T00:00:00Z");
    const existing = await tx.hrPayrollRuleSet.findUnique({ where: { configuracaoInstanciaId_code_effectiveFrom: { configuracaoInstanciaId: instance.id, code, effectiveFrom } } });
    if (existing && (!existing.isDemo || existing.scope !== "DEMONSTRACAO")) throw new Error("Código existente não é demonstrativo; não foi alterado.");
    const set = existing || await tx.hrPayrollRuleSet.create({ data: { configuracaoInstanciaId: instance.id, code, name: "Motor RH/Folha — parâmetros sintéticos 2026", status: "ATIVA", scope: "DEMONSTRACAO", isDemo: true, effectiveFrom, effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), legalReference } });
    await tx.hrCalculationPolicy.upsert({ where: { ruleSetId: set.id }, create: { ruleSetId: set.id, roundingMode: "HALF_UP", roundingScale: 2, movementCutoffDay: 20, negativeNetPayPolicy: "BLOQUEAR", freezeOnClose: true, legalReference }, update: {} });
    const scheme = await tx.hrSocialSecurityScheme.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "RGPS_SINTETICO" } }, create: { ruleSetId: set.id, code: "RGPS_SINTETICO", name: "RGPS — tabela fictícia de demonstração", regime: "RGPS", employeeCalculationMethod: "PROGRESSIVA", ceilingValue: "4000.00", employerContributionRate: "20", legalReference }, update: {} });
    await tx.hrSocialSecurityBand.createMany({ data: [{ socialSecuritySchemeId: scheme.id, sequence: 1, lowerLimit: "0", upperLimit: "1000", employeeRate: "5" }, { socialSecuritySchemeId: scheme.id, sequence: 2, lowerLimit: "1000", upperLimit: null, employeeRate: "10" }], skipDuplicates: true });
    const vacation = await tx.hrVacationPolicy.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "FERIAS_SINTETICAS" } }, create: { ruleSetId: set.id, code: "FERIAS_SINTETICAS", name: "Férias — política fictícia de demonstração", employmentNature: "CLT", acquisitionMonths: 12, concessionMonths: 12, entitlementDays: 30, maxSplits: 3, minFirstSplitDays: 14, minOtherSplitDays: 5, additionalPayRate: "33.333333", allowsCashAbono: true, maxCashAbonoDays: 10, requiresApproval: true, legalReference }, update: {} });
    const regime = await tx.hrEmploymentRegime.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "CLT_SINTETICO" } }, create: { ruleSetId: set.id, code: "CLT_SINTETICO", name: "Contrato — regime fictício de demonstração", employmentNature: "CLT", defaultMonthlyHours: 220, socialSecuritySchemeId: scheme.id, vacationPolicyId: vacation.id, legalReference }, update: {} });
    const salary = await tx.hrPayrollRubric.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "VENCIMENTO" } }, create: { ruleSetId: set.id, code: "VENCIMENTO", name: "Vencimento demonstrativo", type: "PROVENTO", calculationMethod: "FORMULA_CONTROLADA", formulaExpression: "SALARIO_BASE * DIAS / 30", priority: 10, legalReference }, update: {} });
    await tx.hrPayrollRubricIncidence.createMany({ data: ["RGPS", "IRRF"].map(incidenceType => ({ rubricId: salary.id, incidenceType, isIncluded: true })), skipDuplicates: true });
    await tx.hrPayrollRubric.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "VARIAVEL" } }, create: { ruleSetId: set.id, code: "VARIAVEL", name: "Movimento demonstrativo", type: "PROVENTO", calculationMethod: "MANUAL", priority: 20, legalReference }, update: {} });
    const eventMapping: Record<string, string> = {};
    for (const [rubricCode, eventType] of [["VENCIMENTO", "Vencimento"], ["VARIAVEL", "Vencimento"], ["PREVIDENCIA_RGPS_SINTETICO", "Desconto"], ["IRRF", "Desconto"]]) {
      const event = await tx.payrollEvent.upsert({ where: { code: `RH_ENGINE_DEMO_${rubricCode}` }, create: { code: `RH_ENGINE_DEMO_${rubricCode}`, name: `DEMONSTRAÇÃO · ${rubricCode}`, type: eventType, isActive: true }, update: {} });
      if (event.type !== eventType || event.formula?.trim()) throw new Error("Evento demonstrativo existente foi alterado; revise antes de repetir o seed.");
      eventMapping[rubricCode] = event.id;
    }
    const rules: { code: string; name: string; valueType: string; value: Prisma.InputJsonValue }[] = [
      { code: "FOLHA_EVENTOS", name: "Mapeamento explícito de eventos demonstrativos", valueType: "JSON", value: eventMapping },
      { code: "IRRF_FAIXAS", name: "IRRF fictício de demonstração", valueType: "JSON", value: [{ lowerLimit: "0", upperLimit: "1000", employeeRate: "0" }, { lowerLimit: "1000", upperLimit: null, employeeRate: "10" }] },
      { code: "IRRF_DEDUCAO_DEPENDENTE", name: "Dedução fictícia por dependente", valueType: "CURRENCY", value: "100.00" },
      { code: "PREVIDENCIA_BASE_PATRONAL_RGPS_SINTETICO", name: "Base patronal sem teto — demonstração", valueType: "TEXT", value: "SEM_TETO" },
    ];
    for (const rule of rules) await tx.hrPayrollRule.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: rule.code } }, create: { ...rule, ruleSetId: set.id, category: "CALCULO", legalReference, isActive: true }, update: {} });
    return { ruleSetId: set.id, regimeId: regime.id, scope: set.scope, createdEmployees: 0, createdUsers: 0, createdPayrolls: 0 };
  }, { timeout: 60000 });
  console.log(JSON.stringify({ mode: "DEMO_PARAMETERS_ONLY", ...result }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Seed demonstrativo não concluído."); process.exitCode = 1; }).finally(() => db.$disconnect());
