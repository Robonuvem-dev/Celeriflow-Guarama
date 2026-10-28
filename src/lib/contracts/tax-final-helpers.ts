/** Identity/scope only; persistence is supplied explicitly by the caller. */
export type TaxFinalHelpersActor = {
  usuarioId: string;
  employeeId: string | null;
  budgetUnitId?: string | null;
  allowedBudgetUnitIds?: string[];
};

export type CertificateSubject = { taxpayerId: string; role: string; profileId: string | null; typeCatalogId: string | null };
