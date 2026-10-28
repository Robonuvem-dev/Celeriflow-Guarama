import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertDifferentSystemAdministrators, assertMergeReversalAllowed, assertPersonMergeEligible, rankPersonMergeCandidates, type MergeCandidate, type PersonMergeEligibilityInput, type PersonMergeManifest } from "@/lib/cadastros/person-merge-policy";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { PersonMergePageData } from "@/lib/contracts/person-merge";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { people } from "../../schema/people";
import { addresses, documents } from "../../schema/registry";
import { users } from "../../schema/identity";
import { personMergeLedger, personMergeRequests } from "../../schema/person-merge";
import { insertAuditEvent } from "../platform/audit";

async function getSourceEligibility(db: DatabaseExecutor, sourcePersonId: string) {
  const [source] = await db.select({ id: people.id, status: people.status, updatedAt: people.updatedAt }).from(people).where(eq(people.id, sourcePersonId)).limit(1);
  if (!source) throw new Error("Pessoa de origem não encontrada.");
  if (source.status === "Arquivado por mesclagem") throw new Error("A pessoa de origem já está arquivada por mesclagem.");
  const eligibility = await db.execute<PersonMergeEligibilityInput>(sql`SELECT
    EXISTS(SELECT 1 FROM "Taxpayer" WHERE "personId"=${source.id}) AS fiscal,
    (EXISTS(SELECT 1 FROM "Supplier" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "Creditor" WHERE "personId"=${source.id})) AS financial,
    (EXISTS(SELECT 1 FROM "Employee" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "Dependent" WHERE "personId"=${source.id})) AS rh,
    EXISTS(SELECT 1 FROM "Patient" WHERE "personId"=${source.id}) AS health,
    (EXISTS(SELECT 1 FROM "Student" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "EducationalGuardian" WHERE "personId"=${source.id})) AS education,
    (EXISTS(SELECT 1 FROM "SocialFamily" WHERE "representativeId"=${source.id}) OR EXISTS(SELECT 1 FROM "SocialFamilyMember" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "SocialAttendance" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "SocialBenefitConcession" WHERE "personId"=${source.id})) AS social,
    EXISTS(SELECT 1 FROM "Process" WHERE "personId"=${source.id}) AS process,
    (EXISTS(SELECT 1 FROM "Ticket" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "Ombudsman" WHERE "personId"=${source.id}) OR EXISTS(SELECT 1 FROM "OmbudsmanIdentity" WHERE "personId"=${source.id})) AS attendance,
    EXISTS(SELECT 1 FROM "Document" d JOIN "DocumentSignature" s ON s."documentId"=d.id WHERE d."personId"=${source.id} AND s.status='SIGNED') AS "signedDocument"`);
  assertPersonMergeEligible(eligibility.rows[0]);
  const movable = await db.execute<{ id: string }>(sql`SELECT d.id FROM "Document" d WHERE d."personId"=${source.id}
    AND NOT EXISTS(SELECT 1 FROM "DocumentSignature" s WHERE s."documentId"=d.id AND s.status='SIGNED')
    AND NOT EXISTS(SELECT 1 FROM "DocumentVersion" v WHERE v."documentId"=d.id AND v."lockedAt" IS NOT NULL)`);
  return { ...source, documents: movable.rows };
}

export async function getPersonMergeCandidates(db: DatabaseExecutor, sourcePersonId: string): Promise<MergeCandidate[]> {
  const records = await db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf, birthDate: people.birthDate, email: people.email, phonePrimary: people.phonePrimary, status: people.status }).from(people).where(ne(people.status, "Arquivado por mesclagem")).limit(250);
  const source = records.find(person => person.id === sourcePersonId);
  if (!source) throw new Error("Pessoa de origem não encontrada.");
  return rankPersonMergeCandidates(source, records);
}

export async function loadPersonMergePage(db: DatabaseExecutor): Promise<PersonMergePageData> {
  const source = alias(people, "mergeSource"), target = alias(people, "mergeTarget");
  const [personRows, requests] = await Promise.all([
    db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(ne(people.status, "Arquivado por mesclagem")).orderBy(asc(people.fullName)).limit(250),
    db.select({ id: personMergeRequests.id, status: personMergeRequests.status, sourcePerson: { fullName: source.fullName }, targetPerson: { fullName: target.fullName }, proposedByUsuario: { nome: users.nome } }).from(personMergeRequests)
      .innerJoin(source, eq(personMergeRequests.sourcePersonId, source.id)).innerJoin(target, eq(personMergeRequests.targetPersonId, target.id)).innerJoin(users, eq(personMergeRequests.proposedByUsuarioId, users.id)).orderBy(desc(personMergeRequests.createdAt)).limit(50),
  ]);
  return { people: personRows, requests };
}

export async function proposePersonMergeInTransaction(tx: DatabaseTransaction, actor: { id: string }, sourcePersonId: string, targetPersonId: string): Promise<string> {
  if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId) throw new Error("Selecione pessoas de origem e destino diferentes.");
  await getSourceEligibility(tx, sourcePersonId);
  const [target] = await tx.select({ id: people.id, status: people.status }).from(people).where(eq(people.id, targetPersonId)).limit(1);
  if (!target || target.status === "Arquivado por mesclagem") throw new Error("Pessoa de destino inválida.");
  const [created] = await tx.insert(personMergeRequests).values({ sourcePersonId, targetPersonId, proposedByUsuarioId: actor.id }).returning({ id: personMergeRequests.id });
  await tx.insert(personMergeLedger).values({ requestId: created.id, eventType: "PROPOSED", sourcePersonId, targetPersonId, actorUsuarioId: actor.id, manifest: { version: 1, requestId: created.id } });
  await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.personMergeProposed, targetType: "PERSON_MERGE_REQUEST", targetId: created.id });
  return created.id;
}

export async function approveAndExecutePersonMergeInTransaction(tx: DatabaseTransaction, actor: { id: string }, requestId: string): Promise<string> {
  const [request] = await tx.select().from(personMergeRequests).where(eq(personMergeRequests.id, requestId)).limit(1);
  if (!request || request.status !== "PROPOSED") throw new Error("Proposta de mesclagem não está pendente.");
  assertDifferentSystemAdministrators(request.proposedByUsuarioId, actor.id);
  const source = await getSourceEligibility(tx, request.sourcePersonId);
  const [target] = await tx.select({ id: people.id, status: people.status }).from(people).where(eq(people.id, request.targetPersonId)).limit(1);
  if (!target || target.status === "Arquivado por mesclagem") throw new Error("Pessoa de destino inválida.");
  const sourceAddresses = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.personId, source.id));
  const executedAt = new Date();
  const manifest: PersonMergeManifest = { version: 1, sourcePersonId: source.id, targetPersonId: target.id, sourcePreviousStatus: source.status, executedAt: executedAt.toISOString(), addressIds: sourceAddresses.map(row => row.id), documentIds: source.documents.map(row => row.id) };
  const claimed = await tx.update(personMergeRequests).set({ status: "EXECUTED", approvedByUsuarioId: actor.id, approvedAt: executedAt, executedAt }).where(and(eq(personMergeRequests.id, request.id), eq(personMergeRequests.status, "PROPOSED"), ne(personMergeRequests.proposedByUsuarioId, actor.id))).returning({ id: personMergeRequests.id });
  if (claimed.length !== 1) throw new Error("A proposta foi alterada antes da aprovação.");
  await tx.update(addresses).set({ personId: target.id, updatedAt: executedAt }).where(and(inArray(addresses.id, manifest.addressIds), eq(addresses.personId, source.id)));
  await tx.update(documents).set({ personId: target.id, updatedAt: executedAt }).where(and(inArray(documents.id, manifest.documentIds), eq(documents.personId, source.id)));
  await tx.update(people).set({ status: "Arquivado por mesclagem", updatedAt: executedAt }).where(eq(people.id, source.id));
  await tx.insert(personMergeLedger).values({ requestId: request.id, eventType: "EXECUTED", sourcePersonId: source.id, targetPersonId: target.id, actorUsuarioId: actor.id, manifest });
  await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.personMergeExecuted, targetType: "PERSON_MERGE_REQUEST", targetId: request.id });
  return request.id;
}

export async function reversePersonMergeInTransaction(tx: DatabaseTransaction, actor: { id: string }, requestId: string): Promise<string> {
  const [request] = await tx.select().from(personMergeRequests).where(eq(personMergeRequests.id, requestId)).limit(1);
  if (!request || request.status !== "EXECUTED" || !request.executedAt) throw new Error("Mesclagem não pode ser revertida.");
  const [ledger] = await tx.select({ manifest: personMergeLedger.manifest }).from(personMergeLedger).where(and(eq(personMergeLedger.requestId, requestId), eq(personMergeLedger.eventType, "EXECUTED"))).orderBy(desc(personMergeLedger.createdAt)).limit(1);
  if (!ledger) throw new Error("Manifesto de mesclagem não encontrado.");
  const manifest = ledger.manifest as PersonMergeManifest;
  const [sourceRows, targetRows, movedAddresses, movedDocuments] = await Promise.all([
    tx.select({ id: people.id, status: people.status, updatedAt: people.updatedAt }).from(people).where(eq(people.id, manifest.sourcePersonId)).limit(1),
    tx.select({ id: people.id, updatedAt: people.updatedAt }).from(people).where(eq(people.id, manifest.targetPersonId)).limit(1),
    tx.select({ id: addresses.id, personId: addresses.personId, updatedAt: addresses.updatedAt }).from(addresses).where(inArray(addresses.id, manifest.addressIds)),
    tx.select({ id: documents.id, personId: documents.personId, updatedAt: documents.updatedAt }).from(documents).where(inArray(documents.id, manifest.documentIds)),
  ]);
  const source = sourceRows[0], target = targetRows[0];
  if (!source || !target) throw new Error("Pessoas da mesclagem não foram encontradas.");
  if (movedAddresses.length !== manifest.addressIds.length || movedDocuments.length !== manifest.documentIds.length) throw new Error("Não é possível reverter: itens do manifesto não foram encontrados.");
  if (manifest.documentIds.length) {
    const laterEvidence = await tx.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "DocumentSignature" WHERE "documentId" IN (${sql.join(manifest.documentIds.map(id => sql`${id}`), sql`, `)}) AND "createdAt">${request.executedAt.toISOString()}::timestamp)
      OR EXISTS(SELECT 1 FROM "DocumentVersion" WHERE "documentId" IN (${sql.join(manifest.documentIds.map(id => sql`${id}`), sql`, `)}) AND "lockedAt">${request.executedAt.toISOString()}::timestamp) AS found`);
    if (laterEvidence.rows[0].found) throw new Error("Não é possível reverter: documento transferido recebeu assinatura ou bloqueio posterior.");
  }
  assertMergeReversalAllowed(manifest, source.status, target.updatedAt, [...movedAddresses, ...movedDocuments], source.updatedAt);
  const reversedAt = new Date();
  const changed = await tx.update(personMergeRequests).set({ status: "REVERSED", reversedAt, reversedByUsuarioId: actor.id }).where(and(eq(personMergeRequests.id, request.id), eq(personMergeRequests.status, "EXECUTED"))).returning({ id: personMergeRequests.id });
  if (changed.length !== 1) throw new Error("A mesclagem foi alterada antes da reversão.");
  await tx.update(addresses).set({ personId: source.id }).where(and(inArray(addresses.id, manifest.addressIds), eq(addresses.personId, target.id)));
  await tx.update(documents).set({ personId: source.id }).where(and(inArray(documents.id, manifest.documentIds), eq(documents.personId, target.id)));
  await tx.update(people).set({ status: manifest.sourcePreviousStatus, updatedAt: reversedAt }).where(eq(people.id, source.id));
  await tx.insert(personMergeLedger).values({ requestId: request.id, eventType: "REVERSED", sourcePersonId: source.id, targetPersonId: target.id, actorUsuarioId: actor.id, manifest: { version: 1, requestId: request.id, reversedAt: reversedAt.toISOString() } });
  await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.personMergeReversed, targetType: "PERSON_MERGE_REQUEST", targetId: request.id });
  return request.id;
}
