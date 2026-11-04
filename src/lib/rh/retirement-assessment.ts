import { and, eq, sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { hrEmploymentContracts, hrEmploymentRevisions } from "@/db/schema/personnel-workforce";
import { functionalRecordsAt } from "./functional-record-service";
import { serviceTimeAssessment } from "./automatic-service-rights";
import { resolveContractRevision } from "./contract-timeline";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { assessRetirementTime } from "./retirement-time";
import { retirementContributionHistory } from "./contribution-history";
import { matchesReportContract, reportCompleteHistoryPredicate, reportEmployeePredicate } from "./report-filters";
import { retirementAgeForPoints, retirementAgeReached, retirementTransitionThresholds } from "./retirement-rule-extensions";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { personalRevisionAt } from "./personal-timeline";

const day = 86400000;
const date = (value: Date) => value.toISOString().slice(0, 10);
function ageAt(birth: Date, at: Date) { let age = at.getUTCFullYear() - birth.getUTCFullYear(); const month = birth.getUTCMonth(), birthday = Math.min(birth.getUTCDate(), new Date(Date.UTC(at.getUTCFullYear(), month + 1, 0)).getUTCDate()); if (at < new Date(Date.UTC(at.getUTCFullYear(), month, birthday))) age--; return age; }

export async function buildRetirementAssessmentReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[], payrollScope?: SQL): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10), at = new Date(`${reference}T00:00:00Z`);
  const selected = await db.select({ employee: employees, contract: hrEmploymentContracts, person: people }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).innerJoin(people, eq(people.id, employees.personId)).where(and(
    input.employeeId ? eq(employees.id, input.employeeId) : undefined,
    reportEmployeePredicate(input, employees.id, sql`${reference}`),
    reportCompleteHistoryPredicate(input, employees.id, sql`${reference}`),
    personnelBudgetEmployeeWhere(employees.id, budgetUnitIds),
  )).orderBy(employees.name, hrEmploymentContracts.id);
  const output: string[][] = [];
  for (const row of selected) {
    const revisions = await db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, row.contract.id));
    if (!revisions.some(revision => revision.effectiveFrom <= at)) continue;
    const contract = resolveContractRevision(row.contract, revisions, { start: at, end: at }).contract;
    const personal = await personalRevisionAt(db, row.employee.id, reference);
    const identitySnapshot = z.object({ person: z.object({ fullName: z.string().nullish(), birthDate: z.string().nullish(), gender: z.string().nullish() }).nullish() }).parse(personal?.snapshot ?? {});
    const name = identitySnapshot.person?.fullName ?? "Identidade sem fonte documental na referência";
    const birthDate = identitySnapshot.person?.birthDate ? new Date(identitySnapshot.person.birthDate) : null;
    const gender = identitySnapshot.person?.gender;
    if (input.q && !`${name} ${contract.registration}`.toLocaleLowerCase("pt-BR").includes(input.q.toLocaleLowerCase("pt-BR"))) continue;
    if (!matchesReportContract(input, contract, reference)) continue;
    if (input.departmentId && input.departmentId !== contract.departmentId) continue;
    const records = await functionalRecordsAt(db, { employeeId: row.employee.id, contractId: contract.id, from: at, until: at });
    if (input.kind !== "MEMORIA_TEMPO_PREVIDENCIARIO" && records.some(record => record.kind === "CATEGORIA_FOLHA" && record.data.category !== "ATIVO")) continue;
    const policies = records.filter(rule => rule.kind === "REGRA_APOSENTADORIA" && (!rule.data.regimeId || rule.data.regimeId === contract.regimeId) && (!rule.data.roleId || rule.data.roleId === contract.roleId) && (rule.data.gender === "Todos" || rule.data.gender === gender));
    const counted = await serviceTimeAssessment(db, contract, at, "retirement");
    const integrated = await assessRetirementTime(db, row.employee.id, at);
    const publicDays = integrated.publicDays, contributionDays = integrated.contributionDays;
    // Contiguous service in the current role, ending at the selected reference.
    const ordered = revisions.filter(revision => revision.effectiveFrom <= at).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
    let roleStart: Date | null = null;
    for (const revision of [...ordered].reverse()) {
      const snapshot = z.object({ roleId: z.string(), status: z.string() }).parse(revision.snapshot);
      if (snapshot.roleId !== contract.roleId || snapshot.status !== "ATIVO") break;
      roleStart = revision === ordered[0] ? contract.admittedAt : revision.effectiveFrom;
    }
    const roleStartDate = roleStart ? date(roleStart) : null;
    const roleDays = roleStart && roleStartDate ? Math.max(0, Math.floor((at.getTime() - roleStart.getTime()) / day) + 1 - counted.exclusions.filter(value => value >= roleStartDate).length) : 0;
    const identity = [name, contract.registration, reference];
    if (input.kind === "MEMORIA_TEMPO_PREVIDENCIARIO") {
      output.push([...identity, date(contract.admittedAt), reference, String(counted.calendarDays), String(counted.exclusions.length), String(integrated.municipalDays), String(integrated.priorDays), String(contributionDays), String(roleDays), integrated.certificates.map(entry => `${entry.id}: ${entry.employer}, ${entry.from} a ${entry.until}, ${entry.recognizedDays} dias; natureza ${entry.serviceNature}; intervalos ${entry.recognizedPeriods}; ${entry.source}`).join("; "), integrated.contracts.map(entry => `${entry.contractId} / regime ${entry.regimeId}: ${entry.days} dias; exclusões ${entry.excluded.join(", ")}`).join("; ")]);
      continue;
    }
    if (!policies.length) { output.push([...identity, "Sem regra previdenciária aplicável", ...Array(14).fill("")]); continue; }
    for (const policy of policies) {
      const thresholds = retirementTransitionThresholds(policy.data, reference);
      const age = birthDate ? ageAt(birthDate, at) : null;
      const points = (birthDate ? retirementAgeForPoints(birthDate, at) : new Decimal(0)).add(new Decimal(contributionDays).div("365.25"));
      let toll = 0;
      if (policy.data.transitionDate) {
        const cutoff = new Date(`${policy.data.transitionDate}T00:00:00Z`);
        if (cutoff > at) throw new Error("A data de corte da transição não pode ser futura na apuração.");
        const cutoffCounted = await assessRetirementTime(db, row.employee.id, cutoff);
        toll = Math.ceil(Math.max(0, Number(policy.data.contributionDays) - cutoffCounted.contributionDays) * Number(policy.data.tollRate) / 100);
      }
      const neededContribution = Number(policy.data.contributionDays) + toll;
      const publicEntry = integrated.publicAdmissionUnresolved ? null : integrated.firstPublicService;
      const missing = [!birthDate ? "Nascimento sem fonte documental na referência" : !retirementAgeReached(birthDate, at, thresholds.age) ? `Idade mínima (${thresholds.age.toString()})` : "", contributionDays < neededContribution ? "Tempo contributivo / pedágio" : "", publicDays < Number(policy.data.publicDays) ? "Serviço público" : "", roleDays < Number(policy.data.roleDays) ? "Tempo no cargo" : "", new Decimal(points).lt(thresholds.points) ? `Pontuação (${thresholds.points.toString()})` : "", policy.data.publicAdmissionUntil && (!publicEntry || publicEntry > policy.data.publicAdmissionUntil) ? "Ingresso no serviço público após o corte da regra" : ""].filter(Boolean);
      if (contract.status !== "ATIVO" || contract.endsAt && contract.endsAt < at) missing.push("Vínculo de serviço inativo na referência");
      const bases = { rows: (await retirementContributionHistory(db, row.employee.id, at, payrollScope)).slice(0, Number(policy.data.averageMonths)) };
      const indices = policy.data.indexSeries ? records.filter(record => record.kind === "INDICE_PREVIDENCIARIO" && record.data.series === policy.data.indexSeries) : [];
      const corrected = bases.rows.map(entry => {
        const matches = indices.filter(index => index.data.competence === entry.competence);
        if (matches.length > 1) throw new Error(`Mais de um índice vigente para ${entry.competence} na série previdenciária.`);
        const factor = policy.data.indexSeries ? matches[0]?.data.factor : "1";
        return { ...entry, factor, corrected: factor ? new Decimal(entry.base).mul(factor) : null };
      });
      const required = Number(policy.data.averageMonths), enough = bases.rows.length === required && corrected.every(entry => entry.corrected !== null);
      const selectedBases = corrected.filter(entry => entry.corrected !== null).sort((a, b) => b.corrected!.comparedTo(a.corrected!)).slice(0, Math.ceil(required * Number(policy.data.topPercentage || "100") / 100));
      const average = enough ? selectedBases.reduce((sum, entry) => sum.add(entry.corrected!), new Decimal(0)).div(selectedBases.length) : null;
      const rate = Decimal.min(100, new Decimal(policy.data.benefitRate).add(new Decimal(policy.data.extraYearRate || "0").mul(Math.max(0, Math.floor(contributionDays / 365.25) - Number(policy.data.extraAfterYears || "0")))));
      let amountBasis = average, basisEvidence = "";
      if (policy.data.benefitMode === "INTEGRALIDADE") {
        const codes = [...new Set(policy.data.integralityCodes.split(",").map(value => value.trim()).filter(Boolean))];
        const source = (await db.execute<{ id: string; competence: string; items: Array<{ code: string; type: string; value: string }> }>(sql`SELECT s.id,"Payroll".competence,s.snapshot->'items' items FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" WHERE s."contractId"=${contract.id} AND r.mode='OFICIAL' AND r.status='FECHADA' AND "Payroll".type='Mensal' AND to_date("Payroll".competence,'MM/YYYY')=date_trunc('month',${reference}::date) AND ${payrollScope ?? sql`true`} ORDER BY r."approvedAt" DESC,s.id DESC LIMIT 1`)).rows[0];
        if (!codes.length || !source || codes.some(code => !source.items.some(item => item.code === code && item.type === "PROVENTO"))) { amountBasis = null; basisEvidence = "Integralidade sem demonstrativo mensal fechado da referência ou sem rubricas configuradas"; }
        else { amountBasis = source.items.filter(item => codes.includes(item.code)).reduce((sum, item) => sum.add(item.value), new Decimal(0)); basisEvidence = `Integralidade: ${source.id}; ${source.competence}; rubricas ${codes.join(", ")}; base ${amountBasis.toFixed(2)}`; }
      }
      const proportional = policy.data.proportionalReferenceDays ? Decimal.min(1, new Decimal(contributionDays).div(policy.data.proportionalReferenceDays)) : new Decimal(1);
      let benefit = amountBasis?.mul(rate).div(100).mul(proportional) ?? null;
      if (benefit && policy.data.benefitFloor) benefit = Decimal.max(benefit, policy.data.benefitFloor);
      if (benefit && policy.data.benefitCeiling) benefit = Decimal.min(benefit, policy.data.benefitCeiling);
      const amount = benefit?.toFixed(2) ?? "";
      output.push([...identity, policy.name, age === null ? "" : String(age), String(contributionDays), String(publicDays), String(roleDays), points.toFixed(4), String(toll), missing.length ? `Requisitos pendentes: ${missing.join(", ")}` : "Requisitos configurados cumpridos", amountBasis?.toFixed(2) ?? "", amount, `${bases.rows.length}/${required} competências; ${corrected.filter(entry => entry.corrected).length} bases com índice; ${rate.toFixed(4)}%; proporcionalidade ${proportional.toFixed(8)}; idade mínima ${thresholds.age}; pontos mínimos ${thresholds.points}`, basisEvidence || corrected.map(entry => `${entry.competence}: ${entry.base} × ${entry.factor ?? "índice ausente"} = ${entry.corrected?.toFixed(2) ?? "não apurada"}; ${entry.source}`).join("; "), policy.data.legalReference, policy.data.issuer, `${policy.id}/${policy.version}`]);
    }
  }
  return input.kind === "MEMORIA_TEMPO_PREVIDENCIARIO" ? { title: "Memória de tempo — apuração por vínculo e união municipal/contributiva do titular", headers: ["Servidor", "Matrícula", "Referência", "Admissão", "Apuração até", "Dias civis do vínculo", "Dias excluídos do vínculo", "Dias municipais do titular (união)", "Dias anteriores adicionais (sem duplicação)", "Dias contributivos do titular (união)", "Dias no cargo", "Certidões anteriores", "Vínculos, regimes e deduções"], rows: output } : { title: "Apuração de aposentadoria — requisitos, transição e cálculo pelas regras cadastradas; emissão não concede o benefício", headers: ["Servidor", "Matrícula", "Referência", "Regra", "Idade", "Dias contributivos", "Dias de serviço público", "Dias no cargo", "Pontos", "Pedágio (dias)", "Requisitos", "Base do benefício BRL", "Benefício calculado BRL", "Cobertura / coeficiente", "Bases e fatores utilizados", "Fundamento", "Responsável", "Regra / versão"], rows: output };
}
