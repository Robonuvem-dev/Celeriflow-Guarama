export type SupplierStatusFilter = "ALL" | "Ativo" | "Inativo" | "Suspenso";
export type SupplierClassificationFilter = "ALL" | "ME" | "EPP" | "ME_EPP";
export type CertificationFilter = "ALL" | "VENCIDA" | "VENCE_EM_BREVE" | "VIGENTE" | "SEM_VALIDADE";
export type PersonTypeFilter = "ALL" | "PF" | "PJ";
export type SupplierFilters = {
  query: string;
  document?: string;
  personType?: PersonTypeFilter;
  status: SupplierStatusFilter;
  classification: SupplierClassificationFilter;
  certification: CertificationFilter;
  validFrom: string;
  validUntil: string;
  page: number;
};
type SupplierDocumentSource = { title: string; documentType: string; status: string; validUntil: Date | null };
export type SupplierLegalRepresentativeSource = {
  id: string;
  representationType: string;
  status: string;
  representative: {
    fullName: string;
    cpf?: string | null;
  };
};
export type SupplierBiddingSummary = {
  id: string;
  number: string;
  modality: string;
  status: string;
};
export type SupplierTaxInfo = {
  municipalInsc: string | null;
  stateInsc: string | null;
  taxRegime: string | null;
  taxpayerType: string | null;
  economicActivities: string | null;
  fiscalNotes: string | null;
};
export type SupplierSourceRow = {
  id: string; category: string | null; businessBranch: string | null; bankData: string | null; certificationsValidUntil: Date | null; notes: string | null; status: string;
  person: { fullName: string; cpf: string | null; documents: SupplierDocumentSource[] } | null;
  company: { corporateName: string; tradeName: string | null; cnpj: string; companyType: string | null; primaryCnae: string | null; secondaryCnaes: string | null; documents: SupplierDocumentSource[] } | null;
  representatives?: SupplierLegalRepresentativeSource[];
  activeBiddings?: SupplierBiddingSummary[];
  taxInfo?: SupplierTaxInfo | null;
};
