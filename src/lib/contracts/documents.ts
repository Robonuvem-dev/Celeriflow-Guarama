export type DocumentFolder = { id: string; name: string; description: string | null; parentId: string | null; departmentId: string | null; createdAt: Date; updatedAt: Date };
export type DocumentFolderWithCounts = DocumentFolder & { _count: { documents: number; children: number } };
export type DigitalCertificate = {
  id: string; alias: string; ownerName: string; provider: string; credentialReference: string; certificatePem: string; intermediatePems: unknown;
  trustedRootPem: string; subject: string; issuer: string; serialNumber: string; fingerprint256: string; validFrom: Date; validTo: Date;
  status: string; purposes: unknown; createdByUsuarioId: string; createdAt: Date; updatedAt: Date;
};
