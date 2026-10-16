import { Prisma,type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export async function transitionConfiguredLicense(db:PrismaClient,actor:TaxActor,raw:{licenseId:string;expectedUpdatedAt:string;status:"Cancelado"|"Suspenso";reason:string}) {
  const input=z.object({licenseId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),status:z.enum(["Cancelado","Suspenso"]),reason:z.string().trim().min(1).max(4000)}).parse(raw);
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "License" WHERE id=${input.licenseId} FOR UPDATE`;
    const license=await tx.license.findUniqueOrThrow({where:{id:input.licenseId}});
    const issuance=await tx.taxRegistryEntry.findFirstOrThrow({where:{entityType:"LICENSE",entityId:license.id,category:"LICENSE_ISSUANCE"}});
    const scope=taxScopeSnapshot(issuance.data);
    if(actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId!=="string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("UG fora do acesso autorizado.");
    if(license.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Alvará alterado. Recarregue antes de confirmar.");
    if(license.status==="Cancelado" || license.status===input.status) throw new Error("Transição indisponível para a situação atual do alvará.");
    await tx.$queryRaw`SELECT set_config('celeriflow.license_actor',${actor.usuarioId},true)`;
    const result=await tx.license.update({where:{id:license.id},data:{status:input.status}});
    await tx.taxRegistryEntry.create({data:{entityType:"LICENSE",entityId:license.id,category:"LICENSE_LIFECYCLE",title:input.status,actorUsuarioId:actor.usuarioId,data:{governmentEntityId:scope.governmentEntityId,budgetUnitId:scope.budgetUnitId,before:license.status,after:input.status,reason:input.reason} as Prisma.InputJsonObject}});
    await tx.taxAuditLog.create({data:{action:"TRANSITION_CONFIGURED_LICENSE",entityType:"License",entityId:license.id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId,payload:{before:license.status,after:input.status,reason:input.reason}}});
    return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
