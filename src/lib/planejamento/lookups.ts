import "server-only";
import { z } from "zod";
import type { PlanningContext } from "./access";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { pageLookup } from "@/db/repositories/planning-pages/lookups";
import { pageDatabase } from "@/db/repositories/planning-pages/shared";

export const planningLookupFields = ["governmentEntityId", "destinationEntityId", "budgetUnitId", "resourceSourceId", "revenueNatureId", "expenseNatureId", "programId", "programPPAId", "programCodes", "sourceCodes", "actionId", "actionPPAId", "objectiveId", "instrumentId", "sourceInstrumentId", "targetInstrumentId", "parentId", "catalogVersionId", "lineId", "lineCodes", "items", "selectedCodes", "creditId", "waiverId", "taxId", "documentId", "hearingId", "signerIds", "linkId", "propositionId", "lawId", "canonicalCatalogId", "predecessorEntryId"] as const;
export async function planningLookup(context: PlanningContext, raw: unknown) {
  const input = z.object({ field: z.enum(planningLookupFields), instrumentId: z.string().optional(), q: z.string().max(200).default(""), page: z.coerce.number().int().positive().default(1), operation: z.string().optional(), amendmentId: z.string().optional(), parentKind: z.enum(["PPA", "LDO", "LOA"]).optional(), catalogKind: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE", "CNAE", "CBO", "SERVICE"]).optional(), canonicalId: z.string().optional() }).parse(raw);
  if (input.field === "signerIds" && !canPerformModuleOperation(context.user, "DOCUMENTOS", "update")) throw new AccessError("Consulta de assinantes exige autorização documental.", 403);
  return pageLookup(pageDatabase(context), context, input);
}
