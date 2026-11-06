"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { legislatures, minutes, sessions } from "@/db/schema/chamber";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

const sessionInput = z.object({
  id: z.string().min(1).optional(), updatedAt: z.iso.datetime().optional(),
  numero: z.coerce.number().int().positive(), tipo: z.string().trim().min(1).max(80),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), local: z.string().trim().min(1).max(300),
  status: z.enum(["Agendada", "Em Preparação", "Em Andamento", "Realizada", "Encerrada", "Cancelada"]),
  quorum: z.union([z.literal(""), z.coerce.number().int().nonnegative()]), legislaturaId: z.string().min(1),
});

export async function saveChamberSession(raw: unknown): Promise<{ error?: string }> {
  const parsed = sessionInput.safeParse(raw);
  if (!parsed.success) return { error: "Confira os campos obrigatórios, o número, a data e o quórum da sessão." };
  const input = parsed.data;
  const context = await getTenantContextForModuleOperation("CAMARA", input.id ? "update" : "create");
  const date = new Date(`${input.data}:00-03:00`);
  const civil = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (!Number.isFinite(date.valueOf()) || civil.format(date).replace(" ", "T") !== input.data) return { error: "Informe uma data e um horário válidos." };
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CHAMBER_SESSION_REGISTER'))`);
      const [legislature] = await tx.select().from(legislatures).where(eq(legislatures.id, input.legislaturaId));
      if (!legislature) throw new Error("Legislatura não encontrada.");
      const day = input.data.slice(0, 10);
      if (day < legislature.inicio.toISOString().slice(0, 10) || day > legislature.fim.toISOString().slice(0, 10)) throw new Error("A data da sessão deve pertencer ao período da legislatura.");
      const duplicates = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.numero, input.numero), eq(sessions.legislaturaId, input.legislaturaId)));
      if (duplicates.some(row => row.id !== input.id)) throw new Error("Já existe uma sessão com esse número na legislatura.");
      const values = { numero: input.numero, tipo: input.tipo, data: date, local: input.local, status: input.status, quorum: input.quorum === "" ? null : input.quorum, legislaturaId: input.legislaturaId };
      const [saved] = input.id
        ? await tx.update(sessions).set(values).where(and(eq(sessions.id, input.id), eq(sessions.updatedAt, new Date(input.updatedAt ?? 0)))).returning({ id: sessions.id })
        : await tx.insert(sessions).values(values).returning({ id: sessions.id });
      if (!saved) throw new Error("A sessão foi alterada ou removida. Reabra o cadastro antes de salvar.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CHAMBER_SESSION", targetId: saved.id });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar a sessão." }; }
  revalidatePath("/app-domain/camara/sessoes"); revalidatePath("/app-domain/camara");
  return {};
}

export async function saveChamberMinutes(raw: unknown): Promise<{ error?: string }> {
  const parsed = z.object({ id: z.string().min(1), updatedAt: z.iso.datetime(), numero: z.string().trim().min(1).max(100), conteudo: z.string().trim().min(1).max(100000) }).safeParse(raw);
  if (!parsed.success) return { error: "Informe o número e o conteúdo da ata." };
  const input = parsed.data;
  const context = await getTenantContextForModuleOperation("CAMARA", "update");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [saved] = await tx.update(minutes).set({ numero: input.numero, conteudo: input.conteudo }).where(and(eq(minutes.id, input.id), eq(minutes.updatedAt, new Date(input.updatedAt)), eq(minutes.status, "Rascunho"))).returning({ id: minutes.id });
      if (!saved) throw new Error("A ata foi alterada, removida ou não está mais em rascunho. Reabra o registro.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CHAMBER_MINUTES", targetId: saved.id });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar a ata." }; }
  revalidatePath("/app-domain/camara/sessoes");
  return {};
}
