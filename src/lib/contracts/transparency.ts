export interface TransparencyPublication {
  id: string; publicKey: string; collectionSlug: string; entity: string; year: number;
  title: string; group: string; referencePeriod: string; documentKind: string; legalStage: string; source: string; status: string;
  values: unknown; version: number; order: number; fileUrl: string | null; filePathname: string | null; filename: string | null;
  contentType: string | null; sha256: string | null; linkUrl: string | null; publishedAt: Date | null; withdrawnAt: Date | null;
  createdAt: Date; updatedAt: Date;
}
export interface TransparencyNativeBinding {
  id: string; publicKey: string; collectionSlug: string; sourceType: string; sourceId: string; governmentEntityId: string;
  enabled: boolean; sourceReference: string; details: unknown; createdById: string; createdAt: Date; updatedAt: Date;
}
