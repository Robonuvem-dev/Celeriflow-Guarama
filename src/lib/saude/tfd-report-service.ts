import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

export const tfdReportFilters = z.object({
  unitId: z.string().max(200).default(""), destination: z.string().trim().max(200).default(""),
  professionalId: z.string().max(200).default(""), procedureId: z.string().max(200).default(""),
  from: z.union([z.iso.date(), z.literal("")]).default(""), to: z.union([z.iso.date(), z.literal("")]).default(""),
}).strict().refine(input => !input.from || !input.to || input.from <= input.to, "Período inválido.");

export async function tfdProcessReport(context: AppContext, raw: unknown) {
  const input = tfdReportFilters.parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  const where: Prisma.HealthTfdRequestWhereInput = {
    ...(input.unitId ? { originUnitId: input.unitId } : context.user.hasHealthAccessScope ? { originUnitId: { in: context.user.allowedHealthUnitIds || [] } } : {}),
    ...(input.destination ? { destination: { contains: input.destination, mode: "insensitive" } } : {}),
    ...(input.professionalId || input.procedureId ? { clinicalReport: { is: { ...(input.professionalId ? { professionalId: input.professionalId } : {}), ...(input.procedureId ? { procedureId: input.procedureId } : {}) } } } : {}),
    ...(input.from || input.to ? { createdAt: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00-03:00`) } : {}), ...(input.to ? { lte: new Date(`${input.to}T23:59:59.999-03:00`) } : {}) } } : {}),
  };
  const count = await context.prisma.healthTfdRequest.count({ where });
  if (count > 10000) throw new Error("O recorte ultrapassa 10.000 processos. Restrinja o período ou os filtros para emitir o relatório completo.");
  const records = await context.prisma.healthTfdRequest.findMany({ where, orderBy: { createdAt: "asc" }, take: 10001, include: { patient: { include: { person: { select: { fullName: true } } } }, originUnit: true, clinicalReport: { include: { professional: { include: { employee: { select: { name: true } } } }, procedure: true } }, benefits: true } });
  if (records.length > 10000) throw new Error("O recorte cresceu durante a emissão. Restrinja os filtros e tente novamente.");
  return records.map(record => ({
    Processo: record.id, Data: record.createdAt.toLocaleDateString("pt-BR"), Paciente: record.patient.person.fullName,
    "Unidade solicitante": record.originUnit?.name || "Não informada", Destino: record.destination,
    Profissional: record.clinicalReport?.professional.employee.name || "Não informado",
    Procedimento: record.clinicalReport?.procedure ? `${record.clinicalReport.procedure.code} · ${record.clinicalReport.procedure.description}` : "Não informado",
    Diagnóstico: record.clinicalReport?.diagnosis || "Laudo não incluído", Versão: record.clinicalReport?.version || 0,
    Situação: record.status, Autorização: record.authorizedAt?.toLocaleString("pt-BR") || "Não autorizada",
    "Benefícios autorizados": record.benefits.filter(benefit => benefit.status === "AUTORIZADO").length,
    "Benefícios entregues": record.benefits.filter(benefit => benefit.status === "ENTREGUE").length,
  }));
}
