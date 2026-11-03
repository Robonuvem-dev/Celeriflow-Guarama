"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertPersonnelActNotIntegrated } from "@/lib/rh/functional-occurrences";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { personnelActs } from "@/db/schema/personnel-records";
import { assertFunctionalHolderAccess } from "@/lib/rh/functional-record-service";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";

export async function saveAtoPessoal(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const type = formData.get("type") as string;
    const date = formData.get("date") as string;
    const actNumber = formData.get("actNumber") as string;
    const documentUrl = formData.get("documentUrl") as string;

    if (!employeeId || !type || !date) {
      return { success: false, error: "Servidor, Tipo e Data são obrigatórios." };
    }

    const data = {
      employeeId,
      type,
      date: new Date(date),
      actNumber: actNumber || null,
      documentUrl: documentUrl || null,
    };

    if (id) {
      await withDatabaseTransaction(databaseConnection, async tx => {
        const [previous] = await tx.select().from(personnelActs).where(eq(personnelActs.id, id)).for("update");
        if (!previous) throw new Error("Ato de pessoal não encontrado.");
        if (previous.employeeId !== employeeId) throw new Error("O titular de um ato registrado é preservado; registre o ato no relacionamento correto.");
        await assertFunctionalHolderAccess(tx, context, previous.employeeId);
        await assertFunctionalHolderAccess(tx, context, employeeId);
        await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
        await assertPersonnelActNotIntegrated(tx, id);
        const [updated] = await tx.update(personnelActs).set(data).where(eq(personnelActs.id, id)).returning({ id: personnelActs.id });
        if (!updated) throw new Error("Ato de pessoal não encontrado.");
        await auditPersonnelMutation(tx, context.user.id, { employeeId, entity: "PersonnelAct", id, operation: "ALTERAR", before: previous, after: { id, ...data } });
      });
    } else {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await assertFunctionalHolderAccess(tx, context, employeeId);
        await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
        const [created] = await tx.insert(personnelActs).values(data).returning();
        await auditPersonnelMutation(tx, context.user.id, { employeeId, entity: "PersonnelAct", id: created.id, operation: "INCLUIR", before: null, after: created });
      });
    }

    revalidatePath("/rh/atos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar ato de pessoal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o ato de pessoal." };
  }
}

export async function deleteAtoPessoal(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [previous] = await tx.select().from(personnelActs).where(eq(personnelActs.id, id)).for("update");
      if (!previous) throw new Error("Ato de pessoal não encontrado.");
      await assertFunctionalHolderAccess(tx, context, previous.employeeId);
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
      await assertPersonnelActNotIntegrated(tx, id);
      const [removed] = await tx.delete(personnelActs).where(eq(personnelActs.id, id)).returning({ id: personnelActs.id });
      if (!removed) throw new Error("Ato de pessoal não encontrado.");
      await auditPersonnelMutation(tx, context.user.id, { employeeId: previous.employeeId, entity: "PersonnelAct", id, operation: "EXCLUIR", before: previous, after: null });
    });
    revalidatePath("/rh/atos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir ato de pessoal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o ato de pessoal." };
  }
}
