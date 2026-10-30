import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { accessProfiles } from "../../schema/identity";
import { userAdditionalProfiles } from "../../schema/user-additional-profiles";
import { getPostgresError } from "../../errors";
export async function readAdditionalProfiles(database:DatabaseExecutor,usuarioId:string){
 try{return await database.select({id:accessProfiles.id,codigo:accessProfiles.codigo,nome:accessProfiles.nome,permissoes:accessProfiles.permissoes}).from(userAdditionalProfiles).innerJoin(accessProfiles,eq(accessProfiles.id,userAdditionalProfiles.perfilId)).where(and(eq(userAdditionalProfiles.usuarioId,usuarioId),eq(accessProfiles.ativo,true)));}
 catch(error){if(getPostgresError(error)?.code==="42P01")return [];throw error;}
}
