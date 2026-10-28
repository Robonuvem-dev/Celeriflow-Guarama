"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { councilors, legislatures, propositions, sessions } from "@/db/schema/chamber";

async function getTenantDatabase(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("CAMARA", operation);
  return db;
}

// --- Legislaturas ---
export async function createLegislatura(data: {
  numero: number;
  inicio: Date;
  fim: Date;
}) {
  const database = await getTenantDatabase("create");
  await database.insert(legislatures).values({
      numero: data.numero,
      inicio: data.inicio,
      fim: data.fim,
      status: "Ativa",
  });
  revalidatePath("/app-domain/camara/vereadores");
}

// --- Vereadores ---
export async function createVereador(data: {
  nomeCompleto: string;
  nomeParlamentar: string;
  cpf?: string;
  partido?: string;
  legislaturaId: string;
}) {
  const database = await getTenantDatabase("create");
  await database.insert(councilors).values({
      nomeCompleto: data.nomeCompleto,
      nomeParlamentar: data.nomeParlamentar,
      cpf: data.cpf || null,
      partido: data.partido || null,
      legislaturaId: data.legislaturaId,
      status: "Em Exercício",
  });
  revalidatePath("/app-domain/camara/vereadores");
  revalidatePath("/app-domain/camara");
}

export async function deleteVereador(id: string) {
  const database = await getTenantDatabase("delete");
  const [row] = await database.update(councilors).set({ active: false, status: "Inativo" }).where(eq(councilors.id, id)).returning({ id: councilors.id });
  if (!row) throw new Error("Vereador não encontrado.");
  revalidatePath("/app-domain/camara/vereadores");
  revalidatePath("/app-domain/camara");
}

// --- Sessões ---
export async function createSessao(data: {
  numero: number;
  tipo: string;
  data: Date;
  local: string;
}) {
  const database = await getTenantDatabase("create");
  await database.insert(sessions).values({
      numero: data.numero,
      tipo: data.tipo,
      data: data.data,
      local: data.local,
      status: "Agendada",
  });
  revalidatePath("/app-domain/camara/sessoes");
  revalidatePath("/app-domain/camara");
}

export async function deleteSessao(id: string) {
  const database = await getTenantDatabase("delete");
  const [row] = await database.update(sessions).set({ status: "Cancelada" }).where(eq(sessions.id, id)).returning({ id: sessions.id });
  if (!row) throw new Error("Sessão não encontrada.");
  revalidatePath("/app-domain/camara/sessoes");
  revalidatePath("/app-domain/camara");
}

// --- Proposições ---
export async function createProposicao(data: {
  numero: string;
  tipo: string;
  ementa: string;
  texto?: string;
  autorId: string;
  sessaoId?: string;
}) {
  const database = await getTenantDatabase("create");
  await database.insert(propositions).values({
      numero: data.numero,
      tipo: data.tipo,
      ementa: data.ementa,
      texto: data.texto || null,
      autorId: data.autorId,
      sessaoId: data.sessaoId || null,
      status: "Protocolada",
  });
  revalidatePath("/app-domain/camara/proposicoes");
  revalidatePath("/app-domain/camara");
}

export async function deleteProposicao(id: string) {
  const database = await getTenantDatabase("delete");
  const [row] = await database.update(propositions).set({ status: "Arquivada" }).where(eq(propositions.id, id)).returning({ id: propositions.id });
  if (!row) throw new Error("Proposição não encontrada.");
  revalidatePath("/app-domain/camara/proposicoes");
  revalidatePath("/app-domain/camara");
}
