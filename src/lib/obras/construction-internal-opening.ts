import type { Prisma } from "@prisma/client";
import { type ConstructionAccess, calculateConstructionArea } from "./construction-policy";
import { constructionInternalOpeningSchema, assertConstructionInternalOpeningActor, validateConstructionInternalOpeningDocuments, linkConstructionInternalOpeningDocuments } from "./construction-internal-documents";
import { definitionSchema, validateConstructionFields } from "./construction-rules";
import { assignConstructionCase } from "./construction-distribution";
import { createValidatedProcess } from "@/lib/protocols/service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

/** The action enforces OBRAS + PROCESSOS create. The complete opening runs inside this single transaction. */
export async function openConstructionInternalCase(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionInternalOpeningSchema.parse(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`;
  const existing = await tx.constructionCase.findUnique({ where: { requestKey: data.requestKey }, select: { id: true, createdBy: true } });
  if (existing) {
    if (existing.createdBy !== actorId) throw new Error("Referência de abertura indisponível.");
    return existing.id;
  }
  const employee = await assertConstructionInternalOpeningActor(tx, access);
  const config = await tx.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } });
  if (!config) throw new Error("Publique a configuração urbanística antes de abrir solicitações.");
  if (config.version !== data.configurationVersion) throw new Error("A configuração mudou. Atualize a página e confira a nova regra antes de protocolar.");
  if (!config.subjectIds.includes(data.subjectId)) throw new Error("O assunto não está habilitado para Construção Civil.");
  const form = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "FORM" }, orderBy: { version: "desc" } });
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize a página antes de protocolar.");
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  const additionalValues = validateConstructionFields(definition, data.additionalValues);
  const openingDocuments = await validateConstructionInternalOpeningDocuments(tx, actorId, data, definition);
  const properties = await tx.realEstate.findMany({ where: { id: { in: data.propertyIds } }, select: { id: true, municipalInsc: true, registration: true, streetName: true, number: true, lot: true, block: true, landArea: true, builtArea: true, propertyUse: true, fiscalZone: true, taxpayerId: true } });
  if (properties.length !== data.propertyIds.length) throw new Error("Um ou mais imóveis não estão disponíveis.");
  if (data.personId && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa requerente inativa/inexistente.");
  if (data.companyId && !await tx.company.findFirst({ where: { id: data.companyId, status: "Ativo" }, select: { id: true } })) throw new Error("Empresa requerente inativa/inexistente.");
  const catalogs = await tx.constructionCatalogEntry.findMany({ where: { isActive: true, id: { in: [data.modalityId, data.purposeId, ...(data.constructionTypeId ? [data.constructionTypeId] : [])] } } });
  const modality = catalogs.find((entry) => entry.id === data.modalityId && entry.kind === (data.category === "BUILDING" ? "PERMIT_TYPE" : "SUBDIVISION_TYPE"));
  const purpose = catalogs.find((entry) => entry.id === data.purposeId && entry.kind === "PURPOSE");
  const constructionType = catalogs.find((entry) => entry.id === data.constructionTypeId && entry.kind === "CONSTRUCTION_TYPE");
  if (!modality || !purpose || (data.constructionTypeId && !constructionType)) throw new Error("Modalidade, finalidade ou tipo construtivo inválido/inativo.");
  const calculation = calculateConstructionArea(data, config.areaWeights);
  const process = await createValidatedProcess(tx, employee, actorId, { processTypeId: data.processTypeId, subjectId: data.subjectId, personId: data.personId || null, companyId: data.companyId || null, description: data.description });
  const scope = await tx.process.findUniqueOrThrow({ where: { id: process.id }, select: { currentDepartmentId: true } });
  if (!access.administrator && scope.currentDepartmentId !== employee.departmentId) throw new Error("O assunto encaminha para outro setor. Utilize um assunto urbanístico do seu setor.");
  const caseRecord = await tx.constructionCase.create({ data: {
    requestKey: data.requestKey, processId: process.id, configurationId: config.id, category: data.category, locationType: data.locationType, regularization: data.regularization,
    catalogSnapshot: { modality: { id: modality.id, name: modality.name }, purpose: { id: purpose.id, name: purpose.name }, constructionType: constructionType ? { id: constructionType.id, name: constructionType.name } : null },
    existingArea: data.existingArea, expandedArea: data.expandedArea, irregularArea: data.irregularArea, renovationArea: data.renovationArea, demolitionArea: data.demolitionArea, totalArea: calculation.total, calculationSnapshot: calculation.memory,
    createdBy: actorId, properties: { create: properties.map((property) => ({ realEstateId: property.id, cadastralSnapshot: property })) },
    additionalValues, formSnapshot: { version: form?.version || 0, definition, checks: data.checks, documentIds: data.documentIds, documents: openingDocuments.map((document) => ({ label: document.label, documentId: document.documentId, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256 })) },
  }, select: { id: true } });
  await linkConstructionInternalOpeningDocuments(tx, actorId, data.requestKey, caseRecord.id, process.id, openingDocuments);
  if (scope.currentDepartmentId) await assignConstructionCase(tx, { caseId: caseRecord.id, processId: process.id, departmentId: scope.currentDepartmentId, today: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") });
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCase", targetId: caseRecord.id });
  return caseRecord.id;
}
