import { createHash } from "node:crypto";
import { z } from "zod";

// The production schema effective on 2026-10-10. NT07 is published, but its
// staged production dates start on 2026-10-26; it must not silently replace this.
export const esocialReference = {
  layout: "S-1.3/NT06-2026/CNPJ-ALFA",
  documentation: "https://www.gov.br/esocial/pt-br/documentacao-tecnica",
  schemas: "https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/2026-07-01_esquemas_xsd_v_s_01_03_00.zip",
  developerManual: "https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/996775-manualorientacaodesenvolvedoresocialv1-16.pdf",
} as const;
export const environmentInput = z.enum(["RESTRICTED", "PRODUCTION"]);
export const eventKindInput = z.enum(["S2220", "S2210", "S2240"]);
export type EsocialEnvironment = z.infer<typeof environmentInput>;
export type EsocialKind = z.infer<typeof eventKindInput>;
export const hashArtifact = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export function hashSource(value: unknown): string {
  const canonical = (entry: unknown): string => {
    if (entry instanceof Date) return JSON.stringify(entry.toISOString());
    if (Array.isArray(entry)) return `[${entry.map(canonical).join(",")}]`;
    if (entry && typeof entry === "object") return `{${Object.entries(entry).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
    return JSON.stringify(entry) ?? "null";
  };
  return hashArtifact(canonical(value));
}

export type SourceProvenance = {
  kind: EsocialKind; sourceId: string; sourceVersion: string;
  budgetUnitId: string; employeeId: string | null; sourceHash: string;
};
export type SourceEnvelope = SourceProvenance & {
  data: Record<string, unknown>; missing: string[];
};
export const preparationInput = z.object({
  budgetUnitId: z.string().min(1), sourceId: z.string().min(1).max(150),
  kind: eventKindInput, environment: environmentInput,
  submissionKey: z.string().uuid(),
}).strict();
export const configurationInput = z.object({
  budgetUnitId: z.string().min(1), environment: environmentInput,
  employerRegistration: z.string().regex(/^[A-Z0-9]{8,14}$/),
  credentialReference: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/),
  providerReference: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/),
  submissionKey: z.string().uuid(),
}).strict();

export type SubmissionBinding = SourceProvenance & {
  eventId: string; environment: EsocialEnvironment; layout: string;
  credentialReference: string; employerRegistration: string;
};
export type SignedXml = { xml: string; eventXmlId: string; xmlHash: string; certificateFingerprint: string };
export type TransportResponse = { bytes: string; endpoint: string; receivedAt: Date; correlationId: string };
export type VerifiedResponse = {
  environment: EsocialEnvironment; eventXmlId: string; xmlHash: string;
  protocol: string; receipt: string | null; processedAt: Date;
  outcome: "PROCESSING" | "ACCEPTED" | "REJECTED";
  rejectionCodes: string[];
};
/** Server-only trusted implementation boundary. No browser upload can supply
 * any of these capabilities. A GED detached signature is not XMLDSig.
 * Validation MUST use the pinned official XSD, canonical source mapping,
 * XMLDSig reference/unique-ID checks, ICP chain, validity and revocation.
 * Response verification MUST parse the actual authenticated SOAP response,
 * bind event ID/digest, protocol and tpAmb, and distinguish lot/event status.
 */
export interface EsocialTransport {
  readonly mode: "REAL";
  buildAndSign(source: SourceEnvelope, binding: SubmissionBinding): Promise<SignedXml>;
  validateSignedXml(signed: SignedXml, source: SourceEnvelope, binding: SubmissionBinding): Promise<void>;
  send(signed: SignedXml, binding: SubmissionBinding): Promise<TransportResponse>;
  consult(protocol: string, binding: SubmissionBinding): Promise<TransportResponse>;
  verifyResponse(response: TransportResponse, signed: SignedXml, binding: SubmissionBinding): Promise<VerifiedResponse>;
}

export async function exchangeVerified(source: SourceEnvelope, binding: SubmissionBinding, transport?: EsocialTransport) {
  const signed = await buildValidatedXml(source, binding, transport);
  const response = await transport!.send(signed, binding);
  return { signed, response, verified: await verifyExchangeResponse(transport!, response, signed, binding) };
}

export async function buildValidatedXml(source: SourceEnvelope, binding: SubmissionBinding, transport?: EsocialTransport) {
  if (source.missing.length) throw new Error("Origem incompleta; corrija as pendências antes de transmitir.");
  if (source.sourceId !== binding.sourceId || source.sourceHash !== binding.sourceHash || source.sourceVersion !== binding.sourceVersion || source.budgetUnitId !== binding.budgetUnitId || source.employeeId !== binding.employeeId || source.kind !== binding.kind) throw new Error("Proveniência incompatível com o envio.");
  if (!transport || transport.mode !== "REAL") throw new Error("Adaptador real XMLDSig/XSD/mTLS e certificado A1 indisponíveis.");
  const signed = await transport.buildAndSign(source, binding);
  if (!signed.xml || signed.xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(signed.xml) || signed.xmlHash !== hashArtifact(signed.xml) || !signed.eventXmlId || !signed.certificateFingerprint) throw new Error("Artefato assinado inválido.");
  await transport.validateSignedXml(signed, source, binding);
  return signed;
}

export async function verifyExchangeResponse(transport: EsocialTransport, response: TransportResponse, signed: SignedXml, binding: SubmissionBinding, expectedProtocol?: string) {
  if (transport.mode !== "REAL" || !response.bytes || response.bytes.length > 4_000_000 || !/^https:\/\//.test(response.endpoint) || !response.correlationId || !Number.isFinite(response.receivedAt.getTime())) throw new Error("Retorno sem proveniência de transporte real.");
  const value = await transport.verifyResponse(response, signed, binding);
  if (value.environment !== binding.environment || value.eventXmlId !== signed.eventXmlId || value.xmlHash !== signed.xmlHash || !value.protocol || (expectedProtocol && value.protocol !== expectedProtocol) || !Number.isFinite(value.processedAt.getTime()) || value.processedAt > response.receivedAt || !["PROCESSING", "ACCEPTED", "REJECTED"].includes(value.outcome)) throw new Error("Retorno não corresponde ao evento/ambiente/protocolo enviado.");
  if (value.outcome === "ACCEPTED" && (!value.receipt || value.rejectionCodes.length)) throw new Error("Aceitação exige recibo oficial de evento sem rejeição.");
  if (value.outcome !== "ACCEPTED" && value.receipt) throw new Error("Retorno não aceito não pode ter recibo de aceitação.");
  if (value.outcome === "REJECTED" && !value.rejectionCodes.length) throw new Error("Rejeição sem código oficial.");
  return value;
}
