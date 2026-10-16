import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { protocolScope, type ProtocolContext } from "@/lib/protocols/access";
import { canPerformModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { digitalServiceSchema, scheduleSchema } from "./services-policy";

export async function programPortalRequests(context: ProtocolContext, raw: unknown, previousScheduleId?: string) {
  if (!context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para programar.", 403);
  const input = scheduleSchema.parse(raw);
  if (new Set(input.requestIds).size !== input.requestIds.length) throw new Error("Não repita ocorrências.");
  return context.prisma.$transaction(async (tx) => {
    const requests = await tx.portalServiceRequest.findMany({ where: { id: { in: input.requestIds }, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, process: protocolScope(context) }, include: { process: { select: { currentDepartmentId: true } } } });
    if (requests.length !== input.requestIds.length || requests.some((request) => !context.protocolAccess.isAdmin && request.process.currentDepartmentId !== context.user.departmentId)) throw new AccessError("Ocorrências fora do setor ou encerradas.", 403);
    if (requests.some((request) => request.worksServiceId) && !canPerformModuleOperation(context.user, "OBRAS", "update")) throw new AccessError("Programação operacional exige permissão de Obras.", 403);
    const reservations = requests.filter((request) => request.executorType === "RESERVA");
    if (reservations.length && !canPerformModuleOperation(context.user, "CULTURA", "update")) throw new AccessError("Reprogramar reservas exige autorização da Cultura/Esporte.", 403);
    const portalResources = [input.resourceKey, ...(input.employeeId ? [`EMPLOYEE:${input.employeeId}`] : []), ...(input.teamId ? [`TEAM:${input.teamId}`] : []), ...(input.assetId ? [`ASSET:${input.assetId}`] : [])].map((key) => `PORTAL_RESOURCE:${key}`);
    const cultureResources = reservations.map((request) => `CULTURA_RESERVA:${digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration).spaceId}`);
    for (const key of [...new Set([...portalResources, ...cultureResources])].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const departmentIds = requests.map((request) => request.process.currentDepartmentId).filter((id): id is string => Boolean(id));
    if (input.employeeId && !await tx.employee.findFirst({ where: { id: input.employeeId, isActive: true, departmentId: { in: departmentIds } }, select: { id: true } })) throw new Error("Executor não está ativo em um setor responsável.");
    if (input.teamId && !await tx.obrasEquipe.findFirst({ where: { id: input.teamId, isActive: true, departmentId: { in: departmentIds } }, select: { id: true } })) throw new Error("Equipe indisponível ao setor.");
    if (input.assetId && !await tx.asset.findFirst({ where: { id: input.assetId, status: { notIn: ["Baixado", "Inativo"] } }, select: { id: true } })) throw new Error("Equipamento indisponível.");
    let previous = null;
    if (previousScheduleId) {
      previous = await tx.portalServiceSchedule.findFirst({ where: { id: previousScheduleId, status: { in: ["PROGRAMADO", "EM_EXECUCAO"] } }, include: { links: true } });
      if (!previous || previous.links.length !== input.requestIds.length || previous.links.some((link) => !input.requestIds.includes(link.requestId))) throw new Error("Preserve todas as ocorrências da programação anterior.");
      await tx.portalServiceSchedule.update({ where: { id: previous.id }, data: { status: "REPROGRAMADO" } });
    }
    const occupied = await tx.portalServiceSchedule.count({ where: {
      status: { in: ["PROGRAMADO", "EM_EXECUCAO"] }, startsAt: { lt: new Date(input.endsAt) }, endsAt: { gt: new Date(input.startsAt) },
      OR: [{ resourceKey: input.resourceKey }, ...(input.employeeId ? [{ employeeId: input.employeeId }] : []), ...(input.teamId ? [{ teamId: input.teamId }] : []), ...(input.assetId ? [{ assetId: input.assetId }] : [])],
    } });
    if (occupied) throw new Error("Recurso, equipe ou executor já reservado neste intervalo.");
    for (const request of reservations) {
      const source = await tx.culturaReserva.findFirst({ where: { id: request.executorId || "", active: true, status: { in: ["Solicitada", "Aprovada"] } } });
      if (!source || await tx.culturaReserva.count({ where: { id: { not: source.id }, spaceId: source.spaceId, active: true, status: { in: ["Solicitada", "Aprovada"] }, startsAt: { lt: new Date(input.endsAt) }, endsAt: { gt: new Date(input.startsAt) } } })) throw new Error("Reserva indisponível ou espaço ocupado na fonte Cultura/Esporte.");
      await tx.culturaReserva.update({ where: { id: source.id }, data: { startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
    }
    const schedule = await tx.portalServiceSchedule.create({ data: { resourceKey: input.resourceKey, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), type: input.type, reason: input.reason, employeeId: input.employeeId || null, teamId: input.teamId || null, assetId: input.assetId || null, laborQuantity: input.laborQuantity, laborUnitCost: input.laborUnitCost, createdById: context.user.id, links: { create: requests.map((request) => ({ requestId: request.id })) } } });
    for (const request of requests) {
      await tx.portalServiceRequestEvent.create({ data: { requestId: request.id, actorId: context.user.id, kind: previous ? "REPROGRAMACAO" : "PROGRAMACAO", text: `${input.type}: ${new Date(input.startsAt).toLocaleString("pt-BR")} até ${new Date(input.endsAt).toLocaleString("pt-BR")}. ${input.reason}`, requestKey: randomUUID() } });
      await tx.portalServiceRequest.update({ where: { id: request.id }, data: { status: "PROGRAMADO", revision: { increment: 1 } } });
      if (request.worksServiceId) {
        await tx.obrasServico.update({ where: { id: request.worksServiceId }, data: { scheduledFor: new Date(input.startsAt) } });
        if (input.employeeId) await tx.obrasServicoEmployee.upsert({ where: { obrasServicoId_employeeId: { obrasServicoId: request.worksServiceId, employeeId: input.employeeId } }, create: { obrasServicoId: request.worksServiceId, employeeId: input.employeeId }, update: { releasedAt: null } });
        if (input.teamId) await tx.obrasServicoEquipe.upsert({ where: { obrasServicoId_equipeId: { obrasServicoId: request.worksServiceId, equipeId: input.teamId } }, create: { obrasServicoId: request.worksServiceId, equipeId: input.teamId }, update: { releasedAt: null } });
        if (input.assetId) await tx.obrasServicoEquipamento.upsert({ where: { obrasServicoId_assetId: { obrasServicoId: request.worksServiceId, assetId: input.assetId } }, create: { obrasServicoId: request.worksServiceId, assetId: input.assetId }, update: { releasedAt: null } });
      }
    }
    return schedule;
  }, { timeout: 30000 });
}

export async function finishPortalSchedule(context: ProtocolContext, scheduleId: string, raw: unknown) {
  const input = z.object({ status: z.enum(["EM_EXECUCAO", "CONCLUIDO", "CANCELADO"]), reason: z.string().trim().min(5).max(1000), realizedQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0") }).strict().parse(raw);
  if (!context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para operar.", 403);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_SCHEDULE:${scheduleId}`}))`;
    const schedule = await tx.portalServiceSchedule.findUniqueOrThrow({ where: { id: scheduleId }, include: { links: { include: { request: { include: { process: true } } } } } });
    if (!["PROGRAMADO", "EM_EXECUCAO"].includes(schedule.status)) throw new Error("Programação encerrada ou substituída.");
    if (schedule.links.some((link) => !context.protocolAccess.isAdmin && link.request.process.currentDepartmentId !== context.user.departmentId)) throw new AccessError("Programação fora do setor atual.", 403);
    if (schedule.links.some((link) => link.request.worksServiceId) && !canPerformModuleOperation(context.user, "OBRAS", "update")) throw new AccessError("Execução exige permissão de Obras.", 403);
    if (schedule.links.some((link) => link.request.executorType === "RESERVA") && !canPerformModuleOperation(context.user, "CULTURA", "update")) throw new AccessError("Execução de reserva exige permissão de Cultura/Esporte.", 403);
    await tx.portalServiceSchedule.update({ where: { id: scheduleId }, data: { status: input.status, realizedQuantity: input.realizedQuantity } });
    for (const link of schedule.links) {
      await tx.portalServiceRequestEvent.create({ data: { requestId: link.requestId, actorId: context.user.id, kind: `PROGRAMACAO_${input.status}`, text: input.reason, requestKey: randomUUID() } });
      await tx.portalServiceRequest.update({ where: { id: link.requestId }, data: { revision: { increment: 1 } } });
      if (link.request.worksServiceId && input.status === "EM_EXECUCAO") await tx.obrasServico.update({ where: { id: link.request.worksServiceId }, data: { status: "Em Andamento" } });
      if (link.request.executorType === "RESERVA" && link.request.executorId && ["CONCLUIDO", "CANCELADO"].includes(input.status)) await tx.culturaReserva.update({ where: { id: link.request.executorId }, data: { status: input.status === "CANCELADO" ? "Cancelada" : "Realizada" } });
      if (link.request.worksServiceId && input.status === "CONCLUIDO" && !await tx.portalServiceSchedule.count({ where: { id: { not: scheduleId }, status: { in: ["PROGRAMADO", "EM_EXECUCAO"] }, links: { some: { requestId: link.requestId } } } })) await tx.obrasServico.update({ where: { id: link.request.worksServiceId }, data: { status: "Concluído", completedAt: new Date() } });
    }
    return { recorded: true };
  });
}

export async function portalRequestCosts(context: ProtocolContext, requestId: string) {
  const request = await context.prisma.portalServiceRequest.findFirstOrThrow({ where: { id: requestId, process: protocolScope(context) }, include: { worksService: { include: { materials: { include: { material: { select: { name: true } } } } } }, schedules: { include: { schedule: { include: { links: { select: { requestId: true }, orderBy: { requestId: "asc" } } } } } } } });
  let planned = new Prisma.Decimal(0), realized = new Prisma.Decimal(0);
  let plannedComplete = true, realizedComplete = true;
  const movements = request.worksServiceId ? await context.prisma.materialMovement.findMany({ where: { OR: [{ obrasServicoId: request.worksServiceId }, { returnedMovement: { obrasServicoId: request.worksServiceId } }, { reversedMovement: { obrasServicoId: request.worksServiceId } }] }, select: { materialId: true, type: true, quantity: true, unitValue: true } }) : [];
  const items = request.worksService?.materials.map((item) => {
    const estimate = item.unitCost !== null && Number.isFinite(item.unitCost) && Number.isFinite(item.quantityPlanned) ? new Prisma.Decimal(String(item.unitCost)).mul(String(item.quantityPlanned)) : null;
    const source = movements.filter((movement) => movement.materialId === item.materialId);
    const complete = source.every((movement) => movement.unitValue !== null && Number.isFinite(movement.unitValue) && Number.isFinite(movement.quantity) && ["Entrada", "Saída"].includes(movement.type)) && (item.quantityIssued === 0 || source.length > 0);
    const actual = complete ? source.reduce((sum, movement) => sum.add(new Prisma.Decimal(String(movement.unitValue)).mul(String(movement.quantity)).mul(movement.type === "Saída" ? 1 : -1)), new Prisma.Decimal(0)) : null;
    if (estimate) planned = planned.add(estimate); else plannedComplete = false;
    if (actual) realized = realized.add(actual); else realizedComplete = false;
    return { label: item.material.name, planned: estimate?.toFixed(2) || "Não conciliado", realized: actual?.toFixed(2) || "Não conciliado" };
  }) || [];
  for (const { schedule } of request.schedules) {
    if (["CANCELADO", "REPROGRAMADO"].includes(schedule.status)) continue;
    // Explicit equal allocation of the shared program, with the cent remainder on the last occurrence.
    const index = schedule.links.findIndex((link) => link.requestId === requestId), count = schedule.links.length;
    const allocate = (total: Prisma.Decimal) => { const portion = total.div(count).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN); return index === count - 1 ? total.sub(portion.mul(count - 1)) : portion; };
    const estimate = allocate(schedule.laborQuantity.mul(schedule.laborUnitCost)), actual = allocate(schedule.realizedQuantity.mul(schedule.laborUnitCost));
    planned = planned.add(estimate); realized = realized.add(actual);
    items.push({ label: `Mão de obra ${schedule.type} (${count > 1 ? `rateio igual entre ${count} ocorrências` : "programação individual"})`, planned: estimate.toFixed(2), realized: actual.toFixed(2) });
  }
  return { planned: plannedComplete ? planned.toFixed(2) : "Não conciliado", realized: realizedComplete ? realized.toFixed(2) : "Não conciliado", items };
}
