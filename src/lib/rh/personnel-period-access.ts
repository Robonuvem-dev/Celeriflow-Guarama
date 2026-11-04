import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";

/** Legacy source corrections use open periods, as do canonical functional records. */
export async function assertPersonnelPeriodOpen(tx: DatabaseExecutor, employeeId: string, from: Date, until: Date) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until < from) throw new Error("Período civil inválido.");
  const closed = await tx.execute(sql`SELECT s.id FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" JOIN "HrEmploymentContract" c ON c.id=s."contractId"
    WHERE c."employeeId"=${employeeId} AND r.mode='OFICIAL' AND r.status='FECHADA' AND to_date(p.competence,'MM/YYYY')<=${until}::date AND to_date(p.competence,'MM/YYYY')+interval '1 month'>${from}::date LIMIT 1`);
  if (closed.rows.length) throw new Error("O período possui folha encerrada. Preserve a origem histórica e registre a correção compensatória em período aberto.");
}
