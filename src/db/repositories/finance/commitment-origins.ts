import { sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { createId } from "../../ids";
import { databaseTimestamp } from "@/db/temporal";

export async function findCommitmentContract(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; supplierId: string; processId: string | null; status: string; startDate: Date | string; endDate: Date | string; updatedValue: number }>(sql`SELECT id,"supplierId","processId",status,"startDate","endDate","updatedValue" FROM "Contract" WHERE id=${id}`)).rows;
  return row ? { ...row, startDate: databaseTimestamp(row.startDate), endDate: databaseTimestamp(row.endDate) } : null;
}
export async function findCommitmentProcess(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; currentDepartmentId: string | null }>(sql`SELECT id,"currentDepartmentId" FROM "Process" WHERE id=${id}`)).rows;
  return row ?? null;
}
export async function findCommitmentCovenant(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; number: string; status: string; startDate: Date | string; endDate: Date | string }>(sql`SELECT id,number,status,"startDate","endDate" FROM "Covenant" WHERE id=${id}`)).rows;
  return row ? { ...row, startDate: databaseTimestamp(row.startDate), endDate: databaseTimestamp(row.endDate) } : null;
}
export async function findCommitmentPublicityCampaign(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; name: string; status: string; startDate: Date | string; endDate: Date | string }>(sql`SELECT id,name,status,"startDate","endDate" FROM "PublicityCampaign" WHERE id=${id}`)).rows;
  return row ? { ...row, startDate: databaseTimestamp(row.startDate), endDate: databaseTimestamp(row.endDate) } : null;
}
export async function findCommitmentFundedDebt(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; creditorName: string; lawNumber: string; status: string }>(sql`SELECT id,"creditorName","lawNumber",status FROM "FundedDebt" WHERE id=${id}`)).rows;
  return row ?? null;
}
export async function findCommitmentObrasService(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; protocolo: string; active: boolean; commitmentId: string | null; budgetAppropriationId: string | null }>(sql`SELECT id,protocolo,active,"commitmentId","budgetAppropriationId" FROM "ObrasServico" WHERE id=${id}`)).rows;
  return row ?? null;
}
export async function bindCommitmentObrasService(tx: DatabaseTransaction, serviceId: string, commitmentId: string): Promise<void> {
  await tx.execute(sql`UPDATE "ObrasServico" SET "commitmentId"=${commitmentId},"updatedAt"=${new Date()} WHERE id=${serviceId}`);
}
export async function releaseCommitmentProcess(tx: DatabaseTransaction, input: { processId: string; number: string; commitmentId: string; value: string; departmentId: string | null; employeeId: string | null }): Promise<void> {
  const released = await tx.execute(sql`UPDATE "Process" SET status='Recebido',"updatedAt"=${new Date()} WHERE id=${input.processId} AND status='Aguardando Contabilidade' RETURNING id`);
  if (released.rows.length) await tx.execute(sql`INSERT INTO "ProcessEvent" (id,"processId","eventType",description,"previousStatus","newStatus","departmentId","employeeId",metadata) VALUES (${createId()},${input.processId},'ACCOUNTING_RELEASED',${`Processo liberado após a emissão do empenho ${input.number}.`},'Aguardando Contabilidade','Recebido',${input.departmentId},${input.employeeId},${JSON.stringify({ commitmentId: input.commitmentId, commitmentNumber: input.number, commitmentValue: input.value })})`);
}
