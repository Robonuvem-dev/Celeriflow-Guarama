export type FinancialYearRecord = {
  id: string; year: number; governmentEntityId: string | null; status: string;
  startDate: Date; endDate: Date; createdAt: Date; updatedAt: Date;
};

export type FinancialReportScope = { governmentEntityId?: string; budgetUnitId?: string; budgetUnitIds?: string[] };
export type ResolvedFinancialReportScope = FinancialReportScope & { year: number; fullEntity: boolean };
