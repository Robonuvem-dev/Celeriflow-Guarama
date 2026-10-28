import type { JsonValue } from "@/db/json";

export type PortalRequest = {
  id: string; employeeId: string; requestKey: string; kind: string; status: string;
  payload: JsonValue; decision: string | null; actorId: string; decidedBy: string | null;
  createdAt: Date; decidedAt: Date | null;
};
export type PortalIntegrationEvent = {
  id: string; sourceKey: string; domain: string; environment: string; eventType: string; status: string;
  payload: JsonValue; payloadHash: string; externalId: string | null; result: JsonValue | null;
  attempts: number; nextAttemptAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type PortalPolicy = {
  id: string; ruleSetId: string; category: string; code: string; name: string; description: string | null;
  valueType: string; value: JsonValue; unit: string | null; sortOrder: number; legalReference: string | null;
  isRequired: boolean; isActive: boolean; createdAt: Date; updatedAt: Date;
};
