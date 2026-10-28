"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateEmployeeRelations } from "@/db/repositories/administration/leadership";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertEmployee, resolveEmployeePerson } from "@/db/repositories/administration/creation";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function createEmployee(formData: FormData) {
  const cpf = formData.get("cpf") as string;
  const personId = String(formData.get("personId") || "");
  const registration = formData.get("registration") as string;
  
  const roleId = formData.get("roleId") as string || null;
  const secretariatId = formData.get("secretariatId") as string || null;
  const departmentId = formData.get("departmentId") as string || null;
  const unitId = formData.get("unitId") as string || null;

  if (!personId && !cpf) return { error: "Selecione a pessoa física ou informe seu CPF do Cadastro Único." };

  try {
    const context = await getTenantContextForSystemAdministration();
    const hierarchy = await validateEmployeeRelations(context.database ?? db, { secretariatId, departmentId, unitId });
    await withDatabaseTransaction(databaseConnection, async tx => {
      const canonical = await resolveEmployeePerson(tx, { personId, cpf });
      const id = await insertEmployee(tx, canonical, { registration, roleId, secretariatId: hierarchy.secretariatId, departmentId, unitId });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE", targetId: id });
    });
  } catch (error: unknown) {
    console.error("Error creating employee:", error);
    return { error: error instanceof Error ? error.message : "Erro desconhecido ao cadastrar servidor." };
  }

  revalidatePath("/administracao/servidores");
  revalidatePath("/administracao"); 
  redirect("/administracao/servidores");
}
