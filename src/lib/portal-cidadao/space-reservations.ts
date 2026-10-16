import type { Prisma } from "@prisma/client";

export async function createScopedSpaceReservation(tx: Prisma.TransactionClient, input: { spaceId: string; personId?: string | null; companyId?: string | null; eventId?: string | null; startsAt: Date; endsAt: Date; purpose: string; protocolNumber?: string }) {
  if (Boolean(input.personId) === Boolean(input.companyId)) throw new Error("Vincule uma pessoa ou empresa solicitante conferida pelo município.");
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime()) || input.endsAt <= input.startsAt) throw new Error("Período de reserva inválido.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CULTURA_RESERVA:${input.spaceId}`}))`;
  const space = await tx.culturaEspaco.findFirst({ where: { id: input.spaceId, active: true, status: "Disponível" }, select: { id: true } });
  if (!space) throw new Error("Espaço indisponível.");
  if (input.personId && !await tx.person.findFirst({ where: { id: input.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa solicitante indisponível.");
  if (input.companyId && !await tx.company.findFirst({ where: { id: input.companyId, status: "Ativo" }, select: { id: true } })) throw new Error("Empresa solicitante indisponível.");
  if (input.eventId && !await tx.culturaEvento.findFirst({ where: { id: input.eventId, active: true }, select: { id: true } })) throw new Error("Evento indisponível.");
  if (await tx.culturaReserva.count({ where: { spaceId: input.spaceId, active: true, status: { in: ["Solicitada", "Aprovada"] }, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } })) throw new Error("Já existe uma reserva para o espaço neste período.");
  return tx.culturaReserva.create({ data: { spaceId: input.spaceId, personId: input.personId, companyId: input.companyId, eventId: input.eventId, startsAt: input.startsAt, endsAt: input.endsAt, purpose: input.purpose, notes: input.protocolNumber ? `Origem: Autoatendimento / ${input.protocolNumber}` : undefined } });
}
