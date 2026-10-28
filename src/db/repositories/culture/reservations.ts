import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { culturalEvents, culturalReservations, culturalSpaces } from "@/db/schema/culture";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import type { CulturalReservation } from "@/lib/contracts/culture";

export type CultureReservationInput = { spaceId: string; personId?: string | null; companyId?: string | null; eventId?: string | null; startsAt: Date; endsAt: Date; purpose: string; protocolNumber?: string };
export async function createCultureSpaceReservation(tx: DatabaseTransaction, input: CultureReservationInput): Promise<CulturalReservation> {
  if (Boolean(input.personId) === Boolean(input.companyId)) throw new Error("Vincule uma pessoa ou empresa solicitante conferida pelo município.");
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime()) || input.endsAt <= input.startsAt) throw new Error("Período de reserva inválido.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CULTURA_RESERVA:${input.spaceId}`}))`);
  const [space] = await tx.select({ id: culturalSpaces.id }).from(culturalSpaces).where(and(eq(culturalSpaces.id, input.spaceId), eq(culturalSpaces.active, true), eq(culturalSpaces.status, "Disponível")));
  if (!space) throw new Error("Espaço indisponível.");
  if (input.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, input.personId), eq(people.status, "Ativo")))).length) throw new Error("Pessoa solicitante indisponível.");
  if (input.companyId && !(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, input.companyId), eq(companies.status, "Ativo")))).length) throw new Error("Empresa solicitante indisponível.");
  if (input.eventId && !(await tx.select({ id: culturalEvents.id }).from(culturalEvents).where(and(eq(culturalEvents.id, input.eventId), eq(culturalEvents.active, true)))).length) throw new Error("Evento indisponível.");
  const collisions = await tx.select({ id: culturalReservations.id }).from(culturalReservations).where(and(eq(culturalReservations.spaceId, input.spaceId), eq(culturalReservations.active, true), inArray(culturalReservations.status, ["Solicitada", "Aprovada"]), lt(culturalReservations.startsAt, input.endsAt), gt(culturalReservations.endsAt, input.startsAt))).limit(1);
  if (collisions.length) throw new Error("Já existe uma reserva para o espaço neste período.");
  const [reservation] = await tx.insert(culturalReservations).values({ spaceId: input.spaceId, personId: input.personId, companyId: input.companyId, eventId: input.eventId, startsAt: input.startsAt, endsAt: input.endsAt, purpose: input.purpose, notes: input.protocolNumber ? `Origem: Autoatendimento / ${input.protocolNumber}` : undefined }).returning();
  return reservation;
}
