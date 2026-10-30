import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

type EventLabel = { eventType: string; description: string };
type Address = { streetName: string | null; neighborhood: { name: string } | null };
export interface FiscalTaxpayerSource {
  id: string; economicActivities: string | null;
  person: { fullName: string; cpf: string | null; addresses: Address[] } | null;
  company: { corporateName: string; cnpj: string; addresses: Address[] } | null;
  economicRegistrations: { primaryCnae: string | null }[];
}
export interface FiscalPropertySource {
  id: string; municipalInsc: string | null; registration: string | null; taxpayerId: string | null;
  propertyType: string | null; streetName: string | null; block: string | null; fiscalZone: string | null;
  neighborhood: { name: string } | null;
}
export interface FiscalPlanSource {
  id: string; year: number; name: string; planType: string; status: string; filterSnapshot: JsonValue;
  selections: { id: string }[]; inspectors: { employeeId: string }[]; events: EventLabel[]; _count: { orders: number };
}
export interface FiscalMapSource {
  id: string; version: number; obligationType: string; status: string; competence: string;
  assessedBaseDecimal: Decimal; originalBaseDecimal: Decimal; principalDecimal: Decimal; penaltyDecimal: Decimal;
  interestDecimal: Decimal; correctionDecimal: Decimal; discountDecimal: Decimal; totalDecimal: Decimal;
}
export interface FiscalOrderSource {
  id: string; orderNumber: string; originType: string; status: string; taxpayerId: string | null;
  realEstateId: string | null; responsibleEmployeeId: string; reason: string; issuedAt: Date; readAt: Date | null; closedAt: Date | null;
  documents: { id: string; documentKind: string; documentNumber: string; status: string; issuedAt: Date }[];
  requests: { id: string; description: string; status: string; deadlineAt: Date; receivedBy: string | null; returnedTo: string | null }[];
  assessmentMaps: FiscalMapSource[]; events: EventLabel[];
}
export interface FiscalFindingSource {
  id: string; taxpayerId: string; competence: string; status: string; nfseDecimal: Decimal; simplesDeclaredDecimal: Decimal;
  cardDecimal: Decimal; desifDecimal: Decimal; differenceDecimal: Decimal; rate: Decimal; potentialTaxDecimal: Decimal;
  causes: JsonValue; orderLinks: { id: string }[];
}
export interface FiscalProductivitySource {
  id: string; employeeId: string; competence: string; status: string; pointsDecimal: Decimal; pointValueDecimal: Decimal;
  grossAmountDecimal: Decimal; cappedAmountDecimal: Decimal; excessAmountDecimal: Decimal; adjustmentDecimal: Decimal; finalAmountDecimal: Decimal;
  ledger: { movementType: string; amountDecimal: Decimal; description: string }[];
}
export interface FiscalInspectionPageSource {
  rawTaxpayers: FiscalTaxpayerSource[]; properties: FiscalPropertySource[];
  employees: { id: string; name: string; registration: string | null; salaryBase: number }[];
  plans: FiscalPlanSource[]; orders: FiscalOrderSource[]; findings: FiscalFindingSource[]; periods: FiscalProductivitySource[];
  templates: { id: string; code: string; name: string; documentKind: string; bodyTemplate: string; version: number; status: string }[];
  rules: { id: string; code: string; name: string; obligationType: string; penaltyRate: Decimal; discountRate: Decimal; interestRate: Decimal; correctionRate: Decimal; legalBasis: string }[];
}
