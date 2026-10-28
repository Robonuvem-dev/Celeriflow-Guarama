import type { JsonValue } from "@/db/json";
export type ControlPlan = { id: string; title: string; reference: string; status: string; dueAt: Date | null; ownerId: string; budgetUnitId: string | null; createdAt: Date; updatedAt: Date };
export type ControlFinding = { id: string; planId: string; title: string; description: string; status: string; dueAt: Date | null; responsibleId: string | null; evidenceDocumentId: string | null; resolvedAt: Date | null; createdAt: Date; updatedAt: Date };
export type ControlEvent = { id: string; planId: string; findingId: string | null; eventType: string; actorId: string; reason: string; snapshot: JsonValue; createdAt: Date };
export type ControlPlanView = ControlPlan & { findings: ControlFinding[]; events: ControlEvent[]; budgetUnit: { name: string; planningEntityUnit: { governmentEntityId: string; governmentEntity: { name: string } } | null } | null };
