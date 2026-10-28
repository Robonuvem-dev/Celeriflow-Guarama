type RegistryTimestamps = { id: string; createdAt: Date; updatedAt: Date };
export type PersonRecord = RegistryTimestamps & {
  fullName: string; socialName: string | null; cpf: string | null; rg: string | null; rgIssuer: string | null; birthDate: Date | null;
  gender: string | null; raceColor: string | null; nationality: string | null; birthPlace: string | null; maritalStatus: string | null;
  profession: string | null; educationLevel: string | null; motherName: string | null; fatherName: string | null; motherUnknown: boolean; fatherUnknown: boolean;
  status: string; deathDate: Date | null; estateApplied: boolean; phonePrimary: string | null; phoneSecondary: string | null; whatsapp: string | null; email: string | null; emailSecondary: string | null;
};
export type CompanyRecord = RegistryTimestamps & {
  corporateName: string; tradeName: string | null; cnpj: string; municipalInsc: string | null; stateInsc: string | null; companyType: string | null; legalNature: string | null;
  primaryCnae: string | null; secondaryCnaes: string | null; openingDate: Date | null; taxRegime: string | null; status: string; phone: string | null; whatsapp: string | null;
  emailPrimary: string | null; emailFiscal: string | null; website: string | null; contactPerson: string | null;
};
export type TaxpayerRecord = RegistryTimestamps & { taxpayerType: string; municipalInsc: string | null; status: string; economicActivities: string | null; fiscalNotes: string | null; personId: string | null; companyId: string | null };
export type SupplierRecord = RegistryTimestamps & { category: string | null; businessBranch: string | null; bankData: string | null; certificationsValidUntil: Date | null; status: string; notes: string | null; personId: string | null; companyId: string | null };
export type AddressRecord = RegistryTimestamps & { zipCode: string | null; streetName: string | null; number: string | null; complement: string | null; referencePoint: string | null; addressType: string | null; zone: string | null; latitude: number | null; longitude: number | null; neighborhoodId: string | null; streetId: string | null; canonicalAddressId: string | null; personId: string | null; companyId: string | null };
export type RealEstateRecord = RegistryTimestamps & { municipalInsc: string | null; registration: string | null; propertyType: string | null; status: string; streetName: string | null; number: string | null; complement: string | null; lot: string | null; block: string | null; landArea: number | null; builtArea: number | null; propertyUse: string | null; fiscalZone: string | null; neighborhoodId: string | null; streetId: string | null; taxpayerId: string | null };
export type DocumentRecord = RegistryTimestamps & { title: string; documentType: string; fileUrl: string; validUntil: Date | null; status: string; notes: string | null; documentClassId: string | null; publicLabel: string; retentionMonths: number; personId: string | null; companyId: string | null; folderId: string | null };
export type PersonMutation = Partial<Pick<PersonRecord, "fullName" | "cpf" | "email" | "phonePrimary" | "status">>;
export type CompanyMutation = Partial<Pick<CompanyRecord, "corporateName" | "cnpj" | "emailPrimary" | "phone" | "status" | "primaryCnae" | "secondaryCnaes">>;
export type SupplierMutation = Partial<Pick<SupplierRecord, "category" | "businessBranch" | "certificationsValidUntil" | "bankData" | "notes" | "status">>;
export type RealEstateMutation = Partial<Pick<RealEstateRecord, "municipalInsc" | "propertyType" | "streetName" | "number" | "status">>;
export type NeighborhoodRecord = RegistryTimestamps & { name: string; type: string; city: string; state: string; adminRegion: string | null; notes: string | null; status: string; cityId: string | null };
export type TaxpayerDetails = TaxpayerRecord & { person: PersonRecord | null; company: CompanyRecord | null };
export type RealEstateDetails = RealEstateRecord & { neighborhood: NeighborhoodRecord | null; taxpayer: TaxpayerDetails | null };
export type DocumentInput = Pick<DocumentRecord, "title" | "documentType" | "notes" | "fileUrl"> & Partial<Pick<DocumentRecord, "personId" | "companyId" | "validUntil">>;
export type RealEstateInput = Pick<RealEstateRecord, "municipalInsc" | "propertyType" | "propertyUse" | "streetName" | "number" | "complement" | "landArea" | "builtArea" | "status"> & Partial<Pick<RealEstateRecord, "neighborhoodId" | "taxpayerId">>;
