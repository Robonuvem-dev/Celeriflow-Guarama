"use server";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction } from "@/db/transaction";
import { departments, employees } from "@/db/schema/administration";
import { constructionCatalogEntries, constructionConfigVersions } from "@/db/schema/construction-core";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { processSubjects, processTypes } from "@/db/schema/processes";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { constructionCatalogSchema, constructionConfigSchema, constructionStaffSchema } from "@/lib/obras/construction-policy";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionInternalOpeningSchema } from "@/lib/obras/construction-internal-documents";
import { openConstructionInternalCase } from "@/lib/obras/construction-internal-opening";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  const postgres = getPostgresError(error);
  if (postgres) return postgres.code === "23505" ? "Já existe um cadastro com esses dados. Atualize a página." : "Não foi possível salvar. Confira as referências do cadastro.";
  return constructionActionMessage(error, "Não foi possível concluir a operação.");
}
function refresh() { revalidatePath("/obras/construcao-civil"); revalidatePath("/obras/construcao-civil/configuracoes"); revalidatePath("/obras/construcao-civil/equipe"); }

export async function saveConstructionCatalog(input: unknown) {
  try {
    const data = constructionCatalogSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", data.id ? "update" : "create");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) return { error: "Somente gestor urbanístico pode configurar catálogos." };
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (data.id) {
        const [current] = await tx.select().from(constructionCatalogEntries).where(eq(constructionCatalogEntries.id, data.id)).limit(1);
        if (!current || current.kind !== data.kind) throw new Error("Um cadastro existente não pode mudar de catálogo.");
      }
      const values = { kind: data.kind, name: data.name, description: data.description || null, isActive: data.isActive };
      const [entry] = data.id ? await tx.update(constructionCatalogEntries).set(values).where(eq(constructionCatalogEntries.id, data.id)).returning() : await tx.insert(constructionCatalogEntries).values(values).returning();
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
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_CONFIGURATION'))`);
      const [{ total: subjects }] = await tx.select({ total: count() }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(inArray(processSubjects.id, data.subjectIds), eq(processSubjects.isActive, true), eq(processSubjects.allowsInternalOpening, true), eq(processTypes.isActive, true), eq(processTypes.allowsInternalOpening, true)));
      if (subjects !== data.subjectIds.length) throw new Error("Selecione assuntos ativos que permitam abertura interna.");
      const [previous] = await tx.select({ version: constructionConfigVersions.version }).from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1);
      const [config] = await tx.insert(constructionConfigVersions).values({ ...data, version: (previous?.version || 0) + 1, publishedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionConfigVersion", targetId: config.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function saveConstructionStaff(input: unknown) {
  try {
    const data = constructionStaffSchema.parse(input);
    const context = await getTenantContextForSystemAdministration();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [employee] = await tx.select({ id: employees.id }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, data.employeeId), eq(employees.isActive, true), eq(employees.departmentId, data.departmentId), eq(departments.isActive, true))).limit(1);
      if (data.isActive && !employee) throw new Error("O servidor precisa estar ativo e lotado no setor selecionado.");
      if (data.id) {
        const [current] = await tx.select().from(constructionStaffRoles).where(eq(constructionStaffRoles.id, data.id)).limit(1);
        if (!current || current.employeeId !== data.employeeId || current.departmentId !== data.departmentId || current.role !== data.role || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Servidor, setor, papel e início são imutáveis. Encerre o vínculo e crie outro.");
      }
      const values = { employeeId: data.employeeId, departmentId: data.departmentId, role: data.role, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const [role] = data.id ? await tx.update(constructionStaffRoles).set(values).where(eq(constructionStaffRoles.id, data.id)).returning() : await tx.insert(constructionStaffRoles).values(values).returning();
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
    const result = await withDatabaseTransaction(databaseConnection, (tx) => openConstructionInternalCase(tx, access, context.user.id, data));
    refresh(); revalidatePath("/protocolos/processos");
    return { success: true, id: result };
  } catch (error) { return { error: errorMessage(error) }; }
}
