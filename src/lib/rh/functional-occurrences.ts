import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";

export const functionalOccurrenceInputSchema = z.object({ sourceKey: z.string().trim().min(1).max(140), contractId: z.string().min(1), type: z.enum(["ADVERTENCIA", "ELOGIO", "MULTA", "OUTRA"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(3).max(4000), notes: z.string().trim().max(4000).default(""), personnelActId: z.string().min(1), documentIds: z.array(z.string().min(1)).max(100), amount: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/).optional() }).strict();

export async function assertPersonnelActNotIntegrated(tx: Prisma.TransactionClient, actId: string) {
  await tx.$queryRaw`SELECT id FROM "PersonnelAct" WHERE id=${actId} FOR UPDATE`;
  const linked = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "OCORRENCIA_FUNCIONAL_REGISTRADA", payload: { path: ["input", "personnelActId"], equals: actId } }, select: { id: true } });
  if (linked) throw new Error("Ato com ocorrência funcional integrada exige correção compensatória; preserve o registro original.");
  const lifecycle = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "EFEITO_FUNCIONAL_RESCISAO", payload: { path: ["results"], array_contains: [{ actId }] } }, select: { id: true } });
  if (lifecycle) throw new Error("Ato com desligamento/reintegração integrada exige correção compensatória; preserve o registro original.");
}

export async function registerFunctionalOccurrence(db: PrismaClient, actorId: string, raw: unknown) {
  const input = functionalOccurrenceInputSchema.parse(raw);
  input.documentIds = [...new Set(input.documentIds)].sort();
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data civil da ocorrência inválida.");
  if (input.type === "MULTA" ? !input.amount || new Prisma.Decimal(input.amount).lte(0) : input.amount !== undefined) throw new Error("Valor positivo é obrigatório somente para ocorrência de multa.");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:OCCURRENCE:${input.sourceKey}`}))`;
    const sourceKey = `OCORRENCIA:${input.sourceKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      if (JSON.stringify(functionalOccurrenceInputSchema.parse((previous.payload as { input: unknown }).input)) !== JSON.stringify(input)) throw new Error("Chave da ocorrência reutilizada com outros dados.");
      return previous;
    }
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId }, include: { revisions: true, employee: { select: { personId: true } } } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${stored.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${stored.id}`}))`;
    const current = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: stored.id }, include: { revisions: true } });
    const contract = resolveContractRevision(current, current.revisions, { start: date, end: date }).contract;
    if (contract.status !== "ATIVO" || date < contract.admittedAt || (contract.endsAt && date > contract.endsAt)) throw new Error("Ocorrência fora do período ativo do contrato.");
    await tx.$queryRaw`SELECT id FROM "PersonnelAct" WHERE id=${input.personnelActId} FOR SHARE`;
    const act = await tx.personnelAct.findUniqueOrThrow({ where: { id: input.personnelActId } });
    if (act.employeeId !== stored.employeeId || act.date.toISOString().slice(0, 10) > input.date) throw new Error("Ato deve pertencer ao titular e não ser posterior à ocorrência.");
    const documents = await tx.document.findMany({ where: { id: { in: input.documentIds } }, select: { id: true, title: true, documentType: true, personId: true, companyId: true, status: true, validUntil: true, updatedAt: true, healthClinicalDocument: { select: { id: true } }, healthStandardDocument: { select: { id: true } }, sstCertificateDocument: { select: { id: true } } }, orderBy: { id: "asc" } });
    if (documents.length !== input.documentIds.length || documents.some(document => document.companyId || (document.personId && document.personId !== stored.employee.personId) || document.healthClinicalDocument || document.healthStandardDocument || document.sstCertificateDocument)) throw new Error("Anexo ausente, de outro titular ou de origem clínica protegida; use documentos funcionais do GED.");
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId }, include: { ruleSet: { select: { scope: true } } } });
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: regime.ruleSet.scope, eventType: "OCORRENCIA_FUNCIONAL_REGISTRADA", payload: { input, employeeId: stored.employeeId, personId: stored.employee.personId, contractVersion: contract.version, actorId, act, documents, affectsPayroll: false } });
  });
}

export async function cancelFunctionalOccurrence(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ occurrenceId: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:OCCURRENCE_CANCEL:${input.occurrenceId}`}))`;
    const original = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { id: input.occurrenceId } });
    if (original.eventType !== "OCORRENCIA_FUNCIONAL_REGISTRADA") throw new Error("Selecione uma ocorrência funcional original.");
    const sourceKey = `OCORRENCIA:CANCELAMENTO:${original.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      if ((previous.payload as { reason: string }).reason !== input.reason) throw new Error("Ocorrência cancelada com outro fundamento.");
      return previous;
    }
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "OCORRENCIA_FUNCIONAL_CANCELADA", payload: { occurrenceId: original.id, reason: input.reason, actorId } });
  });
}
