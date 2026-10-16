import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { constructionPortalCaseWhere } from "./construction-portal-policy";
import { assertConstructionExternalCompany } from "./construction-external-company";
import { assertExternalApplicationScope } from "./construction-external-policy";
import { automaticViabilityInputSchema, evaluateAutomaticConstructionViability, generateAutomaticViabilityDraft } from "./construction-automatic-viability-policy";
import { assertConstructionGedSignature } from "./construction-documents-service";
import { readConstructionPdf, storeConstructionPdf } from "./construction-document-storage";
import { zoneSchema } from "./construction-rules";

type Db = Prisma.TransactionClient;
export type ConstructionAutomaticViabilityRun = {
  id: string; requestKey: string; caseId: string; identityId: string; outcome: string;
  calculationSnapshot: ReturnType<typeof evaluateAutomaticConstructionViability>;
  viabilityResultId: string; documentId: string | null; documentVersionId: string | null;
  signatureRoutingStatus: string; createdAt: Date;
};
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function portalCase(tx: Db, identityId: string, caseId: string, now: Date) {
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const identity = await tx.constructionPortalIdentity.findFirst({ where: { id: identityId, isActive: true, professional: { professionalType: { in: ["ENGINEER", "ARCHITECT", "BROKER"] }, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], person: { status: "Ativo" } } }, select: { id: true } });
  if (!identity) throw new Error("Habilitação profissional vigente obrigatória.");
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionPortalCaseWhere(identityId), { participants: { some: { identityId, isActive: true, startsAt: { lte: now }, endsAt: null } } }] }, include: { process: true, properties: { include: { realEstate: { include: { constructionZone: { include: { zone: true } } } } } } } });
  if (!record) throw new Error("Solicitação indisponível para sua conta.");
  await assertConstructionExternalCompany(tx, identityId, record.process.companyId, now);
  const authorization = await tx.constructionExternalApplication.findFirst({ where: { caseId, identityId } });
  if (authorization) assertExternalApplicationScope(authorization, identityId, { personId: record.process.personId || "", companyId: record.process.companyId || "", subjectId: record.process.subjectId || "", propertyIds: record.properties.map((p) => p.realEstateId) }, now);
  return record;
}

/** Own persistence uses parameterized SQL so parallel agents do not need to regenerate the client. */
export async function runConstructionAutomaticViability(db: PrismaClient, identityId: string, input: unknown, now = new Date()) {
  const data = automaticViabilityInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`construction-auto-viability:${data.requestKey}`}))`;
    await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
    const record = await portalCase(tx, identityId, data.caseId, now);
    const repeated = await tx.$queryRaw<ConstructionAutomaticViabilityRun[]>`SELECT * FROM "ConstructionAutomaticViabilityRun" WHERE "requestKey"=${data.requestKey}`;
    if (repeated[0]) {
      if (repeated[0].caseId !== data.caseId || repeated[0].identityId !== identityId) throw new Error("Chave de consulta indisponível.");
      return repeated[0].id;
    }
    if (["Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Solicitação encerrada não admite nova consulta.");
    const purpose = z.object({ purpose: z.object({ id: z.string().min(1) }) }).safeParse(record.catalogSnapshot);
    const purposeId = purpose.success ? purpose.data.purpose.id : null;
    const purposeActive = Boolean(purposeId && await tx.constructionCatalogEntry.findFirst({ where: { id: purposeId, kind: "PURPOSE", isActive: true }, select: { id: true } }));
    const properties = [];
    for (const p of record.properties) {
      const assigned = p.realEstate.constructionZone?.zone;
      // Territorial assignment supplies the code; use the latest published version effective today.
      const zone = assigned ? await tx.constructionZoneVersion.findFirst({ where: { code: assigned.code, startsAt: { lte: now }, publishedAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: new Date(now.toISOString().slice(0, 10) + "T00:00:00Z") } }] }, orderBy: { version: "desc" } }) : null;
      const normalizedRule = zone ? { ...zone, startsAt: zone.startsAt.toISOString().slice(0, 10), endsAt: zone.endsAt?.toISOString().slice(0, 10) || "", minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString() } : null;
      properties.push({ realEstateId: p.realEstateId, landArea: String(p.realEstate.landArea || 0), cadastralSnapshot: { linkedAtOpening: p.cadastralSnapshot, current: p.realEstate }, rule: normalizedRule ? { ...normalizedRule, ...zoneSchema.parse(normalizedRule) } : null });
    }
    const viabilityDefinition = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "VIABILITY", publishedAt: { lte: now } }, orderBy: { version: "desc" } });
    const snapshot = evaluateAutomaticConstructionViability({ category: record.category, locationType: record.locationType, purposeId, purposeActive, catalogSnapshot: record.catalogSnapshot, proposedArea: record.totalArea.toString(), today: now.toISOString().slice(0, 10), properties, viabilityDefinitionSnapshot: viabilityDefinition ? { ...viabilityDefinition, publishedAt: viabilityDefinition.publishedAt.toISOString() } : null });
    const result = await tx.constructionViabilityResult.create({ data: { caseId: record.id, requestKey: data.requestKey, outcome: snapshot.outcome, calculationSnapshot: json(snapshot), createdBy: `CONSTRUCTION_PORTAL_IDENTITY:${identityId}` } });
    const id = randomUUID();
    let documentId: string | null = null; let documentVersionId: string | null = null; let routing = "NOT_APPLICABLE";
    if (snapshot.outcome !== "MANUAL") {
      const validationCode = randomUUID().replaceAll("-", "");
      const bytes = await generateAutomaticViabilityDraft({ protocol: record.process.protocolNumber, snapshot, validationCode });
      const stored = await storeConstructionPdf(bytes, `viabilidade-demonstrativa-${id}.pdf`);
      const documentClass = await tx.documentClass.upsert({ where: { code: "CONSTRUCTION_AUTOMATIC_VIABILITY_DEMO" }, create: { code: "CONSTRUCTION_AUTOMATIC_VIABILITY_DEMO", label: "Viabilidade automática demonstrativa", signaturePolicy: "INTERNAL_ALLOWED" }, update: {} });
      if (!documentClass.isActive || documentClass.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Classe GED demonstrativa indisponível.");
      const document = await tx.document.create({ data: { title: `Viabilidade demonstrativa ${record.process.protocolNumber}`, documentType: "Consulta automática de viabilidade demonstrativa", fileUrl: stored.fileUrl, documentClassId: documentClass.id, status: "Pendente Assinatura", publicLabel: "DEMONSTRATIVO — consulta limitada, sem homologação oficial", notes: JSON.stringify({ automaticViabilityRunId: id, backupPath: stored.backupPath, identityId, actorType: "AUTOMATED_SERVICE" }) } });
      const version = await tx.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256, publicValidationCode: validationCode, status: "FINAL" } });
      await tx.processDocument.create({ data: { processId: record.processId, documentId: document.id, purpose: "Viabilidade automática demonstrativa — assinatura GED pendente" } });
      documentId = document.id; documentVersionId = version.id;
      const departmentId = record.process.currentDepartmentId;
      const roles = departmentId ? await tx.constructionStaffRole.findMany({ where: { role: "MANAGER", departmentId, isActive: true, startsAt: { lte: today(now) }, OR: [{ endsAt: null }, { endsAt: { gte: today(now) } }], employee: { isActive: true, departmentId } }, select: { employeeId: true } }) : [];
      const signers = roles.length ? await tx.usuario.findMany({ where: { ativo: true, employeeId: { in: roles.map((r) => r.employeeId) } }, select: { id: true, employeeId: true, nome: true, email: true } }) : [];
      routing = signers.length ? "REQUESTED" : "AWAITING_SIGNER_CONFIGURATION";
      if (signers.length) {
        await tx.documentVersion.update({ where: { id: version.id }, data: { status: "PENDING_SIGNATURE", lockedAt: now } });
        await tx.documentSignature.createMany({ data: signers.map((signer) => ({ documentId: document.id, documentVersionId: version.id, signerUsuarioId: signer.id, signerEmployeeId: signer.employeeId, signerName: signer.nome, signerEmail: signer.email, requestedByUsuarioId: null, documentHash: stored.hashSha256, verificationCode: randomUUID().replaceAll("-", ""), authenticationMethod: "PENDING_REAUTHENTICATION", isRequired: true, status: "PENDING", metadata: JSON.stringify({ actorType: "AUTOMATED_SERVICE", identityId, automaticViabilityRunId: id, demonstration: true }) })) });
      }
    }
    await tx.$executeRaw`INSERT INTO "ConstructionAutomaticViabilityRun" ("id","requestKey","caseId","identityId","outcome","calculationSnapshot","viabilityResultId","documentId","documentVersionId","signatureRoutingStatus") VALUES (${id},${data.requestKey},${record.id},${identityId},${snapshot.outcome},${JSON.stringify(json(snapshot))}::jsonb,${result.id},${documentId},${documentVersionId},${routing})`;
    await tx.processEvent.create({ data: { processId: record.processId, departmentId: record.process.currentDepartmentId, eventType: "CONSTRUCTION_AUTOMATIC_VIABILITY", description: `Consulta online demonstrativa: ${snapshot.outcome}; assinatura GED: ${routing}.`, metadata: JSON.stringify({ actorType: "AUTOMATED_SERVICE", requestedByIdentityId: identityId, runId: id, viabilityResultId: result.id, documentId }) } });
    return id;
  }, { timeout: 60000 });
}
function today(now: Date) { return new Date(now.toISOString().slice(0, 10) + "T00:00:00Z"); }

export async function listConstructionAutomaticViability(db: PrismaClient, identityId: string, caseId: string) {
  return db.$transaction(async (tx) => {
    await portalCase(tx, identityId, caseId, new Date());
    // Storage URLs, filesystem backup paths and identities are never sent to the portal.
    const rows = await tx.$queryRaw<ConstructionAutomaticViabilityRun[]>`SELECT * FROM "ConstructionAutomaticViabilityRun" WHERE "caseId"=${caseId} ORDER BY "createdAt" DESC LIMIT 20`;
    const result = [];
    for (const row of rows) {
      let downloadable = false;
      if (row.documentVersionId) { try { await assertConstructionGedSignature(tx, row.documentVersionId); downloadable = true; } catch { /* Pending/rejected signatures stay blocked. */ } }
      result.push({ id: row.id, outcome: row.outcome, calculationSnapshot: row.calculationSnapshot, signatureRoutingStatus: row.signatureRoutingStatus, documentId: row.documentId, createdAt: row.createdAt.toISOString(), downloadable });
    }
    return result;
  });
}

export async function downloadConstructionAutomaticViability(db: PrismaClient, identityId: string, caseId: string, runId: string) {
  return db.$transaction(async (tx) => {
    await portalCase(tx, identityId, caseId, new Date());
    const [row] = await tx.$queryRaw<ConstructionAutomaticViabilityRun[]>`SELECT * FROM "ConstructionAutomaticViabilityRun" WHERE "id"=${runId} AND "caseId"=${caseId}`;
    if (!row?.documentVersionId || !row.documentId) throw new Error("Documento indisponível.");
    const document = await tx.document.findUniqueOrThrow({ where: { id: row.documentId }, select: { status: true } });
    if (["Cancelado", "CANCELLED", "Vencido", "SUPERSEDED"].includes(document.status)) throw new Error("Documento indisponível.");
    const version = await assertConstructionGedSignature(tx, row.documentVersionId);
    if (version.documentId !== row.documentId) throw new Error("Vínculo GED inválido.");
    return { bytes: await readConstructionPdf(version.fileUrl, version.hashSha256), hash: version.hashSha256, filename: `viabilidade-demonstrativa-${row.id}.pdf` };
  });
}
