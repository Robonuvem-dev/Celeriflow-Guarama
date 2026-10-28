"use server";
import { revalidatePath } from "next/cache";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { getPostgresError, PersistenceError } from "@/db/errors";
import * as master from "@/db/repositories/registry/master-data-operations";
import { assertCanInactivate } from "@/db/repositories/registry/master-data-guards";
import { runMasterDataConsistency } from "@/db/repositories/registry/consistency";
import { validateCep, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  assertExclusiveCanonicalIdentity,
  MasterDataValidationError,
  normalizeEffectivePeriod,
  normalizeMasterDataCode,
} from "@/lib/cadastros/master-data-service";
import type { MasterDataActionResult, MasterDataCatalog, MasterDataValue } from "./master-data-types";

const paths: Record<MasterDataCatalog, string> = {
  families: "/app-domain/cadastros/familias",
  entities: "/app-domain/cadastros/entidades",
  costCenters: "/app-domain/cadastros/centros-custo",
  cities: "/app-domain/cadastros/localidades",
  neighborhoods: "/app-domain/cadastros/localidades",
  streets: "/app-domain/cadastros/localidades",
  banks: "/app-domain/cadastros/bancos-agencias",
  branches: "/app-domain/cadastros/bancos-agencias",
  taxes: "/app-domain/cadastros/tributos",
  currencies: "/app-domain/cadastros/moedas",
  products: "/app-domain/cadastros/produtos",
  cbos: "/app-domain/cadastros/cbo",
  signers: "/app-domain/cadastros/assinantes-legais",
  legalTexts: "/app-domain/cadastros/textos-juridicos",
};

const entityTypes = ["PREFEITURA", "CAMARA", "AUTARQUIA", "FUNDACAO", "CONSORCIO"] as const;
const productKinds = ["MATERIAL", "SERVICO", "PATRIMONIO"] as const;
const reportTypes = ["BALANCO", "RREO", "RGF", "PRESTACAO_CONTAS", "RELATORIO_GESTAO"] as const;

function text(values: Record<string, MasterDataValue>, key: string, required = false) {
  const value = typeof values[key] === "string" ? values[key].trim() : "";
  if (required && !value) throw new MasterDataValidationError(`${key} é obrigatório.`);
  return value;
}

function optional(values: Record<string, MasterDataValue>, key: string) {
  return text(values, key) || null;
}

function dateOrNull(values: Record<string, MasterDataValue>, key: string) {
  const value = optional(values, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MasterDataValidationError(`Data inválida em ${key}.`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new MasterDataValidationError(`Data inválida em ${key}.`);
  return date;
}

function allowed<const T extends readonly string[]>(values: Record<string, MasterDataValue>, key: string, choices: T, required = true): T[number] | null {
  const value = optional(values, key);
  if (!value && !required) return null;
  if (!value || !choices.includes(value as T[number])) throw new MasterDataValidationError(`Valor inválido em ${key}.`);
  return value as T[number];
}

function normalizedOptionalCode(values: Record<string, MasterDataValue>, key: string, options: { digitsOnly?: boolean; length?: number } = {}) {
  const value = optional(values, key);
  return value ? normalizeMasterDataCode(value, options) : null;
}

function cnpjOrNull(values: Record<string, MasterDataValue>, key: string) {
  const value = optional(values, key);
  if (!value) return null;
  const result = validateCnpj(value);
  if (!result.valid) throw new MasterDataValidationError("CNPJ inválido.");
  return result.normalized;
}

function cepOrNull(values: Record<string, MasterDataValue>, key: string) {
  const value = optional(values, key);
  if (!value) return null;
  const result = validateCep(value);
  if (!result.valid) throw new MasterDataValidationError("CEP inválido.");
  return result.normalized;
}

function resultError(error: unknown): MasterDataActionResult {
  console.error("[cadastros/master-data]", error);
  if (error instanceof MasterDataValidationError) return { error: error.message };
  if (error instanceof AccessError) return { error: error.status === 401 ? "Sua sessão expirou. Entre novamente." : "Você não possui permissão para esta operação." };
  if (getPostgresError(error)?.code === "23505") return { error: "Já existe um registro com esta identidade." };
  if (error instanceof PersistenceError && error.kind === "not-found") return { error: "O registro não foi encontrado." };
  if (["23503", "23001"].includes(getPostgresError(error)?.code ?? "")) return { error: "A operação conflita com registros vinculados." };
  return { error: "Não foi possível concluir a operação." };
}

async function audit(tx: DatabaseTransaction, userId: string, targetType: string, targetId: string) {
  await insertAuditEvent(tx, { actorUsuarioId: userId, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
}

function assertActiveReference(record: { id: string } | null, label: string) {
  if (!record) throw new MasterDataValidationError(`${label} não existe ou está inativo.`);
}

export async function mutateMasterDataRecord(catalog: MasterDataCatalog, id: string | null, values: Record<string, MasterDataValue>): Promise<MasterDataActionResult> {
  try {
    if (!Object.hasOwn(paths, catalog)) throw new MasterDataValidationError("Catálogo inválido.");
    const operation = id ? "update" : "create";
    const context = await getTenantContextForModuleOperation("CADASTROS", operation);
    await withDatabaseTransaction(databaseConnection, async tx => {
      let targetId = id || "";
      let targetType = catalog.toUpperCase();

      if (catalog === "families") {
        const code = optional(values, "code");
        const responsiblePersonId = optional(values, "responsiblePersonId");
        const submittedMembers = Array.isArray(values.memberIds) ? values.memberIds.filter(Boolean) : [];
        const memberIds = [...new Set(responsiblePersonId ? [responsiblePersonId, ...submittedMembers] : submittedMembers)];
        if (memberIds.length) {
          const count = await master.countActivePeople(tx, memberIds);
          if (count !== memberIds.length) throw new MasterDataValidationError("Uma das pessoas selecionadas não existe ou está inativa.");
        }
        targetId = await master.saveFamily(tx, id, { code, responsiblePersonId, status: id ? allowed(values, "status", ["ATIVA", "INATIVA"] as const)! : allowed(values, "status", ["ATIVA", "INATIVA"] as const, false) || "ATIVA" }, memberIds);
        targetType = "FAMILY";
      } else if (catalog === "entities") {
        const parentId = optional(values, "parentId");
        await master.assertHierarchy(tx, "entity", id, parentId);
        const companyId = optional(values, "companyId");
        const company = companyId ? await master.findActiveCompany(tx, companyId) : null;
        if (companyId) assertActiveReference(company, "Pessoa jurídica");
        const submittedCnpj = cnpjOrNull(values, "cnpj");
        const companyCnpjValidation = company?.cnpj ? validateCnpj(company.cnpj) : null;
        const companyCnpj = companyCnpjValidation?.valid ? companyCnpjValidation.normalized : null;
        if (submittedCnpj && companyCnpj && submittedCnpj !== companyCnpj) throw new MasterDataValidationError("O CNPJ deve corresponder à pessoa jurídica vinculada.");
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { length: 30 }), name: text(values, "name", true), type: allowed(values, "type", entityTypes)!, cnpj: submittedCnpj || companyCnpj, companyId, parentId };
        targetId = await master.saveGovernmentEntity(tx, id, data); targetType = "GOVERNMENT_ENTITY";
      } else if (catalog === "costCenters") {
        const parentId = optional(values, "parentId");
        await master.assertHierarchy(tx, "costCenter", id, parentId);
        const governmentEntityId = optional(values, "governmentEntityId");
        const secretariatId = optional(values, "secretariatId");
        const departmentId = optional(values, "departmentId");
        const administrativeUnitId = optional(values, "administrativeUnitId");
        if (governmentEntityId) assertActiveReference(await master.findActiveReference(tx, "entity", governmentEntityId), "Entidade");
        if (secretariatId) assertActiveReference(await master.findActiveReference(tx, "secretariat", secretariatId), "Secretaria");
        const department = departmentId ? await master.findActiveDepartment(tx, departmentId) : null;
        const unit = administrativeUnitId ? await master.findActiveUnit(tx, administrativeUnitId) : null;
        if (departmentId) assertActiveReference(department, "Departamento");
        if (administrativeUnitId) assertActiveReference(unit, "Unidade administrativa");
        const hierarchySecretariatId = secretariatId || department?.secretariatId || unit?.secretariatId || null;
        if ((department && department.secretariatId !== hierarchySecretariatId) || (unit && unit.secretariatId !== hierarchySecretariatId)) throw new MasterDataValidationError("Secretaria, departamento e unidade devem pertencer à mesma estrutura.");
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { length: 30 }), name: text(values, "name", true), description: optional(values, "description"), parentId, governmentEntityId, secretariatId: hierarchySecretariatId, departmentId, administrativeUnitId };
        targetId = await master.saveCostCenter(tx, id, data); targetType = "COST_CENTER";
      } else if (catalog === "cities") {
        const stateId = text(values, "stateId", true);
        await assertActiveReference(await master.findActiveReference(tx, "state", stateId), "Estado");
        const data = { stateId, ibgeCode: normalizeMasterDataCode(text(values, "ibgeCode", true), { digitsOnly: true, length: 7 }), name: text(values, "name", true) };
        targetId = await master.saveCity(tx, id, data); targetType = "CITY";
      } else if (catalog === "neighborhoods") {
        const cityId = optional(values, "cityId");
        const city = cityId ? await master.findActiveCity(tx, cityId) : null;
        if (cityId) assertActiveReference(city, "Cidade");
        if (!id && !city) throw new MasterDataValidationError("Cidade é obrigatória para novos bairros.");
        const data = { name: text(values, "name", true), type: text(values, "type", true), ...(city ? { cityId: city.id, city: city.name, state: city.state.uf } : {}), adminRegion: optional(values, "adminRegion"), notes: optional(values, "notes") };
        targetId = await master.saveNeighborhood(tx, id, data); targetType = "NEIGHBORHOOD";
      } else if (catalog === "streets") {
        const cityId = optional(values, "cityId"); const neighborhoodId = optional(values, "neighborhoodId");
        const city = cityId ? await master.findActiveCity(tx, cityId) : null;
        if (cityId) assertActiveReference(city, "Cidade");
        if (!id && !city) throw new MasterDataValidationError("Cidade é obrigatória para novos logradouros.");
        if (neighborhoodId) {
          if (!cityId) throw new MasterDataValidationError("Selecione a cidade do bairro informado.");
          assertActiveReference(await master.findActiveCityNeighborhood(tx, neighborhoodId, cityId), "Bairro da cidade selecionada");
        }
        const data = { name: text(values, "name", true), type: text(values, "type", true), zipCode: cepOrNull(values, "zipCode"), ...(city ? { cityId: city.id, city: city.name, state: city.state.uf } : {}), neighborhoodId };
        targetId = await master.saveStreet(tx, id, data); targetType = "STREET";
      } else if (catalog === "banks") {
        const data = { compe: normalizeMasterDataCode(text(values, "compe", true), { digitsOnly: true, length: 3 }), ispb: normalizeMasterDataCode(text(values, "ispb", true), { digitsOnly: true, length: 8 }), name: text(values, "name", true), shortName: text(values, "shortName", true) };
        targetId = await master.saveBank(tx, id, data); targetType = "BANK";
      } else if (catalog === "branches") {
        const bankId = text(values, "bankId", true); const cityId = optional(values, "cityId");
        await assertActiveReference(await master.findActiveReference(tx, "bank", bankId), "Banco");
        if (cityId) await assertActiveReference(await master.findActiveCity(tx, cityId), "Cidade");
        const data = { bankId, code: normalizeMasterDataCode(text(values, "code", true), { digitsOnly: true, length: 6 }), name: text(values, "name", true), cnpj: cnpjOrNull(values, "cnpj"), cityId };
        targetId = await master.saveBankBranch(tx, id, data); targetType = "BANK_BRANCH";
      } else if (catalog === "taxes") {
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); const effectiveUntil = dateOrNull(values, "effectiveUntil");
        if (effectiveFrom) normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const data = { code: normalizedOptionalCode(values, "code", { length: 30 }), name: text(values, "name", true), taxType: text(values, "taxType", true), governmentLevel: optional(values, "governmentLevel"), revenueNature: optional(values, "revenueNature"), effectiveFrom, effectiveUntil, description: optional(values, "description") };
        targetId = await master.saveTax(tx, id, data); targetType = "TAX";
      } else if (catalog === "currencies") {
        const isDefault = values.isDefault === true;
        const data = { isoCode: normalizeMasterDataCode(text(values, "isoCode", true), { length: 3 }), name: text(values, "name", true), symbol: text(values, "symbol", true), decimalPlaces: Number(text(values, "decimalPlaces") || "2"), isDefault };
        if (!Number.isInteger(data.decimalPlaces) || data.decimalPlaces < 0 || data.decimalPlaces > 6) throw new MasterDataValidationError("Casas decimais deve ser um número entre 0 e 6.");
        targetId = await master.saveCurrency(tx, id, data); targetType = "CURRENCY";
      } else if (catalog === "products") {
        const data = { code: normalizedOptionalCode(values, "code", { length: 40 }), name: text(values, "name", true), description: optional(values, "description"), unit: text(values, "unit") || "UN", category: optional(values, "category"), productKind: allowed(values, "productKind", productKinds, false) || "MATERIAL", specification: optional(values, "specification"), externalCode: optional(values, "externalCode") };
        targetId = await master.saveCatalogItem(tx, id, data); targetType = "CATALOG_ITEM";
      } else if (catalog === "cbos") {
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { digitsOnly: true, length: 6 }), description: text(values, "description", true) };
        targetId = await master.saveHealthCbo(tx, id, data); targetType = "HEALTH_CBO";
      } else if (catalog === "signers") {
        const identity = assertExclusiveCanonicalIdentity({ personId: optional(values, "personId"), companyId: null }, { required: false });
        const employeeId = optional(values, "employeeId");
        if ((identity.personId ? 1 : 0) + (employeeId ? 1 : 0) !== 1) throw new MasterDataValidationError("Informe exclusivamente uma pessoa ou um servidor.");
        if (identity.personId) await assertActiveReference(await master.findActiveReference(tx, "person", identity.personId), "Pessoa");
        if (employeeId) await assertActiveReference(await master.findActiveReference(tx, "employee", employeeId), "Servidor");
        const governmentEntityId = optional(values, "governmentEntityId");
        if (governmentEntityId) await assertActiveReference(await master.findActiveReference(tx, "entity", governmentEntityId), "Entidade");
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); if (!effectiveFrom) throw new MasterDataValidationError("A vigência inicial é obrigatória.");
        const effectiveUntil = dateOrNull(values, "effectiveUntil"); normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const selectedReportTypes = Array.isArray(values.reportTypes) ? [...new Set(values.reportTypes.map(value => normalizeMasterDataCode(value)))] : [];
        if (!selectedReportTypes.length || selectedReportTypes.some(value => !reportTypes.includes(value as typeof reportTypes[number]))) throw new MasterDataValidationError("Selecione tipos de relatório válidos.");
        const signatureOrder = Number(text(values, "signatureOrder") || "1");
        if (!Number.isInteger(signatureOrder) || signatureOrder < 1) throw new MasterDataValidationError("A ordem de assinatura deve ser um inteiro positivo.");
        const data = { personId: identity.personId, employeeId, governmentEntityId, signingRole: text(values, "signingRole", true), reportTypes: selectedReportTypes, signatureOrder, effectiveFrom, effectiveUntil };
        targetId = await master.saveLegalReportSigner(tx, id, data); targetType = "LEGAL_REPORT_SIGNER";
      } else if (catalog === "legalTexts") {
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); const effectiveUntil = dateOrNull(values, "effectiveUntil");
        if (effectiveFrom) normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const governmentEntityId = optional(values, "governmentEntityId");
        if (governmentEntityId) await assertActiveReference(await master.findActiveReference(tx, "entity", governmentEntityId), "Entidade");
        const content = text(values, "content", true);
        const data = { type: text(values, "type", true), number: text(values, "number", true), summary: text(values, "summary", true), governmentLevel: text(values, "governmentLevel", true), issuingBody: text(values, "issuingBody", true), publicationDate: dateOrNull(values, "publicationDate"), effectiveFrom, effectiveUntil, governmentEntityId };
        targetId = await master.saveLegalText(tx, id, data, content);
        targetType = "LEGAL_TEXT";
      }
      await audit(tx, context.user.id, targetType, targetId);
    });
    revalidatePath(paths[catalog]);
    revalidatePath("/app-domain/cadastros");
    return {};
  } catch (error) {
    return resultError(error);
  }
}

export async function setMasterDataRecordActive(catalog: MasterDataCatalog, id: string, active: boolean): Promise<MasterDataActionResult> {
  try {
    if (!Object.hasOwn(paths, catalog)) throw new MasterDataValidationError("Catálogo inválido.");
    const context = await getTenantContextForModuleOperation("CADASTROS", "update");
    await withDatabaseTransaction(databaseConnection, async tx => {
      if (!active) await assertCanInactivate(tx, catalog, id);
      await master.setMasterDataActive(tx, catalog, id, active);
      await audit(tx, context.user.id, catalog.toUpperCase(), id);
    });
    revalidatePath(paths[catalog]);
    revalidatePath("/app-domain/cadastros");
    return {};
  } catch (error) {
    return resultError(error);
  }
}

export async function runMasterDataConsistencyCheck(): Promise<MasterDataActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("CADASTROS", "create");
    await withDatabaseTransaction(databaseConnection, async tx => {
      const runId = await runMasterDataConsistency(tx);
      await audit(tx, context.user.id, "MASTER_DATA_CONSISTENCY_RUN", runId);
    }, { timeoutMs: 30000 });
    revalidatePath("/app-domain/cadastros/qualidade");
    revalidatePath("/app-domain/cadastros");
    return {};
  } catch (error) {
    return resultError(error);
  }
}
