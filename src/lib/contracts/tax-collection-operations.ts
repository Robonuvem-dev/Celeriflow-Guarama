import type * as tables from "@/db/schema/tax-collection-operations";

export type SimplesBatchRecord = typeof tables.simplesImportBatches.$inferSelect;
export type InstallmentAgreementRecord = typeof tables.installmentAgreements.$inferSelect;
export type InstallmentCreationRecord = InstallmentAgreementRecord & {
  quotas: (typeof tables.installmentQuotas.$inferSelect)[];
  debts: (typeof tables.installmentDebts.$inferSelect)[];
  events: (typeof tables.installmentEvents.$inferSelect)[];
};
export type PrizeExecutionRecord = typeof tables.prizeExecutions.$inferSelect & {
  winners: (typeof tables.prizeWinners.$inferSelect & { coupon: typeof tables.prizeCoupons.$inferSelect })[];
};
