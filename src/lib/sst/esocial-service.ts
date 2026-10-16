import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertSstClinicalAccess, sstUnitWhere } from "./access";
import { assertDisciplineAccess } from "./clinical-access";
import { configurationInput, preparationInput, esocialReference, hashArtifact, buildValidatedXml, verifyExchangeResponse, type EsocialTransport, type SourceEnvelope, type SubmissionBinding } from "./esocial-contract";
import { loadEsocialSource } from "./esocial-source";

export type EsocialEventRow = {
  id: string; budgetUnitId: string; employeeId: string | null; kind: SourceEnvelope["kind"];
  environment: SubmissionBinding["environment"]; sourceId: string; sourceVersion: string; sourceHash: string;
  sourceSnapshot: SourceEnvelope["data"]; missingFields: string[]; configurationId: string | null;
  layout: string; submissionKey: string; requestHash: string; createdById: string; createdAt: Date;
};
type Configuration = { id: string; budgetUnitId: string; environment: SubmissionBinding["environment"]; employerRegistration: string; credentialReference: string; providerReference: string; layout: string; version: number };
type Evidence = { id: string; status: string; protocol: string; receipt: string | null; receivedAt: Date; signedXml: string; xmlHash: string; eventXmlId: string; certificateFingerprint: string };
function mutation(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("Sem permissão para preparar integrações SST.", 403);
}
export async function integrationUnits(context: AppContext) {
  return context.prisma.budgetUnit.findMany({ where: { ...sstUnitWhere(context), ...(isSystemAdministrator(context.user) ? {} : { sstAccessGrants: { some: { usuarioId: context.user.id, isActive: true, canReadClinical: true } } }) }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
}
export async function configureEsocial(context: AppContext, raw: unknown) {
  mutation(context);
  const input = configurationInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  const requestHash = hashArtifact(JSON.stringify(input));
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ESOCIAL_CONFIG:${input.budgetUnitId}:${input.environment}`}))`;
    const existing = await tx.$queryRaw<{ id: string; requestHash: string; createdById: string }[]>`SELECT id,"requestHash","createdById" FROM "SstEsocialConfiguration" WHERE "budgetUnitId"=${input.budgetUnitId} AND "submissionKey"=${input.submissionKey}`;
    if (existing[0]) {
      if (existing[0].requestHash !== requestHash || existing[0].createdById !== context.user.id) throw new Error("Submissão reutilizada com outros dados.");
      return existing[0].id;
    }
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "SstEsocialConfiguration" (id,"budgetUnitId",environment,version,"employerRegistration","credentialReference","providerReference",layout,"submissionKey","requestHash","createdById") SELECT ${id},${input.budgetUnitId},${input.environment},COALESCE(MAX(version),0)+1,${input.employerRegistration},${input.credentialReference},${input.providerReference},${esocialReference.layout},${input.submissionKey},${requestHash},${context.user.id} FROM "SstEsocialConfiguration" WHERE "budgetUnitId"=${input.budgetUnitId} AND environment=${input.environment}`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ESOCIAL_CONFIGURATION", targetId: id });
    return id;
  });
}
export async function prepareEsocial(context: AppContext, raw: unknown) {
  mutation(context);
  const input = preparationInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  const requestHash = hashArtifact(JSON.stringify(input));
  const source = await loadEsocialSource(context, input.kind, input.sourceId, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ESOCIAL:${input.budgetUnitId}:${input.kind}:${input.environment}:${input.sourceId}`}))`;
    const prior = await tx.$queryRaw<EsocialEventRow[]>`SELECT * FROM "SstEsocialEvent" WHERE "budgetUnitId"=${input.budgetUnitId} AND "submissionKey"=${input.submissionKey}`;
    if (prior[0]) {
      if (prior[0].requestHash !== requestHash || prior[0].createdById !== context.user.id) throw new Error("Submissão reutilizada com outros dados.");
      return prior[0].id;
    }
    const configs = await tx.$queryRaw<Configuration[]>`SELECT * FROM "SstEsocialConfiguration" WHERE "budgetUnitId"=${input.budgetUnitId} AND environment=${input.environment} ORDER BY version DESC LIMIT 1`;
    const configurationKey = configs[0]?.id ?? "UNCONFIGURED";
    const same = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SstEsocialEvent" WHERE "budgetUnitId"=${input.budgetUnitId} AND kind=${input.kind} AND environment=${input.environment} AND "sourceId"=${source.sourceId} AND "sourceHash"=${source.sourceHash} AND "configurationKey"=${configurationKey}`;
    if (same[0]) return same[0].id;
    const id = randomUUID();
    const missing = [...source.missing, ...(!configs[0] ? ["Configuração externa do empregador/ambiente"] : [])];
    await tx.$executeRaw`INSERT INTO "SstEsocialEvent" (id,"budgetUnitId","employeeId",kind,environment,"sourceId","sourceVersion","sourceHash","sourceSnapshot","missingFields","configurationId","configurationKey",layout,"submissionKey","requestHash","createdById") VALUES (${id},${source.budgetUnitId},${source.employeeId},${source.kind},${input.environment},${source.sourceId},${source.sourceVersion},${source.sourceHash},${JSON.stringify(source.data)}::jsonb,${JSON.stringify(missing)}::jsonb,${configs[0]?.id ?? null},${configurationKey},${esocialReference.layout},${input.submissionKey},${requestHash},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ESOCIAL_PREPARATION", targetId: id });
    return id;
  });
}
export async function readEsocialEvent(context: AppContext, id: string) {
  const rows = await context.prisma.$queryRaw<EsocialEventRow[]>`SELECT * FROM "SstEsocialEvent" WHERE id=${id}`;
  if (!rows[0]) throw new Error("Preparação não encontrada.");
  await assertSstClinicalAccess(context, rows[0].budgetUnitId);
  if (rows[0].kind !== "S2240") await assertDisciplineAccess(context, rows[0].budgetUnitId, "MEDICINE");
  const evidence = await context.prisma.$queryRaw<Pick<Evidence, "id" | "status" | "protocol" | "receipt" | "receivedAt">[]>`SELECT id,status,protocol,receipt,"receivedAt" FROM "SstEsocialEvidence" WHERE "eventId"=${id} ORDER BY revision DESC LIMIT 20`;
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_ESOCIAL_EVENT", targetId: id });
  return { ...rows[0], evidence };
}
export async function listEsocialEvents(context: AppContext, budgetUnitId: string | undefined, requestedPage: number) {
  const units = await integrationUnits(context);
  const ids = units.filter((unit) => !budgetUnitId || unit.id === budgetUnitId).map((unit) => unit.id);
  if (!ids.length) return { units, records: [], total: 0, page: 1 };
  const filter = Prisma.sql`"budgetUnitId" IN (${Prisma.join(ids)})`;
  const counts = await context.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "SstEsocialEvent" WHERE ${filter}`);
  const total = Number(counts[0].total);
  const page = Math.min(Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.$queryRaw<Pick<EsocialEventRow, "id" | "kind" | "environment" | "sourceId" | "createdAt" | "missingFields">[]>(Prisma.sql`SELECT id,kind,environment,"sourceId","createdAt","missingFields" FROM "SstEsocialEvent" WHERE ${filter} ORDER BY "createdAt" DESC,id ASC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { units, records, total, page };
}

// Called only from a server-resolved provider, never from a return-upload API.
// No REAL provider is installed yet. External credentials are never serialized.
export async function transmitEsocial(context: AppContext, eventId: string, transport?: EsocialTransport) {
  mutation(context);
  const row = await readEsocialEvent(context, eventId);
  await assertSstClinicalAccess(context, row.budgetUnitId, true);
  if (!transport || transport.mode !== "REAL") throw new Error("Transmissão bloqueada: certificado A1 e adaptador real XMLDSig/XSD/mTLS indisponíveis.");
  if (row.missingFields.length || !row.configurationId) throw new Error("Preparação com pendências de origem/configuração.");
    const configs = await context.prisma.$queryRaw<Configuration[]>`SELECT * FROM "SstEsocialConfiguration" WHERE id=${row.configurationId}`;
    const config = configs[0];
    if (!config || config.environment !== row.environment || config.budgetUnitId !== row.budgetUnitId) throw new Error("Configuração incompatível.");
    const source = await loadEsocialSource(context, row.kind, row.sourceId, row.budgetUnitId);
    if (source.sourceHash !== row.sourceHash || source.sourceVersion !== row.sourceVersion) throw new Error("Origem alterada: prepare nova versão.");
    const binding: SubmissionBinding = { ...source, eventId, environment: row.environment, layout: row.layout, credentialReference: config.credentialReference, employerRegistration: config.employerRegistration };
    const previous = (await context.prisma.$queryRaw<Evidence[]>`SELECT * FROM "SstEsocialEvidence" WHERE "eventId"=${eventId} ORDER BY revision DESC LIMIT 1`)[0];
    if (previous && previous.status !== "PROCESSING") return previous.id;
    const result = previous ? await (async () => {
      const signed = { xml: previous.signedXml, xmlHash: previous.xmlHash, eventXmlId: previous.eventXmlId, certificateFingerprint: previous.certificateFingerprint };
      await transport.validateSignedXml(signed, source, binding);
      const response = await transport.consult(previous.protocol, binding);
      return { signed, response, verified: await verifyExchangeResponse(transport, response, signed, binding, previous.protocol) };
    })() : await (async () => {
      const signed = await buildValidatedXml(source, binding, transport);
      // Commit the signed artifact and unique send guard before touching the
      // network. No transaction/connection is held during mTLS exchange.
      const claimed = await context.prisma.$executeRaw`INSERT INTO "SstEsocialAttempt" (id,"eventId","signedXml","xmlHash","eventXmlId","certificateFingerprint","createdById") VALUES (${randomUUID()},${eventId},${signed.xml},${signed.xmlHash},${signed.eventXmlId},${signed.certificateFingerprint},${context.user.id}) ON CONFLICT ("eventId") DO NOTHING`;
      if (!claimed) throw new Error("Envio anterior sem retorno confirmado: reconciliação no provedor obrigatória; reenvio bloqueado.");
      const response = await transport.send(signed, binding);
      return { signed, response, verified: await verifyExchangeResponse(transport, response, signed, binding) };
    })();
    const responseHash = hashArtifact(result.response.bytes);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ESOCIAL_RESPONSE:${eventId}`}))`;
    const duplicate = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SstEsocialEvidence" WHERE "eventId"=${eventId} AND "responseHash"=${responseHash}`)[0];
    if (duplicate) return duplicate.id;
    const id = randomUUID();
    const { signed, response, verified } = result;
    await tx.$executeRaw`INSERT INTO "SstEsocialEvidence" (id,"eventId",environment,status,"signedXml","xmlHash","eventXmlId","certificateFingerprint","responseXml","responseHash",endpoint,"correlationId",protocol,receipt,"rejectionCodes","processedAt","receivedAt","createdById") VALUES (${id},${eventId},${row.environment},${verified.outcome},${signed.xml},${signed.xmlHash},${signed.eventXmlId},${signed.certificateFingerprint},${response.bytes},${responseHash},${response.endpoint},${response.correlationId},${verified.protocol},${verified.receipt},${JSON.stringify(verified.rejectionCodes)}::jsonb,${verified.processedAt},${response.receivedAt},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ESOCIAL_VERIFIED_RESPONSE", targetId: id });
    return id;
  }, { timeout: 60_000 });
}
