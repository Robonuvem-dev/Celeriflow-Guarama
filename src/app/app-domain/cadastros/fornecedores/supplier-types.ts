export type SupplierEvidence = {
  title: string;
  documentType: string;
  status: string;
  validUntil: string | null;
};

export type SupplierRepresentative = {
  id: string;
  representationType: string;
  status: string;
  name: string;
  cpf: string | null;
};

export type SupplierBiddingSummaryItem = {
  id: string;
  number: string;
  modality: string;
  status: string;
};

export type SupplierTaxProfile = {
  municipalInsc: string | null;
  stateInsc: string | null;
  taxRegime: string | null;
  taxpayerType: string | null;
  economicActivities: string | null;
  fiscalNotes: string | null;
};

export type SupplierListItem = {
  id: string;
  category: string | null;
  businessBranch: string | null;
  bankData: string | null;
  certificationsValidUntil: string | null;
  notes: string | null;
  status: string;
  person: {
    fullName: string;
    cpf: string | null;
    documents: SupplierEvidence[];
  } | null;
  company: {
    corporateName: string;
    tradeName: string | null;
    cnpj: string;
    companyType: string | null;
    primaryCnae: string | null;
    secondaryCnaes: string | null;
    documents: SupplierEvidence[];
  } | null;
  representatives: SupplierRepresentative[];
  activeBiddings: SupplierBiddingSummaryItem[];
  taxInfo: SupplierTaxProfile | null;
};
