"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { parseSocialUnitInput, type SocialUnitInput } from "@/lib/social/unit-input";
import { ZodError } from "zod";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, eq } from "drizzle-orm";
import { employees } from "@/db/schema/administration";
import { socialAttendances, socialBenefits, socialPrograms, socialUnits } from "@/db/schema/social";
import { createLegacyExpenseInTransaction } from "@/lib/financeiro/legacy-expense";
import { findAccessibleSocialAttendance, findSocialAttendanceMutationResult, findSocialUnitDetails, saveSocialFamilyInTransaction, setSocialFamilyStatusInTransaction } from "@/db/repositories/social/operations";

export async function createSocialUnit(data: SocialUnitInput) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const database = context.database ?? db;
    const values = parseSocialUnitInput(data);
    if (values.isConfidential && context.user.profileCode !== SYSTEM_ADMIN_PROFILE_CODE) throw new Error("Somente o administrador configura sigilo de equipamento.");
    const [created] = await database.insert(socialUnits).values({
        ...values,
        addressId: data.addressId,
        realEstateId: data.realEstateId || null,
        managerId: data.managerId || null,
    }).returning({ id: socialUnits.id });
    const unit = await findSocialUnitDetails(database, created.id);
    revalidatePath("/social/unidades");
    return { success: true, data: unit };
  } catch (error) {
    if (error instanceof ZodError) return { success: false, error: error.issues[0].message };
    console.error("Error creating social unit:", error);
    return { success: false, error: "Falha ao criar unidade socioassistencial." };
  }
}

export async function updateSocialUnit(id: string, data: SocialUnitInput) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const database = context.database ?? db;
    const values = parseSocialUnitInput(data);
    if (values.isConfidential !== undefined && context.user.profileCode !== SYSTEM_ADMIN_PROFILE_CODE) {
      const [current] = await database.select({ isConfidential: socialUnits.isConfidential }).from(socialUnits).where(eq(socialUnits.id, id));
      if (!current || current.isConfidential !== values.isConfidential) throw new Error("Somente o administrador configura sigilo de equipamento.");
    }
    const updated = await database.update(socialUnits).set({
        ...values,
        realEstateId: data.realEstateId || null,
        managerId: data.managerId || null,
    }).where(eq(socialUnits.id, id)).returning({ id: socialUnits.id });
    if (!updated.length) throw new Error("Equipamento inexistente.");
    const unit = await findSocialUnitDetails(database, id);
    revalidatePath("/social/unidades");
    return { success: true, data: unit };
  } catch (error) {
    if (error instanceof ZodError) return { success: false, error: error.issues[0].message };
    console.error("Error updating social unit:", error);
    return { success: false, error: "Falha ao atualizar unidade socioassistencial." };
  }
}

export async function toggleSocialUnitStatus(id: string, isActive: boolean) {
  const context = await getTenantContextForModuleOperation("SOCIAL", "update");
  const database = context.database ?? db;
  try {
    const updated = await database.update(socialUnits).set({ isActive }).where(eq(socialUnits.id, id)).returning({ id: socialUnits.id });
    if (!updated.length) throw new Error("Equipamento inexistente.");
    const unit = await findSocialUnitDetails(database, id);
    revalidatePath("/social/unidades");
    return { success: true, data: unit };
  } catch (error) {
    console.error("Error toggling social unit status:", error);
    return { success: false, error: "Falha ao alterar status da unidade." };
  }
}

export async function createFamily(data: { representativeId: string; nis?: string; familyCode?: string; income?: number; perCapitaIncome?: number; vulnerabilities?: string }) {
  await getTenantContextForModuleOperation("SOCIAL", "create");
  try {
    const family = await withDatabaseTransaction(databaseConnection, tx => saveSocialFamilyInTransaction(tx, data));
    revalidatePath("/app-domain/social/familias");
    revalidatePath("/app-domain/cadastros/familias");
    return { success: true, data: family };
  } catch (error) {
    console.error("Error creating family:", error);
    return { success: false, error: "Falha ao cadastrar família." };
  }
}

export async function updateFamily(id: string, data: { representativeId: string; nis?: string; familyCode?: string; income?: number; perCapitaIncome?: number; vulnerabilities?: string }) {
  await getTenantContextForModuleOperation("SOCIAL", "update");
  try {
    const family = await withDatabaseTransaction(databaseConnection, tx => saveSocialFamilyInTransaction(tx, data, id));
    revalidatePath("/app-domain/social/familias");
    revalidatePath("/app-domain/cadastros/familias");
    return { success: true, data: family };
  } catch (error) {
    console.error("Error updating family:", error);
    return { success: false, error: "Falha ao atualizar família." };
  }
}

export async function toggleFamilyStatus(id: string, status: string) {
  await getTenantContextForModuleOperation("SOCIAL", "update");
  try {
    if (!["Ativo", "Inativo"].includes(status)) throw new Error("Status familiar inválido.");
    const family = await withDatabaseTransaction(databaseConnection, tx => setSocialFamilyStatusInTransaction(tx, id, status));
    revalidatePath("/app-domain/social/familias");
    revalidatePath("/app-domain/cadastros/familias");
    return { success: true, data: family };
  } catch (error) {
    console.error("Error toggling family status:", error);
    return { success: false, error: "Falha ao inativar família." };
  }
}

export async function createAttendance(data: { familyId: string; unitId: string; professionalId: string; type: string; description: string; secrecyLevel?: string; personId?: string }) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const database = context.database ?? db;
    const access = await resolveSocialAccess(context);
    assertSocialUnitAccess(access, data.unitId);
    if (!access.administrator && data.professionalId !== access.employeeId) throw new Error("Profissional inválido para o usuário autenticado.");
    if (!data.type.trim() || !data.description.trim()) throw new Error("Tipo e relato são obrigatórios.");
    if (!["Normal", "Restrito", "CREAS"].includes(data.secrecyLevel || "Normal")) throw new Error("Nível de sigilo inválido.");
    if (!(await database.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true)))).length) throw new Error("Equipamento inativo ou inexistente.");
    if (!(await database.select({ id: employees.id }).from(employees).where(and(eq(employees.id, data.professionalId), eq(employees.isActive, true)))).length) throw new Error("Profissional inativo ou inexistente.");
    const [created] = await database.insert(socialAttendances).values({
        familyId: data.familyId,
        unitId: data.unitId,
        professionalId: data.professionalId,
        type: data.type,
        description: data.description,
        secrecyLevel: data.secrecyLevel || "Normal",
        personId: data.personId || null,
        isActive: true,
    }).returning({ id: socialAttendances.id });
    const attendance = await findSocialAttendanceMutationResult(database, created.id);
    revalidatePath("/social/prontuario");
    revalidatePath("/social/atendimentos");
    return { success: true, data: attendance };
  } catch (error) {
    console.error("Error creating attendance:", error);
    return { success: false, error: "Falha ao registrar atendimento." };
  }
}

export async function updateAttendance(id: string, data: { familyId: string; unitId: string; professionalId: string; type: string; description: string; secrecyLevel?: string; personId?: string }) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const database = context.database ?? db;
    const access = await resolveSocialAccess(context);
    const current = await findAccessibleSocialAttendance(database, access, id);
    if (!current) throw new Error("Atendimento não encontrado ou fora do seu acesso.");
    assertSocialUnitAccess(access, current.unitId);
    assertSocialUnitAccess(access, data.unitId);
    if (!access.administrator && (current.professionalId !== access.employeeId || data.professionalId !== access.employeeId)) throw new Error("Somente o profissional responsável pode alterar este atendimento.");
    if (!data.type.trim() || !data.description.trim()) throw new Error("Tipo e relato são obrigatórios.");
    if (!["Normal", "Restrito", "CREAS"].includes(data.secrecyLevel || "Normal")) throw new Error("Nível de sigilo inválido.");
    await database.update(socialAttendances).set({
        familyId: data.familyId,
        unitId: data.unitId,
        professionalId: data.professionalId,
        type: data.type,
        description: data.description,
        secrecyLevel: data.secrecyLevel || "Normal",
        personId: data.personId || null,
    }).where(eq(socialAttendances.id, id));
    const attendance = await findSocialAttendanceMutationResult(database, id);
    revalidatePath("/social/prontuario");
    revalidatePath("/social/atendimentos");
    return { success: true, data: attendance };
  } catch (error) {
    console.error("Error updating attendance:", error);
    return { success: false, error: "Falha ao atualizar atendimento." };
  }
}

export async function createSocialBenefit(data: { name: string; description?: string; isRecurrent: boolean; expense?: { description: string; value: number; appropriationId: string; secretariatId: string } }) {
  await getTenantContextForModuleOperation("SOCIAL", "create");
  try {
    const benefit = await withDatabaseTransaction(databaseConnection, async tx => {
      const [created] = await tx.insert(socialBenefits).values({ name: data.name, description: data.description, isRecurrent: data.isRecurrent }).returning();
      if (data.expense) await createLegacyExpenseInTransaction(tx, { ...data.expense, socialBenefitId: created.id });
      return created;
    });
    revalidatePath("/social/beneficios");
    return { success: true, data: benefit };
  } catch (error) {
    console.error("Error creating benefit:", error);
    return { success: false, error: "Falha ao criar benefício." };
  }
}

export async function createSocialProgram(data: { name: string; sphere: string; description?: string; expense?: { description: string; value: number; appropriationId: string; secretariatId: string } }) {
  await getTenantContextForModuleOperation("SOCIAL", "create");
  try {
    const program = await withDatabaseTransaction(databaseConnection, async tx => {
      const [created] = await tx.insert(socialPrograms).values({ name: data.name, sphere: data.sphere, description: data.description }).returning();
      if (data.expense) await createLegacyExpenseInTransaction(tx, { ...data.expense, socialProgramId: created.id });
      return created;
    });
    revalidatePath("/social/beneficios");
    return { success: true, data: program };
  } catch (error) {
    console.error("Error creating program:", error);
    return { success: false, error: "Falha ao criar programa social." };
  }
}
export async function toggleAttendanceStatus(id: string, isActive: boolean) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const database = context.database ?? db;
    const access = await resolveSocialAccess(context);
    const current = await findAccessibleSocialAttendance(database, access, id);
    if (!current) throw new Error("Atendimento não encontrado ou fora do seu acesso.");
    assertSocialUnitAccess(access, current.unitId);
    if (!access.administrator && current.professionalId !== access.employeeId) throw new Error("Somente o profissional responsável pode inativar este atendimento.");
    await database.update(socialAttendances).set({ isActive }).where(eq(socialAttendances.id, id));
    const attendance = await findSocialAttendanceMutationResult(database, id);
    revalidatePath("/social/prontuario");
    return { success: true, data: attendance };
  } catch (error) {
    console.error("Error toggling attendance status:", error);
    return { success: false, error: "Falha ao inativar atendimento." };
  }
}

export async function createBenefitConcession(data: { benefitId: string; familyId: string; professionalId: string; quantity?: number; value?: number; personId?: string }) {
  try {
    await getTenantContextForModuleOperation("SOCIAL", "create");
    if (!data.benefitId || !data.familyId) return { success: false, error: "Selecione o benefício e a família." };
    return { success: false, error: "Registre a concessão em Requisições e Dispensação para aplicar autorização, estoque, cotas e comprovantes." };
  } catch (error) {
    console.error("Error creating benefit concession:", error);
    return { success: false, error: "Falha ao registrar concessão de benefício." };
  }
}
