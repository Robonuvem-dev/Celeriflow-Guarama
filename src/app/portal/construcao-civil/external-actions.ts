"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionConfigVersions, constructionPortalIdentities, constructionProfessionals } from "@/db/schema/construction-core";
import { constructionExternalApplications } from "@/db/schema/construction-portal";
import { processSubjects, processTypes } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies, realEstates } from "@/db/schema/registry";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { getTenantContextForSystemAdministration, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { constructionAuthorizationSchema } from "@/lib/obras/construction-external-policy";
import { openConstructionExternalApplication } from "@/lib/obras/construction-external-opening";
import { submitConstructionServiceRequest } from "@/lib/obras/construction-request-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";
import { resolveConstructionServiceRequest } from "@/lib/obras/construction-request-resolution";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";

function errorMessage(error: unknown) { return constructionActionMessage(error, "Não foi possível concluir a operação."); }
export async function authorizeConstructionExternalOpening(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = constructionAuthorizationSchema.parse(input);
    const id = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_AUTHORIZATION:${data.requestKey}`}))`);
      const [repeated] = await tx.select().from(constructionExternalApplications).where(eq(constructionExternalApplications.requestKey, data.requestKey)).limit(1);
      if (repeated) { if (repeated.authorizedBy !== context.user.id || repeated.identityId !== data.identityId) throw new Error("Referência indisponível."); return repeated.id; }
      if (new Date(data.expiresAt) <= new Date()) throw new Error("Informe uma validade futura.");
      if (!(await tx.select({ id: constructionPortalIdentities.id }).from(constructionPortalIdentities).innerJoin(constructionProfessionals, eq(constructionProfessionals.id, constructionPortalIdentities.professionalId)).where(and(eq(constructionPortalIdentities.id, data.identityId), eq(constructionPortalIdentities.isActive, true), eq(constructionProfessionals.isActive, true))).limit(1)).length) throw new Error("Identidade profissional indisponível.");
      if (data.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Pessoa requerente indisponível.");
      if (data.companyId && !(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.status, "Ativo"))).limit(1)).length) throw new Error("Empresa requerente indisponível.");
      await assertConstructionExternalCompany(tx, data.identityId, data.companyId || null);
      if ((await tx.select({ total: count() }).from(realEstates).where(inArray(realEstates.id, data.propertyIds)))[0].total !== data.propertyIds.length) throw new Error("Imóveis indisponíveis.");
      const [config] = await tx.select({ subjectIds: constructionConfigVersions.subjectIds }).from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1);
      const [{ total: subjectCount }] = await tx.select({ total: count() }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(inArray(processSubjects.id, data.subjectIds), eq(processSubjects.isActive, true), eq(processTypes.isActive, true), eq(processTypes.genericWorkflowEnabled, false)));
      if (!config || data.subjectIds.some((id) => !config.subjectIds.includes(id)) || subjectCount !== data.subjectIds.length) throw new Error("Selecione assuntos urbanísticos ativos com fluxo de etapas compatível com abertura externa.");
      const [application] = await tx.insert(constructionExternalApplications).values({ ...data, personId: data.personId || null, companyId: data.companyId || null, expiresAt: new Date(data.expiresAt), authorizedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionExternalApplication", targetId: application.id });
      return application.id;
    });
    revalidatePath("/portal/construcao-civil/nova"); return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function revokeConstructionExternalOpening(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).parse(input);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "ConstructionExternalApplication" WHERE "id"=${data.id} FOR UPDATE`);
      const [current] = await tx.select().from(constructionExternalApplications).where(eq(constructionExternalApplications.id, data.id)).limit(1);
      if (!current || current.caseId) throw new Error("Autorização inexistente ou já protocolada.");
      await tx.update(constructionExternalApplications).set({ revokedAt: new Date(), revokedReason: data.reason }).where(eq(constructionExternalApplications.id, data.id));
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionExternalApplication", targetId: data.id });
    });
    revalidatePath("/portal/construcao-civil/nova"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function openExternalConstructionCase(input: unknown) {
  try {
    const identity = await getConstructionPortalIdentity();
    const id = await withDatabaseTransaction(databaseConnection, (tx) => openConstructionExternalApplication(tx, identity.id, input));
    revalidatePath("/portal/construcao-civil"); revalidatePath("/obras/construcao-civil"); revalidatePath("/protocolos/processos");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function requestConstructionService(input: unknown) {
  try {
    const identity = await getConstructionPortalIdentity();
    const id = await withDatabaseTransaction(databaseConnection, (tx) => submitConstructionServiceRequest(tx, identity.id, input));
    revalidatePath("/portal/construcao-civil", "layout"); revalidatePath("/obras/construcao-civil", "layout");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function attendConstructionServiceRequest(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    const id = await withDatabaseTransaction(databaseConnection, (tx) => resolveConstructionServiceRequest(tx, access, context.user.id, input));
    revalidatePath("/portal/construcao-civil", "layout"); revalidatePath("/obras/construcao-civil", "layout");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
