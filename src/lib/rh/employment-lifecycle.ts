import { desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { personnelActs } from "@/db/schema/personnel-records";
import { hrEmploymentContracts, hrEmploymentRevisions } from "@/db/schema/personnel-workforce";
import { hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { findHrIntegrationEvent, lockPersonnel, personnelJson } from "@/db/repositories/personnel/integration";
import { listClosedContractCompetences, requireEmploymentContract, requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration } from "./workforce-service";
import { assertPositionPlanForContract } from "./position-plan";

export async function applyPocEmploymentLifecycle(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ sourceRunId: z.string().min(1), operation: z.enum(["DESLIGAR", "REINTEGRAR"]), date: z.iso.date(), actNumber: z.string().trim().min(3).max(100), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRunWithStatements(tx, input.sourceRunId);
    await lockPersonnel(tx, `payroll:${run.payrollId}`);
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.scope !== "DEMONSTRACAO" || run.payroll.type !== "Rescisão") throw new Error("Efeito funcional POC exige rescisão demonstrativa fechada.");
    const [set] = await tx.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, run.ruleSetId)).limit(1);
    if (!set) throw new Error("Conjunto de regras não encontrado.");
    if (!set.isDemo || set.scope !== "DEMONSTRACAO") throw new Error("Efeito funcional estimado exige conjunto demonstrativo.");
    const sourceKey = `VINCULO:${input.operation}:${run.id}`;
    const fingerprint = JSON.stringify(input);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Efeito funcional já registrado com outros termos.");
      return previous;
    }
    const closedEnd = payrollPeriod(run.payroll.competence).end.toISOString().slice(0, 10);
    const date = new Date(`${input.date}T00:00:00Z`);
    if (input.operation === "DESLIGAR" && input.date !== closedEnd) throw new Error("Modelo de desligamento automático POC usa o último dia da competência de rescisão; desligamento intramês exige fluxo específico.");
    const termination = await findHrIntegrationEvent(tx, `VINCULO:DESLIGAR:${run.id}`);
    if (input.operation === "REINTEGRAR" && (!termination || input.date <= closedEnd)) throw new Error("Reintegração exige desligamento vinculado e data posterior.");
    const effectiveFrom = input.operation === "DESLIGAR" ? new Date(date.getTime() + 86400000) : date;
    const results = [];
    for (const statement of [...run.statements].sort((a, b) => a.contractId.localeCompare(b.contractId))) {
      await lockPersonnel(tx, `contract:${statement.contractId}`);
      const contract = await requireEmploymentContract(tx, statement.contractId);
      const version = z.object({ contract: z.object({ version: z.number() }) }).parse(statement.snapshot).contract.version;
      const expected = input.operation === "DESLIGAR" ? version : (termination!.payload as { results: { contractId: string; version: number }[] }).results.find(result => result.contractId === contract.id)?.version;
      if (contract.version !== expected || contract.status !== (input.operation === "DESLIGAR" ? "ATIVO" : "INATIVO")) throw new Error("Vínculo mudou após a rescisão/efeito funcional. Concilie antes de aplicar o ato.");
      const closed = await listClosedContractCompetences(tx, contract.id);
      if (closed.some(row => payrollPeriod(row.competence).end >= effectiveFrom)) throw new Error("Efeito funcional alcança outra competência fechada; exige conciliação antes do ato.");
      const [latest] = await tx.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, contract.id)).orderBy(desc(hrEmploymentRevisions.effectiveFrom), desc(hrEmploymentRevisions.version)).limit(1);
      if (latest && latest.effectiveFrom > effectiveFrom) throw new Error("Ato anterior à última vigência contratual.");
      const [updated] = await tx.update(hrEmploymentContracts).set({ status: input.operation === "DESLIGAR" ? "INATIVO" : "ATIVO", endsAt: input.operation === "DESLIGAR" ? date : null, version: sql`${hrEmploymentContracts.version} + 1` }).where(eq(hrEmploymentContracts.id, contract.id)).returning();
      await tx.insert(hrEmploymentRevisions).values({ contractId: contract.id, version: updated.version, effectiveFrom, snapshot: personnelJson(updated), actorId, reason: `${input.operation} POC · ${input.actNumber} · ${input.reason}` });
      if (input.operation === "REINTEGRAR") await assertPositionPlanForContract(tx, updated, effectiveFrom);
      const [act] = await tx.insert(personnelActs).values({ employeeId: contract.employeeId, type: input.operation === "DESLIGAR" ? "Exoneração — POC" : "Reintegração — POC", actNumber: input.actNumber, date }).returning();
      results.push({ contractId: contract.id, version: updated.version, actId: act.id, effectiveFrom: effectiveFrom.toISOString(), status: updated.status });
    }
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "EFEITO_FUNCIONAL_RESCISAO", payload: { fingerprint, input, actorId, results, historicalStatementsPreserved: true, retroactivePaymentsCalculated: false, gapRightsReconciled: false } });
  }, { timeoutMs: 60000 });
}
