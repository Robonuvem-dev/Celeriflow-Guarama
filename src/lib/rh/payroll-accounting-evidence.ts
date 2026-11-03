import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrPayrollAccountingEvidence } from "@/db/schema/personnel-functional-management";
import { lockPersonnel, personnelJson, stablePersonnelJson, enqueueHrIntegration } from "@/db/repositories/personnel/integration";
import { requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { readPayrollAccountingAllocations } from "./payroll-accounting-allocations";
import { payrollPeriod } from "./calculation-engine";

const allocationSchema = z.object({ id: z.string(), details: z.record(z.string(), z.string()), appropriation: z.string(), budgetUnitId: z.string(), source: z.string(), nature: z.string() });
const evidenceSnapshot = z.object({ runId: z.string(), allocations: z.array(allocationSchema), competence: z.string() });
const inputSchema = z.object({ requestKey: z.string().trim().min(1).max(160), runId: z.string().min(1), source: z.string().trim().min(10).max(3000), responsible: z.string().trim().min(3).max(300), reason: z.string().trim().min(10).max(3000) }).strict();

/** Explicit documentary certification supplies a missing source without rewriting the closed run. */
export async function certifyHistoricalPayrollAccounting(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = inputSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, "functional-configuration");
    const run = await requirePayrollRunWithStatements(tx, input.runId);
    await lockPersonnel(tx, `payroll:${run.payrollId}`);
    await assertPayrollBudgetScope(context, run.payrollId);
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || !run.statements.length) throw new Error("Selecione uma execução oficial encerrada com demonstrativos.");
    if ((run.snapshot as { accountingAllocations?: unknown }).accountingAllocations != null) throw new Error("A execução já possui fotografia de rateio; sua classificação original é preservada.");
    const [previous] = await tx.select().from(hrPayrollAccountingEvidence).where(eq(hrPayrollAccountingEvidence.runId, run.id));
    if (previous) {
      if (previous.requestKey !== input.requestKey || previous.source !== input.source || previous.responsible !== input.responsible || previous.reason !== input.reason) throw new Error("Esta execução já possui certificação imutável com outros termos.");
      return { id: previous.id, hash: previous.snapshotHash };
    }
    const period = payrollPeriod(run.payroll.competence), start = period.start.toISOString().slice(0, 10), end = period.end.toISOString().slice(0, 10);
    const ids = new Set(run.statements.map(statement => statement.contractId));
    const allocations = (await readPayrollAccountingAllocations(tx)).filter(row => ids.has(row.details.contractId) && row.details.from <= start && row.details.until >= end);
    for (const id of ids) for (const component of ["REMUNERACAO", "ENCARGO"]) {
      const rows = allocations.filter(row => row.details.contractId === id && row.details.component === component);
      if (!rows.length || rows.some(row => !new Decimal(row.details.percentage).isFinite() || new Decimal(row.details.percentage).lte(0) || !row.details.source) || !rows.reduce((sum, row) => sum.add(row.details.percentage), new Decimal(0)).eq(100)) throw new Error(`Cadastre rateio documental de 100% para ${id}, ${component}, na competência certificada.`);
      for (const row of rows) assertBudgetUnitAccess(context.user, row.budgetUnitId);
    }
    const snapshot = personnelJson({ ...input, allocations, competence: run.payroll.competence, closedRunSnapshotPreserved: true, certificationNature: "FONTE_DOCUMENTAL_POSTERIOR", recordedAt: new Date().toISOString() });
    const snapshotHash = createHash("sha256").update(stablePersonnelJson(snapshot)).digest("hex");
    const [record] = await tx.insert(hrPayrollAccountingEvidence).values({ ...input, actorId: context.user.id, snapshot, snapshotHash }).returning();
    await enqueueHrIntegration(tx, { sourceKey: `RATEIO_HISTORICO_CERTIFICADO:${record.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "RATEIO_HISTORICO_CERTIFICADO", payload: { runId: run.id, evidenceId: record.id, source: input.source, snapshotHash, actorId: context.user.id, closedRunSnapshotPreserved: true } });
    return { id: record.id, hash: snapshotHash };
  });
}

export async function readCertifiedPayrollAccountingEvidence(db: DatabaseExecutor, runIds: string[]) {
  const records = runIds.length ? await db.select().from(hrPayrollAccountingEvidence).where(inArray(hrPayrollAccountingEvidence.runId, runIds)) : [];
  return new Map(records.map(record => {
    if (createHash("sha256").update(stablePersonnelJson(record.snapshot)).digest("hex") !== record.snapshotHash) throw new Error("A fonte documental de rateio não confere com seu resumo de integridade.");
    const snapshot = evidenceSnapshot.parse(record.snapshot);
    if (snapshot.runId !== record.runId) throw new Error("Certificação de rateio vinculada a execução incompatível.");
    return [record.runId, { ...record, allocations: snapshot.allocations }];
  }));
}
