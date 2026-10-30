"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { administrativeUnits, departments, employees, secretariats } from "@/db/schema/administration";
import { processDepartmentMetadata, processUnitMetadata } from "@/db/schema/process-reference-catalog";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
const schema = z.object({ kind: z.enum(["unit", "department"]), id: z.string(), name: z.string().trim().min(1).max(200), acronym: z.string().trim().min(1).max(30), secretariatId: z.string().min(1), unitId: z.string(), responsibleEmployeeId: z.string().nullable(), isActive: z.boolean() });
export async function saveProcessStructure(form: FormData): Promise<void> {
  const context = await getTenantContextForSystemAdministration();
  const input = schema.parse({ kind: form.get("kind"), id: String(form.get("id") || ""), name: form.get("name"), acronym: form.get("acronym"), secretariatId: form.get("secretariatId"), unitId: String(form.get("unitId") || ""), responsibleEmployeeId: String(form.get("responsibleEmployeeId") || "") || null, isActive: form.get("isActive") === "on" });
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [parent] = await tx.select({ id: secretariats.id }).from(secretariats).where(and(eq(secretariats.id,input.secretariatId),eq(secretariats.isActive,true))).limit(1);
    if (!parent) throw new Error("Selecione órgão ativo.");
    if (input.kind === "unit") {
      if (input.id) {
        const [existing] = await tx.select({ id: administrativeUnits.id, secretariatId: administrativeUnits.secretariatId }).from(administrativeUnits).where(eq(administrativeUnits.id,input.id)).limit(1);
        if (!existing || existing.secretariatId !== input.secretariatId) throw new Error("Unidade inválida para este órgão.");
        if (!input.isActive) {
          const activeStaff = await tx.select({id:employees.id}).from(employees).where(and(eq(employees.unitId,input.id),eq(employees.isActive,true))).limit(1);
          const activeSectors = await tx.select({id:departments.id}).from(departments).innerJoin(processDepartmentMetadata,eq(processDepartmentMetadata.departmentId,departments.id)).where(and(eq(processDepartmentMetadata.unitId,input.id),eq(departments.isActive,true))).limit(1);
          if (activeStaff.length || activeSectors.length) throw new Error("Realoque servidores e desative setores vinculados antes de desativar a unidade.");
        }
      }
      const rows = input.id ? await tx.update(administrativeUnits).set({name:input.name,isActive:input.isActive}).where(eq(administrativeUnits.id,input.id)).returning({id:administrativeUnits.id}) : await tx.insert(administrativeUnits).values({name:input.name,secretariatId:input.secretariatId,type:"ADMINISTRATIVA",isActive:input.isActive}).returning({id:administrativeUnits.id});
      await tx.insert(processUnitMetadata).values({unitId:rows[0].id,acronym:input.acronym}).onConflictDoUpdate({target:processUnitMetadata.unitId,set:{acronym:input.acronym}});
      await insertAuditEvent(tx,{actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"ADMINISTRATIVE_UNIT",targetId:rows[0].id});
    } else {
      const [unit] = await tx.select({id:administrativeUnits.id}).from(administrativeUnits).where(and(eq(administrativeUnits.id,input.unitId),eq(administrativeUnits.secretariatId,input.secretariatId),eq(administrativeUnits.isActive,true))).limit(1);
      if (!unit) throw new Error("Selecione unidade ativa pertencente ao órgão.");
      if (input.id) {
        const [existing] = await tx.select({ id: departments.id, secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id,input.id)).limit(1);
        if (!existing || existing.secretariatId !== input.secretariatId) throw new Error("Setor inválido para este órgão.");
        // Existing lifecycle guards require reassignment before deactivation.
        if (!input.isActive) { const active = await tx.select({id:employees.id}).from(employees).where(and(eq(employees.departmentId,input.id),eq(employees.isActive,true))).limit(1); if(active.length) throw new Error("Realoque os servidores ativos antes de desativar o setor."); }
      }
      if (input.responsibleEmployeeId) {
        const [employee] = await tx.select({id:employees.id}).from(employees).where(and(eq(employees.id,input.responsibleEmployeeId),eq(employees.isActive,true),eq(employees.secretariatId,input.secretariatId))).limit(1);
        if (!employee) throw new Error("Responsável deve ser servidor ativo do órgão.");
      }
      const rows = input.id ? await tx.update(departments).set({name:input.name,isActive:input.isActive}).where(eq(departments.id,input.id)).returning({id:departments.id}) : await tx.insert(departments).values({name:input.name,secretariatId:input.secretariatId,isActive:input.isActive}).returning({id:departments.id});
      await tx.insert(processDepartmentMetadata).values({departmentId:rows[0].id,unitId:unit.id,acronym:input.acronym,responsibleEmployeeId:input.responsibleEmployeeId}).onConflictDoUpdate({target:processDepartmentMetadata.departmentId,set:{unitId:unit.id,acronym:input.acronym,responsibleEmployeeId:input.responsibleEmployeeId}});
      await insertAuditEvent(tx,{actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"DEPARTMENT",targetId:rows[0].id});
    }
  });
  revalidatePath("/protocolos/estrutura"); revalidatePath("/administracao/departamentos"); revalidatePath("/administracao/unidades");
}
