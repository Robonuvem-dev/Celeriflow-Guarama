"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { normalizeRestrictiveProfilePermissions, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { countProfileUsers, deleteAccessProfile, findAccessProfile, findDuplicateProfileName, saveAccessProfile, setAccessProfileStatus } from "@/db/repositories/platform/system-administration";

const MODULE_CODES = new Set([
  "ADMINISTRACAO", "CADASTROS", "PROCESSOS", "ATENDIMENTO", "TRANSPARENCIA", "TRIBUTACAO", "FINANCEIRO", "COMPRAS", "RH",
  "PORTAL_SERVIDOR", "PATRIMONIO", "EDUCACAO", "SAUDE", "SOCIAL", "MEIO_AMBIENTE", "SANEAMENTO", "OBRAS", "FROTAS", "CULTURA", "CAMARA",
  "SEGURANCA", "CONFIGURACOES", "CEMITERIOS", "ASSINATURA_DIGITAL", "SUPORTE_TECNICO", "PLANEJAMENTO", "SST", "ILUMINACAO_PUBLICA",
]);

function normalizePermissions(value: string | undefined) {
  return normalizeRestrictiveProfilePermissions(value, MODULE_CODES);
}

function createCustomProfileCode() {
  return `CUSTOM_${randomUUID().replaceAll("-", "")}`;
}

export async function upsertPerfil(data: {
  id?: string;
  nome: string;
  descricao: string;
  permissoes?: string;
  ativo: boolean;
}) {
  try {
    const context = await getTenantContextForModuleOperation("CONFIGURACOES", data.id ? "update" : "create");
    const database = context.database ?? db;
    const nome = data.nome.trim();
    if (!nome) return { error: "Informe o nome do perfil." };

    let jsonPermissoes: string;
    try {
      jsonPermissoes = normalizePermissions(data.permissoes);
    } catch {
      return { error: "A matriz de permissões é inválida." };
    }

    const duplicate = await findDuplicateProfileName(database, nome, data.id);
    if (duplicate) return { error: "Já existe um perfil com este nome." };

    if (data.id) {
      const existing = await findAccessProfile(database, data.id);
      if (!existing) return { error: "Perfil não encontrado." };
      if (existing.codigo === SYSTEM_ADMIN_PROFILE_CODE) {
        return { error: "O perfil técnico do administrador do sistema é gerenciado automaticamente." };
      }
      // GED is internal: preserve its existing ACL on the server, never accept
      // grants for this hidden capability from the editable module matrix.
      if (existing.permissoes) {
        const previous = JSON.parse(existing.permissoes);
        const next = JSON.parse(jsonPermissoes);
        if (previous.modules?.DOCUMENTOS) next.modules.DOCUMENTOS = previous.modules.DOCUMENTOS;
        if (previous.modulosBloqueados?.includes("DOCUMENTOS")) next.modulosBloqueados.push("DOCUMENTOS");
        jsonPermissoes = JSON.stringify(next);
      }
      
      await withDatabaseTransaction(databaseConnection, tx => saveAccessProfile(tx, { nome, descricao: data.descricao, permissoes: jsonPermissoes, ativo: data.ativo }, context.user.id, data.id));
    } else {
      await withDatabaseTransaction(databaseConnection, tx => saveAccessProfile(tx, { codigo: createCustomProfileCode(), nome, descricao: data.descricao, permissoes: jsonPermissoes, ativo: data.ativo }, context.user.id));
    }
    revalidatePermissionConsumers();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: error instanceof AccessError ? error.message : "Não foi possível salvar o perfil. Tente novamente." };
  }
}

export async function togglePerfilStatus(id: string, ativo: boolean) {
  try {
    const context = await getTenantContextForModuleOperation("CONFIGURACOES", "update");
    const perfil = await findAccessProfile(context.database ?? db, id);
    if (!perfil) return { error: "Perfil não encontrado." };
    if (perfil.codigo === SYSTEM_ADMIN_PROFILE_CODE) {
      return { error: "O perfil técnico do administrador do sistema é gerenciado automaticamente." };
    }
    await withDatabaseTransaction(databaseConnection, tx => setAccessProfileStatus(tx, id, ativo, context.user.id));
    revalidatePermissionConsumers();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: error instanceof AccessError ? error.message : "Erro ao alterar o status do perfil." };
  }
}

export async function deletePerfil(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("CONFIGURACOES", "delete");
    const database = context.database ?? db;
    const perfil = await findAccessProfile(database, id);
    if (!perfil) return { error: "Perfil não encontrado." };
    if (perfil.codigo === SYSTEM_ADMIN_PROFILE_CODE) {
      return { error: "O perfil do administrador do sistema é protegido e não pode ser excluído." };
    }

    const linkedUsers = await countProfileUsers(database, id);
    if (linkedUsers > 0) {
      return { error: `Não é possível excluir este perfil porque há ${linkedUsers} usuário(s) vinculado(s). Reatribua ou exclua os usuários antes.` };
    }

    await withDatabaseTransaction(databaseConnection, tx => deleteAccessProfile(tx, id, context.user.id));
    revalidatePermissionConsumers();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: error instanceof AccessError ? error.message : "Não foi possível excluir o perfil. Tente novamente." };
  }
}

function revalidatePermissionConsumers() {
  revalidatePath("/configuracoes/perfis");
  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/app-domain/dashboard");
  revalidatePath("/app-domain/planejamento", "layout");
  revalidatePath("/app-domain/sst", "layout");
  revalidatePath("/");
}

