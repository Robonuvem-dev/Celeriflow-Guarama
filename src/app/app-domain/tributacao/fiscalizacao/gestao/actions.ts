"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JsonObject } from "@/db/json";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { employees } from "@/db/schema/administration";
import { fiscalDocuments, fiscalOrderEvents, fiscalOrders } from "@/db/schema/taxation-inspection";
import { withDatabaseTransaction } from "@/db/transaction";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { createFiscalAssessmentMap } from "@/lib/tributacao/s7-service";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value, "Data inválida.");
export async function manageFiscalOrder(form: FormData): Promise<void> {
  const context = await taxActionContext("update");
  const input = z.object({ orderId: z.string().min(1), operation: z.enum(["CONFIGURAR", "PRORROGAR", "CANCELAR", "ENCERRAR", "ATRIBUIR", "ORDEM_INICIO", "TERMO_FISCAL", "TIAF", "AUTO_PRINCIPAL", "AUTO_ACESSORIA", "TERMO_ENCERRAMENTO"]), reason: z.string().trim().min(5).max(4000) }).parse(Object.fromEntries(form.entries()));
  await withDatabaseTransaction(context.connection, async tx => {
    const [order] = await tx.select().from(fiscalOrders).where(eq(fiscalOrders.id, input.orderId)).for("update");
    if (!order || !context.user.employeeId || order.responsibleEmployeeId !== context.user.employeeId) throw new Error("Somente o responsável pela fiscalização pode alterar esta ordem.");
    if (["ENCERRADA", "CANCELADA"].includes(order.status)) throw new Error("Ordem encerrada ou cancelada.");
    const scope: JsonObject = order.scope && typeof order.scope === "object" && !Array.isArray(order.scope) ? { ...order.scope } : {};
    let documentId: string | undefined;
    if (input.operation === "CONFIGURAR") {
      const procedure = z.string().trim().min(1).max(240).parse(form.get("procedure"));
      const start = day.parse(form.get("periodStart")), end = day.parse(form.get("periodEnd")), due = day.parse(form.get("dueDate"));
      if (start > end) throw new Error("Período fiscalizado inválido.");
      Object.assign(scope, { procedure, periodStart: start, periodEnd: end, dueDate: due, orderModel: z.string().trim().max(80).parse(String(form.get("orderModel") ?? "")) });
    }
    if (input.operation === "PRORROGAR") {
      const dueDate = day.parse(form.get("dueDate"));
      if (typeof scope.dueDate !== "string" || dueDate <= scope.dueDate) throw new Error("Informe uma data posterior ao prazo atual.");
      scope.dueDate = dueDate;
    }
    if (input.operation === "ATRIBUIR") {
      const employeeId = z.string().min(1).parse(form.get("employeeId"));
      const start = day.parse(form.get("periodStart")), end = day.parse(form.get("periodEnd"));
      if (start > end) throw new Error("Período de atuação inválido.");
      const [employee] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.isActive, true))).limit(1);
      if (!employee) throw new Error("Auditor não encontrado ou inativo.");
      const assignments = Array.isArray(scope.auditors) ? scope.auditors : [];
      scope.auditors = [...assignments.filter(item => !(item && typeof item === "object" && !Array.isArray(item) && item.employeeId === employeeId && item.periodStart === start)), { employeeId, periodStart: start, periodEnd: end }];
    }
    if (["ORDEM_INICIO", "TERMO_FISCAL", "TIAF", "AUTO_PRINCIPAL", "AUTO_ACESSORIA", "TERMO_ENCERRAMENTO"].includes(input.operation)) {
      const [document] = await tx.insert(fiscalDocuments).values({ orderId: order.id, documentKind: input.operation, documentNumber: `${input.operation}-${randomUUID().slice(0, 8).toUpperCase()}`, templateCode: typeof scope.orderModel === "string" ? scope.orderModel || null : null, contentSnapshot: { orderNumber: order.orderNumber, taxpayerId: order.taxpayerId, scope, description: input.reason }, issuedByEmployeeId: context.user.employeeId }).returning({ id: fiscalDocuments.id });
      documentId = document.id;
    }
    const nextStatus = input.operation === "CANCELAR" ? "CANCELADA" : input.operation === "ENCERRAR" || input.operation === "TERMO_ENCERRAMENTO" ? "ENCERRADA" : order.status;
    await tx.update(fiscalOrders).set({ scope, ...(nextStatus !== order.status ? { status: nextStatus, closedAt: new Date() } : {}) }).where(eq(fiscalOrders.id, order.id));
    await tx.insert(fiscalOrderEvents).values({ orderId: order.id, eventType: input.operation, description: input.reason, actorUsuarioId: context.user.id, employeeId: context.user.employeeId, payload: { scope, documentId: documentId ?? null } });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "FiscalServiceOrder", targetId: order.id });
  });
  revalidatePath("/tributacao/fiscalizacao");
  revalidatePath("/tributacao/fiscalizacao/gestao");
}

export async function assessFiscalPeriod(form: FormData): Promise<void> {
  const context = await taxActionContext("create");
  const orderId = z.string().min(1).parse(form.get("orderId"));
  const [order] = await context.database.select().from(fiscalOrders).where(eq(fiscalOrders.id, orderId)).limit(1);
  if (!order || !context.user.employeeId || order.responsibleEmployeeId !== context.user.employeeId || ["ENCERRADA", "CANCELADA"].includes(order.status)) throw new Error("Apuração restrita ao responsável de uma ordem aberta.");
  const amount = (key: string) => z.coerce.number().finite().nonnegative().parse(form.get(key));
  await createFiscalAssessmentMap(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId }, { orderId, competence: String(form.get("competence")), obligationType: "PRINCIPAL", originalBase: amount("originalBase"), assessedBase: amount("assessedBase"), rate: amount("rate"), manualPenalty: amount("manualPenalty"), manualInterest: amount("manualInterest"), manualCorrection: amount("manualCorrection") });
  revalidatePath("/tributacao/fiscalizacao");
  revalidatePath("/tributacao/fiscalizacao/gestao");
}
