import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrRightEntries } from "@/db/schema/personnel-workforce";
import type { EmploymentContract } from "@/lib/contracts/personnel";
import type { FunctionalRecord } from "./functional-record-service";
import { matchingFunctionalRules } from "./functional-payroll";
import { serviceTimeAssessment } from "./automatic-service-rights";
import { calculateRemunerationAverage } from "./remuneration-average";
import { payrollPeriod } from "./calculation-engine";
import { preparePocSpecialRubrics } from "./poc-special-payroll";
import { requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import { hrVacationPolicies } from "@/db/schema/personnel-configuration";
import { enqueueHrIntegration, personnelJson } from "@/db/repositories/personnel/integration";
import { specialFunctionalBasis } from "./special-functional-basis";

const day = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
/** Values derive from the dated contract, certified history and rights ledger. */
export async function prepareTerminationRubrics(db: DatabaseExecutor, contract: EmploymentContract, records: FunctionalRecord[], input: Omit<Parameters<typeof preparePocSpecialRubrics>[0], "salary" | "admittedAt" | "endsAt">, scope: string) {
  const p = input.parameters;
  if (!p.terminationDate || !p.terminationReason) throw new Error("Informe data e motivo do desligamento.");
  const termination = new Date(`${p.terminationDate}T00:00:00Z`), period = payrollPeriod(input.competence);
  if (termination < period.start || termination > period.end || termination < contract.admittedAt || contract.endsAt && termination > contract.endsAt) throw new Error("Data do desligamento fora da competência ou do vínculo.");
  const policies = matchingFunctionalRules(records, "REGRA_RESCISAO", contract, { start: termination, end: termination }).filter(row => row.data.reason === p.terminationReason);
  if (policies.length !== 1) throw new Error("Configure uma única regra de direitos rescisórios para o motivo e enquadramento.");
  const policy = policies[0], counted = await serviceTimeAssessment(db, contract, termination, "thirteenth"), excluded = new Set(counted.exclusions);
  const functionalBasis = await specialFunctionalBasis(db, contract, records, { payrollType: input.payrollType, competence: input.competence, referenceDate: p.terminationDate, rubrics: input.rubrics });
  const regime = await requireEmploymentRegime(db, contract.regimeId);
  const [vacationPolicy] = regime.vacationPolicyId ? await db.select().from(hrVacationPolicies).where(eq(hrVacationPolicies.id, regime.vacationPolicyId)) : [];
  const specialVacation = matchingFunctionalRules(records, "FERIAS_ESPECIAIS", contract, { start: termination, end: termination });
  if (specialVacation.length > 1) throw new Error("Mais de uma regra de férias especiais no desligamento.");
  const entitlement = specialVacation.length ? Number(specialVacation[0].data.days) : vacationPolicy?.entitlementDays;
  const acquisitionMonths = specialVacation.length ? Number(specialVacation[0].data.acquisitionMonths) : vacationPolicy?.acquisitionMonths;
  if ((policy.data.vacation === "SIM" || policy.data.overdueVacation === "SIM") && (!entitlement || !acquisitionMonths)) throw new Error("Configure a política de férias para apurar os direitos rescisórios.");
  let avos = 0;
  for (let month = 0; month <= termination.getUTCMonth(); month++) {
    const start = Math.max(Date.UTC(termination.getUTCFullYear(), month, 1), contract.admittedAt.getTime());
    const end = Math.min(Date.UTC(termination.getUTCFullYear(), month + 1, 0), termination.getTime());
    let eligible = 0;
    for (let at = start; at <= end; at += day) if (!excluded.has(iso(new Date(at)))) eligible++;
    if (eligible >= 15) avos++;
  }
  if (p.averageRuleId && (!p.averageFrom || !p.averageUntil || payrollPeriod(p.averageUntil).start > period.start)) throw new Error("Informe o início e fim da média rescisória, sem competências posteriores ao desligamento.");
  const average = p.averageRuleId ? await calculateRemunerationAverage(db, { contractId: contract.id, ruleId: p.averageRuleId, from: p.averageFrom!, until: p.averageUntil! }) : null;
  if (average && average.scope !== scope) throw new Error("A média deve pertencer ao escopo da rescisão.");
  if (average && functionalBasis && average.policy.rubricCodes.some(code => functionalBasis.memory.codes.includes(code))) throw new Error("A base funcional e a média rescisória incluem a mesma verba; concilie a composição.");
  if (!average && new Decimal(p.average).gt(0)) throw new Error("A rescisão por direitos exige média calculada a partir de regra e competências.");
  const rights = await db.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, contract.id), eq(hrRightEntries.kind, "FERIAS"),
    sql`coalesce(${hrRightEntries.details}->>'scope',(SELECT a.details->>'scope' FROM "HrRightEntry" a WHERE a."contractId"=${hrRightEntries.contractId} AND a.kind='FERIAS' AND a."periodStart"=${hrRightEntries.periodStart} AND a."periodEnd"=${hrRightEntries.periodEnd} AND a.quantity>0 AND a.details->>'scope' IS NOT NULL ORDER BY a."createdAt",a.id LIMIT 1))=${scope}`,
    sql`${hrRightEntries.periodEnd}<=${termination}`));
  const balances = new Map<string, Decimal>();
  for (const entry of rights) { const key = `${iso(entry.periodStart)}:${iso(entry.periodEnd)}`; balances.set(key, (balances.get(key) ?? new Decimal(0)).add(entry.quantity)); }
  const overdue = [...balances.values()].reduce((sum, value) => sum.add(Decimal.max(0, value)), new Decimal(0));
  if ([...balances.values()].some(value => value.lt(0))) throw new Error("Saldo de férias negativo no ledger; concilie os aquisitivos antes da rescisão.");
  const lastPeriod = rights.filter(entry => entry.quantity.gt(0)).sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0];
  const acquisitionStart = lastPeriod ? new Date(lastPeriod.periodEnd.getTime() + day) : contract.admittedAt;
  let vacationAvos = 0;
  const vacationTime = await serviceTimeAssessment(db, contract, termination, "vacation"), vacationExcluded = new Set(vacationTime.exclusions);
  for (let start = new Date(acquisitionStart); start <= termination; ) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    next.setUTCDate(Math.min(acquisitionStart.getUTCDate(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
    let days = 0;
    for (let at = start.getTime(); at < next.getTime() && at <= termination.getTime(); at += day) if (!vacationExcluded.has(iso(new Date(at)))) days++;
    if (days >= 15) vacationAvos++;
    start = next;
  }
  if (policy.data.vacation === "SIM" && vacationAvos >= (acquisitionMonths ?? 12)) throw new Error("Apure os aquisitivos de férias completos antes de calcular a rescisão.");
  const vacationDays = (policy.data.overdueVacation === "SIM" ? overdue : new Decimal(0)).add(policy.data.vacation === "SIM" ? new Decimal(vacationAvos).mul(entitlement!).div(acquisitionMonths!) : 0);
  const salaryDays = policy.data.salaryBalance === "SIM" ? Math.min(30, Math.floor((termination.getTime() - Math.max(period.start.getTime(), contract.admittedAt.getTime())) / day) + 1) : 0;
  const paid = await db.execute<{ id: string; runId: string; type: string; competence: string; code: string; value: string }>(sql`
    SELECT s.id,r.id "runId",p.type,p.competence,item->>'code' code,item->>'value' value
    FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId"
    CROSS JOIN LATERAL jsonb_array_elements(s.snapshot->'items') item
    WHERE s."contractId"=${contract.id} AND r.mode='OFICIAL' AND r.status='FECHADA' AND r.scope=${scope}
      AND to_date(p.competence,'MM/YYYY') BETWEEN date_trunc('year',${termination}::date) AND ${termination}::date
      AND p.type IN ('1ª parcela 13º','13º','Diferença 13º') AND item->>'code' IN ('POC_ADIANTAMENTO_13','POC_DECIMO_13','POC_ABATIMENTO')
    ORDER BY r.id,s.id,item->>'code'`);
  // Subtract the effective gross already awarded, including advances not yet offset by the final parcel.
  const priorThirteenth = paid.rows.reduce((sum, row) => sum.add(new Decimal(row.value).mul(row.code === "POC_ABATIMENTO" ? -1 : 1)), new Decimal(0));
  const taxes = await db.execute<{ id: string; scheme: string; social: string; incomeTax: string; employer: string }>(sql`SELECT s.id,s.snapshot->'regime'->'socialSecurityScheme'->>'id' scheme,
    coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' LIKE 'PREVIDENCIA_%'),0)::text social,
    coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code'='IRRF'),0)::text "incomeTax",
    coalesce((s.snapshot->'employerComponents'->>'PREVIDENCIA_PATRONAL')::numeric+(s.snapshot->'employerComponents'->>'CONTRIBUICAO_ATUARIAL')::numeric,
      s.employer-coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' IN ('FGTS','PIS_PASEP')),0))::text employer
    FROM "HrPayrollStatement" s WHERE s.id=ANY(${sql.param([...new Set(paid.rows.map(row => row.id))])}::text[]) ORDER BY s.id`);
  if (taxes.rows.some(row => row.scheme !== regime.socialSecuritySchemeId)) throw new Error("13º anterior com mudança de esquema previdenciário exige conciliação dos recolhimentos antes da rescisão.");
  const priorThirteenthTaxes = taxes.rows.reduce((sum, row) => ({ social: sum.social.add(row.social), incomeTax: sum.incomeTax.add(row.incomeTax), employer: sum.employer.add(row.employer) }), { social: new Decimal(0), incomeTax: new Decimal(0), employer: new Decimal(0) });
  if (priorThirteenth.lt(0)) throw new Error("Histórico de parcelas de 13º não concilia.");
  if (new Decimal(p.previousAdvance).gt(0)) throw new Error("A rescisão por direitos apura abatimentos nas folhas encerradas; remova o adiantamento manual.");
  const salary = functionalBasis?.remuneration ?? contract.salary;
  const prepared = preparePocSpecialRubrics({ ...input, salary, admittedAt: contract.admittedAt, endsAt: termination, parameters: { ...p, previousAdvance: "0.00", days: salaryDays, avos: policy.data.thirteenth === "SIM" ? avos : 0, vacationDays: vacationDays.toNumber(), average: average?.average ?? "0.00" } });
  if (functionalBasis && policy.data.salaryBalance === "SIM") {
    prepared.movements.POC_SALDO = functionalBasis.salaryBalance;
    prepared.memory.formulas.POC_SALDO = "SOMA_DIARIA_DAS_RUBRICAS_DE_ORIGEM / DIAS_CIVIS_DO_MES";
  }
  if (policy.data.thirteenth === "SIM") {
    const full = prepared.movements.POC_DECIMO_13;
    if (priorThirteenth.gt(full)) throw new Error("13º já concedido supera o direito rescisório. Concilie a restituição antes de calcular.");
    prepared.movements.POC_ABATIMENTO = priorThirteenth;
    prepared.memory.formulas.POC_ABATIMENTO = "PARCELAS_13_FECHADAS_MENOS_ABATIMENTOS_JA_REALIZADOS";
  }
  if (Number(policy.data.noticeDays) > 0) {
    const rubric = input.rubrics.find(row => row.code === "AVISO_INDENIZADO" && row.type === "PROVENTO" && row.calculationMethod === "MANUAL");
    if (!rubric) throw new Error("Configure a rubrica manual AVISO_INDENIZADO com as incidências do aviso indenizado.");
    prepared.rubrics.push(rubric);
    prepared.movements.AVISO_INDENIZADO = salary.add(average?.average ?? 0).mul(policy.data.noticeDays).div(30).toDecimalPlaces(2);
    prepared.memory.formulas.AVISO_INDENIZADO = "(SALARIO + MEDIA_APURADA) * DIAS_AVISO / 30";
  }
  let fgtsCertificate: FunctionalRecord | null = null;
  if (Number(policy.data.fgtsFineRate) > 0) {
    const certificates = records.filter(row => row.kind === "SALDO_FGTS" && row.startsAt <= termination && (!row.endsAt || row.endsAt >= termination));
    if (certificates.length !== 1) throw new Error("Registre um saldo integral certificado de FGTS vigente na data de rescisão.");
    fgtsCertificate = certificates[0];
    const rubric = input.rubrics.find(row => row.code === "MULTA_FGTS" && row.type === "PROVENTO" && row.calculationMethod === "MANUAL");
    if (!rubric) throw new Error("Configure a rubrica manual MULTA_FGTS com as incidências próprias da indenização.");
    prepared.rubrics.push(rubric);
    prepared.movements.MULTA_FGTS = new Decimal(fgtsCertificate.data.balance).mul(policy.data.fgtsFineRate).div(100).toDecimalPlaces(2);
    prepared.memory.formulas.MULTA_FGTS = "SALDO_INTEGRAL_CERTIFICADO_FGTS * PERCENTUAL_MOTIVO / 100";
  }
  const vacationSettlement = [
    ...(policy.data.overdueVacation === "SIM" ? [...balances].filter(([, value]) => value.gt(0)).map(([key, value]) => { const [start, end] = key.split(":"); return { start, end, days: value.toString(), proportional: false }; }) : []),
    ...(policy.data.vacation === "SIM" && vacationAvos > 0 ? [{ start: iso(acquisitionStart), end: iso(termination), days: new Decimal(vacationAvos).mul(entitlement!).div(acquisitionMonths!).toDecimalPlaces(4).toString(), proportional: true }] : []),
  ];
  return { ...prepared, memory: { ...prepared.memory, taxModel: "RESCISAO_MENSAL_E_DECIMO_SEGREGADOS", specialFunctionalBasis: functionalBasis?.memory ?? null, terminationDate: p.terminationDate, terminationReason: p.terminationReason, rule: policy, fgtsCertificate, averageAssessment: average, thirteenthAssessment: counted, vacationAssessment: vacationTime, overdueVacationDays: overdue.toString(), proportionalVacationAvos: vacationAvos, rightsEntryIds: rights.map(row => row.id), vacationSettlement, thirteenthHistory: paid.rows, priorThirteenth: priorThirteenth.toFixed(2), priorThirteenthTaxes: { social: priorThirteenthTaxes.social.toFixed(2), incomeTax: priorThirteenthTaxes.incomeTax.toFixed(2), employer: priorThirteenthTaxes.employer.toFixed(2) } } };
}

/** Called only in the closing transaction after every source has been reassessed. */
export async function settleTerminationVacation(db: DatabaseExecutor, input: { contractId: string; runId: string; scope: string; actorId: string; memory: unknown }) {
  const memory = z.object({ terminationDate: z.iso.date(), vacationSettlement: z.array(z.object({ start: z.iso.date(), end: z.iso.date(), days: z.string(), proportional: z.boolean() })) }).parse(input.memory);
  for (const period of memory.vacationSettlement) {
    const start = new Date(`${period.start}T00:00:00Z`), end = new Date(`${period.end}T00:00:00Z`), days = new Decimal(period.days);
    if (days.lte(0) || !days.isFinite()) throw new Error("Quantidade de férias rescisórias inválida.");
    const origin = `FERIAS:RESCISAO:${input.runId}:${input.contractId}:${period.start}`;
    const [settled] = await db.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, origin));
    if (settled) {
      if (!settled.quantity.eq(days.negated())) throw new Error("Baixa rescisória registrada com outra quantidade.");
      continue;
    }
    const entries = await db.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, input.contractId), eq(hrRightEntries.kind, "FERIAS"), eq(hrRightEntries.periodStart, start), eq(hrRightEntries.periodEnd, end),
      sql`coalesce(${hrRightEntries.details}->>'scope',(SELECT a.details->>'scope' FROM "HrRightEntry" a WHERE a."contractId"=${hrRightEntries.contractId} AND a.kind='FERIAS' AND a."periodStart"=${hrRightEntries.periodStart} AND a."periodEnd"=${hrRightEntries.periodEnd} AND a.quantity>0 AND a.details->>'scope' IS NOT NULL ORDER BY a."createdAt",a.id LIMIT 1))=${input.scope}`));
    const balance = entries.reduce((sum, entry) => sum.add(entry.quantity), new Decimal(0));
    const details = { runId: input.runId, scope: input.scope, effectiveAt: memory.terminationDate, period, actorId: input.actorId };
    if (period.proportional) {
      if (entries.length) throw new Error("Período proporcional já possui lançamentos; concilie antes da rescisão.");
      await db.insert(hrRightEntries).values({ contractId: input.contractId, sourceKey: `${origin}:AQUISICAO`, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: days, amount: new Decimal(0), actorId: input.actorId, details: personnelJson({ ...details, operation: "AQUISICAO_PROPORCIONAL_RESCISAO" }) });
    } else if (!balance.eq(days)) throw new Error("Saldo do aquisitivo mudou antes da baixa rescisória.");
    const [entry] = await db.insert(hrRightEntries).values({ contractId: input.contractId, sourceKey: origin, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: days.negated(), amount: new Decimal(0), actorId: input.actorId, details: personnelJson({ ...details, operation: "INDENIZACAO_RESCISAO" }) }).returning();
    await enqueueHrIntegration(db, { sourceKey: origin, domain: "AUDITORIA", environment: input.scope, eventType: "FERIAS_INDENIZADAS_RESCISAO", payload: { ...details, entryId: entry.id, financialPaymentConfirmed: false } });
  }
}
