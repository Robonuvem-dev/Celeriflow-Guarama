import { BIDDING_STATUS, BiddingWorkflowError } from "./bidding-workflow";

export function requiresBiddingStatusReason(status: string) {
  return ([BIDDING_STATUS.ANNULLED, BIDDING_STATUS.REVOKED, BIDDING_STATUS.SUSPENDED, BIDDING_STATUS.CANCELLED, BIDDING_STATUS.DESERTED, BIDDING_STATUS.FAILED, BIDDING_STATUS.INACTIVE] as string[]).includes(status);
}
export function validateBiddingStatusReason(status: string, reason?: string) {
  const text = reason?.trim() || "";
  if (requiresBiddingStatusReason(status) && !text) throw new BiddingWorkflowError("Informe a observação / justificativa da alteração de situação.");
  if (text.length > 4000) throw new BiddingWorkflowError("A observação deve ter no máximo 4.000 caracteres.");
  return text;
}
