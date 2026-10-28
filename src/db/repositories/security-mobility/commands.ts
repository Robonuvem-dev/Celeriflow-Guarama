import { eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { mobilityRecords, securityGuards, securityInfractions, securityOccurrences } from "@/db/schema/security-mobility";
import type { SegMobFormData, SegMobKind } from "@/app/app-domain/seguranca/types";

const clean = (value?: string) => value?.trim() || null;
async function nextSecurityCode(tx: DatabaseTransaction, kind: SegMobKind): Promise<string> {
  const year = new Date().getFullYear();
  const settings = {
    guarda: { key: "seguranca-guarda", prefix: "GCM", table: securityGuards, column: securityGuards.matricula },
    ocorrencia: { key: "seguranca-ocorrencia", prefix: "OC", table: securityOccurrences, column: securityOccurrences.numero },
    infracao: { key: "seguranca-infracao", prefix: "AIT", table: securityInfractions, column: securityInfractions.auto },
    registro: { key: "seguranca-registro", prefix: "SEG", table: mobilityRecords, column: mobilityRecords.codigo },
  }[kind];
  // Only these four fixed tables participate. The counter's unique key serializes
  // allocation; both the counter and record roll back together on any failure.
  const pattern = `^${settings.prefix}-${year}-([0-9]+)$`;
  const result = await tx.execute<{ value: number }>(sql`INSERT INTO "SequenceCounter" (id, key, value, "updatedAt")
    SELECT ${createId()}, ${`${settings.key}:${year}`}, COALESCE(MAX((substring(${settings.column} from ${pattern}))::integer), 0) + 1, ${new Date()}
    FROM ${settings.table}
    ON CONFLICT (key) DO UPDATE SET value = "SequenceCounter".value + 1, "updatedAt" = EXCLUDED."updatedAt"
    RETURNING value`);
  return `${settings.prefix}-${year}-${String(result.rows[0].value).padStart(4, "0")}`;
}

export async function saveSecurityItem(tx: DatabaseTransaction, kind: SegMobKind, input: SegMobFormData, id?: string): Promise<void> {
  const data = !id && !input.code.trim() ? { ...input, code: await nextSecurityCode(tx, kind) } : input;
  let rows: Array<{ id: string }> = [];
  if (kind === "guarda") {
    const values = { matricula: data.code.trim(), nome: data.title.trim(), tipo: data.type || "Guarda Municipal", equipe: clean(data.location), status: data.status || "Ativo", isActive: data.isActive };
    rows = id ? await tx.update(securityGuards).set(values).where(eq(securityGuards.id, id)).returning({ id: securityGuards.id }) : await tx.insert(securityGuards).values(values).returning({ id: securityGuards.id });
  }
  if (kind === "ocorrencia") {
    const values = { numero: data.code.trim(), tipo: data.type || "Ocorrencia Administrativa", descricao: data.description?.trim() || data.title.trim(), local: clean(data.location), bairro: clean(data.district), prioridade: data.priority || "Normal", status: data.status || "Registrada", isActive: data.isActive };
    rows = id ? await tx.update(securityOccurrences).set(values).where(eq(securityOccurrences.id, id)).returning({ id: securityOccurrences.id }) : await tx.insert(securityOccurrences).values(values).returning({ id: securityOccurrences.id });
  }
  if (kind === "infracao") {
    const values = { auto: data.code.trim(), data: data.date ? new Date(data.date) : new Date(), placa: data.plate?.trim() || data.title.trim(), tipo: data.type || "Infracao de Transito", local: data.location?.trim() || "Nao informado", valor: data.value ?? null, status: data.status || "Registrado", isActive: data.isActive };
    rows = id ? await tx.update(securityInfractions).set(values).where(eq(securityInfractions.id, id)).returning({ id: securityInfractions.id }) : await tx.insert(securityInfractions).values(values).returning({ id: securityInfractions.id });
  }
  if (kind === "registro") {
    const values = { codigo: data.code.trim(), categoria: data.category || "Registro Operacional", tipo: data.type || "Atividade", titulo: data.title.trim(), descricao: clean(data.description), local: clean(data.location), bairro: clean(data.district), responsavel: clean(data.responsible), prioridade: data.priority || "Normal", status: data.status || "Ativo", dataInicio: data.date ? new Date(data.date) : new Date(), valor: data.value ?? null, placa: clean(data.plate), relatedModule: clean(data.relatedModule), relatedId: clean(data.relatedId), isActive: data.isActive };
    rows = id ? await tx.update(mobilityRecords).set(values).where(eq(mobilityRecords.id, id)).returning({ id: mobilityRecords.id }) : await tx.insert(mobilityRecords).values(values).returning({ id: mobilityRecords.id });
  }
  if (!rows.length) throw new Error("Registro não encontrado.");
}
export async function setSecurityItemActive(tx: DatabaseTransaction, kind: SegMobKind, id: string, isActive: boolean): Promise<void> {
  let rows: Array<{ id: string }> = [];
  if (kind === "guarda") rows = await tx.update(securityGuards).set({ isActive }).where(eq(securityGuards.id, id)).returning({ id: securityGuards.id });
  if (kind === "ocorrencia") rows = await tx.update(securityOccurrences).set({ isActive }).where(eq(securityOccurrences.id, id)).returning({ id: securityOccurrences.id });
  if (kind === "infracao") rows = await tx.update(securityInfractions).set({ isActive }).where(eq(securityInfractions.id, id)).returning({ id: securityInfractions.id });
  if (kind === "registro") rows = await tx.update(mobilityRecords).set({ isActive }).where(eq(mobilityRecords.id, id)).returning({ id: mobilityRecords.id });
  if (!rows.length) throw new Error("Registro não encontrado.");
}
