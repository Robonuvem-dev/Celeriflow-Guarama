"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionCases, constructionConsultations, constructionConsultationResponses } from "@/db/schema/construction-core";
import { departments, employees } from "@/db/schema/administration";
import { processes } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionDate } from "@/lib/obras/construction-rules";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { auditEventTypes } from "@/lib/platform/audit-evidence";

export async function requestConstructionConsultation(form: FormData): Promise<void> {
  const data = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), targetDepartmentId: z.string().min(1), question: z.string().trim().min(10).max(4000), dueAt: constructionDate }).parse(Object.fromEntries(form));
  const context = await getTenantContextForModuleOperation("OBRAS","update"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.some((role) => ["ANALYST","MANAGER"].includes(role))) throw new Error("Consulta exige analista ou gestor.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
    const item = await findConstructionCaseForAccess(tx, data.caseId, access);
    if (!item?.process.currentDepartmentId || item.process.completedAt) throw new Error("Solicitação indisponível ou encerrada.");
    if (data.targetDepartmentId===item.process.currentDepartmentId) throw new Error("Selecione outro setor para consulta.");
    if (!(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, data.targetDepartmentId), eq(departments.isActive, true))).limit(1)).length) throw new Error("Setor consultado indisponível.");
    const [previous] = await tx.select({ caseId: constructionConsultations.caseId, requestedBy: constructionConsultations.requestedBy }).from(constructionConsultations).where(eq(constructionConsultations.requestKey, data.requestKey)).limit(1);
    if (previous) { if (previous.caseId!==data.caseId || previous.requestedBy!==context.user.id) throw new Error("Referência indisponível."); return; }
    const dueAt = new Date(`${data.dueAt}T23:59:59.999Z`); if (dueAt<new Date()) throw new Error("Prazo da consulta já vencido.");
    const [record] = await tx.insert(constructionConsultations).values({ ...data, dueAt, sourceDepartmentId: item.process.currentDepartmentId, requestedBy: context.user.id }).returning({ id: constructionConsultations.id });
    await notifyProtocolDepartment(tx,context.user.id,data.targetDepartmentId,{ processId:item.processId,type:"CONSULTATION",title:`Parecer solicitado — ${item.process.protocolNumber}`,message:`Há consulta urbanística em /protocolos/consultas-construcao-civil. Prazo: ${data.dueAt}.`,dedupeDiscriminator:`CONSTRUCTION_CONSULTATION:${record.id}`,priority:"NORMAL" });
    await writeAuditEvent(tx,{ actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"ConstructionConsultation",targetId:record.id });
  });
  revalidatePath("/obras/construcao-civil/consultas"); revalidatePath("/protocolos/consultas-construcao-civil");
}

export async function respondConstructionConsultation(form: FormData): Promise<void> {
  const data = z.object({ consultationId:z.string().min(1),opinion:z.string().trim().min(10).max(10000) }).parse(Object.fromEntries(form));
  const context = await getTenantContextForModuleOperation("PROCESSOS","update");
  if (!context.user.employeeId || !context.user.departmentId) throw new Error("Parecer exige vínculo operacional a servidor e setor.");
  const employeeId=context.user.employeeId; const departmentId=context.user.departmentId;
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "ConstructionConsultation" WHERE "id"=${data.consultationId} FOR UPDATE`);
    const [item] = await tx.select({ ...getTableColumns(constructionConsultations), response: getTableColumns(constructionConsultationResponses), processId: processes.id, protocolNumber: processes.protocolNumber }).from(constructionConsultations).innerJoin(constructionCases, eq(constructionCases.id, constructionConsultations.caseId)).innerJoin(processes, eq(processes.id, constructionCases.processId)).leftJoin(constructionConsultationResponses, eq(constructionConsultationResponses.consultationId, constructionConsultations.id)).where(and(eq(constructionConsultations.id, data.consultationId), eq(constructionConsultations.targetDepartmentId, departmentId))).limit(1);
    if (!item) throw new Error("Consulta indisponível para seu setor.");
    if (!(await tx.select({ id: employees.id }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, employeeId), eq(employees.isActive, true), eq(employees.departmentId, departmentId), eq(departments.isActive, true))).limit(1)).length) throw new Error("Vínculo operacional inativo.");
    if (item.response) { if (item.response.actorId===context.user.id && item.response.opinion===data.opinion) return; throw new Error("A consulta já possui resposta imutável."); }
    const [record] = await tx.insert(constructionConsultationResponses).values({ ...data, employeeId, actorId: context.user.id }).returning({ id: constructionConsultationResponses.id });
    await notifyProtocolDepartment(tx,context.user.id,item.sourceDepartmentId,{ processId:item.processId,type:"CONSULTATION_RESPONSE",title:`Parecer recebido — ${item.protocolNumber}`,message:"O setor consultado respondeu à consulta urbanística.",dedupeDiscriminator:`CONSTRUCTION_RESPONSE:${record.id}` });
    await writeAuditEvent(tx,{ actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"ConstructionConsultationResponse",targetId:record.id });
  });
  revalidatePath("/obras/construcao-civil/consultas"); revalidatePath("/protocolos/consultas-construcao-civil");
}
