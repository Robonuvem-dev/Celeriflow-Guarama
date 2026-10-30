import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { digitalCertificates } from "@/db/schema/document-workflow";
import { centralA1Integrations as integrations } from "@/db/schema/signature-central-a1";
import { canViewModule, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { AccessError } from "@/lib/platform/access-error";
import type { CentralA1Integration } from "@/lib/contracts/signature-central";
import { inspectIcpBrasilCertificate, type DocumentHashSignatureResult } from "@/lib/security/icp-brasil";
import { assertCentralA1Owner, checkedCentralA1Signature } from "./central-a1-certificate";

export type CentralA1Input = { id?: string; kind: "A1_ECPF" | "A1_ECNPJ"; alias: string; ownerName: string; documentId: string; credentialReference: string; certificatePem: string; intermediatePems: string[]; trustedRootPem: string; active: boolean };
const publicPem = z.string().trim().max(32000).refine(v => /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(v) && !v.includes("PRIVATE KEY"), "Informe apenas certificado público PEM.");
const inputSchema = z.object({ id: z.string().min(1).max(128).optional(), kind: z.enum(["A1_ECPF", "A1_ECNPJ"]), alias: z.string().trim().min(1).max(120), ownerName: z.string().trim().min(1).max(200), documentId: z.string().max(30).transform(v => v.replace(/\D/g, "")), credentialReference: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/), certificatePem: publicPem, intermediatePems: z.array(publicPem).max(8), trustedRootPem: publicPem, active: z.boolean() }).strict();

function authorize(context: AppContext, operation?: "create" | "update", admin = false) {
  if (!canViewModule(context.user, "ASSINATURA_DIGITAL") || (operation && !canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", operation)) || (admin && !isSystemAdministrator(context.user))) throw new AccessError("Acesso negado às integrações da Central de Assinaturas.", 403);
}
function dto(row: typeof integrations.$inferSelect, cert: typeof digitalCertificates.$inferSelect): CentralA1Integration {
  return { id: row.id, certificateId: cert.id, alias: row.alias, ownerName: row.ownerName, kind: row.kind, documentId: row.documentId, active: row.active && cert.status === "ACTIVE", validFrom: cert.validFrom.toISOString(), validTo: cert.validTo.toISOString(), credentialReference: cert.credentialReference };
}
function chain(cert: typeof digitalCertificates.$inferSelect): string[] {
  if (!Array.isArray(cert.intermediatePems) || !cert.intermediatePems.every(v => typeof v === "string")) throw new Error("Cadeia pública armazenada inválida.");
  return cert.intermediatePems as string[];
}
function isolated(cert: typeof digitalCertificates.$inferSelect) {
  if (!Array.isArray(cert.purposes) || cert.purposes.length !== 1 || cert.purposes[0] !== "SIGNATURE_CENTRAL") throw new Error("Certificado sem finalidade exclusiva SIGNATURE_CENTRAL.");
}

export async function listCentralA1Integrations(context: AppContext): Promise<CentralA1Integration[]> {
  authorize(context);
  const rows = await (context.database ?? db).select().from(integrations).innerJoin(digitalCertificates, eq(integrations.certificateId, digitalCertificates.id)).orderBy(integrations.alias);
  return rows.map(r => dto(r.SignatureCentralA1Integration, r.DigitalCertificate));
}

export async function saveCentralA1Integration(context: AppContext, raw: CentralA1Input): Promise<CentralA1Integration> {
  authorize(context, raw?.id ? "update" : "create", true);
  const input = inputSchema.parse(raw);
  assertCentralA1Owner(input.certificatePem, input.kind, input.documentId);
  // Validate even inactive registrations: no unproven or broken configuration persisted.
  checkedCentralA1Signature(input, "configuration-validation", "0".repeat(64));
  const metadata = inspectIcpBrasilCertificate(input.certificatePem);
  return (context.database ?? db).transaction(async tx => {
    let certificateId: string;
    if (input.id) {
      const [row] = await tx.select().from(integrations).where(eq(integrations.id, input.id)).for("update");
      if (!row) throw new Error("Integração não encontrada.");
      certificateId = row.certificateId;
      const [cert] = await tx.select().from(digitalCertificates).where(eq(digitalCertificates.id, certificateId)).for("update");
      isolated(cert);
      await tx.update(digitalCertificates).set({ ...metadata, alias: input.alias, ownerName: input.ownerName, credentialReference: input.credentialReference, certificatePem: input.certificatePem, intermediatePems: input.intermediatePems, trustedRootPem: input.trustedRootPem, status: input.active ? "ACTIVE" : "SUSPENDED" }).where(eq(digitalCertificates.id, certificateId));
    } else {
      const [cert] = await tx.insert(digitalCertificates).values({ ...metadata, alias: input.alias, ownerName: input.ownerName, credentialReference: input.credentialReference, certificatePem: input.certificatePem, intermediatePems: input.intermediatePems, trustedRootPem: input.trustedRootPem, purposes: ["SIGNATURE_CENTRAL"], status: input.active ? "ACTIVE" : "SUSPENDED", createdByUsuarioId: context.user.id }).returning();
      certificateId = cert.id;
    }
    const values = { certificateId, kind: input.kind, alias: input.alias, ownerName: input.ownerName, documentId: input.documentId, active: input.active };
    const [row] = input.id ? await tx.update(integrations).set(values).where(eq(integrations.id, input.id)).returning() : await tx.insert(integrations).values(values).returning();
    const [cert] = await tx.select().from(digitalCertificates).where(eq(digitalCertificates.id, certificateId));
    return dto(row, cert);
  });
}

export async function signCentralA1Envelope(context: AppContext, input: { integrationId: string; method: "A1_ECPF" | "A1_ECNPJ"; signerDocument: string; recordId: string; envelopeHash: string }): Promise<{ evidence: DocumentHashSignatureResult; intermediatePems: string[]; trustedRootPem: string; integrationId: string; kind: "A1_ECPF" | "A1_ECNPJ" }> {
  authorize(context, "create");
  if (!input.recordId || !/^[a-f0-9]{64}$/i.test(input.envelopeHash)) throw new Error("Envelope de assinatura inválido.");
  return (context.database ?? db).transaction(async tx => {
    const [joined] = await tx.select().from(integrations).innerJoin(digitalCertificates, eq(integrations.certificateId, digitalCertificates.id)).where(and(eq(integrations.id, input.integrationId), eq(integrations.active, true))).for("share");
    if (!joined) throw new Error("Integração A1 indisponível ou suspensa.");
    const row = joined.SignatureCentralA1Integration, cert = joined.DigitalCertificate;
    isolated(cert);
    if (cert.status !== "ACTIVE" || row.kind !== input.method || row.documentId !== input.signerDocument.replace(/\D/g, "")) throw new Error("Método ou documento do assinador incompatível com a integração A1 ativa.");
    assertCentralA1Owner(cert.certificatePem, input.method, input.signerDocument);
    const intermediatePems = chain(cert);
    const evidence = checkedCentralA1Signature({ ...cert, intermediatePems }, input.recordId, input.envelopeHash);
    return { evidence, intermediatePems, trustedRootPem: cert.trustedRootPem, integrationId: row.id, kind: row.kind };
  });
}

export async function getCentralA1PublicConfiguration(context: AppContext, id: string): Promise<CentralA1Input> {
  authorize(context, "update", true);
  const [r] = await (context.database ?? db).select().from(integrations).innerJoin(digitalCertificates, eq(integrations.certificateId, digitalCertificates.id)).where(eq(integrations.id, id));
  if (!r) throw new Error("Integração não encontrada.");
  const row = r.SignatureCentralA1Integration, cert = r.DigitalCertificate;
  return { id: row.id, kind: row.kind, alias: row.alias, ownerName: row.ownerName, documentId: row.documentId, active: row.active, credentialReference: cert.credentialReference, certificatePem: cert.certificatePem, intermediatePems: chain(cert), trustedRootPem: cert.trustedRootPem };
}

export async function suspendCentralA1Integration(context: AppContext, id: string): Promise<void> {
  authorize(context, "update", true);
  // Suspension must remain possible when a key is missing or the certificate expired.
  const rows = await (context.database ?? db).update(integrations).set({ active: false }).where(eq(integrations.id, id)).returning({ id: integrations.id });
  if (!rows.length) throw new Error("Integração não encontrada.");
}
