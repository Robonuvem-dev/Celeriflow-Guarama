import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { hrEmploymentContracts, hrRightEntries } from "@/db/schema/personnel-workforce";
import { hrVacationPolicies } from "@/db/schema/personnel-configuration";
import { enqueueHrIntegration, lockPersonnel, personnelJson } from "@/db/repositories/personnel/integration";
import { findActivePayrollRule, requireEmploymentHolderHistory, requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { vacationDaysForConfiguredEntitlement, vacationEntitlementPolicySchema } from "./vacation-entitlement";
import { assertFunctionalHolderAccess, functionalRecordsAt } from "./functional-record-service";
import { matchingFunctionalRules } from "./functional-payroll";
import { serviceTimeAssessment } from "./automatic-service-rights";
import { civilAnniversary, completedCivilServiceYears } from "./civil-service-calendar";
import { hrContractInputSchema, saveEmploymentContractInTransaction } from "./workforce-service";
import { resolveContractRevision } from "./contract-timeline";
import type { AppContext } from "@/lib/platform/tenant-context";
import { acquireServiceRightsInTransaction, calculateServiceAcquisitions, loadServiceAcquisitionSources, serviceRightConcessionEnd, serviceRightPolicySchema } from "./service-rights";
import { assertPersonnelDepartment, assertPersonnelRubrics } from "./personnel-scope";
import { assessProgressionEvaluation } from "./progression-evaluation";

const day = 86400000;
const iso = (value: Date) => value.toISOString().slice(0, 10);
function monthsAfter(date: Date, months: number) { const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)); next.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate())); return next; }
export const rightsProcessingInput = z.object({ contractIds: z.array(z.string().min(1)).min(1).max(500), referenceDate: z.iso.date(), mode: z.enum(["PREVIA", "APLICAR"]), kinds: z.array(z.enum(["FERIAS", "LICENCA_PREMIO", "PROGRESSAO", "ATS"])).min(1).default(["FERIAS", "LICENCA_PREMIO", "PROGRESSAO", "ATS"]) }).strict();
type ProcessingRow = { contractId: string; registration: string; kind: string; start: string; acquiredAt: string; deadline: string; quantity: string; ruleId: string; status: string; evidence: string };

/** One transaction and stable source per acquisition: retries never duplicate a right. */
export async function processAutomaticRights(db: DatabaseConnection, context: AppContext, raw: unknown) {
  return withDatabaseTransaction(db, tx => processAutomaticRightsInTransaction(tx, context, raw), { timeoutMs: 120000 });
}

export async function processAutomaticRightsInTransaction(tx: DatabaseTransaction, context: AppContext, raw: unknown) {
  const input = rightsProcessingInput.parse(raw), through = new Date(`${input.referenceDate}T00:00:00Z`);
  if (input.mode === "APLICAR" && input.referenceDate > new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) throw new Error("Concessões futuras são exibidas na previsão; a aplicação usa uma data já alcançada no calendário municipal.");
    await lockPersonnel(tx, "functional-configuration");
    const rows: ProcessingRow[] = [];
    for (const id of [...new Set(input.contractIds)].sort()) {
      const stored = await requireEmploymentHolderHistory(tx, id);
      await assertFunctionalHolderAccess(tx, context, stored.employeeId);
      await lockPersonnel(tx, `employee:${stored.employeeId}`); await lockPersonnel(tx, `contract:${id}`);
      let contract = resolveContractRevision(stored, stored.revisions, { start: through, end: through }).contract;
      assertPersonnelDepartment(context.user, contract.departmentId);
      if (contract.admittedAt > through || contract.status !== "ATIVO") continue;
      const records = await functionalRecordsAt(tx, { employeeId: contract.employeeId, contractId: id, from: contract.admittedAt, until: through });
      if (records.some(record => record.kind === "CATEGORIA_FOLHA" && record.data.category !== "ATIVO" && record.startsAt <= through && (!record.endsAt || record.endsAt >= through))) continue;
      const regime = await requireEmploymentRegime(tx, contract.regimeId);
      const serviceRules = (await tx.execute<{ id: string; value: unknown }>(sql`SELECT id,value FROM "HrPayrollRule" WHERE "ruleSetId"=${regime.ruleSetId} AND "isActive" AND value->>'origin'='LICENCA_PREMIO' ORDER BY id`)).rows;
      if (input.kinds.includes("LICENCA_PREMIO") && serviceRules.length > 1) throw new Error("Mais de uma política de licença-prêmio ativa no regime.");
      for (const rule of input.kinds.includes("LICENCA_PREMIO") ? serviceRules : []) {
        const policy = serviceRightPolicySchema.parse(rule.value);
        const sources = await loadServiceAcquisitionSources(tx, contract, through, policy);
        const assessment = calculateServiceAcquisitions(contract.admittedAt, through, policy, sources.absences, sources.effects);
        const entries = await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, id), eq(hrRightEntries.kind, "LICENCA_PREMIO"), sql`${hrRightEntries.details}->>'scope'=${regime.ruleSet.scope}`));
        for (const period of assessment.periods) {
          const own = entries.filter(entry => entry.periodStart.getTime() === period.periodStart.getTime() && entry.periodEnd.getTime() === period.periodEnd.getTime());
          const balance = own.reduce((sum, entry) => sum.add(entry.quantity), new Decimal(0));
          const deadline = serviceRightConcessionEnd(period.periodEnd, policy.concessionMonths);
          rows.push({ contractId: id, registration: contract.registration, kind: "LICENCA_PREMIO", start: iso(period.periodStart), acquiredAt: iso(period.periodEnd), deadline: deadline ? iso(new Date(deadline.getTime() - day)) : "", quantity: own.length ? balance.toString() : String(policy.entitlementDays), ruleId: rule.id, status: own.some(entry => entry.quantity.gt(0)) ? "Registrada" : "Devida", evidence: `${period.countedDays} dias computados; ${period.suspendedDays} dias suspensos; ${policy.legalReference}` });
        }
        const pending = assessment.pending;
        rows.push({ contractId: id, registration: contract.registration, kind: "LICENCA_PREMIO", start: iso(pending.periodStart), acquiredAt: "", deadline: "", quantity: String(pending.countedDays), ruleId: rule.id, status: "Em aquisição", evidence: `${pending.suspendedDays} dias suspensos; ${policy.legalReference}` });
        if (input.mode === "APLICAR") await acquireServiceRightsInTransaction(tx, context.user.id, { contractId: id, ruleId: rule.id, through: input.referenceDate });
      }
      const policies = input.kinds.includes("PROGRESSAO") ? matchingFunctionalRules(records, "REGRA_PROGRESSAO", contract, { start: through, end: through }) : [];
      if (policies.length > 1) throw new Error("Mais de uma progressão aplicável ao vínculo na referência. Concilie as regras antes de processar.");
      for (const policy of policies) {
        const assessment = await serviceTimeAssessment(tx, contract, through, "progression");
        if (contract.roleId === policy.data.targetRoleId && contract.salaryLevel === policy.data.targetLevel) continue;
        const ordered = [...stored.revisions].filter(row => row.effectiveFrom <= through).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
        let beginning = contract.admittedAt;
        for (let index = 1; index < ordered.length; index++) {
          const before = ordered[index - 1].snapshot as { roleId: string; salaryLevel: string | null };
          const after = ordered[index].snapshot as { roleId: string; salaryLevel: string | null };
          if (before.roleId !== after.roleId || before.salaryLevel !== after.salaryLevel) beginning = ordered[index].effectiveFrom;
        }
        const credits = policy.data.priorCredit === "SIM" ? await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, id), eq(hrRightEntries.kind, "TEMPO_SERVICO"), sql`${hrRightEntries.details}->>'appliesTo' IN ('PROGRESSAO','TODOS')`, sql`${hrRightEntries.details}->>'scope'=${regime.ruleSet.scope}`, sql`${hrRightEntries.periodEnd}<${contract.admittedAt}`)) : [];
        const credited = credits.reduce((sum, row) => sum.add(row.quantity), new Decimal(0)).toNumber();
        let due = civilAnniversary(beginning, Number(policy.data.intervalYears));
        for (let index = 0; index < 55000; index++) {
          const excluded = assessment.exclusions.filter(value => value >= iso(beginning) && value < iso(due)).length;
          const adjusted = new Date(civilAnniversary(beginning, Number(policy.data.intervalYears)).getTime() + (excluded - credited) * day);
          if (adjusted.getTime() === due.getTime()) break;
          due = adjusted;
        }
        if (due < policy.startsAt) due = policy.startsAt;
        const evaluation = Number(policy.data.minimumScore) === 0 ? null : await assessProgressionEvaluation(tx, context, contract.employeeId, beginning, through, policy.data);
        const score = evaluation?.score;
        const qualified = Number(policy.data.minimumScore) === 0 || score != null && new Decimal(score).gte(policy.data.minimumScore);
        if (qualified && evaluation?.availableOn && evaluation.availableOn > iso(due)) due = new Date(`${evaluation.availableOn}T00:00:00Z`);
        const sourceKey = `PROGRESSAO:AUTO:${id}:${policy.id}:${iso(beginning)}`;
        const existing = await tx.execute(sql`SELECT id FROM "HrIntegrationEvent" WHERE "sourceKey"=${sourceKey}`);
        const status = existing.rows.length ? "Registrada" : !qualified ? "Aguardando avaliação mínima" : due > through ? "Prevista" : "Devida";
        rows.push({ contractId: id, registration: contract.registration, kind: "PROGRESSAO", start: iso(beginning), acquiredAt: iso(due), deadline: "", quantity: policy.data.salary, ruleId: policy.id, status, evidence: `Cargo ${policy.data.targetRoleId}; nível ${policy.data.targetLevel}; avaliação ${score ?? "não exigida / indisponível"}; ${policy.data.legalReference}` });
        if (input.mode !== "APLICAR" || status !== "Devida") continue;
        const current = (await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, id)))[0];
        const updated = await saveEmploymentContractInTransaction(tx, context.user.id, hrContractInputSchema.parse({ id, version: current.version, employeeId: contract.employeeId, registration: contract.registration, regimeId: contract.regimeId, roleId: policy.data.targetRoleId, departmentId: contract.departmentId ?? "", costCenterId: contract.costCenterId ?? "", workLocation: contract.workLocation, salaryLevel: policy.data.targetLevel, admittedAt: iso(contract.admittedAt), appointedAt: contract.appointedAt ? iso(contract.appointedAt) : "", swornAt: contract.swornAt ? iso(contract.swornAt) : "", endsAt: contract.endsAt ? iso(contract.endsAt) : "", effectiveFrom: iso(due), salary: policy.data.salary, monthlyHours: contract.monthlyHours, details: contract.details, reason: `Progressão automática — ${policy.data.legalReference}` }));
        await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "PROGRESSAO_AUTOMATICA", payload: { employeeId: contract.employeeId, contractId: id, rule: policy, assessment, credited, score, evaluation, version: updated.version, effectiveFrom: iso(due), actorId: context.user.id } });
        const refreshed = await requireEmploymentHolderHistory(tx, id);
        contract = resolveContractRevision(refreshed, refreshed.revisions, { start: through, end: through }).contract;
      }
      const [regular] = regime?.vacationPolicyId ? await tx.select().from(hrVacationPolicies).where(eq(hrVacationPolicies.id, regime.vacationPolicyId)) : [];
      const special = matchingFunctionalRules(records, "FERIAS_ESPECIAIS", contract, { start: through, end: through });
      if (input.kinds.includes("FERIAS") && special.length > 1) throw new Error("Mais de uma política de férias especiais aplicável ao vínculo.");
      const vacation = special[0];
      const acquisitionMonths = vacation ? Number(vacation.data.acquisitionMonths) : regular?.acquisitionMonths;
      const entitlement = vacation ? Number(vacation.data.days) : regular?.entitlementDays;
      if (input.kinds.includes("FERIAS") && acquisitionMonths && entitlement && regular?.isActive) {
        if (!regime.isActive || regime.ruleSet.status !== "ATIVA") throw new Error("Aquisição exige regime e parâmetros ativos.");
        const absenceRule = await findActivePayrollRule(tx, regime.ruleSetId, "FALTAS_FERIAS_POC");
        const absencePolicy = absenceRule ? vacationEntitlementPolicySchema.parse(absenceRule.value) : null;
        const counted = await serviceTimeAssessment(tx, contract, through, "vacation");
        const vacationExclusions = absencePolicy ? counted.functionalExclusions : counted.exclusions;
        let start = vacation && vacation.startsAt > contract.admittedAt ? vacation.startsAt : contract.admittedAt;
        for (let cycle = 0; cycle < 1000 && start <= through; cycle++) {
          const nominalEnd = new Date(monthsAfter(start, acquisitionMonths).getTime() - day);
          let end = nominalEnd;
          for (let iteration = 0; iteration < 55000; iteration++) {
            const excluded = vacationExclusions.filter(value => value >= iso(start) && value <= iso(end)).length;
            const extended = new Date(nominalEnd.getTime() + excluded * day);
            if (extended.getTime() === end.getTime()) break;
            end = extended;
          }
          const deadline = monthsAfter(new Date(end.getTime() + day), vacation ? Number(vacation.data.useWithinMonths) : regular.concessionMonths);
          const sourceKey = `FERIAS:AQUISICAO:${id}:${iso(start)}`;
          const faults = absencePolicy ? await tx.select({ date: attendanceRecords.date }).from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, contract.employeeId), sql`${attendanceRecords.date} BETWEEN ${start} AND ${end}`, sql`${attendanceRecords.status}=ANY(${sql.param(absencePolicy.attendanceStatuses)}::text[])`)) : [];
          const absenceCount = new Set(faults.map(row => iso(row.date))).size;
          const entitledDays = absencePolicy ? vacationDaysForConfiguredEntitlement(absencePolicy, absenceCount, entitlement) : entitlement;
          const [existing] = await tx.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, sourceKey));
          if (existing && (existing.periodEnd.getTime() !== end.getTime() || !existing.quantity.eq(entitledDays))) throw new Error("A política ou frequência alterou uma aquisição registrada. Concilie o ledger antes de reapurar.");
          rows.push({ contractId: id, registration: contract.registration, kind: "FERIAS", start: iso(start), acquiredAt: iso(end), deadline: iso(deadline), quantity: String(entitledDays), ruleId: vacation?.id ?? regular.id, status: existing ? "Registrada" : end > through ? "Prevista" : "Devida", evidence: vacation?.data.legalReference ?? regular.legalReference ?? "Política de férias" });
          if (!existing && end <= through && input.mode === "APLICAR") {
            if (regime.ruleSet.effectiveFrom > start || regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < end) throw new Error("Os parâmetros devem cobrir todo o aquisitivo.");
            if (stored.revisions.some(row => row.effectiveFrom >= start && row.effectiveFrom <= end && (row.snapshot as { regimeId: string }).regimeId !== regime.id)) throw new Error("Aquisitivo atravessa mudança de regime; concilie a política de transição.");
            await tx.insert(hrRightEntries).values({ contractId: id, sourceKey, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: new Decimal(entitledDays), amount: new Decimal(0), actorId: context.user.id, details: personnelJson({ operation: "AQUISICAO", policy: regular, specialRule: vacation ?? null, absencePolicy, absenceCount, concessionEndsAt: deadline, scope: regime.ruleSet.scope, exclusions: vacationExclusions.filter(value => value >= iso(start) && value <= iso(end)), faultTreatment: absencePolicy ? "REDUCAO_POR_FAIXAS_SEM_DUPLICAR_PRORROGACAO" : "EXCLUSAO_DO_TEMPO" }) });
          }
          if (end > through) break;
          start = new Date(end.getTime() + day);
        }
      }
      const ats = input.kinds.includes("ATS") ? matchingFunctionalRules(records, "REGRA_ATS", contract, { start: through, end: through }) : [];
      for (const rule of ats) {
        assertPersonnelRubrics(context.user, [rule.data.rubricCode]);
        const counted = await serviceTimeAssessment(tx, contract, through, "ats");
        const start = rule.data.initialDate ? new Date(`${rule.data.initialDate}T00:00:00Z`) : contract.admittedAt;
        const credits = rule.data.priorCredit === "SIM" ? await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, id), eq(hrRightEntries.kind, "TEMPO_SERVICO"), sql`coalesce(${hrRightEntries.details}->>'appliesTo','ATS') IN ('ATS','TODOS')`, sql`${hrRightEntries.details}->>'scope'=${regime.ruleSet.scope}`, sql`${hrRightEntries.periodEnd}<${contract.admittedAt}`)) : [];
        const credited = credits.reduce((sum, row) => sum.add(row.quantity), new Decimal(0));
        if (!credited.isInteger() || credited.lt(0)) throw new Error("Averbação inconsistente para a previsão de ATS.");
        const exclusions = counted.exclusions.filter(date => date >= iso(start));
        const years = Math.max(0, completedCivilServiceYears(start, new Date(through.getTime() + (credited.toNumber() - exclusions.length) * day)));
        const acquisition = Math.floor(years / Number(rule.data.intervalYears));
        for (let index = 1; index <= acquisition; index++) {
          const previousRate = Decimal.min(new Decimal(rule.data.rate).mul(index - 1), new Decimal(rule.data.maximumRate));
          const increment = Decimal.min(new Decimal(rule.data.rate).mul(index), new Decimal(rule.data.maximumRate)).sub(previousRate);
          if (increment.lte(0)) break;
          const nominal = civilAnniversary(start, index * Number(rule.data.intervalYears));
          let due = new Date(nominal.getTime() - credited.toNumber() * day);
          for (let attempt = 0; attempt < 55000; attempt++) {
            const excluded = exclusions.filter(value => value <= iso(due)).length;
            const adjusted = new Date(nominal.getTime() + (excluded - credited.toNumber()) * day);
            if (adjusted.getTime() === due.getTime()) break;
            due = adjusted;
          }
          if (due < rule.startsAt) due = rule.startsAt;
          if (due > through || rule.endsAt && due > rule.endsAt) continue;
          const sourceKey = `ATS:AQUISICAO_AUTO:${id}:${rule.id}:${iso(start)}:${index}`;
          const [existing] = await tx.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, sourceKey));
          if (existing && (!existing.quantity.eq(increment) || existing.periodEnd.getTime() !== due.getTime())) throw new Error("Contagem ou regra de ATS alterou uma aquisição registrada; concilie o histórico.");
          rows.push({ contractId: id, registration: contract.registration, kind: "ATS_ADQUIRIDO", start: iso(start), acquiredAt: iso(due), deadline: "", quantity: increment.toString(), ruleId: rule.id, status: existing ? "Registrada" : "Devida", evidence: `${index}ª aquisição; ${rule.data.legalReference}` });
          if (!existing && input.mode === "APLICAR") {
            const [entry] = await tx.insert(hrRightEntries).values({ contractId: id, sourceKey, kind: "ATS", periodStart: start, periodEnd: due, quantity: increment, amount: new Decimal(0), actorId: context.user.id, details: personnelJson({ operation: "AQUISICAO_AUTOMATICA", scope: regime.ruleSet.scope, ruleId: rule.id, ruleVersion: rule.version, index, creditedDays: credited.toNumber(), exclusions: exclusions.filter(value => value <= iso(due)), legalReference: rule.data.legalReference }) }).returning();
            await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: regime.ruleSet.scope, eventType: "ATS_ADQUIRIDO_AUTOMATICAMENTE", payload: { employeeId: contract.employeeId, contractId: id, entryId: entry.id, actorId: context.user.id, effectiveFrom: iso(due), increment: increment.toString() } });
          }
        }
        let next = civilAnniversary(start, (acquisition + 1) * Number(rule.data.intervalYears));
        next = new Date(next.getTime() + (exclusions.length - credited.toNumber()) * day);
        if (next < rule.startsAt) next = rule.startsAt;
        const currentRate = Decimal.min(new Decimal(rule.data.rate).mul(acquisition), new Decimal(rule.data.maximumRate));
        const nextEligible = currentRate.lt(rule.data.maximumRate) && (!rule.endsAt || next <= rule.endsAt) && (!contract.endsAt || next <= contract.endsAt);
        rows.push({ contractId: id, registration: contract.registration, kind: "ATS", start: iso(start), acquiredAt: nextEligible ? iso(next) : "", deadline: "", quantity: currentRate.toString(), ruleId: rule.id, status: nextEligible ? "Percentual vigente / próxima aquisição" : "Percentual vigente / sem aquisição futura na vigência", evidence: `${exclusions.length} dias excluídos; ${credited.toString()} dias averbados; ${nextEligible ? Math.max(0, Math.ceil((next.getTime() - through.getTime()) / day)) : 0} dias até a próxima aquisição prevista; excluídas somente ocorrências já documentadas; ${rule.data.legalReference}` });
      }
    }
    return { applied: input.mode === "APLICAR", rows };
}
