import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "../src/db/decimal";
import { calculatePayrollPensions } from "../src/lib/rh/payroll-pensions";
import { calculateConsignmentMargin } from "../src/lib/rh/consignment-margin";
import { allocateTaxDifference } from "../src/lib/rh/payroll-tax-compensation";
import { retirementAgeReached, retirementAgeForPoints, retirementTransitionThresholds } from "../src/lib/rh/retirement-rule-extensions";
import { resolvePayrollCategory } from "../src/lib/rh/functional-payroll";
import { resolveCategoryIncidences } from "../src/lib/rh/category-incidences";
import { HR_PAYROLL_TYPES } from "../src/lib/rh/calculation-engine";
import type { FunctionalRecord } from "../src/lib/rh/functional-record-service";

const period = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-30T23:59:59.999Z") };
const recordDefaults = { version: 1, name: "Regra municipal", status: "ATIVO", createdAt: period.start, updatedAt: period.start, employeeId: null, contractId: null, key: "regra", actorId: "rh" };
const pension = { id: "judicial", contractId: "vinculo", beneficiaryPersonId: "beneficiaria", courtReference: "Processo municipal 123", startsAt: "2026-01-01", endsAt: null, payrollTypes: ["Mensal"], method: "PERCENTUAL", value: "20.00", basis: "APOS_IRRF", deductFromIncomeTax: false };
const pensionInput = { ...period, contractId: "vinculo", payrollType: "Mensal", gross: "1000.00", socialContribution: "-40.00", incomeTax: "-60.00", phase: "APOS_IRRF" as const };

test("pensão: restituição fiscal só aumenta a base mediante previsão expressa do título", () => {
  const policy = { origin: "PENSOES_FOLHA", legalReference: "Título judicial vigente", entries: [pension] };
  const ordinary = calculatePayrollPensions(policy, pensionInput)[0];
  assert.equal(ordinary.base, "1000.00"); assert.equal(ordinary.amount, "200.00");
  const explicit = calculatePayrollPensions({ ...policy, entries: [{ ...pension, taxRefundTreatment: "INCLUIR_CONFORME_TITULO" }] }, pensionInput)[0];
  assert.equal(explicit.amount, "220.00");
  assert.equal(explicit.compensationMemory.incomeTaxRefund, "60.00");
});

test("pensão: início intramês distingue proporcionalidade civil, integralidade expressa e ausência de decisão", () => {
  const entry = { ...pension, method: "FIXO", value: "300.00", startsAt: "2026-09-16" };
  const policy = (partialPeriod?: string) => ({ origin: "PENSOES_FOLHA", legalReference: "Título judicial vigente", entries: [{ ...entry, ...(partialPeriod ? { partialPeriod } : {}) }] });
  assert.throws(() => calculatePayrollPensions(policy(), pensionInput), /decisão explícita/);
  const proportional = calculatePayrollPensions(policy("PROPORCIONAL_DIAS_CIVIS"), pensionInput)[0];
  assert.equal(proportional.amount, "150.00"); assert.equal(proportional.periodMemory.days, 15);
  assert.equal(calculatePayrollPensions(policy("INTEGRAL_CONFORME_TITULO"), pensionInput)[0].amount, "300.00");
});

test("margem: restituição não se torna remuneração ordinária nem duplica limite entre vínculos", () => {
  const policy = { origin: "MARGEM_CONSIGNAVEL", remunerationRubricCodes: ["BASE"], compulsoryDeductionRubricCodes: ["IRRF"], consignmentRubricCodes: ["CONSIGNADO"], legalReference: "Lei municipal de consignação" };
  const rows = ["a", "b"].map(contractId => ({ contractId, items: [{ code: "BASE", type: "PROVENTO", value: "500.00" }, { code: "IRRF", type: "DESCONTO", value: "-50.00" }, { code: "CONSIGNADO", type: "DESCONTO", value: "100.00" }] }));
  const margin = calculateConsignmentMargin(rows, policy, 30);
  assert.equal(margin.base, "1000.00"); assert.equal(margin.limit, "300.00"); assert.equal(margin.available, "100.00");
  assert.equal(calculateConsignmentMargin(rows, { ...policy, taxRefundTreatment: "DEDUZIR_DA_RETENCAO" }, 30).limit, "330.00");
  assert.throws(() => calculateConsignmentMargin([rows[0], rows[0]], policy, 30), /duplicados/);
});

test("compensação: conserva centavos/sinal e impede crédito superior à retenção ou sem autorização", () => {
  const input = { amount: new Decimal("-0.05"), bases: [new Decimal(0), new Decimal(0)], previousBases: [new Decimal(1), new Decimal(2)], tax: "IRRF" as const, payrollType: "Diferença 13º", reference: "2026-09-30", priorTax: new Decimal("0.05"), policy: { origin: "COMPENSACAO_TRIBUTARIA_FOLHA", payrollTypes: ["Diferença 13º"], taxes: ["IRRF"], from: "2026-01-01", until: "2026-12-31", legalReference: "Fundamento municipal da compensação" } };
  const parts = allocateTaxDifference(input);
  assert.equal(parts.reduce((sum, value) => sum.add(value), new Decimal(0)).toFixed(2), "-0.05");
  assert.ok(parts.every(value => value.lte(0)));
  assert.throws(() => allocateTaxDifference({ ...input, amount: new Decimal("-0.06") }), /superar/);
  assert.throws(() => allocateTaxDifference({ ...input, reference: "2027-01-01" }), /não está autorizada/);
});

test("aposentadoria: idade civil em meses, aniversário de fevereiro e limites progressivos", () => {
  const birth = new Date("1964-02-29T00:00:00Z");
  assert.equal(retirementAgeReached(birth, new Date("2026-02-27T00:00:00Z"), new Decimal(62)), false);
  assert.equal(retirementAgeReached(birth, new Date("2026-02-28T00:00:00Z"), new Decimal(62)), true);
  assert.equal(retirementAgeReached(birth, new Date("2026-08-28T00:00:00Z"), new Decimal("62.5")), false);
  assert.equal(retirementAgeReached(birth, new Date("2026-08-29T00:00:00Z"), new Decimal("62.5")), true);
  assert.ok(retirementAgeForPoints(birth, new Date("2026-08-29T00:00:00Z")).gt(62));
  const thresholds = retirementTransitionThresholds({ minimumAge: "60", annualAgeIncrease: "0.5", maximumAge: "62", minimumPoints: "90", annualPointsIncrease: "1", maximumPoints: "95", escalationFrom: "2020-01-01" }, "2026-09-30");
  assert.equal(thresholds.age.toString(), "62"); assert.equal(thresholds.points.toString(), "95");
});

test("categorias: todas as modalidades preservam/excluem incidências declaradas sem criar incidências", () => {
  for (const category of ["ATIVO", "APOSENTADO", "PENSIONISTA"]) for (const payrollType of HR_PAYROLL_TYPES) {
    const policy: FunctionalRecord = { ...recordDefaults, id: "matriz", kind: "REGRA_INCIDENCIAS_CATEGORIA", startsAt: new Date("2026-01-01"), endsAt: null, data: { category, payrollTypes: payrollType, RPPS: "MANTER", FGTS: "EXCLUIR" } };
    const rubric = { code: "BASE", name: "Vencimento", type: "PROVENTO", calculationMethod: "VALOR_FIXO", formulaExpression: null, calculationBaseCode: null, fixedValue: "1000", percentageRate: null, incidences: [{ incidenceType: "RPPS", isIncluded: true }, { incidenceType: "FGTS", isIncluded: true }, { incidenceType: "IRRF", isIncluded: false }] };
    const assessment = resolveCategoryIncidences([policy], { regimeId: "regime", roleId: "cargo" }, category, payrollType, period, [rubric]);
    assert.deepEqual(assessment.rubrics[0].incidences.map(item => item.isIncluded), [true, false, false]);
    assert.deepEqual(rubric.incidences.map(item => item.isIncluded), [true, true, false]);
  }
});

test("pensionista: vínculo deve pertencer à beneficiária e cobrir cada dia de vigência", () => {
  const contract = { salary: new Decimal(9000), employee: { personId: "beneficiaria" }, admittedAt: period.start, endsAt: null };
  const category: FunctionalRecord = { ...recordDefaults, id: "pensao", kind: "CATEGORIA_FOLHA", startsAt: period.start, endsAt: null, data: { category: "PENSIONISTA", beneficiaryPersonId: "beneficiaria", amount: "1500.00", legalReference: "Ato de concessão" } };
  assert.equal(resolvePayrollCategory([category], contract, period).salary.toFixed(2), "1500.00");
  assert.throws(() => resolvePayrollCategory([category], { ...contract, employee: { personId: "instituidor" } }, period), /contrato próprio/);
  assert.throws(() => resolvePayrollCategory([{ ...category, startsAt: new Date("2026-09-02") }], contract, period), /contínuo/);
});
