import type { DatabaseExecutor } from "@/db/transaction";
import type { SupplierFilters, SupplierSourceRow } from "@/lib/contracts/supplier";
import { countSupplierRows, loadSupplierRows } from "@/db/repositories/registry/suppliers";
export { buildSupplierWhere } from "@/db/repositories/registry/suppliers";
export type { SupplierStatusFilter, SupplierClassificationFilter, CertificationFilter, SupplierFilters } from "@/lib/contracts/supplier";
import type { SupplierListItem } from "./supplier-types";
import { dateInputValue } from "./supplier-utils";

export const SUPPLIER_PAGE_SIZE = 20;

const supplierStatuses = ["ALL", "Ativo", "Inativo", "Suspenso"] as const;
const supplierClassifications = ["ALL", "ME", "EPP", "ME_EPP"] as const;
const certificationFilters = ["ALL", "VENCIDA", "VENCE_EM_BREVE", "VIGENTE", "SEM_VALIDADE"] as const;

type SearchParameter = string | string[] | undefined;

function firstValue(value: SearchParameter) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function allowedValue<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function validDateParameter(value: string) {
  return dateInputValue(value);
}

function validPage(value: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function supplierItem(row: SupplierSourceRow): SupplierListItem {
  const document = (item: { title: string; documentType: string; status: string; validUntil: Date | null }) => ({
    title: item.title,
    documentType: item.documentType,
    status: item.status,
    validUntil: dateInputValue(item.validUntil) || null,
  });

  return {
    id: row.id,
    category: row.category,
    businessBranch: row.businessBranch,
    bankData: row.bankData,
    certificationsValidUntil: dateInputValue(row.certificationsValidUntil) || null,
    notes: row.notes,
    status: row.status,
    person: row.person ? {
      fullName: row.person.fullName,
      cpf: row.person.cpf,
      documents: (row.person.documents || []).map(document),
    } : null,
    company: row.company ? {
      corporateName: row.company.corporateName,
      tradeName: row.company.tradeName,
      cnpj: row.company.cnpj,
      companyType: row.company.companyType,
      primaryCnae: row.company.primaryCnae,
      secondaryCnaes: row.company.secondaryCnaes,
      documents: (row.company.documents || []).map(document),
    } : null,
  };
}

export function parseSupplierFilters(input: Record<string, SearchParameter>): SupplierFilters {
  const query = firstValue(input.q).slice(0, 150);
  return {
    query,
    status: allowedValue(firstValue(input.status), supplierStatuses, "ALL"),
    classification: allowedValue(firstValue(input.classification), supplierClassifications, "ALL"),
    certification: allowedValue(firstValue(input.certification), certificationFilters, "ALL"),
    validFrom: validDateParameter(firstValue(input.validFrom)),
    validUntil: validDateParameter(firstValue(input.validUntil)),
    page: validPage(firstValue(input.page)),
  };
}

export function supplierFilterSearchParams(filters: SupplierFilters, includePage = true) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.classification !== "ALL") params.set("classification", filters.classification);
  if (filters.certification !== "ALL") params.set("certification", filters.certification);
  if (filters.validFrom) params.set("validFrom", filters.validFrom);
  if (filters.validUntil) params.set("validUntil", filters.validUntil);
  if (includePage && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function hasActiveSupplierFilters(filters: SupplierFilters) {
  return Boolean(
    filters.query
    || filters.status !== "ALL"
    || filters.classification !== "ALL"
    || filters.certification !== "ALL"
    || filters.validFrom
    || filters.validUntil,
  );
}

export async function getSupplierList(db: DatabaseExecutor, filters: SupplierFilters, referenceDate = new Date()) {
  const total = await countSupplierRows(db, filters, referenceDate);
  const pageCount = Math.ceil(total / SUPPLIER_PAGE_SIZE);
  const page = total ? Math.min(filters.page, pageCount) : 1;
  const rows = await loadSupplierRows(db, filters, referenceDate, { offset: (page - 1) * SUPPLIER_PAGE_SIZE, limit: SUPPLIER_PAGE_SIZE });
  return { suppliers: rows.map(supplierItem), total, page, pageCount };
}

export async function getSupplierReportRows(db: DatabaseExecutor, filters: SupplierFilters, referenceDate = new Date()) {
  const rows = await loadSupplierRows(db, filters, referenceDate);
  return rows.map(supplierItem);
}
