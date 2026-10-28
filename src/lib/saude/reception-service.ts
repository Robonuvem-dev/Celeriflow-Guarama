import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema/health-registration";
import { healthObservations } from "@/db/schema/health-care";
import { healthRiskProtocols, healthDestinations, healthRooms, healthReceptions, healthBeds, healthBedOccupancies } from "@/db/schema/health-reception";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";

export class ReceptionError extends Error {}

const RISK_LABELS = ["Não urgente", "Pouco urgente", "Urgente", "Muita urgência", "Emergência"];
const RISK_COLORS = ["#2563eb", "#16a34a", "#eab308", "#f97316", "#dc2626"];
const RISK_WAITS = [240, 120, 60, 30, 10];

// Classificação de risco configurável (níveis, cores, tempos). Não
// incorpora protocolo clínico oficial; a comissão configura os valores.
export async function ensureRiskProtocols(context: AppContext) {
  const database = context.database ?? db;
  for (let level = 1; level <= 5; level += 1) {
    await database.insert(healthRiskProtocols).values({ level, label: `Nível ${6 - level} · ${RISK_LABELS[5 - level]}`, colorHex: RISK_COLORS[5 - level], maxWaitMinutes: RISK_WAITS[5 - level] }).onConflictDoNothing({ target: healthRiskProtocols.level });
  }
  return database.select().from(healthRiskProtocols).where(eq(healthRiskProtocols.isActive, true)).orderBy(asc(healthRiskProtocols.level));
}

export async function saveRiskProtocol(context: AppContext, raw: unknown) {
  const input = z.object({ level: z.number().int().min(1).max(5), label: z.string().trim().min(2).max(80), colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/), maxWaitMinutes: z.number().int().min(0).max(1440) }).strict().parse(raw);
  const [protocol] = await (context.database ?? db).insert(healthRiskProtocols).values({ ...input, isActive: true }).onConflictDoUpdate({ target: healthRiskProtocols.level, set: { label: input.label, colorHex: input.colorHex, maxWaitMinutes: input.maxWaitMinutes, isActive: true } }).returning({ id: healthRiskProtocols.id });
  return protocol;
}

export async function saveDestination(context: AppContext, raw: unknown) {
  const input = z.object({ name: z.string().trim().min(2).max(120) }).strict().parse(raw);
  const name = input.name;
  const [destination] = await (context.database ?? db).insert(healthDestinations).values({ name }).onConflictDoUpdate({ target: healthDestinations.name, set: { isActive: true } }).returning({ id: healthDestinations.id });
  return destination;
}

export async function saveRoom(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), name: z.string().trim().min(2).max(120), kind: z.enum(["Atendimento", "Triagem"]).default("Atendimento") }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const [room] = await (context.database ?? db).insert(healthRooms).values({ unitId: input.unitId, name: input.name.trim(), kind: input.kind }).onConflictDoUpdate({ target: [healthRooms.unitId, healthRooms.name], set: { kind: input.kind, isActive: true } }).returning({ id: healthRooms.id });
  return room;
}

const receptionSchema = z.object({
  patientId: z.string().min(1).nullable().optional(),
  unidentifiedName: z.string().trim().max(200).nullable().optional(),
  unitId: z.string().min(1),
  priorityFlags: z.array(z.enum(["GESTANTE", "IDOSO", "DEFICIENTE"])).max(3).default([]),
  companionName: z.string().trim().max(200).nullable().optional(),
  companionKinship: z.string().trim().max(60).nullable().optional(),
  companionPhone: z.string().trim().max(30).nullable().optional(),
  transportMode: z.enum(["Meios próprios", "Socorro"]).nullable().optional(),
  agreement: z.string().trim().max(120).nullable().optional(),
  roomId: z.string().min(1).nullable().optional(),
  destinationId: z.string().min(1).nullable().optional(),
}).strict();

export async function createReception(context: AppContext, raw: unknown) {
  const input = receptionSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (!input.patientId && !(input.unidentifiedName || "").trim()) throw new ReceptionError("Identifique o paciente ou registre atendimento sem identificação.");
  const database = context.database ?? db;
  if (input.patientId && !(await database.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1)).length) throw new ReceptionError("Paciente ativo não encontrado.");
  if (input.roomId) {
    const [room] = await database.select({ unitId: healthRooms.unitId, isActive: healthRooms.isActive }).from(healthRooms).where(eq(healthRooms.id, input.roomId)).limit(1);
    if (!room?.isActive || room.unitId !== input.unitId) throw new ReceptionError("Sala inválida para a unidade.");
  }
  const [reception] = await database.insert(healthReceptions).values({ patientId: input.patientId || null, unidentifiedName: input.patientId ? null : (input.unidentifiedName || "").trim(), unitId: input.unitId, priorityFlags: input.priorityFlags.join(","), companionName: input.companionName || null, companionKinship: input.companionKinship || null, companionPhone: input.companionPhone || null, transportMode: input.transportMode || null, agreement: input.agreement || null, roomId: input.roomId || null, destinationId: input.destinationId || null, createdByUsuarioId: context.user.id }).returning({ id: healthReceptions.id });
  return reception;
}

export async function linkReceptionPatient(context: AppContext, receptionId: string, patientId: string) {
  return runHealthTransaction(context, async tx => {
  await tx.execute(sql`SELECT id FROM "HealthReception" WHERE id=${receptionId} FOR UPDATE`);
  const [reception] = await tx.select({ id: healthReceptions.id, unitId: healthReceptions.unitId, patientId: healthReceptions.patientId }).from(healthReceptions).where(eq(healthReceptions.id, receptionId)).limit(1);
  if (!reception) throw new ReceptionError("Recepção não encontrada.");
  assertHealthUnitAccess(context.user, reception.unitId);
  if (reception.patientId) throw new ReceptionError("Recepção já vinculada.");
  if (!(await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, patientId), eq(patients.status, "Ativo"))).limit(1)).length) throw new ReceptionError("Paciente ativo não encontrado.");
  const [linked] = await tx.update(healthReceptions).set({ patientId, unidentifiedName: null }).where(eq(healthReceptions.id, receptionId)).returning({ id: healthReceptions.id });
  return linked;
  });
}

export async function transitionReception(context: AppContext, receptionId: string, status: string, outcome?: string | null) {
  const target = status.trim();
  if (!["Aguardando", "Em atendimento", "Concluída", "Evadiu-se", "Cancelada"].includes(target)) throw new ReceptionError("Situação inválida.");
  return runHealthTransaction(context, async tx => {
  await tx.execute(sql`SELECT id FROM "HealthReception" WHERE id=${receptionId} FOR UPDATE`);
  const [reception] = await tx.select({ id: healthReceptions.id, unitId: healthReceptions.unitId, status: healthReceptions.status }).from(healthReceptions).where(eq(healthReceptions.id, receptionId)).limit(1);
  if (!reception) throw new ReceptionError("Recepção não encontrada.");
  assertHealthUnitAccess(context.user, reception.unitId);
  if (["Concluída", "Evadiu-se", "Cancelada"].includes(reception.status)) throw new ReceptionError("Recepção já encerrada.");
  const [updated] = await tx.update(healthReceptions).set({ status: target, outcome: outcome?.trim() || null }).where(eq(healthReceptions.id, receptionId)).returning({ id: healthReceptions.id });
  return updated;
  });
}

const bedSchema = z.object({ unitId: z.string().min(1), room: z.string().trim().max(80).nullable().optional(), code: z.string().trim().min(1).max(40) }).strict();

export async function saveBed(context: AppContext, raw: unknown) {
  const input = bedSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const [bed] = await (context.database ?? db).insert(healthBeds).values({ unitId: input.unitId, room: input.room || null, code: input.code.trim().toUpperCase() }).onConflictDoUpdate({ target: [healthBeds.unitId, healthBeds.code], set: { room: input.room || null } }).returning({ id: healthBeds.id });
  return bed;
}

export async function transitionBed(context: AppContext, bedId: string, status: string) {
  const target = status.trim();
  if (!["Livre", "Ocupado", "Manutenção", "Reservado", "Limpeza"].includes(target)) throw new ReceptionError("Situação do leito inválida.");
  return runHealthTransaction(context, async tx => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${bedId}))`);
  const [bed] = await tx.select({ id: healthBeds.id, unitId: healthBeds.unitId }).from(healthBeds).where(eq(healthBeds.id, bedId)).limit(1);
  if (!bed) throw new ReceptionError("Leito não encontrado.");
  assertHealthUnitAccess(context.user, bed.unitId);
  if (target === "Ocupado") throw new ReceptionError("Ocupação de leito exige internação do paciente.");
  const open = (await tx.select({ id: healthBedOccupancies.id }).from(healthBedOccupancies).where(and(eq(healthBedOccupancies.bedId, bedId), isNull(healthBedOccupancies.dischargedAt))).limit(1)).length;
  if (open > 0 && target !== "Ocupado") throw new ReceptionError("Leito com internação ativa.");
  const [updated] = await tx.update(healthBeds).set({ status: target }).where(eq(healthBeds.id, bedId)).returning({ id: healthBeds.id });
  return updated;
  });
}

export async function admitBed(context: AppContext, raw: unknown) {
  const input = z.object({ bedId: z.string().min(1), patientId: z.string().min(1), notes: z.string().trim().max(1000).nullable().optional() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.bedId}))`);
  const [bed] = await tx.select({ id: healthBeds.id, unitId: healthBeds.unitId, status: healthBeds.status }).from(healthBeds).where(eq(healthBeds.id, input.bedId)).limit(1);
  if (!bed) throw new ReceptionError("Leito não encontrado.");
  assertHealthUnitAccess(context.user, bed.unitId);
  if (bed.status !== "Livre") throw new ReceptionError("Somente leitos livres recebem internação.");
  if (!(await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1)).length) throw new ReceptionError("Paciente ativo não encontrado.");
    if ((await tx.select({ id: healthBedOccupancies.id }).from(healthBedOccupancies).where(and(eq(healthBedOccupancies.bedId, input.bedId), isNull(healthBedOccupancies.dischargedAt))).limit(1)).length) throw new ReceptionError("Leito ocupado por outra internação.");
    await tx.insert(healthBedOccupancies).values({ bedId: input.bedId, patientId: input.patientId, notes: input.notes || null });
    const [occupied] = await tx.update(healthBeds).set({ status: "Ocupado" }).where(eq(healthBeds.id, input.bedId)).returning({ id: healthBeds.id });
    return occupied;
  });
}

export async function dischargeBed(context: AppContext, occupancyId: string) {
  return runHealthTransaction(context, async tx => {
  const [initial] = await tx.select({ bedId: healthBedOccupancies.bedId }).from(healthBedOccupancies).where(eq(healthBedOccupancies.id, occupancyId)).limit(1);
  if (!initial) throw new ReceptionError("Internação não encontrada ou já encerrada.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${initial.bedId}))`);
  const [occupancy] = await tx.select({ id: healthBedOccupancies.id, bedId: healthBedOccupancies.bedId, dischargedAt: healthBedOccupancies.dischargedAt, bed: { unitId: healthBeds.unitId } }).from(healthBedOccupancies).innerJoin(healthBeds, eq(healthBeds.id, healthBedOccupancies.bedId)).where(eq(healthBedOccupancies.id, occupancyId)).limit(1);
  if (!occupancy || occupancy.dischargedAt) throw new ReceptionError("Internação não encontrada ou já encerrada.");
  assertHealthUnitAccess(context.user, occupancy.bed.unitId);
    await tx.update(healthBedOccupancies).set({ dischargedAt: new Date() }).where(eq(healthBedOccupancies.id, occupancyId));
    const [bed] = await tx.update(healthBeds).set({ status: "Limpeza" }).where(eq(healthBeds.id, occupancy.bedId)).returning({ id: healthBeds.id });
    return bed;
  });
}

const observationSchema = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), bedId: z.string().min(1).nullable().optional(), responsible: z.string().trim().max(200).nullable().optional(), solicitedBy: z.string().trim().max(200).nullable().optional() }).strict();

export async function createObservation(context: AppContext, raw: unknown) {
  const input = observationSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const database = context.database ?? db;
  if (!(await database.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1)).length) throw new ReceptionError("Paciente ativo não encontrado.");
  if (input.bedId && !(await database.select({ id: healthBeds.id }).from(healthBeds).where(and(eq(healthBeds.id, input.bedId), eq(healthBeds.unitId, input.unitId))).limit(1)).length) throw new ReceptionError("Leito inválido para a unidade.");
  const [observation] = await database.insert(healthObservations).values({ patientId: input.patientId, unitId: input.unitId, bedId: input.bedId || null, responsible: input.responsible || null, solicitedBy: input.solicitedBy || null, createdByUsuarioId: context.user.id }).returning({ id: healthObservations.id });
  return observation;
}

export async function transitionObservation(context: AppContext, observationId: string, status: string) {
  const target = status.trim();
  if (!["Em observação", "Alta", "Transferido"].includes(target)) throw new ReceptionError("Situação inválida.");
  return runHealthTransaction(context, async tx => {
  await tx.execute(sql`SELECT id FROM "HealthObservation" WHERE id=${observationId} FOR UPDATE`);
  const [observation] = await tx.select({ id: healthObservations.id, unitId: healthObservations.unitId, status: healthObservations.status }).from(healthObservations).where(eq(healthObservations.id, observationId)).limit(1);
  if (!observation) throw new ReceptionError("Observação não encontrada.");
  assertHealthUnitAccess(context.user, observation.unitId);
  if (observation.status !== "Em observação") throw new ReceptionError("Observação já encerrada.");
  if (target === observation.status) return { id: observation.id };
  const [updated] = await tx.update(healthObservations).set({ status: target, dischargedAt: new Date() }).where(eq(healthObservations.id, observationId)).returning({ id: healthObservations.id });
  return updated;
  });
}
