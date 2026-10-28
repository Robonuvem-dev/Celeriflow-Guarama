"use server";
import { createCultureSpaceReservation } from "@/db/repositories/culture/reservations";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, eq, gt, sql } from "drizzle-orm";
import { culturalAgents, culturalEvents, culturalProjects, culturalReservations, culturalSpaces } from "@/db/schema/culture";
import { people } from "@/db/schema/people";
import { companies, realEstates } from "@/db/schema/registry";
import { employees } from "@/db/schema/administration";
import { PersistenceError, translateDatabaseError } from "@/db/errors";
import { z } from "zod";
import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

async function authorize(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("CULTURA", operation);
}

type ActionResult = { error?: string };

const text = z.string().trim().min(1, "Campo obrigatório.");
const agentTypes = ["Artista Individual", "Grupo Cultural", "Produtor", "Coletivo"] as const;
const spaceTypes = ["Centro Cultural", "Quadra", "Teatro", "Praça", "Biblioteca"] as const;

function databaseError(error: unknown, fallback: string) {
  const translated = translateDatabaseError(error);
  if (translated instanceof PersistenceError && translated.kind === "unique") return "Já existe um registro com esses dados.";
  return fallback;
}

function revalidate(path: string) {
  revalidatePath(path);
  revalidatePath("/cultura");
}

export async function createAgente(data: { nome: string; tipo: string; segmento: string; personId?: string; companyId?: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ nome: text, tipo: z.enum(agentTypes), segmento: text, personId: z.string().trim().optional(), companyId: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (Boolean(parsed.data.personId) === Boolean(parsed.data.companyId)) return { error: "Vincule o agente a uma pessoa ou empresa do Cadastro Geral." };
  const [person, company] = await Promise.all([
    parsed.data.personId ? db.select({ id: people.id, cpf: people.cpf, phonePrimary: people.phonePrimary, email: people.email }).from(people).where(eq(people.id, parsed.data.personId)).then(rows => rows[0]) : null,
    parsed.data.companyId ? db.select({ id: companies.id, cnpj: companies.cnpj, emailPrimary: companies.emailPrimary }).from(companies).where(eq(companies.id, parsed.data.companyId)).then(rows => rows[0]) : null,
  ]);
  if ((parsed.data.personId && !person) || (parsed.data.companyId && !company)) return { error: "Cadastro Geral não encontrado." };
  try {
    await db.insert(culturalAgents).values({ nome: parsed.data.nome, tipo: parsed.data.tipo, segmento: parsed.data.segmento, cpfCnpj: person?.cpf ?? company?.cnpj, telefone: person?.phonePrimary, email: person?.email ?? company?.emailPrimary, personId: person?.id, companyId: company?.id });
  } catch (error) {
    return { error: databaseError(error, "Não foi possível cadastrar o agente cultural.") };
  }
  revalidate("/cultura/gestao-cultural");
  return {};
}

export async function inactivateAgente(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Agente inválido." };
  try { const rows = await db.update(culturalAgents).set({ active: false, status: "Inativo" }).where(eq(culturalAgents.id, id)).returning({ id: culturalAgents.id }); if (!rows.length) throw new Error("Agente não encontrado."); }
  catch (error) { return { error: databaseError(error, "Não foi possível inativar o agente.") }; }
  revalidate("/cultura/gestao-cultural");
  return {};
}

export async function createEspaco(data: { nome: string; tipo: string; capacidade?: number; realEstateId?: string; assetId?: string; responsibleEmployeeId?: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ nome: text, tipo: z.enum(spaceTypes), capacidade: z.number().int().positive().optional(), realEstateId: z.string().trim().optional(), assetId: z.string().trim().optional(), responsibleEmployeeId: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [property, asset, employee] = await Promise.all([
    parsed.data.realEstateId ? db.select({ id: realEstates.id }).from(realEstates).where(eq(realEstates.id, parsed.data.realEstateId)).then(rows => rows[0]) : null,
    parsed.data.assetId ? db.execute<{ id: string; status: string }>(sql`SELECT id, status FROM "Asset" WHERE id = ${parsed.data.assetId}`).then(result => result.rows[0]) : null,
    parsed.data.responsibleEmployeeId ? db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, parsed.data.responsibleEmployeeId), eq(employees.isActive, true))).then(rows => rows[0]) : null,
  ]);
  if ((parsed.data.realEstateId && !property) || (parsed.data.assetId && (!asset || asset.status === "Baixado" || asset.status === "Inativo")) || (parsed.data.responsibleEmployeeId && !employee)) return { error: "Uma das referências informadas não está disponível." };
  try {
    await db.insert(culturalSpaces).values({ nome: parsed.data.nome, tipo: parsed.data.tipo, capacidade: parsed.data.capacidade, realEstateId: property?.id, assetId: asset?.id, responsibleEmployeeId: employee?.id });
  } catch (error) { return { error: databaseError(error, "Não foi possível cadastrar o espaço.") }; }
  revalidate("/cultura/gestao-cultural");
  revalidate("/cultura/espacos-reservas");
  return {};
}

export async function inactivateEspaco(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Espaço inválido." };
  const [hasFutureReservation] = await db.select({ id: culturalReservations.id }).from(culturalReservations).where(and(eq(culturalReservations.spaceId, id), eq(culturalReservations.active, true), eq(culturalReservations.status, "Aprovada"), gt(culturalReservations.endsAt, new Date()))).limit(1);
  if (hasFutureReservation) return { error: "Não é possível inativar um espaço com reserva aprovada futura." };
  try { const rows = await db.update(culturalSpaces).set({ active: false, status: "Indisponível" }).where(eq(culturalSpaces.id, id)).returning({ id: culturalSpaces.id }); if (!rows.length) throw new Error("Espaço não encontrado."); }
  catch (error) { return { error: databaseError(error, "Não foi possível inativar o espaço.") }; }
  revalidate("/cultura/gestao-cultural");
  revalidate("/cultura/espacos-reservas");
  return {};
}

export async function createEvento(data: { nome: string; tipo: string; startsAt: string; endsAt?: string; spaceId?: string; responsibleEmployeeId?: string; projectId?: string; publicoAlvo?: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ nome: text, tipo: text, startsAt: text, endsAt: z.string().trim().optional(), spaceId: z.string().trim().optional(), responsibleEmployeeId: z.string().trim().optional(), projectId: z.string().trim().optional(), publicoAlvo: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt))) return { error: "Informe um período válido para o evento." };
  const [space, employee, project] = await Promise.all([
    parsed.data.spaceId ? db.select({ id: culturalSpaces.id }).from(culturalSpaces).where(and(eq(culturalSpaces.id, parsed.data.spaceId), eq(culturalSpaces.active, true))).then(rows => rows[0]) : null,
    parsed.data.responsibleEmployeeId ? db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, parsed.data.responsibleEmployeeId), eq(employees.isActive, true))).then(rows => rows[0]) : null,
    parsed.data.projectId ? db.select({ id: culturalProjects.id }).from(culturalProjects).where(and(eq(culturalProjects.id, parsed.data.projectId), eq(culturalProjects.active, true))).then(rows => rows[0]) : null,
  ]);
  if ((parsed.data.spaceId && !space) || (parsed.data.responsibleEmployeeId && !employee) || (parsed.data.projectId && !project)) return { error: "Uma das referências informadas não está disponível." };
  try {
    await db.insert(culturalEvents).values({ nome: parsed.data.nome, tipo: parsed.data.tipo, data: startsAt, startsAt, endsAt, spaceId: space?.id, responsibleEmployeeId: employee?.id, projectId: project?.id, publicoAlvo: parsed.data.publicoAlvo || null, local: null });
  } catch (error) { return { error: databaseError(error, "Não foi possível cadastrar o evento.") }; }
  revalidate("/cultura/eventos");
  return {};
}

export async function cancelEvento(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Evento inválido." };
  try { const rows = await db.update(culturalEvents).set({ status: "Cancelado", active: false }).where(eq(culturalEvents.id, id)).returning({ id: culturalEvents.id }); if (!rows.length) throw new Error("Evento não encontrado."); }
  catch (error) { return { error: databaseError(error, "Não foi possível cancelar o evento.") }; }
  revalidate("/cultura/eventos");
  return {};
}

export async function createReserva(data: { spaceId: string; personId?: string; companyId?: string; eventId?: string; startsAt: string; endsAt: string; purpose: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ spaceId: text, personId: z.string().trim().optional(), companyId: z.string().trim().optional(), eventId: z.string().trim().optional(), startsAt: text, endsAt: text, purpose: text }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (Boolean(parsed.data.personId) === Boolean(parsed.data.companyId)) return { error: "Informe uma pessoa ou empresa solicitante." };
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return { error: "Informe um período de reserva válido." };
  const [space, person, company, event] = await Promise.all([
    db.select({ id: culturalSpaces.id }).from(culturalSpaces).where(and(eq(culturalSpaces.id, parsed.data.spaceId), eq(culturalSpaces.active, true), eq(culturalSpaces.status, "Disponível"))).then(rows => rows[0]),
    parsed.data.personId ? db.select({ id: people.id }).from(people).where(eq(people.id, parsed.data.personId)).then(rows => rows[0]) : null,
    parsed.data.companyId ? db.select({ id: companies.id }).from(companies).where(eq(companies.id, parsed.data.companyId)).then(rows => rows[0]) : null,
    parsed.data.eventId ? db.select({ id: culturalEvents.id }).from(culturalEvents).where(and(eq(culturalEvents.id, parsed.data.eventId), eq(culturalEvents.active, true))).then(rows => rows[0]) : null,
  ]);
  if (!space || (parsed.data.personId && !person) || (parsed.data.companyId && !company) || (parsed.data.eventId && !event)) return { error: "Uma das referências informadas não está disponível." };
  try { await withDatabaseTransaction(databaseConnection, tx => createCultureSpaceReservation(tx, { spaceId: space.id, personId: person?.id, companyId: company?.id, eventId: event?.id, startsAt, endsAt, purpose: parsed.data.purpose })); }
  catch (error) { return { error: error instanceof Error ? error.message : databaseError(error, "Não foi possível solicitar a reserva.") }; }
  revalidate("/cultura/espacos-reservas");
  return {};
}
