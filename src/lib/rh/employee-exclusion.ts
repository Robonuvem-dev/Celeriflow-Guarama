import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";

/** Preserve the shared Person and immutable observations; reject every operational consumer. */
export async function excludeUnusedEmployee(connection: DatabaseConnection, context: AppContext, employeeId: string) {
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `employee:${employeeId}`);
    await tx.execute(sql`SELECT id FROM "Employee" WHERE id=${employeeId} FOR UPDATE`);
    await assertFunctionalHolderAccess(tx, context, employeeId);
    const references = await tx.execute<{ schema: string; table: string; column: string }>(sql`
      SELECT DISTINCT n.nspname schema,c.relname "table",a.attname "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('Employee','HrPersonalRevision') AND (
        a.attname='employeeId' OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.contype='f' AND fk.conrelid=c.oid AND fk.confrelid='"Employee"'::regclass AND a.attnum=ANY(fk.conkey))) ORDER BY schema,"table","column"`);
    for (const reference of references.rows) {
      const found = await tx.execute(sql`SELECT 1 FROM ${sql.identifier(reference.schema)}.${sql.identifier(reference.table)} WHERE ${sql.identifier(reference.column)}=${employeeId} LIMIT 1`);
      if (found.rows.length) throw new Error(`O servidor possui registros em ${reference.table}. Preserve o cadastro e trate sua situação funcional.`);
    }
    const linked = await tx.execute(sql`SELECT id FROM "HrReferenceRecord" WHERE strpos(details::text,${employeeId})>0 UNION ALL SELECT id FROM "HrIntegrationEvent" WHERE strpos(payload::text,${employeeId})>0 LIMIT 1`);
    if (linked.rows.length) throw new Error("O servidor possui referências ou eventos funcionais e não pode ser excluído.");
    const [deleted] = await tx.delete(employees).where(eq(employees.id, employeeId)).returning();
    if (!deleted) throw new Error("Servidor não encontrado.");
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_UNUSED_EXCLUDED", targetId: employeeId });
    return { employeeId, personId: deleted.personId };
  });
}
