import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { and, asc, count, eq, gt, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { portalServiceRequests, portalServiceRequestEvents, portalServiceSchedules, portalScheduleRequests } from "@/db/schema/portal-services";
import { processes } from "@/db/schema/processes";
import { employees } from "@/db/schema/administration";
import { assets } from "@/db/schema/assets";
import { materials, materialMovements } from "@/db/schema/assets-stock";
import { infrastructureServices, infrastructureTeams, infrastructureServiceEmployees, infrastructureServiceTeams, infrastructureServiceEquipment, infrastructureServiceMaterials } from "@/db/schema/infrastructure";
import { culturalReservations } from "@/db/schema/culture";
import { z } from "zod";
import { protocolScopeCondition, type ProtocolScopeContext } from "@/lib/protocols/access";
import { canPerformModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { digitalServiceSchema, scheduleSchema } from "./services-policy";

export async function programPortalRequests(context: ProtocolScopeContext, raw: unknown, previousScheduleId?: string, connection: DatabaseConnection = databaseConnection) {
  if (!context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para programar.", 403);
  const input = scheduleSchema.parse(raw);
  if (new Set(input.requestIds).size !== input.requestIds.length) throw new Error("Não repita ocorrências.");
  return withDatabaseTransaction(connection, async tx => {
    const requestRows = await tx.select({ request: portalServiceRequests, process: { currentDepartmentId: processes.currentDepartmentId } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(and(inArray(portalServiceRequests.id, input.requestIds), notInArray(portalServiceRequests.status, ["CONCLUIDO", "CANCELADO"]), protocolScopeCondition(context)));
    const requests = requestRows.map(row => ({ ...row.request, process: row.process }));
    if (requests.length !== input.requestIds.length || requests.some(request => !context.protocolAccess.isAdmin && request.process.currentDepartmentId !== context.user.departmentId)) throw new AccessError("Ocorrências fora do setor ou encerradas.", 403);
    if (requests.some(request => request.worksServiceId) && !canPerformModuleOperation(context.user, "OBRAS", "update")) throw new AccessError("Programação operacional exige permissão de Obras.", 403);
    const reservations = requests.filter(request => request.executorType === "RESERVA");
    if (reservations.length && !canPerformModuleOperation(context.user, "CULTURA", "update")) throw new AccessError("Reprogramar reservas exige autorização da Cultura/Esporte.", 403);
    const portalResources = [input.resourceKey, ...(input.employeeId ? [`EMPLOYEE:${input.employeeId}`] : []), ...(input.teamId ? [`TEAM:${input.teamId}`] : []), ...(input.assetId ? [`ASSET:${input.assetId}`] : [])].map(key => `PORTAL_RESOURCE:${key}`);
    const cultureResources = reservations.map(request => `CULTURA_RESERVA:${digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration).spaceId}`);
    for (const key of [...new Set([...portalResources, ...cultureResources])].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const departmentIds = requests.map(request => request.process.currentDepartmentId).filter((id): id is string => Boolean(id));
    if (input.employeeId && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true), inArray(employees.departmentId, departmentIds))).limit(1)).length) throw new Error("Executor não está ativo em um setor responsável.");
    if (input.teamId && !(await tx.select({ id: infrastructureTeams.id }).from(infrastructureTeams).where(and(eq(infrastructureTeams.id, input.teamId), eq(infrastructureTeams.isActive, true), inArray(infrastructureTeams.departmentId, departmentIds))).limit(1)).length) throw new Error("Equipe indisponível ao setor.");
    if (input.assetId && !(await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.id, input.assetId), notInArray(assets.status, ["Baixado", "Inativo"]))).limit(1)).length) throw new Error("Equipamento indisponível.");
    let previous = null;
    if (previousScheduleId) {
      const [previousRow] = await tx.select().from(portalServiceSchedules).where(and(eq(portalServiceSchedules.id, previousScheduleId), inArray(portalServiceSchedules.status, ["PROGRAMADO", "EM_EXECUCAO"]))).limit(1);
      previous = previousRow ? { ...previousRow, links: await tx.select().from(portalScheduleRequests).where(eq(portalScheduleRequests.scheduleId, previousRow.id)) } : null;
      if (!previous || previous.links.length !== input.requestIds.length || previous.links.some(link => !input.requestIds.includes(link.requestId))) throw new Error("Preserve todas as ocorrências da programação anterior.");
      await tx.update(portalServiceSchedules).set({ status: "REPROGRAMADO" }).where(eq(portalServiceSchedules.id, previous.id));
    }
    const [{ total: occupied }] = await tx.select({ total: count() }).from(portalServiceSchedules).where(and(inArray(portalServiceSchedules.status, ["PROGRAMADO", "EM_EXECUCAO"]), lt(portalServiceSchedules.startsAt, new Date(input.endsAt)), gt(portalServiceSchedules.endsAt, new Date(input.startsAt)), or(eq(portalServiceSchedules.resourceKey, input.resourceKey), input.employeeId ? eq(portalServiceSchedules.employeeId, input.employeeId) : undefined, input.teamId ? eq(portalServiceSchedules.teamId, input.teamId) : undefined, input.assetId ? eq(portalServiceSchedules.assetId, input.assetId) : undefined)));
    if (occupied) throw new Error("Recurso, equipe ou executor já reservado neste intervalo.");
    for (const request of reservations) {
      const [source] = await tx.select().from(culturalReservations).where(and(eq(culturalReservations.id, request.executorId || ""), eq(culturalReservations.active, true), inArray(culturalReservations.status, ["Solicitada", "Aprovada"]))).limit(1);
      if (!source) throw new Error("Reserva indisponível ou espaço ocupado na fonte Cultura/Esporte.");
      const [{ total: sourceOccupied }] = await tx.select({ total: count() }).from(culturalReservations).where(and(ne(culturalReservations.id, source.id), eq(culturalReservations.spaceId, source.spaceId), eq(culturalReservations.active, true), inArray(culturalReservations.status, ["Solicitada", "Aprovada"]), lt(culturalReservations.startsAt, new Date(input.endsAt)), gt(culturalReservations.endsAt, new Date(input.startsAt))));
      if (sourceOccupied) throw new Error("Reserva indisponível ou espaço ocupado na fonte Cultura/Esporte.");
      await tx.update(culturalReservations).set({ startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) }).where(eq(culturalReservations.id, source.id));
    }
    const [schedule] = await tx.insert(portalServiceSchedules).values({ resourceKey: input.resourceKey, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), type: input.type, reason: input.reason, employeeId: input.employeeId || null, teamId: input.teamId || null, assetId: input.assetId || null, laborQuantity: input.laborQuantity, laborUnitCost: input.laborUnitCost, createdById: context.user.id }).returning();
    await tx.insert(portalScheduleRequests).values(requests.map(request => ({ scheduleId: schedule.id, requestId: request.id })));
    for (const request of requests) {
      await tx.insert(portalServiceRequestEvents).values({ requestId: request.id, actorId: context.user.id, kind: previous ? "REPROGRAMACAO" : "PROGRAMACAO", text: `${input.type}: ${new Date(input.startsAt).toLocaleString("pt-BR")} até ${new Date(input.endsAt).toLocaleString("pt-BR")}. ${input.reason}`, requestKey: randomUUID() });
      await tx.update(portalServiceRequests).set({ status: "PROGRAMADO", revision: sql`${portalServiceRequests.revision} + 1` }).where(eq(portalServiceRequests.id, request.id));
      if (request.worksServiceId) {
        await tx.update(infrastructureServices).set({ scheduledFor: new Date(input.startsAt) }).where(eq(infrastructureServices.id, request.worksServiceId));
        if (input.employeeId) await tx.insert(infrastructureServiceEmployees).values({ obrasServicoId: request.worksServiceId, employeeId: input.employeeId }).onConflictDoUpdate({ target: [infrastructureServiceEmployees.obrasServicoId, infrastructureServiceEmployees.employeeId], set: { releasedAt: null } });
        if (input.teamId) await tx.insert(infrastructureServiceTeams).values({ obrasServicoId: request.worksServiceId, equipeId: input.teamId }).onConflictDoUpdate({ target: [infrastructureServiceTeams.obrasServicoId, infrastructureServiceTeams.equipeId], set: { releasedAt: null } });
        if (input.assetId) await tx.insert(infrastructureServiceEquipment).values({ obrasServicoId: request.worksServiceId, assetId: input.assetId }).onConflictDoUpdate({ target: [infrastructureServiceEquipment.obrasServicoId, infrastructureServiceEquipment.assetId], set: { releasedAt: null } });
      }
    }
    return schedule;
  }, { timeoutMs: 30_000 });
}

export async function finishPortalSchedule(context: ProtocolScopeContext, scheduleId: string, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ status: z.enum(["EM_EXECUCAO", "CONCLUIDO", "CANCELADO"]), reason: z.string().trim().min(5).max(1000), realizedQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0") }).strict().parse(raw);
  if (!context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para operar.", 403);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_SCHEDULE:${scheduleId}`}))`);
    const [scheduleRow] = await tx.select().from(portalServiceSchedules).where(eq(portalServiceSchedules.id, scheduleId)).limit(1);
    if (!scheduleRow) throw new Error("Programação não encontrada.");
    const links = await tx.select({ requestId: portalScheduleRequests.requestId, request: portalServiceRequests, process: processes }).from(portalScheduleRequests).innerJoin(portalServiceRequests, eq(portalServiceRequests.id, portalScheduleRequests.requestId)).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(eq(portalScheduleRequests.scheduleId, scheduleId));
    const schedule = { ...scheduleRow, links: links.map(link => ({ requestId: link.requestId, request: { ...link.request, process: link.process } })) };
    if (!["PROGRAMADO", "EM_EXECUCAO"].includes(schedule.status)) throw new Error("Programação encerrada ou substituída.");
    if (schedule.links.some(link => !context.protocolAccess.isAdmin && link.request.process.currentDepartmentId !== context.user.departmentId)) throw new AccessError("Programação fora do setor atual.", 403);
    if (schedule.links.some(link => link.request.worksServiceId) && !canPerformModuleOperation(context.user, "OBRAS", "update")) throw new AccessError("Execução exige permissão de Obras.", 403);
    if (schedule.links.some(link => link.request.executorType === "RESERVA") && !canPerformModuleOperation(context.user, "CULTURA", "update")) throw new AccessError("Execução de reserva exige permissão de Cultura/Esporte.", 403);
    await tx.update(portalServiceSchedules).set({ status: input.status, realizedQuantity: input.realizedQuantity }).where(eq(portalServiceSchedules.id, scheduleId));
    for (const link of schedule.links) {
      await tx.insert(portalServiceRequestEvents).values({ requestId: link.requestId, actorId: context.user.id, kind: `PROGRAMACAO_${input.status}`, text: input.reason, requestKey: randomUUID() });
      await tx.update(portalServiceRequests).set({ revision: sql`${portalServiceRequests.revision} + 1` }).where(eq(portalServiceRequests.id, link.requestId));
      if (link.request.worksServiceId && input.status === "EM_EXECUCAO") await tx.update(infrastructureServices).set({ status: "Em Andamento" }).where(eq(infrastructureServices.id, link.request.worksServiceId));
      if (link.request.executorType === "RESERVA" && link.request.executorId && ["CONCLUIDO", "CANCELADO"].includes(input.status)) await tx.update(culturalReservations).set({ status: input.status === "CANCELADO" ? "Cancelada" : "Realizada" }).where(eq(culturalReservations.id, link.request.executorId));
      if (link.request.worksServiceId && input.status === "CONCLUIDO") {
        const [{ total: pending }] = await tx.select({ total: count() }).from(portalServiceSchedules).where(and(ne(portalServiceSchedules.id, scheduleId), inArray(portalServiceSchedules.status, ["PROGRAMADO", "EM_EXECUCAO"]), sql`EXISTS(SELECT 1 FROM ${portalScheduleRequests} WHERE ${portalScheduleRequests.scheduleId}=${portalServiceSchedules.id} AND ${portalScheduleRequests.requestId}=${link.requestId})`));
        if (!pending) await tx.update(infrastructureServices).set({ status: "Concluído", completedAt: new Date() }).where(eq(infrastructureServices.id, link.request.worksServiceId));
      }
    }
    return { recorded: true };
  }, { timeoutMs: 5_000 });
}

export async function portalRequestCosts(context: ProtocolScopeContext, requestId: string, executor: DatabaseExecutor = db) {
  const [request] = await executor.select({ worksServiceId: portalServiceRequests.worksServiceId }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(and(eq(portalServiceRequests.id, requestId), protocolScopeCondition(context))).limit(1);
  if (!request) throw new AccessError("Solicitação não encontrada.", 404);
  const materialRows = request.worksServiceId ? await executor.select({ item: infrastructureServiceMaterials, material: { name: materials.name } }).from(infrastructureServiceMaterials).innerJoin(materials, eq(materials.id, infrastructureServiceMaterials.materialId)).where(eq(infrastructureServiceMaterials.obrasServicoId, request.worksServiceId)) : [];
  const scheduleRows = await executor.select({ schedule: portalServiceSchedules }).from(portalScheduleRequests).innerJoin(portalServiceSchedules, eq(portalServiceSchedules.id, portalScheduleRequests.scheduleId)).where(eq(portalScheduleRequests.requestId, requestId));
  const allLinks = scheduleRows.length ? await executor.select({ scheduleId: portalScheduleRequests.scheduleId, requestId: portalScheduleRequests.requestId }).from(portalScheduleRequests).where(inArray(portalScheduleRequests.scheduleId, scheduleRows.map(row => row.schedule.id))).orderBy(asc(portalScheduleRequests.requestId)) : [];
  let planned = new Decimal(0), realized = new Decimal(0);
  let plannedComplete = true, realizedComplete = true;
  const movements = request.worksServiceId ? await executor.select({ materialId: materialMovements.materialId, type: materialMovements.type, quantity: materialMovements.quantity, unitValue: materialMovements.unitValue }).from(materialMovements).where(or(eq(materialMovements.obrasServicoId, request.worksServiceId), sql`EXISTS(SELECT 1 FROM "MaterialMovement" origin WHERE origin.id IN (${materialMovements.returnedMovementId},${materialMovements.reversedMovementId}) AND origin."obrasServicoId"=${request.worksServiceId})`)) : [];
  const items = materialRows.map(({ item, material }) => {
    const estimate = item.unitCost !== null && Number.isFinite(item.unitCost) && Number.isFinite(item.quantityPlanned) ? new Decimal(String(item.unitCost)).mul(String(item.quantityPlanned)) : null;
    const source = movements.filter(movement => movement.materialId === item.materialId);
    const complete = source.every(movement => movement.unitValue !== null && Number.isFinite(movement.unitValue) && Number.isFinite(movement.quantity) && ["Entrada", "Saída"].includes(movement.type)) && (item.quantityIssued === 0 || source.length > 0);
    const actual = complete ? source.reduce((sum, movement) => sum.add(new Decimal(String(movement.unitValue)).mul(String(movement.quantity)).mul(movement.type === "Saída" ? 1 : -1)), new Decimal(0)) : null;
    if (estimate) planned = planned.add(estimate); else plannedComplete = false;
    if (actual) realized = realized.add(actual); else realizedComplete = false;
    return { label: material.name, planned: estimate?.toFixed(2) || "Não conciliado", realized: actual?.toFixed(2) || "Não conciliado" };
  });
  for (const { schedule } of scheduleRows) {
    if (["CANCELADO", "REPROGRAMADO"].includes(schedule.status)) continue;
    // Explicit equal allocation, with the cent remainder on the last occurrence.
    const links = allLinks.filter(link => link.scheduleId === schedule.id);
    const index = links.findIndex(link => link.requestId === requestId), count = links.length;
    const allocate = (total: Decimal) => { const portion = total.div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN); return index === count - 1 ? total.sub(portion.mul(count - 1)) : portion; };
    const estimate = allocate(new Decimal(schedule.laborQuantity).mul(schedule.laborUnitCost)), actual = allocate(new Decimal(schedule.realizedQuantity).mul(schedule.laborUnitCost));
    planned = planned.add(estimate); realized = realized.add(actual);
    items.push({ label: `Mão de obra ${schedule.type} (${count > 1 ? `rateio igual entre ${count} ocorrências` : "programação individual"})`, planned: estimate.toFixed(2), realized: actual.toFixed(2) });
  }
  return { planned: plannedComplete ? planned.toFixed(2) : "Não conciliado", realized: realizedComplete ? realized.toFixed(2) : "Não conciliado", items };
}
