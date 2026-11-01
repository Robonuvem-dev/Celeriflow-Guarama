import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { db, databaseConnection } from "@/db/client";
import { socialAttachments, socialBeneficiaryRegistrations, socialScfvEvents, socialScfvGroups } from "@/db/schema/social-workflows";
import { deleteUploadedDocument, uploadProcessFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { employees } from "@/db/schema/administration";
import { socialProfessionalLinks } from "@/db/schema/social";
export async function POST(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create"), access = await resolveSocialAccess(context), database = context.database ?? db;
    const form = await request.formData(), unitId = String(form.get("unitId") || ""), eventId = String(form.get("eventId") || ""), personId = String(form.get("personId") || ""), caption = String(form.get("caption") || "").trim();
    assertSocialUnitAccess(access, unitId);
    if (Boolean(eventId) === Boolean(personId) || !caption || caption.length > 250) throw new Error("Informe descrição e evento ou pessoa, exclusivamente.");
    if (eventId) { const [event] = await database.select({ unitId: socialScfvGroups.unitId }).from(socialScfvEvents).innerJoin(socialScfvGroups, eq(socialScfvGroups.id, socialScfvEvents.groupId)).where(eq(socialScfvEvents.id, eventId)); if (event?.unitId !== unitId) throw new Error("Evento fora da unidade."); }
    if (personId) {
      const [person] = await database.select().from(socialBeneficiaryRegistrations).where(eq(socialBeneficiaryRegistrations.personId, personId));
      if (person?.unitId !== unitId) {
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        const [professional] = await database.select({ id: employees.id }).from(employees).innerJoin(socialProfessionalLinks, eq(socialProfessionalLinks.employeeId, employees.id)).where(and(eq(employees.personId, personId), eq(employees.isActive, true), eq(socialProfessionalLinks.unitId, unitId), eq(socialProfessionalLinks.isActive, true), lte(socialProfessionalLinks.startsAt, today), or(isNull(socialProfessionalLinks.endsAt), gte(socialProfessionalLinks.endsAt, today)), access.administrator ? undefined : eq(employees.id, access.employeeId || ""))).limit(1);
        if (!professional) throw new Error("Pessoa sem cadastro Social ou vínculo profissional vigente nesta unidade.");
      }
    }
    const file = form.get("file"); if (!(file instanceof File) || file.size > 4 * 1024 * 1024) throw new Error("Envie arquivo de até 4 MB.");
    const stored = await uploadProcessFile(file);
    try {
      const result = await ingestGedDocument(databaseConnection, { title: caption, documentType: file.type.startsWith("image/") ? "Fotografia socioassistencial" : "Documento socioassistencial", documentClassCode: "SOCIAL_EVIDENCE", fileUrl: stored.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, publicLabel: "Documento socioassistencial restrito", afterCreate: async (tx, documentId) => { await tx.insert(socialAttachments).values({ unitId, eventId: eventId || null, personId: personId || null, documentId, caption, createdBy: context.user.id }); } });
      return Response.json({ id: result.documentId });
    } catch (error) { await deleteUploadedDocument(stored).catch(() => undefined); throw error; }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha no envio." }, { status: 400 }); }
}
