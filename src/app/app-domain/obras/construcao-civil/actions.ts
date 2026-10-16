"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionCatalogSchema, constructionConfigSchema, constructionStaffSchema } from "@/lib/obras/construction-policy";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionInternalOpeningSchema } from "@/lib/obras/construction-internal-documents";
import { openConstructionInternalCase } from "@/lib/obras/construction-internal-opening";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002" ? "Já existe um cadastro com esses dados. Atualize a página." : "Não foi possível salvar. Confira as referências do cadastro.";
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "Não foi possível concluir a operação.";
}
function refresh() { revalidatePath("/obras/construcao-civil"); revalidatePath("/obras/construcao-civil/configuracoes"); revalidatePath("/obras/construcao-civil/equipe"); }

export async function saveConstructionCatalog(input: unknown) {
  try {
    const data = constructionCatalogSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", data.id ? "update" : "create");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) return { error: "Somente gestor urbanístico pode configurar catálogos." };
    await context.prisma.$transaction(async (tx) => {
      if (data.id) {
        const current = await tx.constructionCatalogEntry.findUnique({ where: { id: data.id } });
        if (!current || current.kind !== data.kind) throw new Error("Um cadastro existente não pode mudar de catálogo.");
      }
      const values = { kind: data.kind, name: data.name, description: data.description || null, isActive: data.isActive };
      const entry = data.id ? await tx.constructionCatalogEntry.update({ where: { id: data.id }, data: values }) : await tx.constructionCatalogEntry.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCatalogEntry", targetId: entry.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function publishConstructionConfiguration(input: unknown) {
  try {
    const data = constructionConfigSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) return { error: "Somente gestor urbanístico pode publicar configurações." };
    await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_CONFIGURATION'))`;
      const subjects = await tx.subject.count({ where: { id: { in: data.subjectIds }, isActive: true, allowsInternalOpening: true, processType: { isActive: true, allowsInternalOpening: true } } });
      if (subjects !== data.subjectIds.length) throw new Error("Selecione assuntos ativos que permitam abertura interna.");
      const previous = await tx.constructionConfigVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
      const config = await tx.constructionConfigVersion.create({ data: { ...data, version: (previous?.version || 0) + 1, publishedBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionConfigVersion", targetId: config.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function saveConstructionStaff(input: unknown) {
  try {
    const data = constructionStaffSchema.parse(input);
    const context = await getTenantContextForSystemAdministration();
    await context.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: data.employeeId, isActive: true, departmentId: data.departmentId, department: { isActive: true } }, select: { id: true } });
      if (data.isActive && !employee) throw new Error("O servidor precisa estar ativo e lotado no setor selecionado.");
      if (data.id) {
        const current = await tx.constructionStaffRole.findUnique({ where: { id: data.id } });
        if (!current || current.employeeId !== data.employeeId || current.departmentId !== data.departmentId || current.role !== data.role || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Servidor, setor, papel e início são imutáveis. Encerre o vínculo e crie outro.");
      }
      const values = { employeeId: data.employeeId, departmentId: data.departmentId, role: data.role, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const role = data.id ? await tx.constructionStaffRole.update({ where: { id: data.id }, data: values }) : await tx.constructionStaffRole.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionStaffRole", targetId: role.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function openConstructionCase(input: unknown) {
  try {
    const data = constructionInternalOpeningSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    await getTenantContextForModuleOperation("PROCESSOS", "create");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role))) return { error: "Abertura interna exige papel de analista ou gestor urbanístico vigente." };
    if (!context.user.employeeId) return { error: "Vincule seu usuário a um servidor para abrir o processo interno." };
    const result = await context.prisma.$transaction((tx) => openConstructionInternalCase(tx, access, context.user.id, data));
    refresh(); revalidatePath("/protocolos/processos");
    return { success: true, id: result };
  } catch (error) { return { error: errorMessage(error) }; }
}
