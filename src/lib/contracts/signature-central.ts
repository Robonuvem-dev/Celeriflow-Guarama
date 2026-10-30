export type CentralSignerKind = "SERVIDOR" | "CIDADAO";
export type CentralSignatureMethod = "INTERNAL" | "A1_ECPF" | "A1_ECNPJ";

export type CentralSigner = {
  id: string; kind: CentralSignerKind; name: string; role: string; documentId: string;
  phone: string; mobile: string; email: string; validUntil: string; active: boolean;
  employeeId: string | null; personId: string | null; accountUserId: string | null;
  hasPassword: boolean;
};
export type CentralSignerInput = Omit<CentralSigner, "id" | "hasPassword"> & { id?: string; password?: string };
export type CentralDocumentType = { id: string; name: string; description: string; active: boolean };
export type CentralOrigin = {
  id: string; kind: CentralSignerKind; name: string; role: string; documentId: string;
  phone: string; mobile: string; email: string; employeeId: string | null; personId: string | null;
};
export type CentralA1Integration = {
  id: string; kind: "A1_ECPF" | "A1_ECNPJ"; alias: string; ownerName: string; documentId: string;
  certificateId: string; active: boolean; validFrom: string; validTo: string; credentialReference: string;
};
export type CentralSignatureRecord = {
  id: string; code: string; filename: string; mimeType: string; byteLength: number; hashSha256: string;
  documentTypeName: string; signerName: string; signerRole: string; signerDocument: string;
  method: CentralSignatureMethod; signedAt: string; expiresAt: string; storageDeletedAt: string | null;
};
export type CentralValidation = {
  valid: boolean; message: string; fileCompared: boolean;
  records: Array<Pick<CentralSignatureRecord, "code" | "filename" | "hashSha256" | "documentTypeName" | "signerName" | "signerRole" | "method" | "signedAt" | "expiresAt"> & { signerDocumentMasked: string; valid: boolean }>;
};
