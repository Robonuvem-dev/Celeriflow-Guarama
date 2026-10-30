import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";
import { auroraSignatureDocuments, renderAuroraSignatureDocument } from "./lib/aurora-signature-documents";
import { auroraSignatureMaterial } from "./lib/aurora-signature-material";
import { withDatabaseTransaction } from "../src/db/transaction";
import type { Database } from "../src/db/connection";
import { centralDocumentTypes, centralRecords, centralSigners } from "../src/db/schema/signature-central";
import { centralA1Integrations } from "../src/db/schema/signature-central-a1";
import { auditEvents } from "../src/db/schema/audit";
import { normalizeCentralDocument, saveCentralSigner, verifyCentralRecord } from "../src/lib/signatures/central-service";
import { saveCentralA1Integration, signCentralA1Envelope } from "../src/lib/signatures/central-a1";
import { centralCanonical, centralHash, signCentralInternal, verifyCentralEvidence, type CentralEnvelope, type CentralEvidence } from "../src/lib/signatures/central-evidence";
import { centralBlobPrefix, centralBlobStore, CENTRAL_RETENTION_MS } from "../src/lib/signatures/central-storage";
import { getCeleriFlowInstanceId } from "../src/lib/platform/instance";
import type { AppContext } from "../src/lib/platform/tenant-context";

const prefix = "aurora-signature-history-v1";
const folder = "C:\\Users\\thiag\\AppData\\Local\\Temp\\opencode\\aurora-signature-history";
function uuid(key: string) {
  const hex = createHash("sha256").update(`${prefix}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function municipalCnpj() {
  let value = "487650120001";
  for (const weights of [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
    const remainder = [...value].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
    value += remainder < 2 ? "0" : String(11 - remainder);
  }
  return normalizeCentralDocument(value);
}

async function main() {
  config({ path: process.env.SIGNATURE_ENV_FILE || ".env.local", quiet: true });
  if (getCeleriFlowInstanceId() !== "guarama") throw new Error("Carga restrita à instância guarama.");
  const connection = openCrossDomainDatabase();
  const db = connection.db;
  const apply = process.argv.includes("--apply");
  try {
    const [institution] = (await db.execute<{ name: string; cnpj: string | null }>(sql`SELECT name, cnpj FROM "Institution" WHERE city='Aurora das Veredas' AND state='MG' LIMIT 1`)).rows;
    if (!institution || !institution.name.includes("Aurora das Veredas")) throw new Error("Instituição de Aurora das Veredas não confirmada.");
    const [leader] = (await db.execute<{ id: string; name: string; cpf: string; personId: string | null; role: string; email: string | null; phone: string | null }>(sql`SELECT e.id, e.name, e.cpf, e."personId", r.name AS role, e.email, e.phone FROM "Employee" e JOIN "Role" r ON r.id=e."roleId" JOIN "Secretariat" s ON s."managerId"=e.id WHERE e.id='aurora-system-v1:employee:009' AND e."isActive"=true`)).rows;
    if (!leader) throw new Error("Responsável canônica da Administração não encontrada.");
    const [actor] = (await db.execute<{ id: string; name: string; email: string }>(sql`SELECT u.id, u.nome AS name, u.email FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo=true AND p.codigo='SYSTEM_ADMINISTRATOR' ORDER BY u.id LIMIT 1`)).rows;
    if (!actor) throw new Error("Administrador responsável pela carga não encontrado.");
    const cpf = normalizeCentralDocument(leader.cpf), cnpj = institution.cnpj ? normalizeCentralDocument(institution.cnpj) : municipalCnpj();
    const distribution = Object.fromEntries(["INTERNAL", "A1_ECPF", "A1_ECNPJ"].map(method => [method, auroraSignatureDocuments.filter(document => document.method === method).length]));
    const prior = await db.select().from(centralRecords).where(and(eq(centralRecords.actorId, actor.id), sql`${centralRecords.requestId} IN (${sql.join(auroraSignatureDocuments.map(entry => sql`${uuid(`request:${entry.number}`)}`), sql`, `)})`));
    if (process.argv.includes("--verify")) {
      if (prior.length !== 40) throw new Error(`Esperados 40 registros; encontrados ${prior.length}.`);
      let totalBytes = 0;
      for (const entry of auroraSignatureDocuments) {
        const record = prior.find(row => row.requestId === uuid(`request:${entry.number}`));
        if (!record || record.status !== "SIGNED" || !verifyCentralRecord(record) || record.evidence?.envelope.method !== entry.method) throw new Error(`Evidência divergente: ${entry.number}`);
        const bytes = await centralBlobStore.get(record.blobPath);
        if (!bytes || centralHash(bytes) !== record.hashSha256 || (await PDFDocument.load(bytes)).getPageCount() !== 1) throw new Error(`PDF divergente: ${entry.number}`);
        const body = new FormData();
        body.set("code", record.code);
        body.set("file", new File([new Uint8Array(bytes)], record.filename, { type: "application/pdf" }));
        let response = await fetch("https://guarama.celeriflow.com.br/api/assinatura-digital/validar", { method: "POST", body });
        for (let attempt = 0; response.status === 429 && attempt < 3; attempt++) {
          const seconds = Number(response.headers.get("Retry-After") || "60");
          if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) throw new Error("Prazo de validação pública indisponível.");
          await response.arrayBuffer();
          console.log(JSON.stringify({ mode: "WAITING_PUBLIC_RATE_LIMIT", number: entry.number, retryAfterSeconds: seconds }));
          await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 500));
          response = await fetch("https://guarama.celeriflow.com.br/api/assinatura-digital/validar", { method: "POST", body });
        }
        const validation = await response.json() as { valid?: boolean; fileCompared?: boolean; records?: { method: string; valid: boolean; hashSha256: string }[] };
        if (!response.ok || !validation.valid || !validation.fileCompared || validation.records?.[0]?.method !== entry.method || validation.records[0].hashSha256 !== record.hashSha256) throw new Error(`Validação pública divergente: ${entry.number} (HTTP ${response.status})`);
        totalBytes += bytes.length;
      }
      console.log(JSON.stringify({ mode: "VERIFIED", records: prior.length, distribution, onePagePdfs: 40, matchingBlobs: 40, publicValidationsWithOriginal: 40, totalBytes, pending: prior.filter(row => row.status !== "SIGNED").length, earliestRequest: new Date(Math.min(...prior.map(row => row.createdAt.getTime()))).toISOString(), latestRequest: new Date(Math.max(...prior.map(row => row.createdAt.getTime()))).toISOString() }, null, 2));
      return;
    }
    if (!apply) {
      console.log(JSON.stringify({ mode: "PREVIEW", municipality: institution.name, signer: leader.name, role: leader.role, documents: auroraSignatureDocuments.length, distribution, alreadyCreated: prior.length, certificateTrust: "PRIVATE_AURORA_PRESENTATION_CHAIN", signedAt: "ACTUAL_EXECUTION_TIME", historicalRequestDates: true, documentsPlan: auroraSignatureDocuments.map(({ number, type, title, method }) => ({ number, type, title, method })) }, null, 2));
      return;
    }
    const material = await auroraSignatureMaterial(join(folder, "material"), { name: leader.name, cpf, cnpj });
    await mkdir(join(folder, "documents"), { recursive: true });
    const context: AppContext & { databaseConnection: typeof connection } = {
      database: db, databaseConnection: connection,
      user: { id: actor.id, name: actor.name, email: actor.email, firebaseUid: "", role: "administrator", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null },
    };
    async function signerFor(documentId: string, company: boolean) {
      const [priorSigner] = await db.select().from(centralSigners).where(eq(centralSigners.documentId, documentId));
      if (priorSigner) {
        if (!priorSigner.active || priorSigner.validUntil < new Date() || (company ? priorSigner.name !== institution.name : priorSigner.employeeId !== leader.id)) throw new Error("Cadastro de assinador existente incompatível; nenhuma alteração realizada.");
        return priorSigner;
      }
      const saved = await saveCentralSigner(context, { kind: company ? "CIDADAO" : "SERVIDOR", name: company ? institution.name : leader.name, role: company ? `Representação administrativa: ${leader.name}` : leader.role, documentId, phone: "", mobile: "", email: company ? "administracao@auroradasveredas.example" : leader.email || "administracao@auroradasveredas.example", validUntil: new Date(Date.now() + 365 * 86400000).toISOString(), active: true, employeeId: company ? null : leader.id, personId: company ? null : leader.personId, accountUserId: null, password: material.signerPassword });
      return (await db.select().from(centralSigners).where(eq(centralSigners.id, saved.id)))[0];
    }
    const personSigner = await signerFor(cpf, false), companySigner = await signerFor(cnpj, true);
    const integrationIds: Partial<Record<"A1_ECPF" | "A1_ECNPJ", string>> = {};
    try {
      for (const kind of ["A1_ECPF", "A1_ECNPJ"] as const) {
        const company = kind === "A1_ECNPJ", leaf = company ? material.cnpj : material.cpf;
        const reference = company ? "AURORA_PRESENTATION_CNPJ" : "AURORA_PRESENTATION_CPF";
        process.env[`${reference}_PRIVATE_KEY_PEM`] = leaf.privateKeyPem;
        const alias = `${company ? "Aurora das Veredas" : leader.name} · ${company ? "e-CNPJ" : "e-CPF"} · Cadeia privada`;
        const existing = (await db.select().from(centralA1Integrations).where(eq(centralA1Integrations.alias, alias)))[0];
        const integration = await withDatabaseTransaction(connection, tx => saveCentralA1Integration({ ...context, database: tx as Database }, { id: existing?.id, kind, alias, ownerName: company ? institution.name : leader.name, documentId: company ? cnpj : cpf, credentialReference: reference, certificatePem: leaf.certificatePem, intermediatePems: [], trustedRootPem: material.trustedRootPem, active: true }));
        integrationIds[kind] = integration.id;
      }
      let created = 0, reused = 0, totalBytes = 0;
      for (const entry of auroraSignatureDocuments) {
        const requestId = uuid(`request:${entry.number}`), recordId = uuid(`record:${entry.number}`), code = uuid(`code:${entry.number}`);
        const [existing] = await db.select().from(centralRecords).where(and(eq(centralRecords.actorId, actor.id), eq(centralRecords.requestId, requestId)));
        if (existing?.status === "SIGNED") {
          if (!verifyCentralRecord(existing)) throw new Error(`Evidência existente inválida: ${entry.number}`);
          reused++; totalBytes += existing.byteLength; continue;
        }
        const company = entry.method === "A1_ECNPJ", signer = company ? companySigner : personSigner;
        const issuedAt = new Date(new Date(material.createdAt).getTime() - (80 - entry.number) * 86400000);
        const filename = `AV-2026-${String(entry.number).padStart(3, "0")}-${entry.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf`;
        const bytes = await renderAuroraSignatureDocument(entry, { signer: company ? `${institution.name} — ${leader.name}` : leader.name, role: leader.role, issuedAt, signedAt: new Date(material.createdAt), code });
        if ((await PDFDocument.load(bytes)).getPageCount() !== 1 || bytes.length > 3 * 1024 * 1024) throw new Error(`Documento fora do limite: ${entry.number}`);
        await writeFile(join(folder, "documents", filename), bytes);
        const hashSha256 = centralHash(bytes), integrationId = entry.method === "INTERNAL" ? null : integrationIds[entry.method]!;
        const blobPath = `${centralBlobPrefix()}${recordId}/original`;
        const requestDigest = await withDatabaseTransaction(connection, async tx => {
          await tx.insert(centralDocumentTypes).values({ id: uuid(`type:${entry.type}`), name: entry.type, description: `${entry.type} municipal`, active: true }).onConflictDoNothing();
          const [documentType] = await tx.select().from(centralDocumentTypes).where(eq(centralDocumentTypes.name, entry.type));
          if (!documentType?.active) throw new Error(`Tipo de documento inativo: ${entry.type}`);
          const digest = centralHash(centralCanonical({ signerId: signer.id, documentTypeId: documentType.id, method: entry.method, integrationId, filename, mimeType: "application/pdf", hash: hashSha256, size: bytes.length }));
          await tx.insert(centralRecords).values({ id: recordId, requestId, requestDigest: digest, actorId: actor.id, signerId: signer.id, documentTypeId: documentType.id, code, filename, mimeType: "application/pdf", byteLength: bytes.length, hashSha256, blobPath, expiresAt: new Date(Date.now() + CENTRAL_RETENTION_MS) }).onConflictDoNothing({ target: [centralRecords.actorId, centralRecords.requestId] });
          return digest;
        });
        await withDatabaseTransaction(connection, async tx => {
          const [row] = await tx.select().from(centralRecords).where(eq(centralRecords.id, recordId)).for("update");
          if (!row || row.requestDigest !== requestDigest) throw new Error(`Conteúdo divergente para o expediente ${entry.number}.`);
          if (row.status === "SIGNED") { reused++; return; }
          const [documentType] = await tx.select().from(centralDocumentTypes).where(eq(centralDocumentTypes.id, row.documentTypeId));
          const signedAt = new Date(), expiresAt = new Date(signedAt.getTime() + CENTRAL_RETENTION_MS);
          const envelope: CentralEnvelope = { version: 1, instanceId: getCeleriFlowInstanceId(), recordId, code, actorId: actor.id, signer: { id: signer.id, name: signer.name, role: signer.role, documentId: signer.documentId, kind: signer.kind, employeeId: signer.employeeId, personId: signer.personId, accountUserId: signer.accountUserId, validUntil: signer.validUntil.toISOString() }, documentType: { id: documentType.id, name: documentType.name }, file: { filename, mimeType: "application/pdf", byteLength: bytes.length, hashSha256 }, method: entry.method, integrationId, signedAt: signedAt.toISOString(), expiresAt: expiresAt.toISOString() };
          let evidence: CentralEvidence;
          if (entry.method === "INTERNAL") evidence = signCentralInternal(envelope, material.internalKeyPem);
          else {
            const canonical = centralCanonical(envelope), envelopeHash = centralHash(canonical);
            const signed = await signCentralA1Envelope({ ...context, database: tx as Database }, { integrationId: integrationId!, method: entry.method, signerDocument: signer.documentId, recordId, envelopeHash });
            evidence = { kind: "A1", envelope, canonical, envelopeHash, evidence: signed.evidence, intermediatePems: signed.intermediatePems, trustedRootPem: signed.trustedRootPem };
          }
          if (!verifyCentralEvidence(evidence)) throw new Error(`Assinatura inválida: ${entry.number}`);
          await centralBlobStore.put(blobPath, bytes, "application/pdf");
          const stored = await centralBlobStore.get(blobPath);
          if (!stored || centralHash(stored) !== hashSha256) throw new Error(`Blob não confirmado: ${entry.number}`);
          const [record] = await tx.update(centralRecords).set({ status: "SIGNED", evidence, signedAt, expiresAt, createdAt: issuedAt, accountUserId: signer.accountUserId, storageDeletedAt: null }).where(eq(centralRecords.id, recordId)).returning();
          if (!verifyCentralRecord(record)) throw new Error(`Registro não confere com a assinatura: ${entry.number}`);
          await tx.insert(auditEvents).values({ id: `${prefix}:${entry.number}`, eventType: "OWNER_AUTHORIZED_PRESENTATION_IMPORT", targetType: "SignatureCentralRecord", targetId: recordId, actorUsuarioId: actor.id }).onConflictDoNothing();
          created++;
        }, { timeoutMs: 120000 });
        totalBytes += bytes.length;
        console.log(JSON.stringify({ number: entry.number, method: entry.method, filename, bytes: bytes.length, status: "SIGNED" }));
      }
      const report = { mode: "APPLIED", municipality: institution.name, signer: leader.name, created, reused, total: created + reused, distribution, totalBytes, certificateTrust: "PRIVATE_AURORA_PRESENTATION_CHAIN_NOT_ICP_BRASIL", credentialsProvisionedToProduction: false, integrationsStatus: "SUSPENDED_AFTER_IMPORT", directory: join(folder, "documents"), records: auroraSignatureDocuments.map(entry => ({ number: entry.number, method: entry.method, id: uuid(`record:${entry.number}`), code: uuid(`code:${entry.number}`) })) };
      await writeFile(join(folder, "report.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
    } finally {
      for (const id of Object.values(integrationIds)) await db.update(centralA1Integrations).set({ active: false }).where(eq(centralA1Integrations.id, id));
      delete process.env.AURORA_PRESENTATION_CPF_PRIVATE_KEY_PEM;
      delete process.env.AURORA_PRESENTATION_CNPJ_PRIVATE_KEY_PEM;
    }
  } finally { await connection.pool.end(); }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/seed-aurora-signature-history.ts")) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : "Carga indisponível."); process.exitCode = 1; });
}
