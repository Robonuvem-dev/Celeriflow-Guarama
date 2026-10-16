"use server";

import { randomUUID } from "node:crypto";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

async function getTenantPrisma() {
  return (await getTenantContextForSystemAdministration()).prisma;
}

// --- Instância da Prefeitura ---
export async function updateInstancia(id: string, data: {
  nomePrefeitura: string;
  cnpj?: string;
  municipio: string;
  uf: string;
  dominio?: string;
}) {
  const prisma = await getTenantPrisma();
  await prisma.configuracaoInstancia.update({
    where: { id },
    data: {
      nomePrefeitura: data.nomePrefeitura,
      cnpj: data.cnpj || null,
      municipio: data.municipio,
      uf: data.uf,
      dominio: data.dominio || null,
    },
  });
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
  const prisma = await getTenantPrisma();
  await prisma.configuracaoInstancia.create({
    data: {
      nomePrefeitura: data.nomePrefeitura,
      cnpj: data.cnpj || null,
      municipio: data.municipio,
      uf: data.uf,
      dominio: data.dominio || null,
      status: "Ativa",
    },
  });
  revalidatePath("/configuracoes/instancia");
  revalidatePath("/configuracoes");
}

// --- Módulos Contratados ---
export async function toggleModulo(id: string, ativo: boolean) {
  const prisma = await getTenantPrisma();
  const modulo = await prisma.configuracaoModulo.findUnique({ where: { id }, select: { codigo: true } });
  if (!modulo) throw new Error("Módulo não encontrado.");
  if (modulo.codigo === "CONFIGURACOES" && !ativo) throw new Error("O módulo Configurações não pode ser inativado.");
  await prisma.configuracaoModulo.update({
    where: { id },
    data: {
      ativo,
      dataAtivacao: ativo ? new Date() : null,
    },
  });
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
  const prisma = await getTenantPrisma();
  await prisma.configuracaoModulo.create({
    data: {
      nome: data.nome,
      codigo: data.codigo,
      ativo: data.ativo ?? true,
      dataAtivacao: data.ativo === false ? null : new Date(),
    },
  });
  revalidatePath("/configuracoes/modulos");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function ensureDefaultModulos() {
  const prisma = await getTenantPrisma();
  const existing = await prisma.configuracaoModulo.findMany({ select: { codigo: true } });
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
      await prisma.configuracaoModulo.create({
        data: {
          codigo: mod.codigo,
          nome: mod.nome,
          ativo: !inactiveByDefault.has(mod.codigo),
          dataAtivacao: inactiveByDefault.has(mod.codigo) ? null : new Date(),
        },
      });
    }
  }

  for (const mod of defaultModules) {
    await prisma.configuracaoModulo.updateMany({
      where: { codigo: mod.codigo, nome: { not: mod.nome } },
      data: { nome: mod.nome },
    });
  }

  await prisma.configuracaoModulo.updateMany({
    where: {
      codigo: "PATRIMONIO",
      nome: {
        in: [
          "Patrimônio e Almoxarifado",
          "Patrimônio, Almoxarifado & Estoque",
          "Patrimônio, Almoxarifado e Estoque",
        ],
      },
    },
    data: { nome: "Almoxarifado e Patrimônio" },
  });
}

// --- Perfis de Acesso ---
export async function createPerfil(data: {
  nome: string;
  descricao?: string;
  permissoes: string;
}) {
  const prisma = await getTenantPrisma();
  await prisma.configuracaoPerfil.create({
    data: {
      codigo: `CUSTOM_${randomUUID().replaceAll("-", "")}`,
      nome: data.nome,
      descricao: data.descricao || null,
      permissoes: data.permissoes,
      ativo: true,
    },
  });
  revalidatePath("/configuracoes/perfis");
  revalidatePath("/configuracoes");
}

export async function togglePerfil(id: string, ativo: boolean) {
  const prisma = await getTenantPrisma();
  await prisma.configuracaoPerfil.update({
    where: { id },
    data: { ativo },
  });
  revalidatePath("/configuracoes/perfis");
  revalidatePath("/configuracoes");
}
