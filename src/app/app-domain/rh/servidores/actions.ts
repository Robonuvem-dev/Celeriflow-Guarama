"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { validateEmployeeRelations } from "@/lib/administration/employee-lifecycle";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { resolveEmployeePerson } from "@/db/repositories/administration/creation";
import { databaseConnection } from "@/db/client";
import { employees } from "@/db/schema/administration";
import { withDatabaseTransaction } from "@/db/transaction";
import { eq, sql } from "drizzle-orm";

async function getEmployeeContext(operation: "create" | "update" | "delete") {
  return getTenantContextForModuleOperation("RH", operation);
}

export async function saveServidor(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getEmployeeContext(id ? "update" : "create");
  try {
    const name = formData.get("name") as string;
    const cpf = formData.get("cpf") as string;
    const personId = String(formData.get("personId") || "");
    const registration = formData.get("registration") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const roleId = formData.get("roleId") as string;
    const departmentId = formData.get("departmentId") as string;
    const secretariatId = formData.get("secretariatId") as string;
    const isActive = formData.get("isActive") === "true";
    const salaryBase = parseFloat(formData.get("salaryBase") as string) || 0;
    const contractedHours = parseInt(formData.get("contractedHours") as string, 10) || 220;

    if (!name && !personId && !cpf) {
      return { success: false, error: "Nome é obrigatório." };
    }

    const data = {
      name,
      cpf: cpf || null,
      registration: registration || null,
      email: email || null,
      phone: phone || null,
      roleId: roleId || null,
      departmentId: departmentId || null,
      isActive,
      salaryBase,
      contractedHours
    };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (id) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${id}`}))`);
      const hierarchy = await validateEmployeeRelations(tx, { secretariatId: secretariatId || null, departmentId: departmentId || null });
      const [previous] = id ? await tx.select({ personId: employees.personId }).from(employees).where(eq(employees.id, id)).limit(1) : [];
      if (id && !previous) throw new Error("Servidor não encontrado.");
      const canonical = await resolveEmployeePerson(tx, { personId, cpf, existingPersonId: previous?.personId });
      const details = { ...data, ...canonical, secretariatId: hierarchy.secretariatId };
      const [employee] = id
        ? await tx.update(employees).set(details).where(eq(employees.id, id)).returning({ id: employees.id })
        : await tx.insert(employees).values(details).returning({ id: employees.id });
      if (!employee) throw new Error("Servidor não encontrado.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE", targetId: employee.id });
    });

    revalidatePath("/rh/servidores");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar servidor:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o servidor. Verifique se o CPF já está cadastrado." };
  }
}

export async function toggleServidorStatus(id: string, isActive: boolean) {
  const context = await getEmployeeContext("update");
  try {
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [employee] = await tx.update(employees).set({ isActive }).where(eq(employees.id, id)).returning({ id: employees.id });
      if (!employee) throw new Error("Servidor não encontrado.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE", targetId: id });
    });
    revalidatePath("/rh/servidores");
    return { success: true };
  } catch (error) {
    console.error("Erro ao alterar status do servidor:", error);
    return { success: false, error: "Falha ao alterar status." };
  }
}

export async function deleteServidor(id: string) {
  void id;
  return { success: false, error: "A exclusão física de servidores foi desativada. Inative o servidor para preservar o histórico." };
}
