import { randomUUID } from "node:crypto";
import { Prisma,type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { createItbiDeclarationInTransaction } from "./s3-service";
import { taxScopeSnapshot } from "./scope";

export async function createItbiPropertyCollection(db:PrismaClient,actor:TaxActor,input:{declarations:Parameters<typeof createItbiDeclarationInTransaction>[2][];reason:string}) {
  if(!input.reason.trim() || input.reason.length>4000) throw new Error("Informe o fundamento do conjunto de transmissões.");
  if(!input.declarations.length || input.declarations.length>100 || new Set(input.declarations.map(row=>row.realEstateId)).size!==input.declarations.length) throw new Error("Selecione de 1 a 100 imóveis distintos no processo.");
  if(new Set(input.declarations.map(row=>row.processId)).size!==1) throw new Error("Todas as unidades devem compartilhar o mesmo processo de transferência.");
  return db.$transaction(async tx=>{
    for(const id of input.declarations.map(row=>row.realEstateId).sort()) await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${id} FOR UPDATE`;
    const declarations=[];
    for(const row of input.declarations) declarations.push(await createItbiDeclarationInTransaction(tx,actor,row));
    const scope=taxScopeSnapshot(declarations[0].calculationSnapshot);
    const collectionId=randomUUID();
    await tx.taxRegistryEntry.create({data:{entityType:"ITBI_COLLECTION",entityId:collectionId,category:"ITBI_PROPERTY_COLLECTION",title:`Processo com ${declarations.length} imóveis`,actorUsuarioId:actor.usuarioId,processId:input.declarations[0].processId,data:{governmentEntityId:scope.governmentEntityId,budgetUnitId:scope.budgetUnitId,declarationIds:declarations.map(row=>row.id),properties:declarations.map(row=>({id:row.realEstateId,declarationId:row.id,declaredValue:row.declaredPropertyValue.toString(),taxableBase:row.taxableBase.toString(),taxAmount:row.taxAmount.toString()})),reason:input.reason}}});
    return {collectionId,declarations};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
