import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { verifyDocumentHashICPBrasil, type DocumentHashSignatureResult } from "@/lib/security/icp-brasil";
import type { CentralSignatureMethod } from "@/lib/contracts/signature-central";
import { assertCentralA1Owner } from "./central-a1-certificate";
import { CentralError } from "./central-error";

export type CentralEnvelope = {
  version: 1; instanceId: string; recordId: string; code: string; actorId: string;
  signer: { id: string; name: string; role: string; documentId: string; kind: string; employeeId: string | null; personId: string | null; accountUserId: string | null; validUntil: string };
  documentType: { id: string; name: string }; file: { filename: string; mimeType: string; byteLength: number; hashSha256: string };
  method: CentralSignatureMethod; integrationId: string | null; signedAt: string; expiresAt: string;
};
export type CentralEvidence = { envelope: CentralEnvelope; canonical: string; envelopeHash: string } & (
  { kind: "INTERNAL"; publicKeyPem: string; fingerprint: string; signatureBase64: string; algorithm: "SHA256" | "Ed25519" } |
  { kind: "A1"; evidence: DocumentHashSignatureResult; intermediatePems: string[]; trustedRootPem: string }
);
export function centralCanonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(centralCanonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${centralCanonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
export function centralHash(bytes: string | Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function internalKey(pem = process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM) {
  if (!pem) throw new CentralError("Assinatura interna não configurada.", 503);
  let key;
  try { key = createPrivateKey(pem.replace(/\\n/g, "\n")); } catch { throw new CentralError("Chave de assinatura interna inválida.", 503); }
  if (!["rsa", "ec", "ed25519"].includes(key.asymmetricKeyType ?? "")) throw new CentralError("Tipo de chave interna não suportado.", 503);
  if (key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new CentralError("Chave RSA deve ter ao menos 2048 bits.", 503);
  return key;
}
export function getCentralInternalConfigurationStatus() {
  try { internalKey(); return { configured: true, valid: true }; }
  catch { return { configured: Boolean(process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM), valid: false }; }
}
export function signCentralInternal(envelope: CentralEnvelope, pem?: string): CentralEvidence {
  const key = internalKey(pem), publicKey = createPublicKey(key);
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const canonical = centralCanonical(envelope), algorithm = key.asymmetricKeyType === "ed25519" ? "Ed25519" : "SHA256";
  return { kind: "INTERNAL", envelope, canonical, envelopeHash: centralHash(canonical), publicKeyPem,
    fingerprint: centralHash(publicKey.export({ format: "der", type: "spki" })), algorithm,
    signatureBase64: sign(algorithm === "Ed25519" ? null : "sha256", Buffer.from(canonical), key).toString("base64") };
}
export function verifyCentralEvidence(proof: CentralEvidence): boolean {
  try {
    if (proof.envelope.version !== 1 || centralCanonical(proof.envelope) !== proof.canonical || centralHash(proof.canonical) !== proof.envelopeHash) return false;
    const signedAt = new Date(proof.envelope.signedAt).getTime(), expiresAt = new Date(proof.envelope.expiresAt).getTime();
    const validUntil = new Date(proof.envelope.signer.validUntil).getTime();
    if (!Number.isFinite(signedAt) || !Number.isFinite(validUntil) || expiresAt - signedAt !== 90 * 24 * 60 * 60 * 1000 || signedAt > validUntil) return false;
    if (proof.kind === "INTERNAL") {
      if (proof.envelope.method !== "INTERNAL") return false;
      const key = createPublicKey(proof.publicKeyPem);
      if (centralHash(key.export({ format: "der", type: "spki" })) !== proof.fingerprint) return false;
      return verify(proof.algorithm === "Ed25519" ? null : "sha256", Buffer.from(proof.canonical), key, Buffer.from(proof.signatureBase64, "base64"));
    }
    const evidence = { ...proof.evidence, signedAt: new Date(proof.evidence.signedAt) };
    if (proof.envelope.method === "INTERNAL") return false;
    assertCentralA1Owner(evidence.certificatePem, proof.envelope.method, proof.envelope.signer.documentId);
    // The helper signs immediately after envelope construction; bind its time
    // to that envelope too, without requiring millisecond identity.
    if (evidence.signedAt.getTime() < signedAt || evidence.signedAt.getTime() - signedAt > 60_000) return false;
    return evidence.documentVersionId === proof.envelope.recordId && evidence.documentHash === proof.envelopeHash &&
      verifyDocumentHashICPBrasil(evidence, { intermediateCertificatePems: proof.intermediatePems, trustedRootCertificatePem: proof.trustedRootPem });
  } catch { return false; }
}
