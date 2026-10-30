import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { Database, DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { centralDocumentTypes, centralRecords, centralSigners, type CentralRecordRow } from "@/db/schema/signature-central";
import { users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { centralOwnerFilter, findCentralOrigins, findCentralRecords } from "@/db/repositories/documents/central";
import { AccessError, canPerformModuleOperation, canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { getCeleriFlowInstanceId } from "@/lib/platform/instance";
import type { CentralDocumentType, CentralOrigin, CentralSignatureRecord, CentralSigner, CentralSignerInput, CentralSignerKind, CentralSignatureMethod, CentralValidation } from "@/lib/contracts/signature-central";
import { centralCanonical, centralHash, signCentralInternal, verifyCentralEvidence, type CentralEnvelope, type CentralEvidence } from "./central-evidence";
import { hashCentralPassword, verifyCentralPassword } from "./central-password";
import { assertCentralBlobPath, centralBlobPrefix, centralBlobStore, CENTRAL_RETENTION_MS, readCentralFile, type CentralBlobStore } from "./central-storage";
import { CentralCredentialError, CentralError } from "./central-error";

export { CentralError } from "./central-error";
type CentralContext = AppContext & { databaseConnection?: DatabaseConnection };
function database(context: AppContext) { return context.database ?? db; }
export function assertCentralPermission(context: AppContext, operation?: "create" | "update") {
  if (!canViewModule(context.user, "ASSINATURA_DIGITAL") || (operation && !canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", operation))) throw new AccessError("Sem permissão na Central de Assinaturas.", 403);
}
export async function centralTransaction<T>(context: CentralContext, operation: (tx: DatabaseExecutor) => Promise<T>) {
  if (context.database !== db && !context.databaseConnection) throw new CentralError("Contexto de banco injetado requer databaseConnection para transações.", 503);
  if (context.databaseConnection && context.databaseConnection.db !== context.database) throw new CentralError("databaseConnection incompatível com o banco do contexto.", 503);
  try { return await withDatabaseTransaction(context.databaseConnection ?? databaseConnection, operation); }
  catch (error) {
    if (error instanceof CentralError || error instanceof AccessError) throw error;
    // Actions display Error.message; never let SQL parameters (password hashes)
    // or provider details cross that boundary.
    throw new CentralError("Operação indisponível. Tente novamente com os mesmos dados.", 503);
  }
}
function signerDto(row: typeof centralSigners.$inferSelect): CentralSigner {
  return { id: row.id, kind: row.kind as CentralSignerKind, name: row.name, role: row.role, documentId: row.documentId, phone: row.phone, mobile: row.mobile, email: row.email,
    validUntil: row.validUntil.toISOString(), active: row.active, employeeId: row.employeeId, personId: row.personId, accountUserId: row.accountUserId, hasPassword: Boolean(row.passwordHash) };
}
export async function listCentralSigners(context: AppContext): Promise<CentralSigner[]> {
  assertCentralPermission(context); return (await database(context).select().from(centralSigners).orderBy(centralSigners.name, centralSigners.id)).map(signerDto);
}
export function normalizeCentralDocument(value: string) {
  if (!/^[\d.\-/\s]+$/.test(value)) throw new CentralError("CPF/CNPJ inválido.");
  const digits = value.replace(/\D/g, "");
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) throw new CentralError("CPF/CNPJ inválido.");
  const check = (base: string, weights: number[]) => { const mod = [...base].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11; return String(mod < 2 ? 0 : 11 - mod); };
  const base = digits.slice(0, -2);
  const first = check(base, digits.length === 11 ? [10,9,8,7,6,5,4,3,2] : [5,4,3,2,9,8,7,6,5,4,3,2]);
  const second = check(base + first, digits.length === 11 ? [11,10,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  if (digits !== base + first + second) throw new CentralError("CPF/CNPJ inválido.");
  return digits;
}
function signerContact(input: Pick<CentralSignerInput, "phone" | "mobile" | "email">) {
  const phone = input.phone.trim(), mobile = input.mobile.trim(), email = input.email.trim().toLowerCase();
  for (const value of [phone, mobile]) {
    const digits = value.replace(/\D/g, "");
    if (value && (value.length > 40 || !/^[+\d().\s-]+$/.test(value) || digits.length < 8 || digits.length > 15)) throw new CentralError("Telefone/celular inválido.");
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new CentralError("E-mail inválido.");
  return { phone, mobile, email };
}
async function canonicalOrigin(tx: DatabaseExecutor, input: Pick<CentralSignerInput, "kind" | "employeeId" | "personId" | "documentId" | "name" | "role" | "email">) {
  if (input.kind !== "SERVIDOR" && input.kind !== "CIDADAO") throw new CentralError("Origem inválida.");
  const documentId = normalizeCentralDocument(input.documentId);
  if (input.kind === "CIDADAO" && !input.personId && !input.employeeId) {
    const name = input.name.trim(), role = input.role.trim();
    if (name.length < 2 || name.length > 200 || role.length > 160 || /[\u0000-\u001f\u007f]/.test(name + role)) throw new CentralError("Nome/cargo inválido: nome de 2 a 200 caracteres e cargo de até 160.");
    return { name, role, documentId, employeeId: null, personId: null, email: input.email.trim().toLowerCase() };
  }
  const id = input.kind === "SERVIDOR" ? input.employeeId : input.personId;
  if (!id || (input.kind === "CIDADAO" && input.employeeId)) throw new CentralError("Selecione um vínculo canônico.");
  const origin = (await findCentralOrigins(tx, input.kind, "", id))[0];
  if (!origin || normalizeCentralDocument(origin.documentId) !== normalizeCentralDocument(input.documentId) || origin.personId !== input.personId) throw new CentralError("Vínculo inativo ou documento divergente da origem.");
  return origin;
}
async function assertSignerAccount(tx: DatabaseExecutor, accountUserId: string | null, origin: { kind?: string; employeeId: string | null; personId: string | null; documentId: string; email: string }, kind: CentralSignerKind) {
  if (!accountUserId) return;
  const [account] = await tx.select({ id: users.id, email: users.email, employeeId: users.employeeId }).from(users).where(and(eq(users.id, accountUserId), eq(users.ativo, true)));
  let compatible = Boolean(account && kind === "SERVIDOR" && account.employeeId === origin.employeeId);
  if (account && kind === "CIDADAO") {
    const document = normalizeCentralDocument(origin.documentId);
    if (account.employeeId) {
      const [employee] = await tx.select({ cpf: employees.cpf }).from(employees).where(and(eq(employees.id, account.employeeId), eq(employees.isActive, true)));
      compatible = Boolean(employee?.cpf && employee.cpf.replace(/\D/g, "") === document);
    }
    if (!compatible) {
      // A client-declared e-mail alone cannot claim an arbitrary active account.
      // E-mail binding requires the same CPF/CNPJ in a canonical active Person.
      const [person] = await tx.select({ id: people.id }).from(people).where(and(eq(people.status, "Ativo"),
        eq(sql`regexp_replace(${people.cpf}, '[^0-9]', '', 'g')`, document),
        eq(sql`lower(trim(${people.email}))`, account.email.trim().toLowerCase()),
        origin.personId ? eq(people.id, origin.personId) : undefined));
      compatible = Boolean(person);
    }
  }
  if (!compatible) throw new CentralError("Conta de acesso inexistente/inativa ou vínculo CPF/e-mail/RH incompatível.", 403);
}
export async function saveCentralSigner(context: AppContext, input: CentralSignerInput): Promise<CentralSigner> {
  assertCentralPermission(context, input.id ? "update" : "create");
  const validUntil = new Date(input.validUntil);
  if (!Number.isFinite(validUntil.getTime()) || (input.active && validUntil <= new Date())) throw new CentralError("Informe uma validade futura.");
  const contact = signerContact(input);
  return centralTransaction(context, async tx => {
    const existing = input.id ? (await tx.select().from(centralSigners).where(eq(centralSigners.id, input.id)).for("update"))[0] : undefined;
    if (input.id && !existing) throw new CentralError("Assinador não encontrado.", 404);
    const origin = await canonicalOrigin(tx, input);
    await assertSignerAccount(tx, input.accountUserId, origin, input.kind);
    const passwordHash = input.password ? await hashCentralPassword(input.password) : existing?.passwordHash;
    if (!passwordHash) throw new CentralError("A senha pessoal inicial é obrigatória.");
    const values = { kind: input.kind, name: origin.name, role: origin.role, documentId: normalizeCentralDocument(origin.documentId),
      ...contact, validUntil, active: input.active,
      employeeId: origin.employeeId, personId: origin.personId, accountUserId: input.accountUserId || null, passwordHash, updatedAt: new Date() };
    const [row] = existing ? await tx.update(centralSigners).set(values).where(eq(centralSigners.id, existing.id)).returning() : await tx.insert(centralSigners).values({ id: randomUUID(), ...values }).returning();
    return signerDto(row);
  });
}
export async function listCentralDocumentTypes(context: AppContext): Promise<CentralDocumentType[]> {
  assertCentralPermission(context); return database(context).select().from(centralDocumentTypes).orderBy(centralDocumentTypes.name, centralDocumentTypes.id);
}
export async function saveCentralDocumentType(context: AppContext, input: { id?: string; name: string; description: string; active: boolean }): Promise<CentralDocumentType> {
  assertCentralPermission(context, input.id ? "update" : "create");
  const values = { name: input.name.trim(), description: input.description.trim(), active: input.active };
  if (!values.name || values.name.length > 160 || values.description.length > 2000) throw new CentralError("Nome/descrição de tipo inválido.");
  return centralTransaction(context, async tx => {
    const [row] = input.id ? await tx.update(centralDocumentTypes).set(values).where(eq(centralDocumentTypes.id, input.id)).returning() : await tx.insert(centralDocumentTypes).values({ id: randomUUID(), ...values }).returning();
    if (!row) throw new CentralError("Tipo não encontrado.", 404); return row;
  });
}
export async function searchCentralOrigins(context: AppContext, kind: CentralSignerKind, query: string): Promise<CentralOrigin[]> {
  assertCentralPermission(context);
  if (!canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create") && !canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "update")) throw new AccessError("Sem permissão para buscar origens.", 403);
  if (!["SERVIDOR", "CIDADAO"].includes(kind)) throw new CentralError("Origem inválida.");
  const term = query.trim(); if (term.length < 2) return [];
  if (term.length > 100) throw new CentralError("Busca muito longa.");
  return findCentralOrigins(database(context), kind, term.replace(/[\\%_]/g, "\\$&"));
}
export function centralRecordDto(row: CentralRecordRow): CentralSignatureRecord {
  if (!row.evidence || !row.signedAt) throw new CentralError("Assinatura ainda não concluída.", 409);
  const e = row.evidence.envelope;
  return { id: row.id, code: row.code, filename: row.filename, mimeType: row.mimeType, byteLength: row.byteLength, hashSha256: row.hashSha256,
    documentTypeName: e.documentType.name, signerName: e.signer.name, signerRole: e.signer.role, signerDocument: e.signer.documentId,
    method: e.method, signedAt: row.signedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), storageDeletedAt: row.storageDeletedAt?.toISOString() ?? null };
}
export async function listCentralSignatureRecords(context: AppContext): Promise<CentralSignatureRecord[]> {
  assertCentralPermission(context); return (await findCentralRecords(database(context), context.user.id, isSystemAdministrator(context.user))).map(centralRecordDto);
}
type SignInput = { file: File; signerId: string; documentTypeId: string; method: CentralSignatureMethod; integrationId?: string; password: string; requestId: string };
export async function signCentralFile(context: AppContext, input: SignInput, storage: CentralBlobStore = centralBlobStore): Promise<CentralSignatureRecord> {
  assertCentralPermission(context, "create");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new CentralError("requestId deve ser UUID.");
  if (!["INTERNAL", "A1_ECPF", "A1_ECNPJ"].includes(input.method) || (input.method !== "INTERNAL" && !input.integrationId)) throw new CentralError("Método/integração inválido.");
  const file = await readCentralFile(input.file);
  const requestDigest = centralHash(centralCanonical({ signerId: input.signerId, documentTypeId: input.documentTypeId, method: input.method, integrationId: input.integrationId || null, filename: file.filename, mimeType: file.mimeType, hash: file.hashSha256, size: file.byteLength }));
  // Validate credentials before reserving an intent (also on a completed retry).
  async function authorizedSigner(tx: DatabaseExecutor) {
    const [signer] = await tx.select().from(centralSigners).where(eq(centralSigners.id, input.signerId)).for("share");
    if (!signer || !signer.active || signer.validUntil <= new Date()) throw new CentralError("Assinador inativo ou fora da validade.", 403);
    if (input.method === "INTERNAL") {
      if (!await verifyCentralPassword(input.password, signer.passwordHash)) throw new CentralCredentialError();
    } else if (signer.accountUserId !== context.user.id && !(!signer.accountUserId && context.user.employeeId && signer.employeeId === context.user.employeeId)) {
      throw new CentralError("Selecione um assinador vinculado à sua conta para usar o certificado digital.", 403);
    }
    const origin = await canonicalOrigin(tx, { ...signer, kind: signer.kind as CentralSignerKind });
    await assertSignerAccount(tx, signer.accountUserId, origin, signer.kind as CentralSignerKind);
    return signer;
  }
  const intent = await centralTransaction(context, async tx => {
    await authorizedSigner(tx);
    const type = (await tx.select().from(centralDocumentTypes).where(and(eq(centralDocumentTypes.id, input.documentTypeId), eq(centralDocumentTypes.active, true))))[0];
    if (!type) throw new CentralError("Tipo de documento inativo ou inexistente.");
    const id = randomUUID(), now = new Date();
    await tx.insert(centralRecords).values({ id, actorId: context.user.id, signerId: input.signerId, documentTypeId: type.id, requestId: input.requestId, requestDigest,
      code: randomUUID(), filename: file.filename, mimeType: file.mimeType, byteLength: file.byteLength, hashSha256: file.hashSha256,
      blobPath: `${centralBlobPrefix()}${id}/original`, expiresAt: new Date(now.getTime() + CENTRAL_RETENTION_MS) }).onConflictDoNothing({ target: [centralRecords.actorId, centralRecords.requestId] });
    const [row] = await tx.select().from(centralRecords).where(and(eq(centralRecords.actorId, context.user.id), eq(centralRecords.requestId, input.requestId))).for("update");
    if (row.requestDigest !== requestDigest) throw new CentralError("requestId já utilizado com outro conteúdo.", 409);
    if (row.status === "PENDING") {
      // Re-arm the durable intent BEFORE another external write, including a
      // retry after cleanup. Refresh its abandonment clock so a retention scan
      // cannot mark it deleted between this commit and the upload transaction.
      await tx.update(centralRecords).set({ storageDeletedAt: null, createdAt: now }).where(eq(centralRecords.id, row.id));
    }
    return row;
  });
  return centralTransaction(context, async tx => {
    const [row] = await tx.select().from(centralRecords).where(eq(centralRecords.id, intent.id)).for("update");
    if (row.status === "SIGNED") return centralRecordDto(row);
    const signer = await authorizedSigner(tx);
    const [type] = await tx.select().from(centralDocumentTypes).where(and(eq(centralDocumentTypes.id, input.documentTypeId), eq(centralDocumentTypes.active, true)));
    if (!type) throw new CentralError("Tipo de documento inativo.");
    const now = new Date(), expiresAt = new Date(now.getTime() + CENTRAL_RETENTION_MS);
    const envelope: CentralEnvelope = { version: 1, instanceId: getCeleriFlowInstanceId(), recordId: row.id, code: row.code, actorId: context.user.id,
      signer: { id: signer.id, name: signer.name, role: signer.role, documentId: signer.documentId, kind: signer.kind, employeeId: signer.employeeId, personId: signer.personId, accountUserId: signer.accountUserId, validUntil: signer.validUntil.toISOString() },
      documentType: { id: type.id, name: type.name }, file: { filename: row.filename, mimeType: row.mimeType, byteLength: row.byteLength, hashSha256: row.hashSha256 }, method: input.method,
      integrationId: input.method === "INTERNAL" ? null : input.integrationId!, signedAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
    let evidence: CentralEvidence;
    if (input.method === "INTERNAL") evidence = signCentralInternal(envelope);
    else {
      const { signCentralA1Envelope } = await import("./central-a1");
      const canonical = centralCanonical(envelope), envelopeHash = centralHash(canonical);
      // The A1 helper's transaction becomes a savepoint on this same connection.
      const result = await signCentralA1Envelope({ ...context, database: tx as Database }, { integrationId: input.integrationId!, method: input.method, signerDocument: signer.documentId, recordId: row.id, envelopeHash });
      evidence = { kind: "A1", envelope, canonical, envelopeHash, evidence: result.evidence, intermediatePems: result.intermediatePems, trustedRootPem: result.trustedRootPem };
    }
    if (!verifyCentralEvidence(evidence)) throw new CentralError("Falha ao verificar a evidência gerada.", 503);
    assertCentralBlobPath(row.blobPath);
    // Hold the intent row lock through upload+commit. A concurrent retry cannot
    // overwrite a committed original. On rollback the durable path is retained
    // for an overwrite retry or the retention worker (including uncertain put).
    await storage.put(row.blobPath, file.bytes, file.mimeType);
    const [signed] = await tx.update(centralRecords).set({ status: "SIGNED", evidence, signedAt: now, expiresAt, accountUserId: signer.accountUserId, storageDeletedAt: null }).where(eq(centralRecords.id, row.id)).returning();
    return centralRecordDto(signed);
  });
}
export function verifyCentralRecord(row: CentralRecordRow) {
  const proof = row.evidence, e = proof?.envelope;
  return Boolean(proof && e && row.status === "SIGNED" && verifyCentralEvidence(proof) && e.instanceId === getCeleriFlowInstanceId() &&
    e.recordId === row.id && e.code === row.code && e.actorId === row.actorId && e.signer.id === row.signerId && e.signer.accountUserId === row.accountUserId && e.documentType.id === row.documentTypeId &&
    centralCanonical(e.file) === centralCanonical({ filename: row.filename, mimeType: row.mimeType, byteLength: row.byteLength, hashSha256: row.hashSha256 }) && e.signedAt === row.signedAt?.toISOString() && e.expiresAt === row.expiresAt.toISOString());
}
export async function validateCentralSignature(input: { code?: string; file?: File }, executor: DatabaseExecutor = db): Promise<CentralValidation> {
  const code = input.code?.trim();
  if (!code && !input.file) throw new CentralError("Informe um código ou arquivo.");
  if (code && !/^[0-9a-f-]{36}$/i.test(code)) throw new CentralError("Código inválido.");
  const file = input.file ? await readCentralFile(input.file) : undefined;
  const rows = await executor.select().from(centralRecords).where(and(eq(centralRecords.status, "SIGNED"), code ? eq(centralRecords.code, code) : eq(centralRecords.hashSha256, file!.hashSha256)));
  const records = rows.map(row => {
    // Malformed persisted evidence is invalid, not a technical outage. Public
    // projection is explicit and never serializes the stored proof or identity.
    const e = row.evidence?.envelope, document = e?.signer?.documentId;
    return { code: row.code, filename: row.filename, hashSha256: row.hashSha256, documentTypeName: e?.documentType?.name ?? "Indisponível", signerName: e?.signer?.name ?? "Indisponível", signerRole: e?.signer?.role ?? "",
      method: e?.method ?? "INTERNAL", signedAt: row.signedAt!.toISOString(), expiresAt: row.expiresAt.toISOString(), signerDocumentMasked: typeof document !== "string" ? "***" : document.length === 11 ? `***.***.${document.slice(6,9)}-**` : `**.***.${document.slice(5,8)}/****-**`,
      valid: verifyCentralRecord(row) && (!file || row.hashSha256 === file.hashSha256) };
  });
  const valid = records.length > 0 && records.every(r => r.valid);
  return { valid, fileCompared: Boolean(file), message: valid ? "Assinatura verificada. O prazo de armazenamento não afeta a evidência." : "Assinatura não encontrada, evidência inválida ou arquivo divergente.", records };
}
export async function getCentralPrivateRecord(context: AppContext, id: string) {
  assertCentralPermission(context);
  const [row] = await database(context).select().from(centralRecords).where(and(eq(centralRecords.id, id), eq(centralRecords.status, "SIGNED"), centralOwnerFilter(context.user.id, isSystemAdministrator(context.user))));
  if (!row) throw new CentralError("Registro não encontrado.", 404); return row;
}
export async function downloadCentralFile(context: AppContext, id: string, storage: CentralBlobStore = centralBlobStore) {
  const row = await getCentralPrivateRecord(context, id);
  if (row.expiresAt <= new Date() || row.storageDeletedAt) throw new CentralError("O prazo de armazenamento de 90 dias expirou.", 410);
  if (!verifyCentralRecord(row)) throw new CentralError("Evidência inválida.", 409);
  assertCentralBlobPath(row.blobPath);
  const bytes = await storage.get(row.blobPath);
  if (!bytes) throw new CentralError("Arquivo temporariamente indisponível.", 503);
  if (bytes.length !== row.byteLength || centralHash(bytes) !== row.hashSha256) throw new CentralError("Integridade do arquivo inválida.", 409);
  return { bytes, filename: row.filename, mimeType: row.mimeType };
}
export async function getCentralReceipt(context: AppContext, id: string) {
  const row = await getCentralPrivateRecord(context, id);
  return { record: centralRecordDto(row), evidence: row.evidence, verified: verifyCentralRecord(row), format: "detached-evidence-v1" };
}
