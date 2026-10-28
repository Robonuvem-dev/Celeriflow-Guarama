export const BIDDING_NUMBER_DUPLICATE_ERROR = "J\u00e1 existe uma licita\u00e7\u00e3o com este n\u00famero.";

import { getPostgresError } from "@/db/errors";

export function biddingNumberDuplicateError(error: unknown): { error: string } | null {
  if (getPostgresError(error)?.code !== "23505") return null;
  return { error: BIDDING_NUMBER_DUPLICATE_ERROR };
}
