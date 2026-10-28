"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { companies } from "@/db/schema/registry";
import { constructionCompanyProfiles, constructionCompanyProfileEvents } from "@/db/schema/construction-portal";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionDate } from "@/lib/obras/construction-rules";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";

export async function saveConstructionCompanyProfile(input: unknown) {
  try {
    const data = z.object({ companyId: z.string().min(1), startsAt: constructionDate, endsAt: constructionDate, isActive: z.boolean(), legalReference: z.string().trim().min(3).max(2000) }).refine((value) => value.endsAt >= value.startsAt, "Validade anterior ao início.").parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Habilitação de construtoras restrita ao gestor.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (!(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), data.isActive ? eq(companies.status, "Ativo") : undefined)).limit(1)).length) throw new Error("Empresa indisponível ou inativa.");
      const values = { startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: new Date(`${data.endsAt}T00:00:00Z`), isActive: data.isActive, legalReference: data.legalReference };
      const [previous] = await tx.select().from(constructionCompanyProfiles).where(eq(constructionCompanyProfiles.companyId, data.companyId)).limit(1);
      const [record] = await tx.insert(constructionCompanyProfiles).values({ companyId: data.companyId, ...values, createdBy: context.user.id }).onConflictDoUpdate({ target: constructionCompanyProfiles.companyId, set: values }).returning();
      // Full before/after snapshots are preserved as a domain event, rather than overwritten in the authorization history.
      await tx.insert(constructionCompanyProfileEvents).values({ profileId: record.id, actorId: context.user.id, before: previous ? JSON.parse(JSON.stringify(previous)) : {}, after: JSON.parse(JSON.stringify(record)) });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCompanyProfile", targetId: record.id });
    });
    revalidatePath("/obras/construcao-civil/construtoras"); return { success: true };
  } catch (error) { return { error: constructionActionMessage(error, "Não foi possível salvar a habilitação.") }; }
}
