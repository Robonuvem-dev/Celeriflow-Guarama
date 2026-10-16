"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { professionalSchema, employerSchema, definitionPublicationSchema, distributionSchema, zoneSchema, evaluateConstructionViability } from "@/lib/obras/construction-rules";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002" ? "Registro duplicado. Confira as referências e atualize a página." : "Não foi possível salvar as referências informadas.";
  return error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação.";
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
    await context.prisma.$transaction(async (tx) => {
      if (data.isActive && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa inativa ou inexistente.");
      if (data.id) {
        const current = await tx.constructionProfessional.findUnique({ where: { id: data.id } });
        if (!current || current.personId !== data.personId || current.professionalType !== data.professionalType || current.council !== data.council || current.registration !== data.registration || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Identificação do registro é imutável; encerre o perfil e cadastre outro registro.");
      }
      const values = { personId: data.personId, professionalType: data.professionalType, council: data.council, registration: data.registration, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const record = data.id ? await tx.constructionProfessional.update({ where: { id: data.id }, data: values }) : await tx.constructionProfessional.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProfessional", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function saveConstructionEmployer(input: unknown) {
  try {
    const data = employerSchema.parse(input);
    const context = await manager(data.id ? "update" : "create");
    await context.prisma.$transaction(async (tx) => {
      const [professional, company] = await Promise.all([tx.constructionProfessional.findUnique({ where: { id: data.professionalId } }), tx.company.findUnique({ where: { id: data.companyId }, select: { status: true, constructionProfile: { select: { isActive: true, startsAt: true, endsAt: true } } } })]);
      if (data.isActive && (!professional?.isActive || professional.professionalType === "BROKER" || company?.status !== "Ativo")) throw new Error("Vínculo de construtora exige empresa ativa e engenheiro/arquiteto ativo.");
      if (data.isActive && professional && (data.startsAt < professional.startsAt.toISOString().slice(0, 10) || (professional.endsAt && (!data.endsAt || data.endsAt > professional.endsAt.toISOString().slice(0, 10))))) throw new Error("A vigência do vínculo deve estar contida na vigência do registro profissional.");
      if (data.isActive && (!company?.constructionProfile?.isActive || data.startsAt < company.constructionProfile.startsAt.toISOString().slice(0, 10) || !data.endsAt || data.endsAt > company.constructionProfile.endsAt.toISOString().slice(0, 10))) throw new Error("Cadastre a habilitação da construtora e mantenha a vigência do vínculo dentro da validade da empresa.");
      if (data.id) {
        const current = await tx.constructionProfessionalEmployer.findUnique({ where: { id: data.id } });
        if (!current || current.professionalId !== data.professionalId || current.companyId !== data.companyId || current.startsAt.toISOString().slice(0, 10) !== data.startsAt) throw new Error("Empresa, profissional e início são imutáveis.");
      }
      const values = { professionalId: data.professionalId, companyId: data.companyId, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, isActive: data.isActive };
      const record = data.id ? await tx.constructionProfessionalEmployer.update({ where: { id: data.id }, data: values }) : await tx.constructionProfessionalEmployer.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionProfessionalEmployer", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function publishConstructionDefinition(input: unknown) {
  try {
    const data = definitionPublicationSchema.parse(input);
    const context = await manager("update");
    await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DEFINITION:${data.kind}`}))`;
      const latest = await tx.constructionDefinitionVersion.findFirst({ where: { kind: data.kind }, orderBy: { version: "desc" }, select: { version: true } });
      const record = await tx.constructionDefinitionVersion.create({ data: { ...data, version: (latest?.version || 0) + 1, publishedBy: context.user.id } });
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
    await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DISTRIBUTION:${data.departmentId}`}))`;
      if (!await tx.department.findFirst({ where: { id: data.departmentId, isActive: true }, select: { id: true } })) throw new Error("Setor inativo/inexistente.");
      if (data.strategy === "USER") {
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        if (!await tx.constructionStaffRole.findFirst({ where: { employeeId: data.employeeId, departmentId: data.departmentId, role: "ANALYST", isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], employee: { isActive: true, departmentId: data.departmentId } } })) throw new Error("Escolha analista vigente no setor.");
      }
      const latest = await tx.constructionDistributionVersion.findFirst({ where: { departmentId: data.departmentId }, orderBy: { version: "desc" }, select: { version: true } });
      const record = await tx.constructionDistributionVersion.create({ data: { departmentId: data.departmentId, strategy: data.strategy, employeeId: data.strategy === "USER" ? data.employeeId : null, version: (latest?.version || 0) + 1, publishedBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionDistributionVersion", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function publishConstructionZone(input: unknown) {
  try {
    const data = zoneSchema.parse(input);
    const context = await manager("update");
    await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_ZONE:${data.code}`}))`;
      const purposeIds = [...new Set(data.allowedPurposeIds)];
      if (await tx.constructionCatalogEntry.count({ where: { id: { in: purposeIds }, kind: "PURPOSE", isActive: true } }) !== purposeIds.length) throw new Error("Finalidade inválida/inativa.");
      const latest = await tx.constructionZoneVersion.findFirst({ where: { code: data.code }, orderBy: { version: "desc" }, select: { version: true } });
      const record = await tx.constructionZoneVersion.create({ data: { ...data, allowedPurposeIds: purposeIds, allowedCategories: [...new Set(data.allowedCategories)], startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, version: (latest?.version || 0) + 1, publishedBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionZoneVersion", targetId: record.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function linkConstructionPropertyZone(input: unknown) {
  try {
    const data = z.object({ realEstateId: z.string().min(1), zoneId: z.string().min(1) }).parse(input);
    const context = await manager("update");
    await context.prisma.$transaction(async (tx) => {
      const record = await tx.constructionPropertyZone.upsert({ where: { realEstateId: data.realEstateId }, create: data, update: { zoneId: data.zoneId } });
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
    const result = await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_VIABILITY:${data.requestKey}`}))`;
      const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, include: { properties: { include: { realEstate: { include: { constructionZone: { include: { zone: true } } } } } } } });
      if (!record) throw new Error("Solicitação indisponível no seu escopo.");
      const existing = await tx.constructionViabilityResult.findUnique({ where: { requestKey: data.requestKey } });
      if (existing) {
        if (existing.caseId !== record.id || existing.createdBy !== context.user.id) throw new Error("Referência de avaliação indisponível.");
        return existing.id;
      }
      const catalog = z.object({ purpose: z.object({ id: z.string() }) }).parse(record.catalogSnapshot);
      const evaluations = record.properties.map((property) => {
        const zone = property.realEstate.constructionZone?.zone;
        if (!zone) return { realEstateId: property.realEstateId, outcome: "MANUAL", reasons: ["Imóvel sem zoneamento urbanístico vinculado."] };
        const rule = { ...zone, startsAt: zone.startsAt.toISOString().slice(0, 10), endsAt: zone.endsAt?.toISOString().slice(0, 10) || "", minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString() };
        const evaluation = record.properties.length === 1 ? evaluateConstructionViability({ category: record.category, purposeId: catalog.purpose.id, landArea: String(property.realEstate.landArea || 0), proposedArea: record.totalArea.toString(), today: new Date().toISOString().slice(0, 10) }, rule) : { outcome: "MANUAL", reasons: ["Múltiplos imóveis exigem distribuição de áreas por imóvel em análise técnica."] };
        return { realEstateId: property.realEstateId, rule, landArea: String(property.realEstate.landArea || 0), ...evaluation };
      });
      const outcome = evaluations.some((evaluation) => evaluation.outcome === "MANUAL") ? "MANUAL" : evaluations.some((evaluation) => evaluation.outcome === "DENIED") ? "DENIED" : "APPROVED";
      const evaluation = await tx.constructionViabilityResult.create({ data: { caseId: record.id, requestKey: data.requestKey, outcome, calculationSnapshot: JSON.parse(JSON.stringify({ proposedArea: record.totalArea.toString(), purposeId: catalog.purpose.id, evaluations })), createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionViabilityResult", targetId: evaluation.id });
      return evaluation.id;
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true, id: result };
  } catch (error) { return { error: message(error) }; }
}
