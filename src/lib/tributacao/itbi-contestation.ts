import { Prisma,type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope,taxScopeSnapshot } from "./scope";
import { reviseTaxAssessmentInTransaction } from "./s2-service";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { attributeItbiHistory } from "./itbi-history";

const amount=z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine(value=>new Prisma.Decimal(value).gt(0),"Informe valor positivo.");
const requestSchema=z.object({declarationId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),reason:z.string().trim().min(1).max(8000),documentIds:z.array(z.string().min(1)).min(1).max(50),proposedPropertyValue:amount});

async function lockDeclaration(tx:Prisma.TransactionClient,id:string) {
  const origin=await tx.itbiDeclaration.findUniqueOrThrow({where:{id}});
  if(origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${id} FOR UPDATE`;
  const current=await tx.itbiDeclaration.findUniqueOrThrow({where:{id}});
  if(origin.assessmentId!==current.assessmentId) throw new Error("Declaração alterada durante a operação. Recarregue.");
  return current;
}
async function authorize(tx:Prisma.TransactionClient,actor:TaxActor,snapshot:Prisma.JsonValue) {
  await attributeItbiHistory(tx, actor);
  const scope=taxScopeSnapshot(snapshot);
  if(!scope.governmentEntityId || !scope.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(String(scope.budgetUnitId))) throw new Error("Declaração fora da origem autorizada.");
  const tax=await tx.tax.findFirstOrThrow({where:{name:"ITBI",isActive:true}});
  await resolveTaxAssessmentScope(tx,actor,tax.id,snapshot);
  return scope;
}
export async function requestItbiContestation(db:PrismaClient,actor:TaxActor,raw:z.input<typeof requestSchema>) {
  return db.$transaction(tx=>requestItbiContestationInTransaction(tx,actor,raw),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}

export async function requestItbiContestationInTransaction(tx:Prisma.TransactionClient,actor:TaxActor,raw:z.input<typeof requestSchema>) {
  const input=requestSchema.parse(raw);
    const declaration=await lockDeclaration(tx,input.declarationId);const scope=await authorize(tx,actor,declaration.calculationSnapshot);
    if(declaration.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Declaração alterada. Recarregue antes de impugnar.");
    if(!["RASCUNHO","PROTOCOLADA","EM_ANALISE","APROVADA","DAM_EMITIDO","DOCUMENTO_EMITIDO"].includes(declaration.status) || declaration.cadastralUpdatedAt) throw new Error("Declaração indisponível para impugnação.");
    if(declaration.assessmentId && await tx.taxPayment.count({where:{guide:{assessmentId:declaration.assessmentId},status:"Confirmado"}})) throw new Error("ITBI com pagamento exige revisão fiscal específica após conciliação do crédito.");
    if(await tx.document.count({where:{id:{in:input.documentIds},status:"Válido"}})!==new Set(input.documentIds).size) throw new Error("Anexo GED inválido.");
    await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
    const entry=await tx.taxRegistryEntry.create({data:{entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION",title:"Impugnação da avaliação",actorUsuarioId:actor.usuarioId,processId:declaration.processId,data:{...scope,reason:input.reason,documentIds:input.documentIds,proposedPropertyValue:input.proposedPropertyValue,previousStatus:declaration.status,previousSnapshot:declaration.calculationSnapshot,previousPropertyValue:declaration.declaredPropertyValue.toString(),previousBase:declaration.taxableBase.toString(),previousTaxAmount:declaration.taxAmount.toString()}}});
    if(declaration.assessmentId) {
      const guides=await tx.taxGuide.findMany({where:{assessmentId:declaration.assessmentId,status:{not:"Cancelada"}}});
      for(const guide of guides) await tx.taxGuide.update({where:{id:guide.id},data:{status:"Cancelada"}});
    }
    await tx.itbiDeclaration.update({where:{id:declaration.id},data:{status:"IMPUGNADA",guideId:null,events:{create:{eventType:"IMPUGNACAO_SOLICITADA",description:input.reason,actorUsuarioId:actor.usuarioId,payload:{entryId:entry.id,documentIds:input.documentIds}}}}});
    return entry;
}

export async function decideItbiContestation(db:PrismaClient,actor:TaxActor,raw:{declarationId:string;contestationId:string;expectedUpdatedAt:string;approved:boolean;propertyValue:string;reason:string}) {
  const input=z.object({declarationId:z.string().min(1),contestationId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),approved:z.boolean(),propertyValue:amount,reason:z.string().trim().min(1).max(8000)}).parse(raw);
  return db.$transaction(async tx=>{
    const declaration=await lockDeclaration(tx,input.declarationId);const scope=await authorize(tx,actor,declaration.calculationSnapshot);
    if(declaration.status!=="IMPUGNADA" || declaration.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Impugnação indisponível ou declaração alterada.");
    const contestation=await tx.taxRegistryEntry.findFirstOrThrow({where:{id:input.contestationId,entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION"}});
    const latest=await tx.taxRegistryEntry.findFirstOrThrow({where:{entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION"},orderBy:{createdAt:"desc"}});
    if(latest.id!==contestation.id) throw new Error("Selecione a impugnação vigente.");
    const prior=taxScopeSnapshot(contestation.data);
    const newValue=input.approved ? new Prisma.Decimal(input.propertyValue) : declaration.declaredPropertyValue;
    const base=input.approved ? newValue.mul(declaration.transmittedFraction).div(100).toDecimalPlaces(2) : declaration.taxableBase;
    const tax=base.mul(declaration.appliedRate).div(100).toDecimalPlaces(2);
    if(input.approved && declaration.assessmentId) await reviseTaxAssessmentInTransaction(tx,actor,{assessmentId:declaration.assessmentId,taxableBase:base.toFixed(2),imposedValue:tax.toFixed(2),reason:input.reason,processId:declaration.processId ?? undefined,idempotencyKey:`ITBI_CONTESTATION:${contestation.id}`});
    const status=declaration.assessmentId ? "APROVADA" : typeof prior.previousStatus==="string" ? prior.previousStatus : "EM_ANALISE";
    if(declaration.documentId) await tx.document.update({where:{id:declaration.documentId},data:{status:"Revogado"}});
    const updated=await tx.itbiDeclaration.update({where:{id:declaration.id},data:{status,taxableBase:base,taxAmount:tax,documentId:null,calculationSnapshot:{...taxScopeSnapshot(declaration.calculationSnapshot),contestationDecisionId:contestation.id,originalDeclaredPropertyValue:prior.previousPropertyValue as string,revisedPropertyValue:input.approved ? newValue.toFixed(2) : taxScopeSnapshot(declaration.calculationSnapshot).revisedPropertyValue ?? null,taxableBase:base.toFixed(2),taxAmount:tax.toFixed(2)} as Prisma.InputJsonObject,events:{create:{eventType:input.approved ? "IMPUGNACAO_DEFERIDA" : "IMPUGNACAO_INDEFERIDA",description:input.reason,actorUsuarioId:actor.usuarioId,payload:{contestationId:contestation.id,previousBase:declaration.taxableBase.toString(),newBase:base.toString()}}}}});
    await tx.taxRegistryEntry.create({data:{entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION_DECISION",title:input.approved ? "Deferida" : "Indeferida",actorUsuarioId:actor.usuarioId,processId:declaration.processId,data:{...scope,contestationId:contestation.id,approved:input.approved,reason:input.reason,propertyValue:newValue.toString(),taxableBase:base.toString(),taxAmount:tax.toString()}}});
    return updated;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
