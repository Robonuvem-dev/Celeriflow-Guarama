"use server";
import { eq,inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { databaseConnection,db } from "@/db/client";
import { accessProfiles } from "@/db/schema/identity";
import { userAdditionalProfiles } from "@/db/schema/user-additional-profiles";
import { withDatabaseTransaction } from "@/db/transaction";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { isSystemAdministratorEmail,isSystemAdministratorProfileCode,requiresSecretariatScope } from "@/lib/administration/c3-policy";
import { findActiveUserEmployee,findManagedUser } from "@/db/repositories/platform/system-administration";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
export async function saveAdditionalUserProfiles(form:FormData):Promise<void>{
 const context=await getTenantContextForSystemAdministration(),database=context.database??db,id=String(form.get("usuarioId")||"");
 const user=await findManagedUser(database,id);
 if(!user)throw new Error("Usuário não encontrado.");
 if(isSystemAdministratorEmail(user.email)||isSystemAdministratorProfileCode(user.perfil.codigo))throw new Error("Conta técnica não pode receber perfis complementares.");
 const ids=[...new Set(form.getAll("profileIds").map(String))].filter(profileId=>profileId!==user.perfilId);
 if(ids.length>50)throw new Error("Quantidade de perfis inválida.");
 await withDatabaseTransaction(databaseConnection,async tx=>{
  const profiles=ids.length?await tx.select().from(accessProfiles).where(inArray(accessProfiles.id,ids)):[];
  if(profiles.length!==ids.length||profiles.some(profile=>!profile.ativo||isSystemAdministratorProfileCode(profile.codigo)))throw new Error("Selecione somente perfis ativos, sem perfil técnico de administrador.");
  if(profiles.some(profile=>requiresSecretariatScope(profile.codigo))){
   const employee=user.employeeId?await findActiveUserEmployee(tx,user.employeeId):null;
   if(!employee?.secretariatId)throw new Error("Os perfis selecionados exigem servidor ativo lotado em secretaria.");
  }
  await tx.delete(userAdditionalProfiles).where(eq(userAdditionalProfiles.usuarioId,id));
  if(ids.length)await tx.insert(userAdditionalProfiles).values(ids.map(perfilId=>({usuarioId:id,perfilId})));
  await insertAuditEvent(tx,{actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"USER_ADDITIONAL_PROFILES",targetId:id});
 });
 revalidatePath("/configuracoes/usuarios");
}
