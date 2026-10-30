import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { hrEmployeeDocuments, hrReferenceRecords } from "@/db/schema/personnel-reference-records";
export function fillEmployeeDocument(body: string, values: { nome: string; cpf: string; matricula: string; data: string }) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values,key)) throw new Error(`Palavra-chave desconhecida: ${key}`);
    return values[key as keyof typeof values];
  });
}
export async function issueEmployeeDocument(db: DatabaseExecutor, employeeId: string, templateId: string) {
  const [employee] = await db.select({name:employees.name,cpf:employees.cpf,registration:employees.registration}).from(employees).where(eq(employees.id,employeeId)).limit(1);
  const [template] = await db.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.id,templateId),eq(hrReferenceRecords.kind,"MODELO_DOCUMENTO"))).limit(1);
  if (!employee || !template) throw new Error("Servidor ou modelo não encontrado.");
  const body = fillEmployeeDocument(template.details.body,{nome:employee.name,cpf:employee.cpf || "Não informado",matricula:employee.registration || "Não informada",data:new Date().toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})});
  const [document] = await db.insert(hrEmployeeDocuments).values({employeeId,templateId,templateUpdatedAt:template.updatedAt,documentType:template.details.documentType,title:template.name,body}).returning();
  return document;
}
