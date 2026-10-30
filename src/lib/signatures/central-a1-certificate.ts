import "server-only";
import { X509Certificate, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { validateCpf, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { resolveReferencedA1Config, signDocumentHashICPBrasil, verifyDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

type Node = { tag: number; value: Buffer; children: Node[] };
// Strict DER reader: inspect SAN otherName, never CN, free text or user declarations.
function nodes(bytes: Buffer): Node[] {
  const result: Node[] = [];
  for (let i = 0; i < bytes.length;) {
    const tag = bytes[i++];
    let length = bytes[i++];
    if (length === undefined) throw new Error("DER incompleto.");
    if (length & 128) {
      const count = length & 127;
      if (!count || count > 4 || i + count > bytes.length) throw new Error("DER inválido.");
      length = 0;
      for (let j = 0; j < count; j++) length = length * 256 + bytes[i++];
    }
    if (i + length > bytes.length) throw new Error("DER incompleto.");
    const value = bytes.subarray(i, i + length);
    result.push({ tag, value, children: tag & 32 ? nodes(value) : [] });
    i += length;
  }
  return result;
}
function oid(node: Node | undefined, hex: string) { return node?.tag === 6 && node.value.toString("hex") === hex; }

export function certificateOwner(certificatePem: string): { kind: "A1_ECPF" | "A1_ECNPJ"; documentId: string } {
  const cert = new X509Certificate(certificatePem);
  if (cert.ca) throw new Error("Informe certificado de titular, não certificado de autoridade certificadora.");
  const tbs = nodes(cert.raw)[0]?.children[0];
  const extensions = tbs?.children.find(n => n.tag === 0xa3)?.children[0]?.children ?? [];
  const san = extensions.filter(n => oid(n.children[0], "551d11"));
  const cpfs = new Set<string>(), cnpjs = new Set<string>();
  for (const extension of san) {
    const octets = extension.children.find(n => n.tag === 4);
    if (!octets) continue;
    for (const name of nodes(octets.value)[0]?.children ?? []) {
      if (name.tag !== 0xa0) continue;
      const [type, explicit] = name.children;
      const value = explicit?.children[0];
      if (explicit?.tag !== 0xa0 || !value || ![4, 12, 19, 22].includes(value.tag)) continue;
      const text = value.value.toString("utf8");
      // ICP-Brasil 2.16.76.1.3.1: birthdate (8), CPF (11), remaining identity fields.
      if (oid(type, "604c010301") && /^\d{19}/.test(text)) cpfs.add(text.slice(8, 19));
      // 2.16.76.1.3.3 binds the legal entity; .3.1 can identify its responsible person.
      if (oid(type, "604c010303") && /^\d{14}$/.test(text)) cnpjs.add(text);
    }
  }
  if (cnpjs.size === 1) {
    const documentId = [...cnpjs][0];
    if (validateCnpj(documentId).valid) return { kind: "A1_ECNPJ", documentId };
  } else if (!cnpjs.size && cpfs.size === 1) {
    const documentId = [...cpfs][0];
    if (validateCpf(documentId).valid) return { kind: "A1_ECPF", documentId };
  }
  throw new Error("Não foi possível comprovar o titular: exige SAN ICP-Brasil otherName 2.16.76.1.3.1 (CPF) ou 2.16.76.1.3.3 (CNPJ), válido e inequívoco.");
}

export function assertCentralA1Owner(certificatePem: string, kind: "A1_ECPF" | "A1_ECNPJ", documentId: string) {
  const owner = certificateOwner(certificatePem);
  if (owner.kind !== kind || owner.documentId !== documentId.replace(/\D/g, "")) throw new Error("Tipo ou CPF/CNPJ informado não corresponde ao titular comprovado pelo certificado.");
  return owner;
}

export function checkedCentralA1Signature(input: { certificatePem: string; intermediatePems: string[]; trustedRootPem: string; credentialReference: string }, recordId: string, envelopeHash: string) {
  const config = resolveReferencedA1Config({ ...input, intermediateCertificatePems: input.intermediatePems, trustedRootCertificatePem: input.trustedRootPem });
  // Preserve all existing chain, expiry and private-key matching checks.
  const evidence = signDocumentHashICPBrasil(recordId, envelopeHash, config);
  if (!verifyDocumentHashICPBrasil(evidence, config)) throw new Error("Falha na verificação da assinatura A1.");
  return evidence;
}

export function centralSigningConfigurationStatus() {
  let internalKeyValid = false;
  const pem = process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM;
  if (pem) {
    try {
      const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
      if (!["rsa", "ec", "ed25519"].includes(key.asymmetricKeyType ?? "")) throw new Error("Tipo não suportado.");
      if (key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("RSA insuficiente.");
      const algorithm = key.asymmetricKeyType === "ed25519" ? null : "sha256";
      const probe = Buffer.from("signature-central-configuration-check");
      internalKeyValid = verify(algorithm, probe, createPublicKey(key), sign(algorithm, probe, key));
    } catch { /* Expose booleans only, never OpenSSL errors or secret material. */ }
  }
  return { internalKeyPresent: Boolean(pem), internalKeyValid, blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) };
}
