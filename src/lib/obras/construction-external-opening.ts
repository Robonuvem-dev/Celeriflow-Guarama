import type { Prisma } from "@prisma/client";
import { constructionExternalOpeningSchema, assertExternalApplicationScope, validateExternalOpeningEvidence } from "./construction-external-policy";
import { calculateConstructionArea } from "./construction-policy";
import { definitionSchema, validateConstructionFields } from "./construction-rules";
import { createConstructionExternalProcess } from "./construction-external-process";
import { assignConstructionCase } from "./construction-distribution";
import { assertConstructionExternalCompany } from "./construction-external-company";

export async function openConstructionExternalApplication(tx: Prisma.TransactionClient, identityId: string, rawInput: unknown) {
  const data = constructionExternalOpeningSchema.parse(rawInput);
  await tx.$queryRaw`SELECT "id" FROM "ConstructionExternalApplication" WHERE "id"=${data.applicationId} FOR UPDATE`;
  const application = await tx.constructionExternalApplication.findFirst({ where: { id: data.applicationId, identityId }, include: { documents: true } });
  if (!application) throw new Error("Autorização indisponível.");
  if (application.caseId) {
    const existing = await tx.constructionCase.findUniqueOrThrow({ where: { id: application.caseId }, select: { id: true, requestKey: true } });
    if (existing.requestKey !== data.requestKey) throw new Error("Esta autorização já foi protocolada. Consulte a solicitação existente.");
    return existing.id;
  }
  assertExternalApplicationScope(application, identityId, data);
  await assertConstructionExternalCompany(tx, identityId, application.companyId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`;
  if (await tx.constructionCase.findUnique({ where: { requestKey: data.requestKey }, select: { id: true } })) throw new Error("Referência de abertura indisponível.");
   const identity = await tx.constructionPortalIdentity.findFirst({ where: { id: identityId, isActive: true, professional: { isActive: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") } }], person: { status: "Ativo" } } }, select: { id: true, professional: { select: { professionalType: true } } } });
  if (!identity) throw new Error("Habilitação profissional encerrada.");
  const config = await tx.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } });
  if (!config || config.version !== data.configurationVersion || !config.subjectIds.includes(data.subjectId)) throw new Error("Configuração/assunto alterado. Atualize a página.");
  const form = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "FORM" }, orderBy: { version: "desc" } });
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize a página.");
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  const additionalValues = validateConstructionFields(definition, data.additionalValues);
  validateExternalOpeningEvidence(definition, data.documentIds, data.checks);
  const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" } });
  if (!term || term.id !== data.termId) throw new Error("Leia e aceite o termo vigente antes de protocolar.");
  const documents = [];
  for (const [label, documentId] of Object.entries(data.documentIds)) {
    const uploaded = application.documents.find((doc) => doc.documentId === documentId && doc.label === label);
    if (!uploaded) throw new Error("Documento não pertence a esta abertura.");
    const current = await tx.document.findFirst({ where: { id: documentId, status: { in: ["Válido", "Assinado"] }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, select: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, status: true, hashSha256: true } } } });
    if (current?.versions[0]?.id !== uploaded.documentVersionId || !["FINAL", "SIGNED"].includes(current.versions[0].status) || current.versions[0].hashSha256 !== uploaded.hashSha256) throw new Error("Documento GED alterado/inválido. Reenvie a versão atual.");
    documents.push(uploaded);
  }
  if (data.personId && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Requerente indisponível.");
  if (data.companyId && !await tx.company.findFirst({ where: { id: data.companyId, status: "Ativo" }, select: { id: true } })) throw new Error("Requerente indisponível.");
  const properties = await tx.realEstate.findMany({ where: { id: { in: application.propertyIds } }, select: { id: true, municipalInsc: true, registration: true, streetName: true, number: true, lot: true, block: true, landArea: true, builtArea: true, propertyUse: true, fiscalZone: true, taxpayerId: true } });
  if (properties.length !== application.propertyIds.length) throw new Error("Imóvel autorizado indisponível.");
  const catalogs = await tx.constructionCatalogEntry.findMany({ where: { isActive: true, id: { in: [data.modalityId, data.purposeId, data.constructionTypeId].filter(Boolean) } } });
  const modality = catalogs.find((entry) => entry.id === data.modalityId && entry.kind === (data.category === "BUILDING" ? "PERMIT_TYPE" : "SUBDIVISION_TYPE"));
  const purpose = catalogs.find((entry) => entry.id === data.purposeId && entry.kind === "PURPOSE");
  const constructionType = catalogs.find((entry) => entry.id === data.constructionTypeId && entry.kind === "CONSTRUCTION_TYPE");
  if (!modality || !purpose || (data.constructionTypeId && !constructionType)) throw new Error("Modalidade, finalidade ou tipo construtivo indisponível.");
  const area = calculateConstructionArea(data, config.areaWeights);
  const process = await createConstructionExternalProcess(tx, identityId, { ...data, personId: data.personId || null, companyId: data.companyId || null });
  const record = await tx.constructionCase.create({ data: {
    requestKey: data.requestKey, processId: process.id, configurationId: config.id, category: data.category, locationType: data.locationType, regularization: data.regularization,
    catalogSnapshot: { modality: { id: modality.id, name: modality.name }, purpose: { id: purpose.id, name: purpose.name }, constructionType: constructionType ? { id: constructionType.id, name: constructionType.name } : null },
    existingArea: data.existingArea, expandedArea: data.expandedArea, irregularArea: data.irregularArea, renovationArea: data.renovationArea, demolitionArea: data.demolitionArea, totalArea: area.total, calculationSnapshot: area.memory,
    createdBy: `EXTERNAL:${identityId}`, additionalValues, formSnapshot: { version: form?.version || 0, definition, checks: data.checks, documentIds: data.documentIds },
    properties: { create: properties.map((property) => ({ realEstateId: property.id, cadastralSnapshot: property })) },
    participants: { create: { identityId, role: identity.professional.professionalType === "BROKER" ? "BROKER" : "TECHNICAL", reason: application.authorizationReason, createdBy: application.authorizedBy } },
    acceptances: { create: { identityId, termId: term.id } },
  }, select: { id: true } });
  for (const document of documents) {
    await tx.processDocument.create({ data: { processId: process.id, documentId: document.documentId, purpose: `Abertura: ${document.label}` } });
    await tx.constructionMessage.create({ data: { caseId: record.id, identityId, requestKey: document.requestKey, content: `Documento de abertura: ${document.label}`, documentId: document.documentId, evidenceSnapshot: { termId: term.id, termVersion: term.version, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256, applicationId: application.id } } });
  }
  await tx.constructionExternalApplication.update({ where: { id: application.id }, data: { caseId: record.id } });
  if (process.currentDepartmentId) await assignConstructionCase(tx, { caseId: record.id, processId: process.id, departmentId: process.currentDepartmentId, today: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") });
  return record.id;
}
