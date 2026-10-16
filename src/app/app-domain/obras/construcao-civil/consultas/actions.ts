"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { constructionDate } from "@/lib/obras/construction-rules";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function requestConstructionConsultation(form: FormData): Promise<void> {
  const data = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), targetDepartmentId: z.string().min(1), question: z.string().trim().min(10).max(4000), dueAt: constructionDate }).parse(Object.fromEntries(form));
  const context = await getTenantContextForModuleOperation("OBRAS","update"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.some((role) => ["ANALYST","MANAGER"].includes(role))) throw new Error("Consulta exige analista ou gestor.");
  await context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
    const item = await tx.constructionCase.findFirst({ where: { AND: [{ id:data.caseId }, constructionCaseWhere(access)] }, select: { processId:true, process:{ select:{ currentDepartmentId:true,protocolNumber:true,completedAt:true } } } });
    if (!item?.process.currentDepartmentId || item.process.completedAt) throw new Error("Solicitação indisponível ou encerrada.");
    if (data.targetDepartmentId===item.process.currentDepartmentId) throw new Error("Selecione outro setor para consulta.");
    if (!await tx.department.findFirst({ where:{ id:data.targetDepartmentId,isActive:true },select:{ id:true } })) throw new Error("Setor consultado indisponível.");
    const previous = await tx.constructionConsultation.findUnique({ where:{ requestKey:data.requestKey },select:{ caseId:true,requestedBy:true } });
    if (previous) { if (previous.caseId!==data.caseId || previous.requestedBy!==context.user.id) throw new Error("Referência indisponível."); return; }
    const dueAt = new Date(`${data.dueAt}T23:59:59.999Z`); if (dueAt<new Date()) throw new Error("Prazo da consulta já vencido.");
    const record = await tx.constructionConsultation.create({ data:{ ...data,dueAt,sourceDepartmentId:item.process.currentDepartmentId,requestedBy:context.user.id },select:{ id:true } });
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
  await context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ConstructionConsultation" WHERE "id"=${data.consultationId} FOR UPDATE`;
    const item=await tx.constructionConsultation.findFirst({ where:{ id:data.consultationId,targetDepartmentId:departmentId },include:{ response:true,case:{ select:{ processId:true,process:{ select:{ protocolNumber:true } } } } } });
    if (!item) throw new Error("Consulta indisponível para seu setor.");
    if (!await tx.employee.findFirst({ where:{ id:employeeId,isActive:true,departmentId,department:{ isActive:true } },select:{ id:true } })) throw new Error("Vínculo operacional inativo.");
    if (item.response) { if (item.response.actorId===context.user.id && item.response.opinion===data.opinion) return; throw new Error("A consulta já possui resposta imutável."); }
    const record=await tx.constructionConsultationResponse.create({ data:{ ...data,employeeId,actorId:context.user.id },select:{ id:true } });
    await notifyProtocolDepartment(tx,context.user.id,item.sourceDepartmentId,{ processId:item.case.processId,type:"CONSULTATION_RESPONSE",title:`Parecer recebido — ${item.case.process.protocolNumber}`,message:"O setor consultado respondeu à consulta urbanística.",dedupeDiscriminator:`CONSTRUCTION_RESPONSE:${record.id}` });
    await writeAuditEvent(tx,{ actorUsuarioId:context.user.id,eventType:auditEventTypes.administrativeMutation,targetType:"ConstructionConsultationResponse",targetId:record.id });
  });
  revalidatePath("/obras/construcao-civil/consultas"); revalidatePath("/protocolos/consultas-construcao-civil");
}
