"use server";

import { and, count, desc, eq, getTableColumns, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionCatalogEntries, constructionDistributionVersions, constructionProfessionals, constructionViabilityResults } from "@/db/schema/construction-core";
import { constructionCompanyProfiles, constructionProfessionalEmployers, constructionStaffRoles } from "@/db/schema/construction-portal";
import { constructionDefinitionVersions, constructionPropertyZones, constructionZoneVersions } from "@/db/schema/construction-viability";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { listConstructionPlanPropertyZones } from "@/db/repositories/infrastructure/construction-integrations";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { professionalSchema, employerSchema, definitionPublicationSchema, distributionSchema, zoneSchema, evaluateConstructionViability } from "@/lib/obras/construction-rules";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  const postgres = getPostgresError(error);
  if (postgres) return postgres.code === "23505" ? "Registro duplicado. Confira as referências e atualize a página." : "Não foi possível salvar as referências informadas.";
  return constructionActionMessage(error, "Não foi possível concluir a operação.");
}
async function manager(operation: "create" | "update") {
  const context = await getTenantContextForModuleOperation("OBRAS", operation);
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Operação restrita ao gestor urbanístico.");
  return { ...context, access };
}
function refresh() {
  for (const route of ["/obras/construcao-civil/profissionais", "/obras/construcao-civil/regras", "/obras/construcao-civil/novo"]) revalidatePath(route);
}

export async function saveConstructionProfessional(input: unknown) {
  try {
    const data = professionalSchema.parse(input);
    const context = await manager(data.id ? "update" : "create");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (data.isActive && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Pessoa inativa ou inexistente.");
      if (data.id) {
        const [current] = await tx.select().from(constructionProfessionals).where(eq(constructionProfessionals.id, data.id)).limit(1);
        if (!current || current.personId !== data.personId || current.professionalType !== data.professionalType || current.council !== data.council || current.registration !== data.registration || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Identificação do registro é imutável; encerre o perfil e cadastre outro registro.");
      }
      const values = { personId: data.personId, professionalType: data.professionalType, council: data.council, registration: data.registration, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const [record] = data.id ? await tx.update(constructionProfessionals).set(values).where(eq(constructionProfessionals.id, data.id)).returning() : await tx.insert(constructionProfessionals).values(values).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProfessional", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function saveConstructionEmployer(input: unknown) {
  try {
    const data = employerSchema.parse(input);
    const context = await manager(data.id ? "update" : "create");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[professional], [company]] = await Promise.all([
        tx.select().from(constructionProfessionals).where(eq(constructionProfessionals.id, data.professionalId)).limit(1),
        tx.select({ status: companies.status, constructionProfile: getTableColumns(constructionCompanyProfiles) }).from(companies).leftJoin(constructionCompanyProfiles, eq(constructionCompanyProfiles.companyId, companies.id)).where(eq(companies.id, data.companyId)).limit(1),
      ]);
      if (data.isActive && (!professional?.isActive || professional.professionalType === "BROKER" || company?.status !== "Ativo")) throw new Error("Vínculo de construtora exige empresa ativa e engenheiro/arquiteto ativo.");
      if (data.isActive && professional && (data.startsAt < professional.startsAt.toISOString().slice(0, 10) || (professional.endsAt && (!data.endsAt || data.endsAt > professional.endsAt.toISOString().slice(0, 10))))) throw new Error("A vigência do vínculo deve estar contida na vigência do registro profissional.");
      if (data.isActive && (!company?.constructionProfile?.isActive || data.startsAt < company.constructionProfile.startsAt.toISOString().slice(0, 10) || !data.endsAt || data.endsAt > company.constructionProfile.endsAt.toISOString().slice(0, 10))) throw new Error("Cadastre a habilitação da construtora e mantenha a vigência do vínculo dentro da validade da empresa.");
      if (data.id) {
        const [current] = await tx.select().from(constructionProfessionalEmployers).where(eq(constructionProfessionalEmployers.id, data.id)).limit(1);
        if (!current || current.professionalId !== data.professionalId || current.companyId !== data.companyId || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Empresa, profissional e início são imutáveis.");
      }
      const values = { professionalId: data.professionalId, companyId: data.companyId, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const [record] = data.id ? await tx.update(constructionProfessionalEmployers).set(values).where(eq(constructionProfessionalEmployers.id, data.id)).returning() : await tx.insert(constructionProfessionalEmployers).values(values).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProfessionalEmployer", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function publishConstructionDefinition(input: unknown) {
  try {
    const data = definitionPublicationSchema.parse(input);
    const context = await manager("update");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DEFINITION:${data.kind}`}))`);
      const [latest] = await tx.select({ version: constructionDefinitionVersions.version }).from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, data.kind)).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
      const [record] = await tx.insert(constructionDefinitionVersions).values({ ...data, version: (latest?.version || 0) + 1, publishedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionDefinitionVersion", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function publishConstructionDistribution(input: unknown) {
  try {
    const data = distributionSchema.parse(input);
    const context = await manager("update");
    if (!context.access.administrator && data.departmentId !== context.access.departmentId) return { error: "Configure somente o seu setor." };
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DISTRIBUTION:${data.departmentId}`}))`);
      if (!(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, data.departmentId), eq(departments.isActive, true))).limit(1)).length) throw new Error("Setor inativo/inexistente.");
      if (data.strategy === "USER") {
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        if (!(await tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).where(and(eq(constructionStaffRoles.employeeId, data.employeeId), eq(constructionStaffRoles.departmentId, data.departmentId), eq(constructionStaffRoles.role, "ANALYST"), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today)), eq(employees.isActive, true), eq(employees.departmentId, data.departmentId))).limit(1)).length) throw new Error("Escolha analista vigente no setor.");
      }
      const [latest] = await tx.select({ version: constructionDistributionVersions.version }).from(constructionDistributionVersions).where(eq(constructionDistributionVersions.departmentId, data.departmentId)).orderBy(desc(constructionDistributionVersions.version)).limit(1);
      const [record] = await tx.insert(constructionDistributionVersions).values({ departmentId: data.departmentId, strategy: data.strategy, employeeId: data.strategy === "USER" ? data.employeeId : null, version: (latest?.version || 0) + 1, publishedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionDistributionVersion", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function publishConstructionZone(input: unknown) {
  try {
    const data = zoneSchema.parse(input);
    const context = await manager("update");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_ZONE:${data.code}`}))`);
      const purposeIds = [...new Set(data.allowedPurposeIds)];
      if ((await tx.select({ total: count() }).from(constructionCatalogEntries).where(and(inArray(constructionCatalogEntries.id, purposeIds), eq(constructionCatalogEntries.kind, "PURPOSE"), eq(constructionCatalogEntries.isActive, true))))[0].total !== purposeIds.length) throw new Error("Finalidade inválida/inativa.");
      const [latest] = await tx.select({ version: constructionZoneVersions.version }).from(constructionZoneVersions).where(eq(constructionZoneVersions.code, data.code)).orderBy(desc(constructionZoneVersions.version)).limit(1);
      const [record] = await tx.insert(constructionZoneVersions).values({ ...data, minimumLandArea: new Decimal(data.minimumLandArea), maxFloorAreaRatio: new Decimal(data.maxFloorAreaRatio), allowedPurposeIds: purposeIds, allowedCategories: [...new Set(data.allowedCategories)], startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, version: (latest?.version || 0) + 1, publishedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionZoneVersion", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function linkConstructionPropertyZone(input: unknown) {
  try {
    const data = z.object({ realEstateId: z.string().min(1), zoneId: z.string().min(1) }).parse(input);
    const context = await manager("update");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [record] = await tx.insert(constructionPropertyZones).values(data).onConflictDoUpdate({ target: constructionPropertyZones.realEstateId, set: { zoneId: data.zoneId } }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPropertyZone", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function evaluateConstructionCase(input: unknown) {
  try {
    const data = z.object({ caseId: z.string().min(1), requestKey: z.uuid() }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))) return { error: "Avaliação exige papel de analista ou gestor." };
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_VIABILITY:${data.requestKey}`}))`);
      const record = await findConstructionCaseForAccess(tx, data.caseId, access);
      if (!record) throw new Error("Solicitação indisponível no seu escopo.");
      const [existing] = await tx.select().from(constructionViabilityResults).where(eq(constructionViabilityResults.requestKey, data.requestKey)).limit(1);
      if (existing) {
        if (existing.caseId !== record.id || existing.createdBy !== context.user.id) throw new Error("Referência de avaliação indisponível.");
        return existing.id;
      }
      const catalog = z.object({ purpose: z.object({ id: z.string() }) }).parse(record.catalogSnapshot);
      const properties = await listConstructionPlanPropertyZones(tx, record.id);
      const evaluations = properties.map((property) => {
        const zone = property.zone;
        if (!zone) return { realEstateId: property.realEstateId, outcome: "MANUAL", reasons: ["Imóvel sem zoneamento urbanístico vinculado."] };
        const rule = { ...zone, startsAt: zone.startsAt.toISOString().slice(0, 10), endsAt: zone.endsAt?.toISOString().slice(0, 10) || "", minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString() };
        const evaluation = properties.length === 1 ? evaluateConstructionViability({ category: record.category, purposeId: catalog.purpose.id, landArea: String(property.landArea || 0), proposedArea: record.totalArea.toString(), today: new Date().toISOString().slice(0, 10) }, rule) : { outcome: "MANUAL", reasons: ["Múltiplos imóveis exigem distribuição de áreas por imóvel em análise técnica."] };
        return { realEstateId: property.realEstateId, rule, landArea: String(property.landArea || 0), ...evaluation };
      });
      const outcome = evaluations.some((evaluation) => evaluation.outcome === "MANUAL") ? "MANUAL" : evaluations.some((evaluation) => evaluation.outcome === "DENIED") ? "DENIED" : "APPROVED";
      const [evaluation] = await tx.insert(constructionViabilityResults).values({ caseId: record.id, requestKey: data.requestKey, outcome, calculationSnapshot: JSON.parse(JSON.stringify({ proposedArea: record.totalArea.toString(), purposeId: catalog.purpose.id, evaluations })), createdBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionViabilityResult", targetId: evaluation.id });
      return evaluation.id;
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true, id: result };
  } catch (error) { return { error: message(error) }; }
}
