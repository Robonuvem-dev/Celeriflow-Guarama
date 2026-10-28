import type { Decimal } from "@/db/decimal";
import type { EmployeeRecord } from "./administration";
import type { PersonRecord, RealEstateRecord } from "./registry";

type Timestamps = { id: string; createdAt: Date; updatedAt: Date };
export type SocialUnitRecord = Timestamps & { identificationCode: string | null; implementationDate: Date | null; streetAddress: string | null; municipality: string | null; latitude: number | null; longitude: number | null; name: string; type: string; phone: string | null; email: string | null; isActive: boolean; isConfidential: boolean; addressId: string | null; realEstateId: string | null; managerId: string | null };
export type SocialUnitDetails = SocialUnitRecord & { realEstate: RealEstateRecord | null; manager: EmployeeRecord | null };
export type SocialFamilyRecord = Timestamps & { familyCode: string | null; nis: string | null; income: number | null; perCapitaIncome: number | null; vulnerabilities: string | null; status: string; masterFamilyId: string | null; representativeId: string; addressId: string | null };
export type SocialFamilyMemberRecord = Timestamps & { kinship: string; isDependent: boolean; familyId: string; personId: string };
export type SocialFamilyDetails = SocialFamilyRecord & { representative: PersonRecord; members: SocialFamilyMemberRecord[] };
export type SocialAttendanceRecord = Timestamps & { involvedProfessionalIds: string[]; date: Date; type: string; description: string; referrals: string | null; secrecyLevel: string; isActive: boolean; familyId: string; personId: string | null; unitId: string; professionalId: string };
export type SocialAttendanceDetails = SocialAttendanceRecord & { family: SocialFamilyRecord & { representative: PersonRecord }; person: PersonRecord | null; unit: SocialUnitRecord; professional: EmployeeRecord & { person: PersonRecord | null } };
export type SocialCatalogRecord = Timestamps & { kind: string; name: string; description: string | null; allowedUnitTypes: string[]; isActive: boolean };
export type SocialProfessionalLinkRecord = Timestamps & { employeeId: string; unitId: string; jobTitle: string; specialty: string | null; startsAt: Date; endsAt: Date | null; isActive: boolean; individualScope: string; familyScope: string; workingDays: number[]; workStart: string; workEnd: string; includeInRma: boolean };
export type SocialBenefitRecord = Timestamps & { dispensingMode: string; requiresApproval: boolean; quotaControlled: boolean; maxPerRequest: number; authorizerEmployeeId: string | null; name: string; description: string | null; isRecurrent: boolean; isActive: boolean };
export type SocialProgramRecord = Timestamps & { name: string; description: string | null; sphere: string; isActive: boolean };
export type SocialNetworkOrganizationRecord = Timestamps & { name: string; taxId: string | null; organizationType: string; address: string | null; phone: string | null; email: string | null; usesCounterReference: boolean; isActive: boolean };
export type SocialReferralRecord = Timestamps & { unitId: string; personId: string | null; familyId: string | null; destinationOrganizationId: string; reasonId: string; priorityTypeId: string | null; referenceProfessional: string | null; objective: string; observations: string | null; referredAt: Date; createdBy: string; status: string; counterReferenceAt: Date | null; counterReferenceProfessional: string | null; counterReferenceDescription: string | null; counterReferenceBy: string | null };
export type SocialReferralDetails = SocialReferralRecord & { unit: { name: string }; destinationOrganization: SocialNetworkOrganizationRecord };
export type SocialPersonProfileRecord = Timestamps & { personId: string; nis: string | null; genderIdentity: string | null; sexualOrientation: string | null; workSituation: string | null; occupation: string | null; workplace: string | null; admittedAt: Date | null; lastReviewedAt: Date };
export type SocialPersonFactRecord = Timestamps & { personId: string; catalogId: string; unitId: string; kind: string; identifiedAt: Date; observations: string | null; endedAt: Date | null; endingReason: string | null; createdBy: string; endedBy: string | null };
export type SocialFinancialEntryRecord = { id: string; personId: string; catalogId: string; unitId: string; kind: string; competence: Date; value: Decimal; employmentDescription: string | null; observations: string | null; cancelledAt: Date | null; cancellationReason: string | null; createdBy: string; cancelledBy: string | null; createdAt: Date };
export type SocialBenefitRequestRecord = { id: string; familyId: string; unitId: string; personId: string | null; reason: string; createdBy: string; createdAt: Date; cancelledAt: Date | null; cancellationReason: string | null };
export type SocialBenefitRequestItemRecord = { id: string; requestId: string; benefitId: string; quantity: number; value: Decimal | null; status: string; approvalRequired: boolean; dispensingMode: string; quotaControlled: boolean; authorizerEmployeeId: string | null; evaluatedBy: string | null; evaluatedAt: Date | null; assessment: string | null; deliveredBy: string | null; deliveredAt: Date | null; deliveryReason: string | null };
export type SocialBenefitRequestDetails = SocialBenefitRequestRecord & { family: { familyCode: string | null; representative: Pick<PersonRecord, "fullName" | "socialName" | "cpf"> }; unit: Pick<SocialUnitRecord, "name" | "streetAddress" | "municipality">; items: (SocialBenefitRequestItemRecord & { benefit: { name: string } })[] };
export type SocialBenefitStockRecord = { id: string; benefitId: string; unitId: string; quantity: number; updatedAt: Date; benefit: { name: string }; unit: { name: string } };
export type SocialBenefitQuotaRecord = { id: string; benefitId: string; unitId: string; startsAt: Date; endsAt: Date; total: number; consumed: number; createdAt: Date; benefit: { name: string }; unit: { name: string } };

export interface SuasRmaRecord {
  id: string;
  nis: string;
  nomeCidadao: string;
  unidadeAtendimento: string;
  tipoAtendimento: string;
  detalhesRma: string;
  tecnicoResponsavel: string;
  dataAtendimento: Date;
  status: string;
  createdAt: Date;
}
