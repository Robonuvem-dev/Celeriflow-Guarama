import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "../src/db/decimal";
import type { EmploymentContract, EmploymentRevision, AttendanceRecord } from "../src/lib/contracts/personnel";
import { allocatePayrollAmount, calculateContribution, calculateContractRubrics, evaluatePayrollFormula } from "../src/lib/rh/calculation-engine";
import { calculateIncomeTax, INCOME_TAX_2026_BANDS, INCOME_TAX_2026_REDUCTION } from "../src/lib/rh/income-tax";
import { resolveContractRevision } from "../src/lib/rh/contract-timeline";
import { calculateProratedMonthlyRubrics, resolveMonthlyContractSegments } from "../src/lib/rh/monthly-proration";
import { calculateConsignmentMargin } from "../src/lib/rh/consignment-margin";
import { allocateProratedStatementLocations } from "../src/lib/rh/prorated-statement-locations";
import { calculatePayrollPensions } from "../src/lib/rh/payroll-pensions";
import { countThirteenthAvos } from "../src/lib/rh/poc-special-payroll";
import { benefitMoney, summarizeBenefitLedger } from "../src/lib/sst/benefit-policy";
import { LeaveExactDecimal } from "../src/lib/sst/functional-leave-policy";
import { configuredAttendanceTotals } from "../src/lib/portal-servidor/attendance-totals";

test("folha sem cliente gerado: fórmulas, RGPS/IRRF de referência e centavos", () => {
  assert.equal(evaluatePayrollFormula("SALARIO * (1 + 10 / 100)", () => new Decimal("1000.01")).toFixed(3), "1100.011");
  assert.throws(() => evaluatePayrollFormula("process.exit()", () => new Decimal(0)), /símbolo/);
  const result = calculateContractRubrics({ salary: "3000.01", days: 15, monthlyHours: 220, movements: {}, rubrics: [{ code: "SALARIO", name: "Salário", type: "PROVENTO", calculationMethod: "FORMULA_CONTROLADA", formulaExpression: "SALARIO_BASE * DIAS / 30", calculationBaseCode: null, fixedValue: null, percentageRate: null, incidences: [{ incidenceType: "RGPS", isIncluded: true }] }] });
  assert.equal(result.net.toFixed(2), "1500.01");
  assert.equal(result.bases.RGPS.toFixed(2), "1500.01");
  const bands = [{ lowerLimit: "0", upperLimit: "1621", employeeRate: "7.5" }, { lowerLimit: "1621", upperLimit: "2902.84", employeeRate: "9" }, { lowerLimit: "2902.84", upperLimit: "4354.27", employeeRate: "12" }, { lowerLimit: "4354.27", upperLimit: null, employeeRate: "14" }];
  assert.equal(calculateContribution(new Decimal(4400), bands, "PROGRESSIVA", "8475.55").toFixed(2), "417.51");
  const income = (amount: string, referenceDate = "2026-10-31") => calculateIncomeTax({ income: amount, legalDeductions: "509.60", simplifiedDeduction: "607.20", bands: INCOME_TAX_2026_BANDS, referenceDate, reductionPolicy: INCOME_TAX_2026_REDUCTION });
  assert.equal(income("5000").tax, "0.00");
  assert.equal(income("6000").reduction, "179.75");
  assert.equal(income("7350.01").reduction, "0.00");
  assert.equal(income("5000", "2025-12-31").reduction, "0.00");
  assert.deepEqual(allocatePayrollAmount(new Decimal("0.02"), [1, 1, 1, 1].map(n => new Decimal(n))).map(value => value.toFixed(2)), ["0.01", "0.01", "0.00", "0.00"]);
});

test("vigência e rateio civil mantêm identidade, lotação histórica e total de centavos", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const contract: EmploymentContract = { id: "c", employeeId: "e", registration: "REG", regimeId: "r", roleId: "role", departmentId: null, costCenterId: null, workLocation: "A", salaryLevel: null, admittedAt: now, appointedAt: null, swornAt: null, endsAt: null, monthlyHours: 200, salary: new Decimal(3000), status: "ATIVO", version: 1, details: {}, createdAt: now, updatedAt: now };
  const revised = { ...contract, version: 2, salary: new Decimal(6000), workLocation: "B", monthlyHours: 100 };
  const revisions: EmploymentRevision[] = [contract, revised].map((snapshot, index) => ({ id: `v${index + 1}`, contractId: "c", version: index + 1, effectiveFrom: index ? new Date("2026-11-16T00:00:00Z") : now, snapshot: JSON.parse(JSON.stringify(snapshot)), actorId: "actor", reason: "Revisão documental", createdAt: now }));
  const period = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-30T23:59:59.999Z") };
  assert.throws(() => resolveContractRevision(contract, revisions, period), /rateio temporal/);
  const segments = resolveMonthlyContractSegments(contract, revisions, period);
  assert.deepEqual(segments.map(segment => [segment.calendarDays, segment.contract.workLocation]), [[15, "A"], [15, "B"]]);
  const rubrics = [{ code: "SALARIO", name: "Salário", type: "PROVENTO", calculationMethod: "FORMULA_CONTROLADA", formulaExpression: "SALARIO_BASE * DIAS / 30", calculationBaseCode: null, percentageRate: null, fixedValue: null, incidences: [] }, { code: "MANUAL", name: "Manual", type: "PROVENTO", calculationMethod: "MANUAL", formulaExpression: null, calculationBaseCode: null, percentageRate: null, fixedValue: null, incidences: [] }];
  const calculated = calculateProratedMonthlyRubrics({ segments, period, rubrics, movements: { MANUAL: new Decimal("0.01") }, policy: { origin: "RATEIO_MENSAL_CIVIL", divisor: "DIAS_CIVIS_MES", manualMovements: "VALOR_INTEGRAL_RATEADO", legalReference: "Modelo civil", estimated: true } });
  assert.equal(calculated.result.gross.toFixed(2), "4500.01");
  const locations = allocateProratedStatementLocations({ items: calculated.result.items, proration: calculated.memory }, "0.01");
  assert.deepEqual(locations.map(location => location.workLocation), ["A", "B"]);
  assert.equal(locations.reduce((sum, location) => sum.add(location.gross), new Decimal(0)).toFixed(2), "4500.01");
  assert.equal(locations.reduce((sum, location) => sum.add(location.employer), new Decimal(0)).toFixed(2), "0.01");
  assert.equal(countThirteenthAvos(new Date("2026-01-17"), new Date("2026-02-28"), null), 2);
  assert.equal(countThirteenthAvos(new Date("2026-01-18"), new Date("2026-02-28"), null), 1);
});

test("margem por titular, pensão, SST de alta precisão e ponto conservam contratos", () => {
  const margin = calculateConsignmentMargin(["A", "B"].map(contractId => ({ contractId, items: [{ code: "SALARIO", type: "PROVENTO", value: "1000.01" }, { code: "PREV", type: "DESCONTO", value: "100.00" }, { code: "CONS", type: "DESCONTO", value: "200.00" }] })), { origin: "MARGEM_CONSIGNAVEL", remunerationRubricCodes: ["SALARIO"], compulsoryDeductionRubricCodes: ["PREV"], consignmentRubricCodes: ["CONS"], legalReference: "Regra de margem" }, "30");
  assert.equal(margin.limit, "540.01"); assert.equal(margin.available, "140.01");
  const pensions = calculatePayrollPensions({ origin: "PENSOES_FOLHA", legalReference: "Decisão judicial", entries: [{ id: "p", contractId: "c", beneficiaryPersonId: "person", courtReference: "PROCESSO 01", startsAt: "2026-01-01", endsAt: null, payrollTypes: ["Mensal"], method: "PERCENTUAL", value: "20", basis: "APOS_PREVIDENCIA", deductFromIncomeTax: true }] }, { contractId: "c", payrollType: "Mensal", start: new Date("2026-10-01"), end: new Date("2026-10-31"), gross: "4400", socialContribution: "417.51", incomeTax: "0", phase: "ANTES_IRRF" });
  assert.equal(pensions[0].amount, "796.50");
  assert.equal(benefitMoney.parse("99999999999999,99"), "99999999999999.99");
  const ledger = summarizeBenefitLedger([{ beneficiaryId: "b", competence: "10/2026", kind: "MONTHLY", amount: "99999999999999.99" }, { beneficiaryId: "b", competence: "10/2026", kind: "REFUND", amount: "-0.01" }]);
  assert.equal(ledger[0].net, "99999999999999.98");
  assert.equal(new LeaveExactDecimal("9999999999.12345678").mul("9999999999").toFixed(8), "99999999981234567800.87654322");
  const date = new Date("2026-10-01");
  const rows: AttendanceRecord[] = [{ id: "p", employeeId: "e", date, entryTime: null, exitTime: null, status: "Presente", hoursWorked: 0.1, extraHours: 0, bankHours: 0, contractedHours: 8, createdAt: date, updatedAt: date }, { id: "a", employeeId: "e", date, entryTime: null, exitTime: null, status: "Falta", hoursWorked: 0.2, extraHours: 0, bankHours: 0, contractedHours: 8, createdAt: date, updatedAt: date }];
  assert.deepEqual(configuredAttendanceTotals(rows, { origin: "TOTALIZADORES_PONTO_FUNCIONAL", budgetUnitId: "ug", totals: [{ code: "HOURS", label: "Horas", field: "hoursWorked" }, { code: "PRESENT", label: "Presenças", field: "RECORD_COUNT", statuses: ["Presente"] }] }), [{ code: "HOURS", label: "Horas", value: "0.3000" }, { code: "PRESENT", label: "Presenças", value: "1" }]);
});
