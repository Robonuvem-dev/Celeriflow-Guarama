import { and, desc, eq, ne } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { taxes, taxGuides } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { firstItbiRegistryEntry, insertItbiRegistryEntry, itbiJson, itbiRegistryPosition, lockItbiRecord, readConfirmedItbiPayments, readItbiDeclaration, readValidItbiDocuments, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope,taxScopeSnapshot } from "./scope";
import { reviseTaxAssessmentInTransaction } from "./s2-service";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { attributeItbiHistory } from "./itbi-history";

const amount=z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine(value=>new Decimal(value).gt(0),"Informe valor positivo.");
const requestSchema=z.object({declarationId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),reason:z.string().trim().min(1).max(8000),documentIds:z.array(z.string().min(1)).min(1).max(50),proposedPropertyValue:amount});

async function lockDeclaration(tx:DatabaseTransaction,id:string) {
  const origin=await readItbiDeclaration(tx,id);
  if(origin.assessmentId) await lockItbiRecord(tx,"TaxAssessment",origin.assessmentId);
  await lockItbiRecord(tx,"ItbiDeclaration",id);
  const current=await readItbiDeclaration(tx,id);
  if(origin.assessmentId!==current.assessmentId) throw new Error("Declaração alterada durante a operação. Recarregue.");
  return current;
}
async function authorize(tx:DatabaseTransaction,actor:TaxActor,snapshot:JsonValue) {
  await attributeItbiHistory(tx, actor);
  const scope=taxScopeSnapshot(snapshot);
  if(!scope.governmentEntityId || !scope.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(String(scope.budgetUnitId))) throw new Error("Declaração fora da origem autorizada.");
  const tax=requireItbiRecord((await tx.select().from(taxes).where(and(eq(taxes.name,"ITBI"),eq(taxes.isActive,true))).limit(1))[0]);
  await resolveTaxAssessmentScope(tx,actor,tax.id,snapshot);
  return scope;
}
export async function requestItbiContestation(connection:DatabaseConnection,actor:TaxActor,raw:z.input<typeof requestSchema>) {
  return withDatabaseTransaction(connection,tx=>requestItbiContestationInTransaction(tx,actor,raw),{isolationLevel:"serializable",timeoutMs:60000});
}

export async function requestItbiContestationInTransaction(tx:DatabaseTransaction,actor:TaxActor,raw:z.input<typeof requestSchema>) {
  const input=requestSchema.parse(raw);
    const declaration=await lockDeclaration(tx,input.declarationId);const scope=await authorize(tx,actor,declaration.calculationSnapshot);
    if(declaration.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Declaração alterada. Recarregue antes de impugnar.");
    if(!["RASCUNHO","PROTOCOLADA","EM_ANALISE","APROVADA","DAM_EMITIDO","DOCUMENTO_EMITIDO"].includes(declaration.status) || declaration.cadastralUpdatedAt) throw new Error("Declaração indisponível para impugnação.");
    if(declaration.assessmentId && (await readConfirmedItbiPayments(tx,declaration.assessmentId)).length) throw new Error("ITBI com pagamento exige revisão fiscal específica após conciliação do crédito.");
    if((await readValidItbiDocuments(tx,input.documentIds)).length!==new Set(input.documentIds).size) throw new Error("Anexo GED inválido.");
    await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
    const entry=await insertItbiRegistryEntry(tx,{entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION",title:"Impugnação da avaliação",actorUsuarioId:actor.usuarioId,processId:declaration.processId,data:{...scope,reason:input.reason,documentIds:input.documentIds,proposedPropertyValue:input.proposedPropertyValue,previousStatus:declaration.status,previousSnapshot:declaration.calculationSnapshot,previousPropertyValue:declaration.declaredPropertyValue.toString(),previousBase:declaration.taxableBase.toString(),previousTaxAmount:declaration.taxAmount.toString()}});
    if(declaration.assessmentId) {
      const guides=await tx.select().from(taxGuides).where(and(eq(taxGuides.assessmentId,declaration.assessmentId),ne(taxGuides.status,"Cancelada")));
      for(const guide of guides) requireItbiRecord((await tx.update(taxGuides).set({status:"Cancelada"}).where(eq(taxGuides.id,guide.id)).returning({id:taxGuides.id}))[0]);
    }
    await updateItbiDeclaration(tx,declaration.id,{status:"IMPUGNADA",guideId:null},{eventType:"IMPUGNACAO_SOLICITADA",description:input.reason,actorUsuarioId:actor.usuarioId,payload:{entryId:entry.id,documentIds:input.documentIds}});
    return entry;
}

export async function decideItbiContestation(connection:DatabaseConnection,actor:TaxActor,raw:{declarationId:string;contestationId:string;expectedUpdatedAt:string;approved:boolean;propertyValue:string;reason:string}) {
  const input=z.object({declarationId:z.string().min(1),contestationId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),approved:z.boolean(),propertyValue:amount,reason:z.string().trim().min(1).max(8000)}).parse(raw);
  return withDatabaseTransaction(connection,async tx=>{
    const declaration=await lockDeclaration(tx,input.declarationId);const scope=await authorize(tx,actor,declaration.calculationSnapshot);
    if(declaration.status!=="IMPUGNADA" || declaration.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Impugnação indisponível ou declaração alterada.");
    const contestation=requireItbiRecord(await firstItbiRegistryEntry(tx,and(eq(taxRegistryEntries.id,input.contestationId),itbiRegistryPosition("ITBI_DECLARATION",declaration.id,"ITBI_CONTESTATION"))!));
    const latest=requireItbiRecord(await firstItbiRegistryEntry(tx,itbiRegistryPosition("ITBI_DECLARATION",declaration.id,"ITBI_CONTESTATION"),[desc(taxRegistryEntries.createdAt)]));
    if(latest.id!==contestation.id) throw new Error("Selecione a impugnação vigente.");
    const prior=taxScopeSnapshot(contestation.data);
    const newValue=input.approved ? new Decimal(input.propertyValue) : declaration.declaredPropertyValue;
    const base=input.approved ? newValue.mul(declaration.transmittedFraction).div(100).toDecimalPlaces(2) : declaration.taxableBase;
    const tax=base.mul(declaration.appliedRate).div(100).toDecimalPlaces(2);
    if(input.approved && declaration.assessmentId) await reviseTaxAssessmentInTransaction(tx,actor,{assessmentId:declaration.assessmentId,taxableBase:base.toFixed(2),imposedValue:tax.toFixed(2),reason:input.reason,processId:declaration.processId ?? undefined,idempotencyKey:`ITBI_CONTESTATION:${contestation.id}`});
    const status=declaration.assessmentId ? "APROVADA" : typeof prior.previousStatus==="string" ? prior.previousStatus : "EM_ANALISE";
    if(declaration.documentId) requireItbiRecord((await tx.update(documents).set({status:"Revogado"}).where(eq(documents.id,declaration.documentId)).returning({id:documents.id}))[0]);
    const updated=await updateItbiDeclaration(tx,declaration.id,{status,taxableBase:base,taxAmount:tax,documentId:null,calculationSnapshot:itbiJson({...taxScopeSnapshot(declaration.calculationSnapshot),contestationDecisionId:contestation.id,originalDeclaredPropertyValue:prior.previousPropertyValue,revisedPropertyValue:input.approved ? newValue.toFixed(2) : taxScopeSnapshot(declaration.calculationSnapshot).revisedPropertyValue ?? null,taxableBase:base.toFixed(2),taxAmount:tax.toFixed(2)})},{eventType:input.approved ? "IMPUGNACAO_DEFERIDA" : "IMPUGNACAO_INDEFERIDA",description:input.reason,actorUsuarioId:actor.usuarioId,payload:{contestationId:contestation.id,previousBase:declaration.taxableBase.toString(),newBase:base.toString()}});
    await insertItbiRegistryEntry(tx,{entityType:"ITBI_DECLARATION",entityId:declaration.id,category:"ITBI_CONTESTATION_DECISION",title:input.approved ? "Deferida" : "Indeferida",actorUsuarioId:actor.usuarioId,processId:declaration.processId,data:{...scope,contestationId:contestation.id,approved:input.approved,reason:input.reason,propertyValue:newValue.toString(),taxableBase:base.toString(),taxAmount:tax.toString()}});
    return updated;
  },{isolationLevel:"serializable",timeoutMs:60000});
}
