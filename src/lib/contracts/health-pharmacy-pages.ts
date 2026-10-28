/** Undefined means unrestricted, [] means no authorized health unit. The page
 * computes this from the original user scope; these readers add no UG policy. */
export type PharmacyPageUnits = readonly string[] | undefined;
export type PharmacyPageSearch = { q?: string; status?: string; page?: string };
export type PharmacyDispensationSearch = PharmacyPageSearch & { patientId?: string; barcode?: string; unitId?: string; receiverQ?: string };
export type PharmacyRequestSearch = PharmacyPageSearch & { patient?: string; materialId?: string; type?: string; receiver?: string };
export type PharmacyKitSearch = PharmacyPageSearch & { receiver?: string; deliveryId?: string };

// Public page/client DTO boundary, independent of persistence and action types.
export type PharmacyDispensationHistory = {
  id: string; quantity: number; date: Date; status: string; movementId: string | null;
  cancellationReason: string | null; cancelledAt: Date | null; receiverRelationship: string | null;
  receiverPerson: { fullName: string } | null; patient: { person: { fullName: string } };
  medicine: { name: string }; unit: { name: string }; stock: { batchNumber: string } | null;
  kitDeliveryItem: { deliveryId: string } | null;
  events: { id: string; createdAt: Date; kind: string; reason: string; actorUsuarioId: string }[];
};
