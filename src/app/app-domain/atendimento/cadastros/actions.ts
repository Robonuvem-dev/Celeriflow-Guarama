"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ombudsmanReferenceCatalog as catalog } from "@/db/schema/ombudsman-reference-catalog";
import { getAttendanceContext } from "@/lib/attendance/access";
import { ombudsmanReferenceSchema } from "@/lib/attendance/reference-catalog";
export async function saveOmbudsmanReference(form:FormData):Promise<void>{
 const context=await getAttendanceContext("edit");
 if(!context.attendanceAccess.isManager)throw new Error("Somente gestores podem configurar assuntos e justificativas.");
 const database=context.database??db,id=String(form.get("id")||"");
 const data=ombudsmanReferenceSchema.parse({kind:form.get("kind"),requestType:form.get("requestType"),name:form.get("name"),subjectId:String(form.get("subjectId")||"")||null,subsubjectId:String(form.get("subsubjectId")||"")||null,isActive:form.get("isActive")==="on"});
 if(id){const [existing]=await database.select().from(catalog).where(and(eq(catalog.id,id),eq(catalog.kind,data.kind))).limit(1);if(!existing)throw new Error("Cadastro não encontrado.");if(existing.requestType!==data.requestType||existing.subjectId!==data.subjectId||existing.subsubjectId!==data.subsubjectId)throw new Error("Preserve os vínculos do cadastro existente; crie outro registro para nova classificação.");}
 if(data.subjectId){const [parent]=await database.select().from(catalog).where(and(eq(catalog.id,data.subjectId),eq(catalog.kind,"SUBJECT"),eq(catalog.requestType,data.requestType))).limit(1);if(!parent)throw new Error("Assunto não pertence ao tipo de solicitação.");}
 if(data.subsubjectId){const [child]=await database.select().from(catalog).where(and(eq(catalog.id,data.subsubjectId),eq(catalog.kind,"SUBSUBJECT"),eq(catalog.subjectId,data.subjectId!),eq(catalog.requestType,data.requestType))).limit(1);if(!child)throw new Error("Subassunto não pertence ao assunto e tipo informados.");}
 if(id)await database.update(catalog).set(data).where(eq(catalog.id,id));else await database.insert(catalog).values(data);
 revalidatePath("/atendimento/cadastros");revalidatePath("/atendimento/ouvidoria/nova");
}
