import type { DatabaseExecutor } from "@/db/transaction";
import { z } from "zod";

export type ReadExecutor = Pick<DatabaseExecutor, "select" | "selectDistinct" | "selectDistinctOn" | "execute">;
export type PlanningPageSearch = { q?: string; page?: string };
export type PlanningPageOption = { id: string; name: string };
export type PlanningLookupInput = { field: string; instrumentId?: string; q: string; page: number; operation?: string; amendmentId?: string; parentKind?: "PPA" | "LDO" | "LOA"; catalogKind?: string; canonicalId?: string };
export type PlanningLookupResult = { options: PlanningPageOption[]; total: number; page: number };

const named = z.object({ id: z.string(), code: z.string().optional(), name: z.string() }).passthrough();
const program = named.extend({ origin: z.string().nullable(), guidelines: z.string().nullable(), targetAudience: z.string().nullable(), financing: z.string().nullable(), managerName: z.string().nullable(), objectives: z.array(z.object({ code: z.string(), description: z.string(), indicators: z.array(z.object({ name: z.string(), unit: z.string(), baselineValue: z.number(), targetValue: z.number() }).passthrough()) }).passthrough()) });
export const planningReportLine = z.object({
  id: z.string(), instrumentId: z.string(), kind: z.string(), code: z.string(), description: z.string(), year: z.number(), budgetUnitId: z.string(), resourceSourceId: z.string(),
  programId: z.string().nullable(), actionId: z.string().nullable(), functionCode: z.string().nullable(), subfunctionCode: z.string().nullable(), product: z.string().nullable(), productUnit: z.string().nullable(),
  originalValue: z.string(), physicalTarget: z.string(), physicalActual: z.string(), appropriationId: z.string().nullish(),
  destinationEntityId: z.string().nullable(), destinationEntity: named.nullable(), transferDirection: z.string().nullable(), originalPhysicalTarget: z.string().nullable(), originalPhysicalActual: z.string().nullable(),
  budgetUnit: named.extend({ secretariat: named }), resourceSource: named, revenueNature: named.nullable(), expenseNature: named.nullable(), program: program.nullable(), action: named.extend({ type: z.string().optional() }).nullable(),
  classificationSnapshot: z.object({ versionId: z.string(), normativeReference: z.string(), source: z.object({ code: z.string(), name: z.string() }).passthrough(), revenue: named.nullable(), expense: named.nullable(), tree: z.array(z.object({ kind: z.string(), code: z.string(), parentCode: z.string().nullable(), degree: z.number(), name: z.string() }).passthrough()) }).passthrough().nullish(),
  movements: z.array(z.object({ id: z.string(), idempotencyKey: z.string(), value: z.string(), effectiveAt: z.string(), reason: z.string(), legalActNumber: z.string(), legalText: z.string() }).passthrough()),
  physicalEvents: z.array(z.object({ effectiveAt: z.string(), createdAt: z.string(), target: z.string(), actual: z.string() }).passthrough()),
  quotas: z.array(z.object({ id: z.string(), month: z.number(), periodMonths: z.number(), planned: z.string(), disbursementPlanned: z.string(), disbursementPaid: z.string(), consumed: z.string(), blocked: z.string(), closedAt: z.string().nullable(), method: z.string(), calculation: z.object({ initialPlanned: z.string(), initialDisbursement: z.string(), generatedAt: z.string().optional() }).passthrough(), events: z.array(z.object({ type: z.string(), effectiveAt: z.string(), value: z.string(), createdAt: z.string() }).passthrough()) }).passthrough()),
}).passthrough();
export const planningReportPiece = z.object({
  id: z.string(), code: z.string(), title: z.string(), revision: z.number(), kind: z.string(), governmentEntityId: z.string(), governmentEntity: named.extend({ cnpj: z.string().nullish() }),
  memories: z.array(z.object({ title: z.string(), year: z.number().nullish(), normativeReference: z.string(), baseValue: z.string(), rate: z.string(), resultValue: z.string(), methodology: z.string(), assumptions: z.string(), calculation: z.unknown().optional() }).passthrough()),
  waivers: z.array(z.object({ id: z.string(), taxId: z.string().nullish(), realizedValue: z.string().nullish(), realizedThrough: z.string().nullish(), year: z.number(), description: z.string(), legalReference: z.string(), estimatedValue: z.string(), compensation: z.string(), compensationValue: z.string(), methodology: z.string() }).passthrough()),
  fiscalRules: z.array(z.object({ type: z.string(), normativeReference: z.string(), definition: z.unknown() }).passthrough()), programs: z.array(program).optional(),
  plannedWorks: z.array(z.object({ title: z.string(), type: z.string(), year: z.number(), location: z.string(), legalReference: z.string(), value: z.string(), startsAt: z.string().nullish(), conservationValue: z.string().optional(), newProjectsValue: z.string().optional() }).passthrough()),
}).passthrough();
export type PlanningReportLine = z.infer<typeof planningReportLine>;
export type PlanningReportPiece = z.infer<typeof planningReportPiece>;
export const planningDataset = z.object({ title: z.string(), year: z.number(), warnings: z.array(z.string()), metadata: z.object({ status: z.enum(["INTERNAL_REVIEW", "INTERNAL_PARTIAL"]), scope: z.string(), referencePeriod: z.string(), statutoryCompleteness: z.literal("NOT_STATUTORY"), publicSnapshotEligible: z.boolean(), publicSnapshotCondition: z.string() }).passthrough(), sections: z.array(z.object({ title: z.string(), rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))) }).passthrough()) }).passthrough();
