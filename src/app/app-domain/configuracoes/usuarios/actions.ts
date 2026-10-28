"use server";

import { revalidatePath } from "next/cache";
import { assertAdministratorLifecycleChange, isSystemAdministratorEmail, isSystemAdministratorProfileCode, requiresSecretariatScope, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { AccessError, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { adminAuth } from "@/lib/firebase/server";
import { createFirebaseUserProvisioner } from "@/lib/firebase/user-provisioning";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { countSystemAdministrators, deleteManagedUser, findAccessProfile, findActiveUserEmployee, findManagedUser, findManagedUserLink, saveManagedUser, setManagedUserStatus } from "@/db/repositories/platform/system-administration";

export async function upsertUsuario(data: {
  id?: string;
  nome: string;
  email: string;
  perfilId: string;
  employeeId?: string;
  ativo: boolean;
}) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const database = context.database ?? db;
    const perfil = await findAccessProfile(database, data.perfilId, true);
    if (!perfil) return { error: "Selecione um perfil de acesso ativo." };
    if (isSystemAdministratorProfileCode(perfil.codigo)) {
      return { error: "O perfil técnico do administrador do sistema não pode ser atribuído nesta tela." };
    }

    const email = data.email.trim().toLowerCase();
    if (!data.nome.trim() || !email) return { error: "Nome e e-mail são obrigatórios." };
    if (isSystemAdministratorEmail(email) || isSystemAdministratorProfileCode(perfil.codigo)) {
      return { error: "A conta técnica do administrador do sistema é gerenciada automaticamente." };
    }
    const existing = data.id
      ? await findManagedUser(database, data.id)
      : null;
    if (data.id && !existing) return { error: "Usuário não encontrado." };
    if (existing && (isSystemAdministratorEmail(existing.email) || isSystemAdministratorProfileCode(existing.perfil.codigo))) {
      return { error: "A conta técnica do administrador do sistema não pode ser alterada nesta tela." };
    }
    const duplicateEmailUser = await findManagedUserLink(database, "email", email);
    if (duplicateEmailUser && duplicateEmailUser.id !== existing?.id) return { error: "Já existe um usuário com este e-mail." };

    const employeeId = data.employeeId || null;
    if (requiresSecretariatScope(perfil.codigo) && !employeeId) {
      return { error: "Este perfil exige vínculo com um servidor lotado em uma secretaria." };
    }
    if (employeeId) {
      const employee = await findActiveUserEmployee(database, employeeId);
      if (!employee) return { error: "Selecione um servidor ativo para vincular ao usuário." };
      if (requiresSecretariatScope(perfil.codigo) && !employee.secretariatId) {
        return { error: "O servidor selecionado precisa estar lotado em uma secretaria para utilizar este perfil." };
      }

      const linkedUser = await findManagedUserLink(database, "employeeId", employeeId);
      if (linkedUser && linkedUser.id !== existing?.id) {
        return { error: "Este servidor já está vinculado a outro usuário." };
      }
    }

    if (existing) {
      const activeSystemAdministratorCount = await countSystemAdministrators(database, SYSTEM_ADMIN_PROFILE_CODE);
      try {
        assertAdministratorLifecycleChange({
          actorUsuarioId: context.user.id,
          targetUsuarioId: existing.id,
          targetIsSystemAdministrator: isSystemAdministratorProfileCode(existing.perfil.codigo),
          targetWillBeSystemAdministrator: isSystemAdministratorProfileCode(perfil.codigo),
          targetWillBeActive: data.ativo,
          activeSystemAdministratorCount,
        });
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Não foi possível alterar o acesso administrativo." };
      }
    }

    const provisioner = createFirebaseUserProvisioner(adminAuth);
    const { firebaseUid } = await provisioner.provision({
      email,
      displayName: data.nome.trim(),
      disabled: !data.ativo,
      firebaseUid: existing?.firebaseUid,
    });

    await withDatabaseTransaction(databaseConnection, tx => saveManagedUser(tx, { nome: data.nome.trim(), email, firebaseUid, perfilId: data.perfilId, employeeId, ativo: data.ativo }, context.user.id, existing?.id));
    revalidatePath("/configuracoes/usuarios");
    revalidatePath("/portal-servidor");
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: error instanceof AccessError ? error.message : "Não foi possível salvar o usuário. Tente novamente." };
  }
}

export async function toggleUsuarioStatus(id: string, ativo: boolean) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const database = context.database ?? db;
    const target = await findManagedUser(database, id);
    if (!target) return { error: "Usuário não encontrado." };
    if (isSystemAdministratorEmail(target.email) || isSystemAdministratorProfileCode(target.perfil.codigo)) {
      return { error: "A conta técnica do administrador do sistema não pode ser desativada." };
    }
    const activeSystemAdministratorCount = await countSystemAdministrators(database, SYSTEM_ADMIN_PROFILE_CODE);
    try {
      assertAdministratorLifecycleChange({
        actorUsuarioId: context.user.id,
        targetUsuarioId: target.id,
        targetIsSystemAdministrator: isSystemAdministratorProfileCode(target.perfil.codigo),
        targetWillBeSystemAdministrator: isSystemAdministratorProfileCode(target.perfil.codigo),
        targetWillBeActive: ativo,
        activeSystemAdministratorCount,
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível alterar o acesso administrativo." };
    }
    const provisioner = createFirebaseUserProvisioner(adminAuth);
    const { firebaseUid } = await provisioner.provision({ email: target.email, displayName: target.nome, disabled: !ativo, firebaseUid: target.firebaseUid });
    await withDatabaseTransaction(databaseConnection, tx => setManagedUserStatus(tx, id, ativo, firebaseUid, context.user.id));
    revalidatePath("/configuracoes/usuarios");
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: error instanceof AccessError ? error.message : "Não foi possível alterar o status do usuário. Tente novamente." };
  }
}

export async function deleteUsuario(id: string) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const database = context.database ?? db;
    const target = await findManagedUser(database, id);
    if (!target) return { error: "Usuário não encontrado." };
    if (isSystemAdministratorEmail(target.email) || isSystemAdministratorProfileCode(target.perfil.codigo)) {
      return { error: "A conta técnica do administrador do sistema não pode ser excluída." };
    }
    if (target.id === context.user.id) return { error: "Você não pode excluir seu próprio usuário." };

    const activeSystemAdministratorCount = await countSystemAdministrators(database, SYSTEM_ADMIN_PROFILE_CODE);
    try {
      assertAdministratorLifecycleChange({
        actorUsuarioId: context.user.id,
        targetUsuarioId: target.id,
        targetIsSystemAdministrator: isSystemAdministratorProfileCode(target.perfil.codigo),
        targetWillBeSystemAdministrator: false,
        targetWillBeActive: false,
        activeSystemAdministratorCount,
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível alterar o acesso administrativo." };
    }

    await withDatabaseTransaction(databaseConnection, tx => deleteManagedUser(tx, id, context.user.id));
    revalidatePath("/configuracoes/usuarios");
    return { error: null };
  } catch (error) {
    console.error(error);
    if (["23503", "23001"].includes(getPostgresError(error)?.code ?? "")) {
      return { error: "Não é possível excluir este usuário porque ele possui histórico ou registros vinculados. Inative-o para revogar o acesso." };
    }
    return { error: error instanceof AccessError ? error.message : "Não foi possível excluir o usuário. Tente novamente." };
  }
}
