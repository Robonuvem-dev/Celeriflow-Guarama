import type { ConstructionParticipantFilter } from "@/lib/contracts/construction-scopes";
import { z } from "zod";

export function constructionPortalCaseWhere(identityId: string): ConstructionParticipantFilter {
  return { participants: { some: { identityId, isActive: true, endsAt: null } } };
}
export const constructionMessageSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), content: z.string().trim().min(1).max(4000) });
