import type { z } from "zod";
import { inspectionPlanSchema } from "./construction-lifecycle-policy";

type Review = { caseId: string; requestKey: string; reviewType: string; decision: string };
type Plan = z.infer<typeof inspectionPlanSchema>;

/** Both writers must use the caller's transaction; a failed plan must roll back the review. */
export async function saveConstructionReviewWithInspectionPlan(data: Review, inspectionTypeIds: string[] | undefined, writers: { review: () => Promise<string>; plan: (input: Plan) => Promise<string> }) {
  const needsPlan = data.reviewType === "PROJECT" && data.decision === "APPROVED";
  const types = needsPlan ? inspectionPlanSchema.shape.inspectionTypeIds.parse(inspectionTypeIds || []) : [];
  const reviewId = await writers.review();
  if (needsPlan) await writers.plan({ caseId: data.caseId, requestKey: data.requestKey, reviewId, inspectionTypeIds: types });
  return reviewId;
}
