import { Prisma } from "@prisma/client";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { createExportSnapshot, exportRequestSchema, selectConstructionExportPermit, type ExportRecord } from "./construction-export";
import { constructionCurrentPublishedArtifactWhere } from "./construction-lifecycle-policy";

export async function constructionExportRecords(tx: Prisma.TransactionClient, access: ConstructionAccess, caseIds: string[]): Promise<ExportRecord[]> {
  const cases = await tx.constructionCase.findMany({ where: { AND: [{ id: { in: caseIds } }, constructionCaseWhere(access)] }, include: { process: { include: { person: true, company: true } }, properties: { include: { realEstate: true } }, lifecycleStart: true } });
  if (cases.length !== caseIds.length) throw new Error("Há processos indisponíveis no lote.");
  const now = new Date();
  const permits = await tx.constructionIssuedDocument.findMany({ where: { caseId: { in: caseIds }, kind: "PERMIT", ...constructionCurrentPublishedArtifactWhere(now) }, orderBy: { publishedAt: "desc" } });
  const versions = await tx.documentVersion.findMany({ where: { id: { in: permits.map((permit) => permit.documentVersionId) }, status: "SIGNED" }, include: { signatures: true } });
  return cases.map((item) => {
    const permit = selectConstructionExportPermit(item.id, permits, versions, now);
    return { caseId: item.id, protocol: item.process.protocolNumber, permitId: permit?.id || null, permitNumber: permit?.number || null, permitIssuedAt: permit?.publishedAt?.toISOString() || null, permitStatus: permit?.status || null, permitDocumentVersionId: permit?.documentVersionId || null, permitHashSha256: permit?.hashSha256 || null, permitValidUntil: permit?.validUntil?.toISOString() || null, ownerDocument: item.process.person?.cpf || item.process.company?.cnpj || null, properties: item.properties.map(({ realEstate }) => ({ registration: realEstate.municipalInsc, address: realEstate.streetName ? [realEstate.streetName, realEstate.number].filter(Boolean).join(", ") : null })), area: item.totalArea.toFixed(4), startedAt: item.lifecycleStart?.startedAt.toISOString().slice(0, 10) || null };
  });
}

export async function persistConstructionExport(tx: Prisma.TransactionClient, access: ConstructionAccess, actor: string, input: unknown) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Lotes restritos ao gestor.");
  const data = exportRequestSchema.parse(input);
  const scope = access.administrator ? "GLOBAL" : access.departmentId!;
  // Serializes version allocation and rectification chain for this scope/period.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`construction-export:${scope}:${data.period}`}))`;
  const repeated = await tx.constructionFederalExport.findUnique({ where: { requestKey: data.requestKey } });
  if (repeated) {
    if (repeated.scope !== scope || repeated.createdBy !== actor) throw new Error("Referência indisponível.");
    return repeated;
  }
  const latest = await tx.constructionFederalExport.findFirst({ where: { scope, period: data.period }, orderBy: { version: "desc" } });
  if (data.rectifiesId) {
    const previous = await tx.constructionFederalExport.findUnique({ where: { id: data.rectifiesId } });
    if (!previous || previous.scope !== scope || previous.period !== data.period || latest?.id !== previous.id) throw new Error("Retifique o lote mais recente da mesma competência e setor.");
  } else if (latest) throw new Error("Já existe lote nesta competência. Use retificação para preservar o histórico.");
  const records = await constructionExportRecords(tx, access, data.caseIds);
  const snapshot = createExportSnapshot(records, { period: data.period, version: (latest?.version || 0) + 1, rectifiesId: data.rectifiesId, reason: data.reason, createdAt: new Date().toISOString() });
  return tx.constructionFederalExport.create({ data: { requestKey: data.requestKey, scope, period: data.period, version: (latest?.version || 0) + 1, payload: snapshot.payload, hashSha256: snapshot.hashSha256, validationSnapshot: snapshot.validation, rectifiesId: data.rectifiesId, reason: data.reason, createdBy: actor, items: { create: records.map((record) => ({ caseId: record.caseId })) } } });
}
