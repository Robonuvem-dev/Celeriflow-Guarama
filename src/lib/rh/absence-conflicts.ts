import type { Prisma } from "@prisma/client";

export async function assertRhAbsenceDoesNotOverlap(tx: Prisma.TransactionClient, input: { employeeId: string; startsAt: Date; endsAt: Date; kind: "FERIAS" | "LICENCA"; excludeId?: string }) {
  if (!Number.isFinite(input.startsAt.getTime()) || !Number.isFinite(input.endsAt.getTime()) || input.endsAt < input.startsAt) throw new Error("Período de férias/afastamento inválido.");
  const vacation = await tx.vacation.findFirst({ where: { employeeId: input.employeeId, ...(input.kind === "FERIAS" && input.excludeId ? { id: { not: input.excludeId } } : {}), status: { in: ["Programada", "Em gozo", "Concluída"] }, enjoymentStart: { lte: input.endsAt }, enjoymentEnd: { gte: input.startsAt } } });
  const leave = await tx.leave.findFirst({ where: { employeeId: input.employeeId, ...(input.kind === "LICENCA" && input.excludeId ? { id: { not: input.excludeId } } : {}), status: "Ativa", startDate: { lte: input.endsAt }, endDate: { gte: input.startsAt } } });
  if (vacation || leave) throw new Error("Período conflita com férias ou afastamento do servidor.");
}
