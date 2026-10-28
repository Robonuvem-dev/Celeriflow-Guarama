/** Read contracts for Financeiro SSR pages; no persistence/client dependency. */
export type FinancePageAccess = { allowedBudgetUnitIds?: string[] };

export type AccountingPageFilters = {
  governmentEntityId: string;
  financialYearId: string;
  budgetUnitIds: string[];
  sourceModule?: string;
  from?: Date;
  through?: Date;
  account?: string;
  q?: string;
  page: number;
};
