export type StoredReportTemplate = {
  id: string; scope: string; version: number; fingerprint: string; header: string; footer: string;
  orientation: string; includeEmissionMetadata: boolean; createdAt: Date; updatedAt: Date;
};
