import { createHash, createPrivateKey, createSign, createVerify, X509Certificate } from "node:crypto";

export class IcpBrasilConfigurationError extends Error {}

export type IcpBrasilCertificateConfig = {
  certificatePem: string;
  privateKeyPem: string;
  privateKeyPassphrase?: string;
  intermediateCertificatePems?: string[];
  trustedRootCertificatePem: string;
};

export type DigitalSignatureResult = {
  documentId: string;
  documentHash: string;
  signatureBase64: string;
  algorithm: "SHA256";
  signedAt: Date;
  certificateSubject: string;
  certificateIssuer: string;
  certificateSerialNumber: string;
  certificateFingerprint256: string;
  certificatePem: string;
};

export type DocumentHashSignatureResult = Omit<DigitalSignatureResult, "documentId"> & {
  documentVersionId: string;
  canonicalPayload: string;
};

function normalizePem(value: string | undefined) {
  return value?.replace(/\\n/g, "\n").trim();
}

export function resolveReferencedA1Config(input: { credentialReference: string; certificatePem: string; intermediateCertificatePems?: string[]; trustedRootCertificatePem: string }): IcpBrasilCertificateConfig {
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(input.credentialReference)) throw new IcpBrasilConfigurationError("A referência do segredo A1 deve ser um prefixo de variável de ambiente válido.");
  const privateKeyPem = normalizePem(process.env[`${input.credentialReference}_PRIVATE_KEY_PEM`]);
  if (!privateKeyPem) throw new IcpBrasilConfigurationError(`Chave A1 indisponível no provedor de segredos para a referência ${input.credentialReference}.`);
  return {
    certificatePem: normalizePem(input.certificatePem)!,
    privateKeyPem,
    privateKeyPassphrase: process.env[`${input.credentialReference}_PRIVATE_KEY_PASSPHRASE`],
    intermediateCertificatePems: input.intermediateCertificatePems?.map((pem) => normalizePem(pem)!).filter(Boolean),
    trustedRootCertificatePem: normalizePem(input.trustedRootCertificatePem)!,
  };
}

export function inspectIcpBrasilCertificate(certificatePem: string) {
  const certificate = new X509Certificate(normalizePem(certificatePem)!);
  return { subject: certificate.subject, issuer: certificate.issuer, serialNumber: certificate.serialNumber, fingerprint256: certificate.fingerprint256, validFrom: new Date(certificate.validFrom), validTo: new Date(certificate.validTo) };
}

function canonicalHashPayload(documentVersionId: string, documentHash: string, signedAt: Date) {
  if (!/^[a-f0-9]{64}$/i.test(documentHash)) throw new IcpBrasilConfigurationError("Hash SHA-256 do documento inválido.");
  return `${documentVersionId}\n${documentHash.toLowerCase()}\n${signedAt.toISOString()}`;
}

export function signDocumentHashICPBrasil(documentVersionId: string, documentHash: string, config: IcpBrasilCertificateConfig): DocumentHashSignatureResult {
  const certificate = new X509Certificate(config.certificatePem);
  const privateKey = createPrivateKey({ key: config.privateKeyPem, format: "pem", passphrase: config.privateKeyPassphrase });
  if (!certificate.checkPrivateKey(privateKey)) throw new IcpBrasilConfigurationError("A chave privada não corresponde ao certificado ICP-Brasil informado.");
  const signedAt = new Date();
  assertCertificateCurrent(certificate, signedAt);
  assertTrustedChain(certificate, config, signedAt);
  const canonicalPayload = canonicalHashPayload(documentVersionId, documentHash, signedAt);
  const signer = createSign("SHA256");
  signer.update(canonicalPayload);
  signer.end();
  return { documentVersionId, documentHash: documentHash.toLowerCase(), canonicalPayload, signatureBase64: signer.sign(privateKey, "base64"), algorithm: "SHA256", signedAt, certificateSubject: certificate.subject, certificateIssuer: certificate.issuer, certificateSerialNumber: certificate.serialNumber, certificateFingerprint256: certificate.fingerprint256, certificatePem: config.certificatePem };
}

export function verifyDocumentHashICPBrasil(result: DocumentHashSignatureResult, config: Pick<IcpBrasilCertificateConfig, "intermediateCertificatePems" | "trustedRootCertificatePem">) {
  try {
    const certificate = new X509Certificate(result.certificatePem);
    if (certificate.fingerprint256 !== result.certificateFingerprint256) return false;
    const signedAt = new Date(result.signedAt);
    assertCertificateCurrent(certificate, signedAt);
    assertTrustedChain(certificate, config, signedAt);
    if (canonicalHashPayload(result.documentVersionId, result.documentHash, signedAt) !== result.canonicalPayload) return false;
    const verifier = createVerify(result.algorithm);
    verifier.update(result.canonicalPayload);
    verifier.end();
    return verifier.verify(certificate.publicKey, result.signatureBase64, "base64");
  } catch {
    return false;
  }
}

function canonicalPayload(documentId: string, content: string, signedAt: Date) {
  const documentHash = createHash("sha256")
    .update(documentId)
    .update("\n")
    .update(content)
    .digest("hex");
  return { documentHash, payload: `${documentId}\n${documentHash}\n${signedAt.toISOString()}` };
}

function assertCertificateCurrent(certificate: X509Certificate, at: Date = new Date()) {
  const timestamp = at.getTime();
  if (!Number.isFinite(timestamp) || timestamp < new Date(certificate.validFrom).getTime() || timestamp > new Date(certificate.validTo).getTime()) {
    throw new IcpBrasilConfigurationError("O certificado ICP-Brasil informado está fora do período de validade.");
  }
}

function assertTrustedChain(certificate: X509Certificate, config: Pick<IcpBrasilCertificateConfig, "intermediateCertificatePems" | "trustedRootCertificatePem">, at: Date) {
  let child = certificate;
  for (const pem of config.intermediateCertificatePems ?? []) {
    const issuer = new X509Certificate(pem);
    if (!child.checkIssued(issuer) || !child.verify(issuer.publicKey)) {
      throw new IcpBrasilConfigurationError("A cadeia do certificado não é válida para a autoridade intermediária informada.");
    }
    assertCertificateCurrent(issuer, at);
    child = issuer;
  }

  const trustedRoot = new X509Certificate(config.trustedRootCertificatePem);
  const isTrustedRoot = child.fingerprint256 === trustedRoot.fingerprint256;
  if (!isTrustedRoot && (!child.checkIssued(trustedRoot) || !child.verify(trustedRoot.publicKey))) {
    throw new IcpBrasilConfigurationError("A cadeia do certificado não termina na raiz ICP-Brasil confiável configurada.");
  }
  assertCertificateCurrent(trustedRoot, at);
}

function environmentConfig(): IcpBrasilCertificateConfig {
  const certificatePem = process.env.ICP_BRASIL_A1_CERT_PEM;
  const privateKeyPem = process.env.ICP_BRASIL_A1_PRIVATE_KEY_PEM;
  const trustedRootCertificatePem = process.env.ICP_BRASIL_TRUSTED_ROOT_CERT_PEM;
  if (!certificatePem || !privateKeyPem || !trustedRootCertificatePem) {
    throw new IcpBrasilConfigurationError("Assinatura ICP-Brasil indisponível: configure o certificado A1, a chave privada e a raiz confiável fora do código-fonte.");
  }

  return {
    certificatePem,
    privateKeyPem,
    privateKeyPassphrase: process.env.ICP_BRASIL_A1_PRIVATE_KEY_PASSPHRASE,
    intermediateCertificatePems: process.env.ICP_BRASIL_A1_CHAIN_PEM
      ?.split("\n---CERTIFICATE---\n")
      .filter(Boolean),
    trustedRootCertificatePem,
  };
}

export function signDocumentICPBrasil(
  documentId: string,
  content: string,
  config: IcpBrasilCertificateConfig = environmentConfig(),
): DigitalSignatureResult {
  if (!documentId.trim() || !content) {
    throw new IcpBrasilConfigurationError("Documento e conteúdo são obrigatórios para assinatura ICP-Brasil.");
  }

  const certificate = new X509Certificate(config.certificatePem);
  const privateKey = createPrivateKey({
    key: config.privateKeyPem,
    format: "pem",
    passphrase: config.privateKeyPassphrase,
  });
  if (!certificate.checkPrivateKey(privateKey)) {
    throw new IcpBrasilConfigurationError("A chave privada não corresponde ao certificado ICP-Brasil informado.");
  }
  const signedAt = new Date();
  assertCertificateCurrent(certificate, signedAt);
  assertTrustedChain(certificate, config, signedAt);

  const { documentHash, payload } = canonicalPayload(documentId, content, signedAt);
  const signer = createSign("SHA256");
  signer.update(payload);
  signer.end();

  return {
    documentId,
    documentHash,
    signatureBase64: signer.sign(privateKey, "base64"),
    algorithm: "SHA256",
    signedAt,
    certificateSubject: certificate.subject,
    certificateIssuer: certificate.issuer,
    certificateSerialNumber: certificate.serialNumber,
    certificateFingerprint256: certificate.fingerprint256,
    certificatePem: config.certificatePem,
  };
}

export function signBatchICPBrasil(
  documents: { id: string; content: string }[],
  config?: IcpBrasilCertificateConfig,
): DigitalSignatureResult[] {
  if (!documents.length) throw new IcpBrasilConfigurationError("Informe ao menos um documento para assinatura em lote.");
  return documents.map((document) => signDocumentICPBrasil(document.id, document.content, config ?? environmentConfig()));
}

export function verifyICPBrasilSignature(
  result: DigitalSignatureResult,
  content: string,
  config: Pick<IcpBrasilCertificateConfig, "intermediateCertificatePems" | "trustedRootCertificatePem">,
): boolean {
  try {
    const certificate = new X509Certificate(result.certificatePem);
    if (certificate.fingerprint256 !== result.certificateFingerprint256) return false;
    const signedAt = new Date(result.signedAt);
    assertCertificateCurrent(certificate, signedAt);
    assertTrustedChain(certificate, config, signedAt);
    const { documentHash, payload } = canonicalPayload(result.documentId, content, signedAt);
    if (documentHash !== result.documentHash) return false;

    const verifier = createVerify(result.algorithm);
    verifier.update(payload);
    verifier.end();
    return verifier.verify(certificate.publicKey, result.signatureBase64, "base64");
  } catch {
    return false;
  }
}
