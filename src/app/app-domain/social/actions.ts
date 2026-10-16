"use server";

import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { parseSocialUnitInput, type SocialUnitInput } from "@/lib/social/unit-input";
import { ZodError } from "zod";
import { assertSocialUnitAccess, resolveSocialAccess, socialAttendanceWhere } from "@/lib/social/access-policy";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";

async function getTenantPrisma(operation: ModuleOperation) {
  return (await getTenantContextForModuleOperation("SOCIAL", operation)).prisma;
}

export async function createSocialUnit(data: SocialUnitInput) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const { prisma } = context;
    const values = parseSocialUnitInput(data);
    if (values.isConfidential && context.user.profileCode !== SYSTEM_ADMIN_PROFILE_CODE) throw new Error("Somente o administrador configura sigilo de equipamento.");
    const unit = await prisma.socialUnit.create({
      data: {
        ...values,
        addressId: data.addressId,
        realEstateId: data.realEstateId || null,
        managerId: data.managerId || null,
      },
      include: { realEstate: true, manager: true }
    });
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
    const { prisma } = context;
    const values = parseSocialUnitInput(data);
    if (values.isConfidential !== undefined && context.user.profileCode !== SYSTEM_ADMIN_PROFILE_CODE) {
      const current = await prisma.socialUnit.findUnique({ where: { id }, select: { isConfidential: true } });
      if (!current || current.isConfidential !== values.isConfidential) throw new Error("Somente o administrador configura sigilo de equipamento.");
    }
    const unit = await prisma.socialUnit.update({
      where: { id },
      data: {
        ...values,
        realEstateId: data.realEstateId || null,
        managerId: data.managerId || null,
      },
      include: { realEstate: true, manager: true }
    });
    revalidatePath("/social/unidades");
    return { success: true, data: unit };
  } catch (error) {
    if (error instanceof ZodError) return { success: false, error: error.issues[0].message };
    console.error("Error updating social unit:", error);
    return { success: false, error: "Falha ao atualizar unidade socioassistencial." };
  }
}

export async function toggleSocialUnitStatus(id: string, isActive: boolean) {
  const prisma = await getTenantPrisma("update");
  try {
    const unit = await prisma.socialUnit.update({
      where: { id },
      data: { isActive },
      include: { realEstate: true, manager: true }
    });
    revalidatePath("/social/unidades");
    return { success: true, data: unit };
  } catch (error) {
    console.error("Error toggling social unit status:", error);
    return { success: false, error: "Falha ao alterar status da unidade." };
  }
}

export async function createFamily(data: { representativeId: string; nis?: string; familyCode?: string; income?: number; perCapitaIncome?: number; vulnerabilities?: string }) {
  const prisma = await getTenantPrisma("create");
  try {
    const familyCode = data.familyCode?.trim() || null;
    const family = await prisma.$transaction(async (tx) => {
      const person = await tx.person.findFirst({ where: { id: data.representativeId, status: { not: "Inativo" } }, select: { id: true } });
      if (!person) throw new Error("Responsável não encontrado ou inativo.");
      const existingMaster = familyCode ? await tx.family.findUnique({ where: { code: familyCode }, include: { socialProfile: { select: { id: true } } } }) : null;
      if (existingMaster?.socialProfile) throw new Error("O código familiar já está vinculado a outro cadastro social.");
      if (existingMaster?.responsiblePersonId && existingMaster.responsiblePersonId !== data.representativeId) throw new Error("O código familiar pertence a outro responsável.");
      const masterFamily = existingMaster
        ? await tx.family.update({ where: { id: existingMaster.id }, data: { responsiblePersonId: data.representativeId, status: "ATIVA" } })
        : await tx.family.create({ data: { code: familyCode, responsiblePersonId: data.representativeId } });
      await tx.familyMember.upsert({
        where: { familyId_personId: { familyId: masterFamily.id, personId: data.representativeId } },
        update: { isRepresentative: true, status: "ATIVO", leftAt: null },
        create: { familyId: masterFamily.id, personId: data.representativeId, kinship: "RESPONSAVEL", isRepresentative: true },
      });
      return tx.socialFamily.create({
        data: {
          representativeId: data.representativeId,
          masterFamilyId: masterFamily.id,
          nis: data.nis,
          familyCode,
          income: data.income ? Number(data.income) : null,
          perCapitaIncome: data.perCapitaIncome ? Number(data.perCapitaIncome) : null,
          vulnerabilities: data.vulnerabilities,
        },
        include: { representative: true, members: true },
      });
    });
    revalidatePath("/app-domain/social/familias");
    revalidatePath("/app-domain/cadastros/familias");
    return { success: true, data: family };
  } catch (error) {
    console.error("Error creating family:", error);
    return { success: false, error: "Falha ao cadastrar família." };
  }
}

export async function updateFamily(id: string, data: { representativeId: string; nis?: string; familyCode?: string; income?: number; perCapitaIncome?: number; vulnerabilities?: string }) {
  const prisma = await getTenantPrisma("update");
  try {
    const familyCode = data.familyCode?.trim() || null;
    const family = await prisma.$transaction(async (tx) => {
      const current = await tx.socialFamily.findUnique({ where: { id }, select: { masterFamilyId: true } });
      if (!current) throw new Error("Família não encontrada.");
      const person = await tx.person.findFirst({ where: { id: data.representativeId, status: { not: "Inativo" } }, select: { id: true } });
      if (!person) throw new Error("Responsável não encontrado ou inativo.");
      let masterFamilyId = current.masterFamilyId;
      if (!masterFamilyId && familyCode) {
        const candidate = await tx.family.findUnique({ where: { code: familyCode }, include: { socialProfile: { select: { id: true } } } });
        if (candidate?.socialProfile && candidate.socialProfile.id !== id) throw new Error("O código familiar já está vinculado a outro cadastro social.");
        if (candidate?.responsiblePersonId && candidate.responsiblePersonId !== data.representativeId) throw new Error("O código familiar pertence a outro responsável.");
        masterFamilyId = candidate?.id || null;
      }
      const masterFamily = masterFamilyId
        ? await tx.family.update({ where: { id: masterFamilyId }, data: { code: familyCode, responsiblePersonId: data.representativeId, status: "ATIVA" } })
        : await tx.family.create({ data: { code: familyCode, responsiblePersonId: data.representativeId } });
      await tx.familyMember.updateMany({ where: { familyId: masterFamily.id, isRepresentative: true, personId: { not: data.representativeId } }, data: { isRepresentative: false } });
      await tx.familyMember.upsert({
        where: { familyId_personId: { familyId: masterFamily.id, personId: data.representativeId } },
        update: { isRepresentative: true, status: "ATIVO", leftAt: null },
        create: { familyId: masterFamily.id, personId: data.representativeId, kinship: "RESPONSAVEL", isRepresentative: true },
      });
      return tx.socialFamily.update({
        where: { id },
        data: {
          representativeId: data.representativeId,
          masterFamilyId: masterFamily.id,
          nis: data.nis,
          familyCode,
          income: data.income ? Number(data.income) : null,
          perCapitaIncome: data.perCapitaIncome ? Number(data.perCapitaIncome) : null,
          vulnerabilities: data.vulnerabilities,
        },
        include: { representative: true, members: true },
      });
    });
    revalidatePath("/app-domain/social/familias");
    revalidatePath("/app-domain/cadastros/familias");
    return { success: true, data: family };
  } catch (error) {
    console.error("Error updating family:", error);
    return { success: false, error: "Falha ao atualizar família." };
  }
}

export async function toggleFamilyStatus(id: string, status: string) {
  const prisma = await getTenantPrisma("update");
  try {
    if (!["Ativo", "Inativo"].includes(status)) throw new Error("Status familiar inválido.");
    const family = await prisma.$transaction(async (tx) => {
      const updated = await tx.socialFamily.update({
        where: { id },
        data: { status },
        include: { representative: true, members: true, masterFamily: { select: { id: true, healthProfile: { select: { isActive: true } } } } },
      });
      if (updated.masterFamily) {
        const keepActive = status === "Ativo" || updated.masterFamily.healthProfile?.isActive === true;
        await tx.family.update({ where: { id: updated.masterFamily.id }, data: { status: keepActive ? "ATIVA" : "INATIVA" } });
      }
      return updated;
    });
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
    const { prisma } = context;
    const access = await resolveSocialAccess(context);
    assertSocialUnitAccess(access, data.unitId);
    if (!access.administrator && data.professionalId !== access.employeeId) throw new Error("Profissional inválido para o usuário autenticado.");
    if (!data.type.trim() || !data.description.trim()) throw new Error("Tipo e relato são obrigatórios.");
    if (!["Normal", "Restrito", "CREAS"].includes(data.secrecyLevel || "Normal")) throw new Error("Nível de sigilo inválido.");
    if (!await prisma.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } })) throw new Error("Equipamento inativo ou inexistente.");
    if (!await prisma.employee.findFirst({ where: { id: data.professionalId, isActive: true } })) throw new Error("Profissional inativo ou inexistente.");
    const attendance = await prisma.socialAttendance.create({
      data: {
        familyId: data.familyId,
        unitId: data.unitId,
        professionalId: data.professionalId,
        type: data.type,
        description: data.description,
        secrecyLevel: data.secrecyLevel || "Normal",
        personId: data.personId || null,
        isActive: true,
      },
      include: { family: true, person: true, professional: true, unit: true }
    });
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
    const { prisma } = context;
    const access = await resolveSocialAccess(context);
    const current = await prisma.socialAttendance.findFirst({ where: { AND: [{ id }, socialAttendanceWhere(access)] } });
    if (!current) throw new Error("Atendimento não encontrado ou fora do seu acesso.");
    assertSocialUnitAccess(access, current.unitId);
    assertSocialUnitAccess(access, data.unitId);
    if (!access.administrator && (current.professionalId !== access.employeeId || data.professionalId !== access.employeeId)) throw new Error("Somente o profissional responsável pode alterar este atendimento.");
    if (!data.type.trim() || !data.description.trim()) throw new Error("Tipo e relato são obrigatórios.");
    if (!["Normal", "Restrito", "CREAS"].includes(data.secrecyLevel || "Normal")) throw new Error("Nível de sigilo inválido.");
    const attendance = await prisma.socialAttendance.update({
      where: { id },
      data: {
        familyId: data.familyId,
        unitId: data.unitId,
        professionalId: data.professionalId,
        type: data.type,
        description: data.description,
        secrecyLevel: data.secrecyLevel || "Normal",
        personId: data.personId || null,
      },
      include: { family: true, person: true, professional: true, unit: true }
    });
    revalidatePath("/social/prontuario");
    revalidatePath("/social/atendimentos");
    return { success: true, data: attendance };
  } catch (error) {
    console.error("Error updating attendance:", error);
    return { success: false, error: "Falha ao atualizar atendimento." };
  }
}

export async function createSocialBenefit(data: { name: string; description?: string; isRecurrent: boolean; expense?: { description: string; value: number; appropriationId: string; secretariatId: string } }) {
  const prisma = await getTenantPrisma("create");
  try {
    const benefit = await prisma.socialBenefit.create({
      data: {
        name: data.name,
        description: data.description,
        isRecurrent: data.isRecurrent,
        expenses: data.expense ? {
          create: {
            description: data.expense.description,
            value: Number(data.expense.value),
            appropriationId: data.expense.appropriationId,
            secretariatId: data.expense.secretariatId,
            status: "Empenhada",
          }
        } : undefined
      },
    });
    revalidatePath("/social/beneficios");
    return { success: true, data: benefit };
  } catch (error) {
    console.error("Error creating benefit:", error);
    return { success: false, error: "Falha ao criar benefício." };
  }
}

export async function createSocialProgram(data: { name: string; sphere: string; description?: string; expense?: { description: string; value: number; appropriationId: string; secretariatId: string } }) {
  const prisma = await getTenantPrisma("create");
  try {
    const program = await prisma.socialProgram.create({
      data: {
        name: data.name,
        sphere: data.sphere,
        description: data.description,
        expenses: data.expense ? {
          create: {
            description: data.expense.description,
            value: Number(data.expense.value),
            appropriationId: data.expense.appropriationId,
            secretariatId: data.expense.secretariatId,
            status: "Empenhada",
          }
        } : undefined
      },
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
    const { prisma } = context;
    const access = await resolveSocialAccess(context);
    const current = await prisma.socialAttendance.findFirst({ where: { AND: [{ id }, socialAttendanceWhere(access)] } });
    if (!current) throw new Error("Atendimento não encontrado ou fora do seu acesso.");
    assertSocialUnitAccess(access, current.unitId);
    if (!access.administrator && current.professionalId !== access.employeeId) throw new Error("Somente o profissional responsável pode inativar este atendimento.");
    const attendance = await prisma.socialAttendance.update({
      where: { id },
      data: { isActive },
      include: { family: true, person: true, professional: true, unit: true }
    });
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
