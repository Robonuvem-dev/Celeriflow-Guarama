import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import type { JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { employees, roles } from "../src/db/schema/administration";
import { systemInstances } from "../src/db/schema/instance-configuration";
import { attendanceRecords, vacations } from "../src/db/schema/personnel-records";
import { hrEmploymentContracts, hrEmploymentRevisions, hrMovements, hrPayrollRuns, hrPayrollStatements, hrRightEntries, payrolls } from "../src/db/schema/personnel-workforce";
import { hrEmploymentRegimes, hrPayrollRules, hrPayrollRuleSets, hrPayrollRubrics, hrPayrollRubricIncidences } from "../src/db/schema/personnel-configuration";
import { hrReferenceRecords } from "../src/db/schema/personnel-reference-records";
import { ensurePocCalculationPolicy, ensurePocEmploymentRegime, ensurePocRuleSet, ensurePocSocialSecurityScheme, ensurePocVacationPolicy, insertPocSocialSecurityBands } from "../src/db/repositories/personnel-poc-bootstrap/records";
import { calculatePayrollRun, closePayrollRun, enqueueHrIntegration, publishPayrollStatements, recordHrRightEntry, saveEmploymentContract } from "../src/lib/rh/workforce-service";
import { acquireVacationRights, reserveVacationRight } from "../src/lib/rh/vacation-rights";
import { payrollPeriod } from "../src/lib/rh/calculation-engine";
import { calculateIncomeHistory2025, incomeHistorySchema, SOCIAL_SECURITY_2025_BANDS } from "../src/lib/rh/income-history";
import { INCOME_TAX_2026_BANDS } from "../src/lib/rh/income-tax";
import { buildPocAnnualIncomeReport, registerPocPayment } from "../src/lib/rh/poc-payment";

const packageId = "RH_HISTORICO_2025_2026_V1", actorId = `SYSTEM:${packageId}`;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const civil = (date: Date) => date.toISOString().slice(0, 10);
const reason = "Consolidação do histórico de pessoal e folha de Vereda das Auroras";
const holidays = new Set(["2025-12-25", "2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]);
type Contract = typeof hrEmploymentContracts.$inferSelect;
type Reservation = { contractId: string; employeeId: string; entryId: string; vacationId: string; days: number; from: Date; until: Date };

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const progress: { stage: string; competence?: string; statements?: number; count?: number }[] = [];
  const save = async () => writeFile("docs/RH_HISTORICO_EXPANSAO_2025_2026.json", JSON.stringify({ packageId, checkedAt: new Date().toISOString(), scope: "DEMONSTRACAO", realPayments: false, createsUsers: false, preservesClosedHistory: true, progress }, null, 2) + "\n");
  try {
    const roster = await connection.db.select({ employee: employees, role: roles.name, contract: hrEmploymentContracts }).from(employees).innerJoin(roles, eq(roles.id, employees.roleId)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.employeeId, employees.id)).where(sql`${hrEmploymentContracts.details}->>'seedPackage'='RH_PORTAL_2026_V1'`).orderBy(asc(employees.id));
    if (roster.length !== 198 || new Set(roster.map(row => row.employee.id)).size !== 198) throw new Error("Confira o conjunto de 198 vínculos antes de expandir.");
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ mode: "PREVIEW", packageId, employees: roster.length, monthly2026: 12, preservesMonths: ["08/2026", "09/2026", "10/2026"], monthly2025: ["12/2025"], annual2025OpeningMonths: 11, historicalContracts: 198, thirteenth: [2025, 2026], vacations2025: 18, futureAttendanceStatus: "Previsto", realPayments: false }, null, 2)); return;
    }
    await mkdir("docs", { recursive: true });
    const baseSet = (await connection.db.select().from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.id, roster[0].contract.regimeId)))[0].ruleSetId;
    const baseRules = await connection.db.select().from(hrPayrollRules).where(eq(hrPayrollRules.ruleSetId, baseSet));
    const set2025 = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
      const [base] = await tx.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, baseSet));
      if (!base.isDemo || base.scope !== "DEMONSTRACAO") throw new Error("Conjunto de origem incompatível.");
      await tx.update(systemInstances).set({ nomePrefeitura: "Prefeitura Municipal de Vereda das Auroras", municipio: "Vereda das Auroras" }).where(eq(systemInstances.id, base.configuracaoInstanciaId));
      await tx.update(hrPayrollRuleSets).set({ name: "Vereda das Auroras — pessoal e folha 2026" }).where(eq(hrPayrollRuleSets.id, baseSet));
      await tx.update(hrPayrollRules).set({ value: { origin: "MENSAGENS_RECIBO", messages: [] } }).where(and(eq(hrPayrollRules.ruleSetId, baseSet), eq(hrPayrollRules.code, "MENSAGENS_RECIBO")));
      const set = await ensurePocRuleSet(tx, { configuracaoInstanciaId: base.configuracaoInstanciaId, code: `${packageId}_2025`, name: "Vereda das Auroras — pessoal e folha 2025", status: "ATIVA", scope: "DEMONSTRACAO", isDemo: true, effectiveFrom: new Date("2024-01-01T00:00:00Z"), effectiveUntil: new Date("2025-12-31T23:59:59.999Z"), legalReference: "Tabelas RGPS e IRRF vigentes em 2025; parâmetros de pessoal do exercício" });
      await ensurePocCalculationPolicy(tx, { ruleSetId: set.id, roundingMode: "HALF_UP", roundingScale: 2, negativeNetPayPolicy: "BLOQUEAR", freezeOnClose: true, legalReference: reason, maxConsignmentMarginRate: "35" });
      const scheme = await ensurePocSocialSecurityScheme(tx, { ruleSetId: set.id, code: "RGPS_POC", name: "Contribuição previdenciária — RGPS 2025", regime: "RGPS", employeeCalculationMethod: "PROGRESSIVA", ceilingValue: "8157.41", employerContributionRate: "22", legalReference: "Portaria Interministerial MPS/MF 6/2025" });
      await insertPocSocialSecurityBands(tx, SOCIAL_SECURITY_2025_BANDS.map((band, index) => ({ ...band, sequence: index + 1, socialSecuritySchemeId: scheme.id })));
      const vacation = await ensurePocVacationPolicy(tx, { ruleSetId: set.id, code: "FERIAS_2025", name: "Férias anuais", employmentNature: "ESTATUTARIO", acquisitionMonths: 12, concessionMonths: 12, entitlementDays: 30, maxSplits: 3, minFirstSplitDays: 10, minOtherSplitDays: 10, allowsCashAbono: true, maxCashAbonoDays: 10, requiresApproval: true, additionalPayRate: "33.333333", legalReference: "Férias anuais e adicional de um terço" });
      const regime = await ensurePocEmploymentRegime(tx, { ruleSetId: set.id, code: "EFETIVO_2025", name: "Efetivo — exercício 2025", employmentNature: "ESTATUTARIO", esocialCategory: "301", defaultMonthlyHours: 200, socialSecuritySchemeId: scheme.id, vacationPolicyId: vacation.id, legalReference: reason });
      const rubrics = await tx.select().from(hrPayrollRubrics).where(eq(hrPayrollRubrics.ruleSetId, baseSet));
      for (const rubric of rubrics) {
        const { id, createdAt: _created, updatedAt: _updated, ...data } = rubric; void _created; void _updated;
        const [copied] = await tx.insert(hrPayrollRubrics).values({ ...data, ruleSetId: set.id }).onConflictDoUpdate({ target: [hrPayrollRubrics.ruleSetId, hrPayrollRubrics.code], set: { name: rubric.name } }).returning();
        const incidences = await tx.select().from(hrPayrollRubricIncidences).where(eq(hrPayrollRubricIncidences.rubricId, id));
        if (incidences.length) await tx.insert(hrPayrollRubricIncidences).values(incidences.map(incidence => ({ rubricId: copied.id, incidenceType: incidence.incidenceType, isIncluded: incidence.isIncluded }))).onConflictDoNothing();
      }
      for (const rule of baseRules.filter(rule => rule.category === "CALCULO" && !["IRRF_REDUCAO_MENSAL", "POC_FONTES_E_ESTIMATIVAS"].includes(rule.code))) {
        const value = rule.code === "IRRF_FAIXAS" ? INCOME_TAX_2026_BANDS : rule.code === "MENSAGENS_RECIBO" ? { origin: "MENSAGENS_RECIBO", messages: [] } : rule.value;
        await tx.insert(hrPayrollRules).values({ ruleSetId: set.id, code: rule.code, name: rule.name, category: rule.category, valueType: rule.valueType, value: json(value), legalReference: reason }).onConflictDoNothing();
      }
      return { ruleSetId: set.id, regimeId: regime.id };
    }, { timeoutMs: 180000 });
    const contracts2025: Contract[] = [];
    for (const [index, row] of roster.entries()) {
      const registration = `${row.employee.registration || String(index + 1).padStart(6, "0")}-2025`;
      const [existing] = await connection.db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.registration, registration));
      const salary = row.contract.salary.div("1.05").toDecimalPlaces(2).toFixed(2);
      if (existing && ((existing.details as { historyPackage?: string }).historyPackage !== packageId || existing.employeeId !== row.employee.id || !existing.salary.eq(salary))) throw new Error("Vínculo histórico existente foi alterado; confira sua origem.");
      const contract = existing ?? await saveEmploymentContract(connection, actorId, { employeeId: row.employee.id, registration, regimeId: set2025.regimeId, roleId: row.contract.roleId, departmentId: row.contract.departmentId || undefined, costCenterId: row.contract.costCenterId || undefined, workLocation: row.contract.workLocation, salaryLevel: row.contract.salaryLevel || undefined, salary, monthlyHours: row.contract.monthlyHours, admittedAt: "2024-01-01", appointedAt: "2024-01-01", swornAt: "2024-01-01", endsAt: "2025-12-31", details: { historyPackage: packageId, estimated: true, salaryCriterion: "2026 role estimate / 1.05", sourceContractId: row.contract.id, weeklyHours: (row.contract.details as { weeklyHours?: number }).weeklyHours, fiscalYear: 2025 }, reason });
      contracts2025.push(contract);
      if ((index + 1) % 30 === 0) console.log(JSON.stringify({ stage: "historical-contracts", count: index + 1 }));
    }
    progress.push({ stage: "historical-contracts", count: contracts2025.length }); await save();
    const reservations2025: Reservation[] = [];
    for (const contract of contracts2025.slice(0, 18)) {
      await acquireVacationRights(connection, actorId, contract.id, "2024-12-31");
      const entry = await reserveVacationRight(connection, actorId, { contractId: contract.id, sourceKey: `${packageId}:FERIAS:2025:${contract.id}`, periodStart: "2024-01-01", periodEnd: "2024-12-31", kind: "GOZO", start: "2025-12-01", days: 30, reason });
      reservations2025.push({ contractId: contract.id, employeeId: contract.employeeId, entryId: entry.id, vacationId: (entry.details as { vacationId: string }).vacationId, days: 30, from: new Date("2025-12-01T00:00:00Z"), until: new Date("2025-12-30T00:00:00Z") });
    }
    const reservations2026: Reservation[] = [];
    const scheduled = await connection.db.select().from(vacations).where(and(eq(vacations.status, "Programada"), sql`"enjoymentStart">='2026-12-01' AND "enjoymentStart"<'2027-01-01'`)).orderBy(asc(vacations.id));
    for (const vacation of scheduled) {
      const row = roster.find(row => row.employee.id === vacation.employeeId);
      if (!row || !vacation.enjoymentStart || !vacation.enjoymentEnd) throw new Error("Programação sem titular ou datas completas.");
      const existing = (await connection.db.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, `${packageId}:FERIAS:2026:${vacation.id}`)))[0];
      const start = civil(vacation.acquisitionStart), end = civil(vacation.acquisitionEnd);
      if (!existing) {
        await recordHrRightEntry(connection, actorId, { contractId: row.contract.id, sourceKey: `${packageId}:SALDO:2026:${vacation.id}`, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: String(vacation.days), amount: "0.00", details: { scope: "DEMONSTRACAO", operation: "SALDO_INICIAL", historyPackage: packageId, estimated: true, vacationId: vacation.id, source: "Saldo do período aquisitivo da programação existente" } });
      }
      const entry = existing ?? await recordHrRightEntry(connection, actorId, { contractId: row.contract.id, sourceKey: `${packageId}:FERIAS:2026:${vacation.id}`, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: String(-vacation.days), amount: "0.00", details: { scope: "DEMONSTRACAO", kind: "GOZO", vacationId: vacation.id, start: civil(vacation.enjoymentStart), end: civil(vacation.enjoymentEnd), historyPackage: packageId, estimated: true, reason } });
      if (vacation.acquisitionStart.getTime() !== entry.periodStart.getTime() || vacation.acquisitionEnd.getTime() !== entry.periodEnd.getTime()) {
        // Legacy programming used noon for civil dates; the canonical ledger
        // uses midnight. Normalize only the time portion of this known import,
        // retaining the original instants in an audit event before linking it.
        if (!vacation.id.startsWith("aurora-mg-50k-v1:vacation:") || civil(vacation.acquisitionStart) !== civil(entry.periodStart) || civil(vacation.acquisitionEnd) !== civil(entry.periodEnd)) throw new Error("Período aquisitivo divergente exige conciliação antes de vincular férias.");
        await withDatabaseTransaction(connection, async tx => {
          await tx.execute(sql`SELECT id FROM "Vacation" WHERE id=${vacation.id} FOR UPDATE`);
          const [linked] = await tx.execute(sql`SELECT id FROM "HrIntegrationEvent" WHERE "sourceKey"=${`FERIAS:FOLHA:${entry.id}`} LIMIT 1`).then(result => result.rows);
          if (linked) throw new Error("Programação já conciliada em folha exige tratamento próprio.");
          await enqueueHrIntegration(tx, { sourceKey: `${packageId}:FERIAS:DATAS_CIVIS:${vacation.id}`, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "FERIAS_PERIODO_CIVIL_NORMALIZADO", payload: json({ packageId, actorId, vacationId: vacation.id, entryId: entry.id, before: { start: vacation.acquisitionStart.toISOString(), end: vacation.acquisitionEnd.toISOString() }, after: { start: entry.periodStart.toISOString(), end: entry.periodEnd.toISOString() }, enjoymentPreserved: true, daysPreserved: true }) });
          const normalized = await tx.execute(sql`UPDATE "Vacation" v SET "acquisitionStart"=e."periodStart", "acquisitionEnd"=e."periodEnd", "updatedAt"=now() FROM "HrRightEntry" e WHERE v.id=${vacation.id} AND e.id=${entry.id} AND v.status='Programada' AND v."acquisitionStart"::date=e."periodStart"::date AND v."acquisitionEnd"::date=e."periodEnd"::date RETURNING v.id`);
          if (normalized.rows.length !== 1) throw new Error("Programação mudou durante a conciliação do aquisitivo.");
        });
      }
      reservations2026.push({ contractId: row.contract.id, employeeId: row.employee.id, entryId: entry.id, vacationId: vacation.id, days: vacation.days, from: vacation.enjoymentStart, until: vacation.enjoymentEnd });
    }
    progress.push({ stage: "vacations-2025", count: reservations2025.length }, { stage: "vacations-2026", count: reservations2026.length }); await save();
    // Earlier months receive separate allocation references; existing closed-month references stay intact.
    const allocations = await connection.db.select().from(hrReferenceRecords).where(eq(hrReferenceRecords.kind, "RATEIO_FOLHA"));
    for (const allocation of allocations.filter(row => row.details.from === "2026-08-01")) {
      await connection.db.insert(hrReferenceRecords).values({ kind: "RATEIO_FOLHA", code: `${packageId}:RATEIO:${allocation.id}`, name: allocation.name, details: { ...allocation.details, from: "2026-01-01", until: "2026-07-31" } }).onConflictDoNothing();
    }
    const revisions = await connection.db.select().from(hrEmploymentRevisions);
    async function monthly(competence: string, contracts: Contract[], reservations: Reservation[], id: string) {
      const period = payrollPeriod(competence);
      await connection.db.insert(payrolls).values({ id, competence, type: "Mensal", status: "Aberta" }).onConflictDoNothing();
      const [previous] = await connection.db.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.requestKey, id));
      if (previous?.status === "FECHADA") return runPayroll(id, competence, "Mensal", contracts.map(row => row.id));
      const existingDates = await connection.db.select({ employeeId: attendanceRecords.employeeId, date: attendanceRecords.date }).from(attendanceRecords).where(sql`date>=${period.start} AND date<=${period.end}`);
      const keys = new Set(existingDates.map(row => `${row.employeeId}:${civil(row.date)}`));
      const records: Array<typeof attendanceRecords.$inferInsert> = [];
      const today = new Date().toISOString().slice(0, 10);
      for (const contract of contracts) {
        const row = roster.find(row => row.employee.id === contract.employeeId)!;
        const revision = revisions.filter(revision => revision.contractId === contract.id && revision.effectiveFrom <= period.end).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version)[0];
        if (!revision) throw new Error("Revisão contratual não localizada.");
        const historical = revision.snapshot as { salary: string };
        const personalVacation = reservations.find(reservation => reservation.contractId === contract.id);
        if (personalVacation) {
          const first = new Date(Math.max(period.start.getTime(), new Date(`${civil(personalVacation.from)}T00:00:00Z`).getTime()));
          const last = new Date(Math.min(period.end.getTime(), new Date(`${civil(personalVacation.until)}T23:59:59.999Z`).getTime()));
          const days = Math.min(30, Math.max(0, Math.floor((last.getTime() - first.getTime()) / 86400000) + 1));
          if (days) await connection.db.insert(hrMovements).values({ contractId: contract.id, sourceKey: `${packageId}:COMPENSACAO_FERIAS:${contract.id}:${competence}`, rubricCode: "VENCIMENTO", startsAt: period.start, endsAt: period.end, amount: new Decimal(historical.salary).mul(days).div(30).toDecimalPlaces(2).negated(), reference: `${days} dias em férias`, notes: "Remuneração de férias processada em folha própria", actorId }).onConflictDoNothing();
        }
        if (row.role.startsWith("Secretário Municipal")) continue;
        const weekly = Number((row.contract.details as { weeklyHours: number }).weeklyHours), daily = weekly / 5;
        for (let date = new Date(period.start); date <= period.end; date = new Date(date.getTime() + 86400000)) {
          const day = civil(date);
          if ([0, 6].includes(date.getUTCDay()) || holidays.has(day) || keys.has(`${contract.employeeId}:${day}`)) continue;
          const future = day >= today;
          const onVacation = personalVacation && day >= civil(personalVacation.from) && day <= civil(personalVacation.until);
          const entry = new Date(`${day}T11:00:00Z`);
          records.push({ id: `${packageId}:PONTO:${contract.employeeId}:${day}`, employeeId: contract.employeeId, date, entryTime: future || onVacation ? null : entry, exitTime: future || onVacation ? null : new Date(entry.getTime() + (daily + 1) * 3600000), contractedHours: daily, hoursWorked: future || onVacation ? 0 : daily, extraHours: 0, bankHours: 0, status: onVacation ? "Férias" : future ? "Previsto" : "Presente" });
        }
      }
      await withDatabaseTransaction(connection, async tx => {
        for (let start = 0; start < records.length; start += 250) await tx.insert(attendanceRecords).values(records.slice(start, start + 250)).onConflictDoNothing();
      }, { timeoutMs: 180000 });
      return runPayroll(id, competence, "Mensal", contracts.map(row => row.id));
    }
    async function runPayroll(id: string, competence: string, type: string, contractIds: string[], specialParameters?: Record<string, unknown>) {
      await connection.db.insert(payrolls).values({ id, competence, type, status: "Aberta" }).onConflictDoNothing();
      const [previous] = await connection.db.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.requestKey, id));
      let run = previous;
      if (!run || run.status !== "FECHADA") {
        console.log(JSON.stringify({ stage: "calculating", competence, type, contracts: contractIds.length }));
        const calculated = await withDatabaseTransaction(connection, tx => inDatabaseTransactionScope(connection, tx, () => calculatePayrollRun(connection, actorId, { payrollId: id, requestKey: id, mode: "OFICIAL", scope: "DEMONSTRACAO", contractIds, ...(specialParameters ? { specialParameters } : {}) })), { timeoutMs: 600000 });
        run = await withDatabaseTransaction(connection, tx => inDatabaseTransactionScope(connection, tx, () => closePayrollRun(connection, actorId, calculated.id)), { timeoutMs: 600000 });
      }
      const [released] = await connection.db.select({ releaseAt: hrPayrollStatements.releaseAt }).from(hrPayrollStatements).where(and(eq(hrPayrollStatements.runId, run.id), sql`"releaseAt" IS NOT NULL`)).limit(1);
      await publishPayrollStatements(connection, actorId, run.id, released?.releaseAt ?? run.approvedAt ?? new Date());
      if (competence.endsWith("/2025")) await registerPocPayment(connection, actorId, { runId: run.id, paymentDate: type === "1ª parcela 13º" ? "2025-12-10" : type === "13º" ? "2025-12-19" : type === "Férias" ? "2025-11-28" : "2025-12-30", reference: `${packageId}:${id}` });
      progress.push({ stage: type, competence, statements: contractIds.length }); await save();
      console.log(JSON.stringify({ stage: "closed-published", competence, type, statements: contractIds.length })); return run;
    }
    const december2025 = await monthly("12/2025", contracts2025, reservations2025, `${packageId}:2025:12:MENSAL`);
    for (const contract of contracts2025) {
      const row = roster.find(row => row.employee.id === contract.employeeId)!;
      const payload = incomeHistorySchema.parse({ version: 1, packageId, year: 2025, anchorRunId: december2025.id, employeeId: row.employee.id, personId: row.employee.personId, contractId: contract.id, cpf: row.employee.cpf, name: row.employee.name, estimated: true, actualBankSettlement: false, months: calculateIncomeHistory2025(contract.salary.toFixed(2)) });
      await withDatabaseTransaction(connection, tx => enqueueHrIntegration(tx, { sourceKey: `${packageId}:RENDIMENTOS:2025:${contract.id}`, domain: "POC_FINANCEIRO", environment: "DEMONSTRACAO", eventType: "RENDIMENTOS_HISTORICOS_IMPORTADOS", payload: json(payload) }));
    }
    const advance2025 = await runPayroll(`${packageId}:2025:12:13_ADIANTAMENTO`, "12/2025", "1ª parcela 13º", contracts2025.map(row => row.id), { avos: 12, reason });
    await runPayroll(`${packageId}:2025:12:13`, "12/2025", "13º", contracts2025.map(row => row.id), { avos: 12, sourceRunId: advance2025.id, reason });
    await runPayroll(`${packageId}:2025:12:FERIAS`, "12/2025", "Férias", reservations2025.map(row => row.contractId), { vacationEntryIds: Object.fromEntries(reservations2025.map(row => [row.contractId, [row.entryId]])), reason });
    const currentContracts = roster.map(row => row.contract);
    for (let month = 1; month <= 12; month++) {
      if ([8, 9, 10].includes(month)) { progress.push({ stage: "original-preserved", competence: `${String(month).padStart(2, "0")}/2026`, statements: 198 }); continue; }
      const mm = String(month).padStart(2, "0");
      await monthly(`${mm}/2026`, currentContracts, month === 12 ? reservations2026 : [], `${packageId}:2026:${mm}:MENSAL`);
    }
    const advance2026 = await runPayroll(`${packageId}:2026:11:13_ADIANTAMENTO`, "11/2026", "1ª parcela 13º", currentContracts.map(row => row.id), { avos: 12, reason });
    await runPayroll(`${packageId}:2026:12:13`, "12/2026", "13º", currentContracts.map(row => row.id), { avos: 12, sourceRunId: advance2026.id, reason });
    if (reservations2026.length) await runPayroll(`${packageId}:2026:12:FERIAS`, "12/2026", "Férias", reservations2026.map(row => row.contractId), { vacationEntryIds: Object.fromEntries(reservations2026.map(row => [row.contractId, [row.entryId]])), reason });
    const annual = await buildPocAnnualIncomeReport(connection.db, 2025);
    if (annual.rows.length !== 198 || annual.rows.some(row => row.at(-1) !== "12")) throw new Error("Confira a cobertura dos doze meses de rendimentos por titular.");
    progress.push({ stage: "annual-income-2025", count: annual.rows.length }); await save();
    console.log(JSON.stringify({ stage: "complete", annual2025: annual.rows.length, packageId }));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
