export type ProcurementCatalogItem = {
  id: string; code: string | null; name: string; description: string | null; unit: string; category: string | null;
  estimatedValue: number | null; isActive: boolean; productKind: string; specification: string | null;
  externalCode: string | null; createdAt: Date; updatedAt: Date;
};
