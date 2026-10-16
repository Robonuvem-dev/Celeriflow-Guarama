import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration } from "./workforce-service";
import { assertPositionPlanForContract } from "./position-plan";

export async function applyPocEmploymentLifecycle(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ sourceRunId: z.string().min(1), operation: z.enum(["DESLIGAR", "REINTEGRAR"]), date: z.iso.date(), actNumber: z.string().trim().min(3).max(100), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const run = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: input.sourceRunId }, include: { payroll: true, statements: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${run.payrollId}`}))`;
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.scope !== "DEMONSTRACAO" || run.payroll.type !== "Rescisão") throw new Error("Efeito funcional POC exige rescisão demonstrativa fechada.");
    const set = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: run.ruleSetId } });
    if (!set.isDemo || set.scope !== "DEMONSTRACAO") throw new Error("Efeito funcional estimado exige conjunto demonstrativo.");
    const sourceKey = `VINCULO:${input.operation}:${run.id}`;
    const fingerprint = JSON.stringify(input);
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Efeito funcional já registrado com outros termos.");
      return previous;
    }
    const closedEnd = payrollPeriod(run.payroll.competence).end.toISOString().slice(0, 10);
    const date = new Date(`${input.date}T00:00:00Z`);
    if (input.operation === "DESLIGAR" && input.date !== closedEnd) throw new Error("Modelo de desligamento automático POC usa o último dia da competência de rescisão; desligamento intramês exige fluxo específico.");
    const termination = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `VINCULO:DESLIGAR:${run.id}` } });
    if (input.operation === "REINTEGRAR" && (!termination || input.date <= closedEnd)) throw new Error("Reintegração exige desligamento vinculado e data posterior.");
    const effectiveFrom = input.operation === "DESLIGAR" ? new Date(date.getTime() + 86400000) : date;
    const results = [];
    for (const statement of [...run.statements].sort((a, b) => a.contractId.localeCompare(b.contractId))) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${statement.contractId}`}))`;
      const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: statement.contractId } });
      const version = z.object({ contract: z.object({ version: z.number() }) }).parse(statement.snapshot).contract.version;
      const expected = input.operation === "DESLIGAR" ? version : (termination!.payload as { results: { contractId: string; version: number }[] }).results.find(result => result.contractId === contract.id)?.version;
      if (contract.version !== expected || contract.status !== (input.operation === "DESLIGAR" ? "ATIVO" : "INATIVO")) throw new Error("Vínculo mudou após a rescisão/efeito funcional. Concilie antes de aplicar o ato.");
      const closed = await tx.hrPayrollStatement.findMany({ where: { contractId: contract.id, run: { status: "FECHADA" } }, select: { run: { select: { payroll: { select: { competence: true } } } } } });
      if (closed.some(row => payrollPeriod(row.run.payroll.competence).end >= effectiveFrom)) throw new Error("Efeito funcional alcança outra competência fechada; exige conciliação antes do ato.");
      const latest = await tx.hrEmploymentRevision.findFirst({ where: { contractId: contract.id }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
      if (latest && latest.effectiveFrom > effectiveFrom) throw new Error("Ato anterior à última vigência contratual.");
      const updated = await tx.hrEmploymentContract.update({ where: { id: contract.id }, data: { status: input.operation === "DESLIGAR" ? "INATIVO" : "ATIVO", endsAt: input.operation === "DESLIGAR" ? date : null, version: { increment: 1 } } });
      await tx.hrEmploymentRevision.create({ data: { contractId: contract.id, version: updated.version, effectiveFrom, snapshot: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue, actorId, reason: `${input.operation} POC · ${input.actNumber} · ${input.reason}` } });
      if (input.operation === "REINTEGRAR") await assertPositionPlanForContract(tx, updated, effectiveFrom);
      const act = await tx.personnelAct.create({ data: { employeeId: contract.employeeId, type: input.operation === "DESLIGAR" ? "Exoneração — POC" : "Reintegração — POC", actNumber: input.actNumber, date } });
      results.push({ contractId: contract.id, version: updated.version, actId: act.id, effectiveFrom: effectiveFrom.toISOString(), status: updated.status });
    }
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "EFEITO_FUNCIONAL_RESCISAO", payload: { fingerprint, input, actorId, results, historicalStatementsPreserved: true, retroactivePaymentsCalculated: false, gapRightsReconciled: false } });
  }, { timeout: 60000 });
}
