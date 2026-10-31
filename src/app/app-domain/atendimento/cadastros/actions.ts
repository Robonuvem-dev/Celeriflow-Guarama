"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ombudsmanReferenceCatalog as catalog, ombudsmanConfigurations } from "@/db/schema/ombudsman-reference-catalog";
import { administrativeUnits, departments, secretariats } from "@/db/schema/administration";
import { processDepartmentMetadata } from "@/db/schema/process-reference-catalog";
import { z } from "zod";
import { getAttendanceContext } from "@/lib/attendance/access";
import { ombudsmanReferenceSchema, ombudsmanRequestTypes } from "@/lib/attendance/reference-catalog";
export async function saveOmbudsmanReference(form:FormData):Promise<void>{
 const context=await getAttendanceContext("edit");
 if(!context.attendanceAccess.isManager)throw new Error("Somente gestores podem configurar assuntos e justificativas.");
 const database=context.database??db,id=String(form.get("id")||"");
 const data=ombudsmanReferenceSchema.parse({kind:form.get("kind"),requestType:form.get("requestType"),name:form.get("name"),subjectId:String(form.get("subjectId")||"")||null,subsubjectId:String(form.get("subsubjectId")||"")||null,isActive:form.get("isActive")==="on"});
 if(id){const [existing]=await database.select().from(catalog).where(and(eq(catalog.id,id),eq(catalog.kind,data.kind))).limit(1);if(!existing)throw new Error("Cadastro não encontrado.");if(existing.requestType!==data.requestType||existing.subjectId!==data.subjectId||existing.subsubjectId!==data.subsubjectId)throw new Error("Preserve os vínculos do cadastro existente; crie outro registro para nova classificação.");}
 if(data.subjectId){const [parent]=await database.select().from(catalog).where(and(eq(catalog.id,data.subjectId),eq(catalog.kind,"SUBJECT"),eq(catalog.requestType,data.requestType))).limit(1);if(!parent)throw new Error("Assunto não pertence ao tipo de solicitação.");}
 if(data.subsubjectId){const [child]=await database.select().from(catalog).where(and(eq(catalog.id,data.subsubjectId),eq(catalog.kind,"SUBSUBJECT"),eq(catalog.subjectId,data.subjectId!),eq(catalog.requestType,data.requestType))).limit(1);if(!child)throw new Error("Subassunto não pertence ao assunto e tipo informados.");}
 const subsubjectFields=data.kind==="SUBSUBJECT"?{isAnonymous:form.get("isAnonymous")==="on",isOnline:form.get("isOnline")==="on",serviceInformation:z.string().trim().max(4000).parse(String(form.get("serviceInformation")||""))||null}:{};
 if(id)await database.update(catalog).set({...data,...subsubjectFields}).where(eq(catalog.id,id));else await database.insert(catalog).values({...data,...subsubjectFields});
 revalidatePath("/atendimento/cadastros");revalidatePath("/atendimento/ouvidoria/nova");
}

export async function saveOmbudsmanConfiguration(form:FormData):Promise<void>{
 const context=await getAttendanceContext("edit");
 if(!context.attendanceAccess.isManager)throw new Error("Somente gestores podem configurar a Ouvidoria.");
 const database=context.database??db,id=String(form.get("id")||""),kind=z.enum(["ROUTE","QUESTIONNAIRE","STATUS"]).parse(form.get("kind"));
 const name=z.string().trim().min(1).max(200).parse(form.get("name"));
 const isActive=form.get("isActive")==="on";
 let settings:typeof ombudsmanConfigurations.$inferInsert.settings={};
 if(kind==="STATUS")settings={availableToApplicant:form.get("availableToApplicant")==="on",status:z.enum(["Cancelado","Encerrado","Movimentado"]).parse(form.get("status"))};
 if(kind==="ROUTE"){
  const route=z.object({requestType:z.enum(ombudsmanRequestTypes),subjectId:z.string().min(1),subsubjectId:z.string().min(1),routeNumber:z.coerce.number().int().positive(),sequence:z.coerce.number().int().positive(),secretariatId:z.string().min(1),unitId:z.string().min(1),departmentId:z.string().min(1),dueDays:z.coerce.number().int().min(0).max(3650)}).parse(Object.fromEntries(form));
  const [[subject],[subsubject],[org],[unit],[department],[metadata]]=await Promise.all([
   database.select().from(catalog).where(and(eq(catalog.id,route.subjectId),eq(catalog.kind,"SUBJECT"),eq(catalog.requestType,route.requestType))).limit(1),
   database.select().from(catalog).where(and(eq(catalog.id,route.subsubjectId),eq(catalog.kind,"SUBSUBJECT"),eq(catalog.subjectId,route.subjectId),eq(catalog.requestType,route.requestType))).limit(1),
   database.select().from(secretariats).where(and(eq(secretariats.id,route.secretariatId),eq(secretariats.isActive,true))).limit(1),
   database.select().from(administrativeUnits).where(and(eq(administrativeUnits.id,route.unitId),eq(administrativeUnits.secretariatId,route.secretariatId),eq(administrativeUnits.isActive,true))).limit(1),
   database.select().from(departments).where(and(eq(departments.id,route.departmentId),eq(departments.secretariatId,route.secretariatId),eq(departments.isActive,true))).limit(1),
   database.select().from(processDepartmentMetadata).where(and(eq(processDepartmentMetadata.departmentId,route.departmentId),eq(processDepartmentMetadata.unitId,route.unitId))).limit(1),
  ]);
  if(!subject||!subsubject||!org||!unit||!department||!metadata)throw new Error("Confira os vínculos de tipo, assunto/subassunto e órgão/unidade/setor do roteiro.");
  settings=route;
 }
 if(id){
  const [existing]=await database.select({id:ombudsmanConfigurations.id}).from(ombudsmanConfigurations).where(and(eq(ombudsmanConfigurations.id,id),eq(ombudsmanConfigurations.kind,kind))).limit(1);
  if(!existing)throw new Error("Cadastro não encontrado.");
  await database.update(ombudsmanConfigurations).set({name,settings,isActive}).where(eq(ombudsmanConfigurations.id,id));
 }else await database.insert(ombudsmanConfigurations).values({kind,name,settings,isActive});
 revalidatePath("/atendimento/cadastros");revalidatePath("/atendimento/ouvidoria");
}
