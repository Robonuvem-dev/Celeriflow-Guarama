"use server";

import { randomUUID } from "node:crypto";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { accessProfiles, modules } from "@/db/schema/identity";
import { systemInstances } from "@/db/schema/instance-configuration";

async function getTenantDatabase() {
  return (await getTenantContextForSystemAdministration()).database ?? db;
}

// --- Instância da Prefeitura ---
export async function updateInstancia(id: string, data: {
  nomePrefeitura: string;
  cnpj?: string;
  municipio: string;
  uf: string;
  dominio?: string;
}) {
  const database = await getTenantDatabase();
  const updated = await database.update(systemInstances).set({
      nomePrefeitura: data.nomePrefeitura,
      cnpj: data.cnpj || null,
      municipio: data.municipio,
      uf: data.uf,
      dominio: data.dominio || null,
  }).where(eq(systemInstances.id, id)).returning({ id: systemInstances.id });
  if (!updated.length) throw new Error("Instância não encontrada.");
  revalidatePath("/configuracoes/instancia");
  revalidatePath("/configuracoes");
}

export async function createInstancia(data: {
  nomePrefeitura: string;
  cnpj?: string;
  municipio: string;
  uf: string;
  dominio?: string;
}) {
  const database = await getTenantDatabase();
  await database.insert(systemInstances).values({
      nomePrefeitura: data.nomePrefeitura,
      cnpj: data.cnpj || null,
      municipio: data.municipio,
      uf: data.uf,
      dominio: data.dominio || null,
      status: "Ativa",
  });
  revalidatePath("/configuracoes/instancia");
  revalidatePath("/configuracoes");
}

// --- Módulos Contratados ---
export async function toggleModulo(id: string, ativo: boolean) {
  const database = await getTenantDatabase();
  const [modulo] = await database.select({ codigo: modules.codigo }).from(modules).where(eq(modules.id, id)).limit(1);
  if (!modulo) throw new Error("Módulo não encontrado.");
  if (modulo.codigo === "CONFIGURACOES" && !ativo) throw new Error("O módulo Configurações não pode ser inativado.");
  const updated = await database.update(modules).set({
      ativo,
      dataAtivacao: ativo ? new Date() : null,
  }).where(eq(modules.id, id)).returning({ id: modules.id });
  if (!updated.length) throw new Error("Módulo não encontrado.");
  revalidatePath("/configuracoes/modulos");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function createModulo(data: {
  nome: string;
  codigo: string;
  ativo?: boolean;
}) {
  const database = await getTenantDatabase();
  await database.insert(modules).values({
      nome: data.nome,
      codigo: data.codigo,
      ativo: data.ativo ?? true,
      dataAtivacao: data.ativo === false ? null : new Date(),
  });
  revalidatePath("/configuracoes/modulos");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function ensureDefaultModulos() {
  const database = await getTenantDatabase();
  const existing = await database.select({ codigo: modules.codigo }).from(modules);
  const existingCodes = new Set(existing.map((m) => m.codigo.toUpperCase()));
  const inactiveByDefault = new Set(["EDUCACAO", "SANEAMENTO", "CULTURA", "SEGURANCA", "MEIO_AMBIENTE"]);

  const defaultModules = [
    { codigo: "ADMINISTRACAO", nome: "Administração" },
    { codigo: "CADASTROS", nome: "Cadastros" },
    { codigo: "PROCESSOS", nome: "Processos e Protocolo" },
    { codigo: "ATENDIMENTO", nome: "Atendimento ao Cidadão" },
    { codigo: "TRANSPARENCIA", nome: "Portal Transparência" },
    { codigo: "TRIBUTACAO", nome: "Tributário" },
    { codigo: "FINANCEIRO", nome: "Financeiro e Contábil" },
    { codigo: "PLANEJAMENTO", nome: "Planejamento e Orçamento" },
    { codigo: "SST", nome: "Segurança e Medicina do Trabalho" },
    { codigo: "COMPRAS", nome: "Compras e Contratos" },
    { codigo: "RH", nome: "RH e Folha" },
    { codigo: "PORTAL_SERVIDOR", nome: "Portal do Servidor" },
    { codigo: "PATRIMONIO", nome: "Almoxarifado e Patrimônio" },
    { codigo: "EDUCACAO", nome: "Educação" },
    { codigo: "SAUDE", nome: "Saúde" },
    { codigo: "SOCIAL", nome: "Assistência Social" },
    { codigo: "MEIO_AMBIENTE", nome: "Meio Ambiente" },
    { codigo: "SANEAMENTO", nome: "Água e Saneamento" },
    { codigo: "OBRAS", nome: "Obras e Construção Civil" },
    { codigo: "ILUMINACAO_PUBLICA", nome: "Iluminação Pública (Iluminaflow)" },
    { codigo: "FROTAS", nome: "Frotas" },
    { codigo: "CULTURA", nome: "Cultura e Lazer" },
    { codigo: "CAMARA", nome: "Câmara Municipal" },
    { codigo: "SEGURANCA", nome: "Segurança e Mobilidade" },
    { codigo: "CEMITERIOS", nome: "Cemitérios" },
    { codigo: "AUDITORIA", nome: "Auditoria" },
    { codigo: "SUPORTE_TECNICO", nome: "Suporte Técnico" },
    { codigo: "CONFIGURACOES", nome: "Configurações" },
  ];

  for (const mod of defaultModules) {
    if (!existingCodes.has(mod.codigo)) {
      await database.insert(modules).values({
          codigo: mod.codigo,
          nome: mod.nome,
          ativo: !inactiveByDefault.has(mod.codigo),
          dataAtivacao: inactiveByDefault.has(mod.codigo) ? null : new Date(),
      });
    }
  }

  for (const mod of defaultModules) {
    await database.update(modules).set({ nome: mod.nome }).where(and(eq(modules.codigo, mod.codigo), ne(modules.nome, mod.nome)));
  }

  await database.update(modules).set({ nome: "Almoxarifado e Patrimônio" }).where(and(eq(modules.codigo, "PATRIMONIO"), inArray(modules.nome, [
          "Patrimônio e Almoxarifado",
          "Patrimônio, Almoxarifado & Estoque",
          "Patrimônio, Almoxarifado e Estoque",
  ])));
}

// --- Perfis de Acesso ---
export async function createPerfil(data: {
  nome: string;
  descricao?: string;
  permissoes: string;
}) {
  const database = await getTenantDatabase();
  await database.insert(accessProfiles).values({
      codigo: `CUSTOM_${randomUUID().replaceAll("-", "")}`,
      nome: data.nome,
      descricao: data.descricao || null,
      permissoes: data.permissoes,
      ativo: true,
  });
  revalidatePath("/configuracoes/perfis");
  revalidatePath("/configuracoes");
}

export async function togglePerfil(id: string, ativo: boolean) {
  const database = await getTenantDatabase();
  const updated = await database.update(accessProfiles).set({ ativo }).where(eq(accessProfiles.id, id)).returning({ id: accessProfiles.id });
  if (!updated.length) throw new Error("Perfil não encontrado.");
  revalidatePath("/configuracoes/perfis");
  revalidatePath("/configuracoes");
}
