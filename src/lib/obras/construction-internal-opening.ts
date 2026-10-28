import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { constructionCaseProperties, constructionCases, constructionConfigVersions } from "@/db/schema/construction-core";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { processes } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { listConstructionOpeningCatalogs, listConstructionOpeningProperties } from "@/db/repositories/infrastructure/construction-opening";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { type ConstructionAccess, calculateConstructionArea } from "./construction-policy";
import { constructionInternalOpeningSchema, assertConstructionInternalOpeningActor, validateConstructionInternalOpeningDocuments, linkConstructionInternalOpeningDocuments } from "./construction-internal-documents";
import { definitionSchema, validateConstructionFields } from "./construction-rules";
import { assignConstructionCase } from "./construction-distribution";
import { createValidatedProcess } from "@/lib/protocols/service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";

/** The action enforces OBRAS + PROCESSOS create. The complete opening runs inside this single transaction. */
export async function openConstructionInternalCase(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionInternalOpeningSchema.parse(input);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_OPEN:${data.requestKey}`}))`);
  const [existing] = await tx.select({ id: constructionCases.id, createdBy: constructionCases.createdBy }).from(constructionCases).where(eq(constructionCases.requestKey, data.requestKey)).limit(1);
  if (existing) {
    if (existing.createdBy !== actorId) throw new Error("Referência de abertura indisponível.");
    return existing.id;
  }
  const employee = await assertConstructionInternalOpeningActor(tx, access);
  const [config] = await tx.select().from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1);
  if (!config) throw new Error("Publique a configuração urbanística antes de abrir solicitações.");
  if (config.version !== data.configurationVersion) throw new Error("A configuração mudou. Atualize a página e confira a nova regra antes de protocolar.");
  if (!config.subjectIds.includes(data.subjectId)) throw new Error("O assunto não está habilitado para Construção Civil.");
  const [form] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "FORM")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if ((form?.version || 0) !== data.formVersion) throw new Error("O formulário mudou. Atualize a página antes de protocolar.");
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  const additionalValues = validateConstructionFields(definition, data.additionalValues);
  const openingDocuments = await validateConstructionInternalOpeningDocuments(tx, actorId, data, definition);
  const properties = await listConstructionOpeningProperties(tx, data.propertyIds);
  if (properties.length !== data.propertyIds.length) throw new Error("Um ou mais imóveis não estão disponíveis.");
  if (data.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Pessoa requerente inativa/inexistente.");
  if (data.companyId && !(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.status, "Ativo"))).limit(1)).length) throw new Error("Empresa requerente inativa/inexistente.");
  const catalogs = await listConstructionOpeningCatalogs(tx, [data.modalityId, data.purposeId, ...(data.constructionTypeId ? [data.constructionTypeId] : [])]);
  const modality = catalogs.find((entry) => entry.id === data.modalityId && entry.kind === (data.category === "BUILDING" ? "PERMIT_TYPE" : "SUBDIVISION_TYPE"));
  const purpose = catalogs.find((entry) => entry.id === data.purposeId && entry.kind === "PURPOSE");
  const constructionType = catalogs.find((entry) => entry.id === data.constructionTypeId && entry.kind === "CONSTRUCTION_TYPE");
  if (!modality || !purpose || (data.constructionTypeId && !constructionType)) throw new Error("Modalidade, finalidade ou tipo construtivo inválido/inativo.");
  const calculation = calculateConstructionArea(data, config.areaWeights);
  const process = await createValidatedProcess(tx, employee, actorId, { processTypeId: data.processTypeId, subjectId: data.subjectId, personId: data.personId || null, companyId: data.companyId || null, description: data.description });
  const [scope] = await tx.select({ currentDepartmentId: processes.currentDepartmentId }).from(processes).where(eq(processes.id, process.id)).limit(1);
  if (!scope) throw new Error("Process não encontrado.");
  if (!access.administrator && scope.currentDepartmentId !== employee.departmentId) throw new Error("O assunto encaminha para outro setor. Utilize um assunto urbanístico do seu setor.");
  const [caseRecord] = await tx.insert(constructionCases).values({
    requestKey: data.requestKey, processId: process.id, configurationId: config.id, category: data.category, locationType: data.locationType, regularization: data.regularization,
    catalogSnapshot: { modality: { id: modality.id, name: modality.name }, purpose: { id: purpose.id, name: purpose.name }, constructionType: constructionType ? { id: constructionType.id, name: constructionType.name } : null },
    existingArea: new Decimal(data.existingArea), expandedArea: new Decimal(data.expandedArea), irregularArea: new Decimal(data.irregularArea), renovationArea: new Decimal(data.renovationArea), demolitionArea: new Decimal(data.demolitionArea), totalArea: new Decimal(calculation.total), calculationSnapshot: calculation.memory,
    createdBy: actorId,
    additionalValues, formSnapshot: { version: form?.version || 0, definition, checks: data.checks, documentIds: data.documentIds, documents: openingDocuments.map((document) => ({ label: document.label, documentId: document.documentId, documentVersionId: document.documentVersionId, hashSha256: document.hashSha256 })) },
  }).returning({ id: constructionCases.id });
  await tx.insert(constructionCaseProperties).values(properties.map(property => ({ caseId: caseRecord.id, realEstateId: property.id, cadastralSnapshot: property })));
  await linkConstructionInternalOpeningDocuments(tx, actorId, data.requestKey, caseRecord.id, process.id, openingDocuments);
  if (scope.currentDepartmentId) await assignConstructionCase(tx, { caseId: caseRecord.id, processId: process.id, departmentId: scope.currentDepartmentId, today: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") });
  await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCase", targetId: caseRecord.id });
  return caseRecord.id;
}
