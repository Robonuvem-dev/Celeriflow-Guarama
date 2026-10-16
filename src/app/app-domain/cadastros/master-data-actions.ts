"use server";
import { readCanonicalIdentityIssues } from "@/lib/cadastros/identity-integrity";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { validateCep, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  assertExclusiveCanonicalIdentity,
  assertNoSelfReference,
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
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "Já existe um registro com esta identidade." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { error: "O registro não foi encontrado." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { error: "A operação conflita com registros vinculados." };
  return { error: "Não foi possível concluir a operação." };
}

async function audit(tx: Prisma.TransactionClient, userId: string, targetType: string, targetId: string) {
  await writeAuditEvent(tx, { actorUsuarioId: userId, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
}

function assertActiveReference(record: { id: string } | null, label: string) {
  if (!record) throw new MasterDataValidationError(`${label} não existe ou está inativo.`);
}

async function assertHierarchy(prisma: Prisma.TransactionClient, catalog: "entity" | "costCenter", id: string | null, parentId: string | null) {
  if (!parentId) return;
  if (id) assertNoSelfReference(id, parentId);
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === id) throw new MasterDataValidationError("A hierarquia informada contém um ciclo.");
    const parent: { parentId: string | null } | null = catalog === "entity"
      ? await prisma.governmentEntity.findFirst({ where: { id: cursor, status: "ATIVA" }, select: { parentId: true } })
      : await prisma.costCenter.findFirst({ where: { id: cursor, isActive: true }, select: { parentId: true } });
    if (!parent) throw new MasterDataValidationError("O registro pai não existe ou está inativo.");
    cursor = parent.parentId;
  }
}

async function assertCanInactivate(prisma: Prisma.TransactionClient, catalog: MasterDataCatalog, id: string) {
  let activeDependents = 0;
  if (catalog === "families") {
    const family = await prisma.family.findUnique({ where: { id }, select: { socialProfile: { select: { status: true } }, healthProfile: { select: { isActive: true } } } });
    activeDependents = Number(family?.socialProfile?.status === "Ativo") + Number(family?.healthProfile?.isActive === true);
  } else if (catalog === "entities") {
    const counts = await Promise.all([
      prisma.governmentEntity.count({ where: { parentId: id, status: "ATIVA" } }),
      prisma.costCenter.count({ where: { governmentEntityId: id, isActive: true } }),
      prisma.legalText.count({ where: { governmentEntityId: id, status: "VIGENTE" } }),
      prisma.legalReportSigner.count({ where: { governmentEntityId: id, status: "ATIVO" } }),
    ]);
    activeDependents = counts.reduce((sum, count) => sum + count, 0);
  } else if (catalog === "costCenters") {
    const counts = await Promise.all([
      prisma.costCenter.count({ where: { parentId: id, isActive: true } }),
      prisma.warehouse.count({ where: { costCenterId: id, isActive: true } }),
    ]);
    activeDependents = counts[0] + counts[1];
  } else if (catalog === "cities") {
    const counts = await Promise.all([
      prisma.neighborhood.count({ where: { cityId: id, status: "Ativo" } }),
      prisma.street.count({ where: { cityId: id, status: "Ativo" } }),
      prisma.bankBranch.count({ where: { cityId: id, status: "ATIVA" } }),
      prisma.warehouse.count({ where: { cityId: id, isActive: true } }),
    ]);
    activeDependents = counts.reduce((sum, count) => sum + count, 0);
  } else if (catalog === "neighborhoods") {
    const counts = await Promise.all([
      prisma.street.count({ where: { neighborhoodId: id, status: "Ativo" } }),
      prisma.warehouse.count({ where: { neighborhoodId: id, isActive: true } }),
    ]);
    activeDependents = counts[0] + counts[1];
  } else if (catalog === "banks") {
    const counts = await Promise.all([
      prisma.bankBranch.count({ where: { bankId: id, status: "ATIVA" } }),
      prisma.bankAccount.count({ where: { bankId: id, isActive: true } }),
    ]);
    activeDependents = counts[0] + counts[1];
  } else if (catalog === "branches") {
    activeDependents = await prisma.bankAccount.count({ where: { bankBranchId: id, isActive: true } });
  } else if (catalog === "currencies") {
    activeDependents = await prisma.currency.count({ where: { id, isDefault: true } });
  } else if (catalog === "products") {
    activeDependents = await prisma.material.count({ where: { catalogItemId: id, isActive: true } });
  } else if (catalog === "cbos") {
    activeDependents = await prisma.healthProfessional.count({ where: { cboId: id, isActive: true } });
  }
  if (activeDependents > 0) throw new MasterDataValidationError(`Não é possível inativar: existem ${activeDependents} vínculo(s) ativo(s).`);
}

export async function mutateMasterDataRecord(catalog: MasterDataCatalog, id: string | null, values: Record<string, MasterDataValue>): Promise<MasterDataActionResult> {
  try {
    if (!Object.hasOwn(paths, catalog)) throw new MasterDataValidationError("Catálogo inválido.");
    const operation = id ? "update" : "create";
    const context = await getTenantContextForModuleOperation("CADASTROS", operation);
    await context.prisma.$transaction(async tx => {
      let targetId = id || "";
      let targetType = catalog.toUpperCase();

      if (catalog === "families") {
        const code = optional(values, "code");
        const responsiblePersonId = optional(values, "responsiblePersonId");
        const submittedMembers = Array.isArray(values.memberIds) ? values.memberIds.filter(Boolean) : [];
        const memberIds = [...new Set(responsiblePersonId ? [responsiblePersonId, ...submittedMembers] : submittedMembers)];
        if (memberIds.length) {
          const count = await tx.person.count({ where: { id: { in: memberIds }, status: { not: "Inativo" } } });
          if (count !== memberIds.length) throw new MasterDataValidationError("Uma das pessoas selecionadas não existe ou está inativa.");
        }
        const family = id
          ? await tx.family.update({ where: { id }, data: { code, responsiblePersonId, status: allowed(values, "status", ["ATIVA", "INATIVA"] as const)! } })
          : await tx.family.create({ data: { code, responsiblePersonId, status: allowed(values, "status", ["ATIVA", "INATIVA"] as const, false) || "ATIVA" } });
        for (const personId of memberIds) {
          await tx.familyMember.upsert({ where: { familyId_personId: { familyId: family.id, personId } }, update: { status: "ATIVO", leftAt: null, isRepresentative: personId === responsiblePersonId }, create: { familyId: family.id, personId, status: "ATIVO", isRepresentative: personId === responsiblePersonId } });
        }
        await tx.familyMember.updateMany({ where: { familyId: family.id, personId: { notIn: memberIds }, status: "ATIVO" }, data: { status: "INATIVO", leftAt: new Date(), isRepresentative: false } });
        targetId = family.id; targetType = "FAMILY";
      } else if (catalog === "entities") {
        const parentId = optional(values, "parentId");
        await assertHierarchy(tx, "entity", id, parentId);
        const companyId = optional(values, "companyId");
        const company = companyId ? await tx.company.findFirst({ where: { id: companyId, status: "Ativo" }, select: { id: true, cnpj: true } }) : null;
        if (companyId) assertActiveReference(company, "Pessoa jurídica");
        const submittedCnpj = cnpjOrNull(values, "cnpj");
        const companyCnpjValidation = company?.cnpj ? validateCnpj(company.cnpj) : null;
        const companyCnpj = companyCnpjValidation?.valid ? companyCnpjValidation.normalized : null;
        if (submittedCnpj && companyCnpj && submittedCnpj !== companyCnpj) throw new MasterDataValidationError("O CNPJ deve corresponder à pessoa jurídica vinculada.");
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { length: 30 }), name: text(values, "name", true), type: allowed(values, "type", entityTypes)!, cnpj: submittedCnpj || companyCnpj, companyId, parentId };
        const record = id ? await tx.governmentEntity.update({ where: { id }, data }) : await tx.governmentEntity.create({ data });
        targetId = record.id; targetType = "GOVERNMENT_ENTITY";
      } else if (catalog === "costCenters") {
        const parentId = optional(values, "parentId");
        await assertHierarchy(tx, "costCenter", id, parentId);
        const governmentEntityId = optional(values, "governmentEntityId");
        const secretariatId = optional(values, "secretariatId");
        const departmentId = optional(values, "departmentId");
        const administrativeUnitId = optional(values, "administrativeUnitId");
        if (governmentEntityId) assertActiveReference(await tx.governmentEntity.findFirst({ where: { id: governmentEntityId, status: "ATIVA" }, select: { id: true } }), "Entidade");
        if (secretariatId) assertActiveReference(await tx.secretariat.findFirst({ where: { id: secretariatId, isActive: true }, select: { id: true } }), "Secretaria");
        const department = departmentId ? await tx.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, secretariatId: true } }) : null;
        const unit = administrativeUnitId ? await tx.administrativeUnit.findFirst({ where: { id: administrativeUnitId, isActive: true }, select: { id: true, secretariatId: true } }) : null;
        if (departmentId) assertActiveReference(department, "Departamento");
        if (administrativeUnitId) assertActiveReference(unit, "Unidade administrativa");
        const hierarchySecretariatId = secretariatId || department?.secretariatId || unit?.secretariatId || null;
        if ((department && department.secretariatId !== hierarchySecretariatId) || (unit && unit.secretariatId !== hierarchySecretariatId)) throw new MasterDataValidationError("Secretaria, departamento e unidade devem pertencer à mesma estrutura.");
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { length: 30 }), name: text(values, "name", true), description: optional(values, "description"), parentId, governmentEntityId, secretariatId: hierarchySecretariatId, departmentId, administrativeUnitId };
        const record = id ? await tx.costCenter.update({ where: { id }, data }) : await tx.costCenter.create({ data });
        targetId = record.id; targetType = "COST_CENTER";
      } else if (catalog === "cities") {
        const stateId = text(values, "stateId", true);
        await assertActiveReference(await tx.state.findFirst({ where: { id: stateId, status: "ATIVO" }, select: { id: true } }), "Estado");
        const data = { stateId, ibgeCode: normalizeMasterDataCode(text(values, "ibgeCode", true), { digitsOnly: true, length: 7 }), name: text(values, "name", true) };
        const record = id ? await tx.city.update({ where: { id }, data }) : await tx.city.create({ data }); targetId = record.id; targetType = "CITY";
      } else if (catalog === "neighborhoods") {
        const cityId = optional(values, "cityId");
        const city = cityId ? await tx.city.findFirst({ where: { id: cityId, status: "ATIVA" }, include: { state: true } }) : null;
        if (cityId) assertActiveReference(city, "Cidade");
        if (!id && !city) throw new MasterDataValidationError("Cidade é obrigatória para novos bairros.");
        const data = { name: text(values, "name", true), type: text(values, "type", true), ...(city ? { cityId: city.id, city: city.name, state: city.state.uf } : {}), adminRegion: optional(values, "adminRegion"), notes: optional(values, "notes") };
        const record = id
          ? await tx.neighborhood.update({ where: { id }, data })
          : await tx.neighborhood.create({ data: { ...data, cityId: city!.id, city: city!.name, state: city!.state.uf } });
        targetId = record.id; targetType = "NEIGHBORHOOD";
      } else if (catalog === "streets") {
        const cityId = optional(values, "cityId"); const neighborhoodId = optional(values, "neighborhoodId");
        const city = cityId ? await tx.city.findFirst({ where: { id: cityId, status: "ATIVA" }, include: { state: true } }) : null;
        if (cityId) assertActiveReference(city, "Cidade");
        if (!id && !city) throw new MasterDataValidationError("Cidade é obrigatória para novos logradouros.");
        if (neighborhoodId) {
          if (!cityId) throw new MasterDataValidationError("Selecione a cidade do bairro informado.");
          assertActiveReference(await tx.neighborhood.findFirst({ where: { id: neighborhoodId, cityId, status: "Ativo" }, select: { id: true } }), "Bairro da cidade selecionada");
        }
        const data = { name: text(values, "name", true), type: text(values, "type", true), zipCode: cepOrNull(values, "zipCode"), ...(city ? { cityId: city.id, city: city.name, state: city.state.uf } : {}), neighborhoodId };
        const record = id
          ? await tx.street.update({ where: { id }, data })
          : await tx.street.create({ data: { ...data, cityId: city!.id, city: city!.name, state: city!.state.uf } });
        targetId = record.id; targetType = "STREET";
      } else if (catalog === "banks") {
        const data = { compe: normalizeMasterDataCode(text(values, "compe", true), { digitsOnly: true, length: 3 }), ispb: normalizeMasterDataCode(text(values, "ispb", true), { digitsOnly: true, length: 8 }), name: text(values, "name", true), shortName: text(values, "shortName", true) };
        const record = id ? await tx.bank.update({ where: { id }, data }) : await tx.bank.create({ data }); targetId = record.id; targetType = "BANK";
      } else if (catalog === "branches") {
        const bankId = text(values, "bankId", true); const cityId = optional(values, "cityId");
        await assertActiveReference(await tx.bank.findFirst({ where: { id: bankId, status: "ATIVO" }, select: { id: true } }), "Banco");
        if (cityId) await assertActiveReference(await tx.city.findFirst({ where: { id: cityId, status: "ATIVA" }, select: { id: true } }), "Cidade");
        const data = { bankId, code: normalizeMasterDataCode(text(values, "code", true), { digitsOnly: true, length: 6 }), name: text(values, "name", true), cnpj: cnpjOrNull(values, "cnpj"), cityId };
        const record = id ? await tx.bankBranch.update({ where: { id }, data }) : await tx.bankBranch.create({ data }); targetId = record.id; targetType = "BANK_BRANCH";
      } else if (catalog === "taxes") {
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); const effectiveUntil = dateOrNull(values, "effectiveUntil");
        if (effectiveFrom) normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const data = { code: normalizedOptionalCode(values, "code", { length: 30 }), name: text(values, "name", true), taxType: text(values, "taxType", true), governmentLevel: optional(values, "governmentLevel"), revenueNature: optional(values, "revenueNature"), effectiveFrom, effectiveUntil, description: optional(values, "description") };
        const record = id ? await tx.tax.update({ where: { id }, data }) : await tx.tax.create({ data }); targetId = record.id; targetType = "TAX";
      } else if (catalog === "currencies") {
        const isDefault = values.isDefault === true;
        const data = { isoCode: normalizeMasterDataCode(text(values, "isoCode", true), { length: 3 }), name: text(values, "name", true), symbol: text(values, "symbol", true), decimalPlaces: Number(text(values, "decimalPlaces") || "2"), isDefault };
        if (!Number.isInteger(data.decimalPlaces) || data.decimalPlaces < 0 || data.decimalPlaces > 6) throw new MasterDataValidationError("Casas decimais deve ser um número entre 0 e 6.");
        if (isDefault) await tx.currency.updateMany({ where: { isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
        const record = id ? await tx.currency.update({ where: { id }, data }) : await tx.currency.create({ data }); targetId = record.id; targetType = "CURRENCY";
      } else if (catalog === "products") {
        const data = { code: normalizedOptionalCode(values, "code", { length: 40 }), name: text(values, "name", true), description: optional(values, "description"), unit: text(values, "unit") || "UN", category: optional(values, "category"), productKind: allowed(values, "productKind", productKinds, false) || "MATERIAL", specification: optional(values, "specification"), externalCode: optional(values, "externalCode") };
        const record = id ? await tx.catalogItem.update({ where: { id }, data }) : await tx.catalogItem.create({ data }); targetId = record.id; targetType = "CATALOG_ITEM";
      } else if (catalog === "cbos") {
        const data = { code: normalizeMasterDataCode(text(values, "code", true), { digitsOnly: true, length: 6 }), description: text(values, "description", true) };
        const record = id ? await tx.healthCbo.update({ where: { id }, data }) : await tx.healthCbo.create({ data }); targetId = record.id; targetType = "HEALTH_CBO";
      } else if (catalog === "signers") {
        const identity = assertExclusiveCanonicalIdentity({ personId: optional(values, "personId"), companyId: null }, { required: false });
        const employeeId = optional(values, "employeeId");
        if ((identity.personId ? 1 : 0) + (employeeId ? 1 : 0) !== 1) throw new MasterDataValidationError("Informe exclusivamente uma pessoa ou um servidor.");
        if (identity.personId) await assertActiveReference(await tx.person.findFirst({ where: { id: identity.personId, status: { not: "Inativo" } }, select: { id: true } }), "Pessoa");
        if (employeeId) await assertActiveReference(await tx.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } }), "Servidor");
        const governmentEntityId = optional(values, "governmentEntityId");
        if (governmentEntityId) await assertActiveReference(await tx.governmentEntity.findFirst({ where: { id: governmentEntityId, status: "ATIVA" }, select: { id: true } }), "Entidade");
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); if (!effectiveFrom) throw new MasterDataValidationError("A vigência inicial é obrigatória.");
        const effectiveUntil = dateOrNull(values, "effectiveUntil"); normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const selectedReportTypes = Array.isArray(values.reportTypes) ? [...new Set(values.reportTypes.map(value => normalizeMasterDataCode(value)))] : [];
        if (!selectedReportTypes.length || selectedReportTypes.some(value => !reportTypes.includes(value as typeof reportTypes[number]))) throw new MasterDataValidationError("Selecione tipos de relatório válidos.");
        const signatureOrder = Number(text(values, "signatureOrder") || "1");
        if (!Number.isInteger(signatureOrder) || signatureOrder < 1) throw new MasterDataValidationError("A ordem de assinatura deve ser um inteiro positivo.");
        const data = { personId: identity.personId, employeeId, governmentEntityId, signingRole: text(values, "signingRole", true), reportTypes: selectedReportTypes, signatureOrder, effectiveFrom, effectiveUntil };
        const record = id ? await tx.legalReportSigner.update({ where: { id }, data }) : await tx.legalReportSigner.create({ data }); targetId = record.id; targetType = "LEGAL_REPORT_SIGNER";
      } else if (catalog === "legalTexts") {
        const effectiveFrom = dateOrNull(values, "effectiveFrom"); const effectiveUntil = dateOrNull(values, "effectiveUntil");
        if (effectiveFrom) normalizeEffectivePeriod({ effectiveFrom, effectiveUntil });
        const governmentEntityId = optional(values, "governmentEntityId");
        if (governmentEntityId) await assertActiveReference(await tx.governmentEntity.findFirst({ where: { id: governmentEntityId, status: "ATIVA" }, select: { id: true } }), "Entidade");
        const content = text(values, "content", true);
        const data = { type: text(values, "type", true), number: text(values, "number", true), summary: text(values, "summary", true), governmentLevel: text(values, "governmentLevel", true), issuingBody: text(values, "issuingBody", true), publicationDate: dateOrNull(values, "publicationDate"), effectiveFrom, effectiveUntil, governmentEntityId };
        if (id) {
          const current = await tx.legalText.findUnique({ where: { id }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } });
          if (!current) throw new MasterDataValidationError("Texto jurídico não encontrado.");
          await tx.legalText.update({ where: { id }, data });
          const latest = current.versions[0];
          const changed = !latest || latest.content !== content || latest.summary !== data.summary || latest.publicationDate?.getTime() !== data.publicationDate?.getTime() || latest.effectiveFrom?.getTime() !== effectiveFrom?.getTime() || latest.effectiveUntil?.getTime() !== effectiveUntil?.getTime();
          if (changed) await tx.legalTextVersion.create({ data: { legalTextId: id, versionNumber: (latest?.versionNumber || 0) + 1, content, summary: data.summary, publicationDate: data.publicationDate, effectiveFrom, effectiveUntil } });
          targetId = id;
        } else {
          const record = await tx.legalText.create({ data: { ...data, versions: { create: { versionNumber: 1, content, summary: data.summary, publicationDate: data.publicationDate, effectiveFrom, effectiveUntil } } } }); targetId = record.id;
        }
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
    await context.prisma.$transaction(async tx => {
      if (!active) await assertCanInactivate(tx, catalog, id);
      if (catalog === "families") await tx.family.update({ where: { id }, data: { status: active ? "ATIVA" : "INATIVA" } });
      else if (catalog === "entities") await tx.governmentEntity.update({ where: { id }, data: { status: active ? "ATIVA" : "INATIVA" } });
      else if (catalog === "costCenters") await tx.costCenter.update({ where: { id }, data: { isActive: active } });
      else if (catalog === "cities") await tx.city.update({ where: { id }, data: { status: active ? "ATIVA" : "INATIVA" } });
      else if (catalog === "neighborhoods") await tx.neighborhood.update({ where: { id }, data: { status: active ? "Ativo" : "Inativo" } });
      else if (catalog === "streets") await tx.street.update({ where: { id }, data: { status: active ? "Ativo" : "Inativo" } });
      else if (catalog === "banks") await tx.bank.update({ where: { id }, data: { status: active ? "ATIVO" : "INATIVO" } });
      else if (catalog === "branches") await tx.bankBranch.update({ where: { id }, data: { status: active ? "ATIVA" : "INATIVA" } });
      else if (catalog === "taxes") await tx.tax.update({ where: { id }, data: { isActive: active } });
      else if (catalog === "currencies") await tx.currency.update({ where: { id }, data: { status: active ? "ATIVA" : "INATIVA", ...(!active ? { isDefault: false } : {}) } });
      else if (catalog === "products") await tx.catalogItem.update({ where: { id }, data: { isActive: active } });
      else if (catalog === "cbos") await tx.healthCbo.update({ where: { id }, data: { isActive: active } });
      else if (catalog === "signers") await tx.legalReportSigner.update({ where: { id }, data: { status: active ? "ATIVO" : "INATIVO" } });
      else if (catalog === "legalTexts") await tx.legalText.update({ where: { id }, data: { status: active ? "VIGENTE" : "INATIVO" } });
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
    await context.prisma.$transaction(async tx => {
      const run = await tx.masterDataConsistencyRun.create({ data: { area: "CADASTROS", runType: "INTEGRIDADE_REFERENCIAL" } });
      const checks = await Promise.all([
        tx.employee.findMany({ where: { personId: null }, select: { id: true } }),
        tx.bankAccount.findMany({ where: { bankId: null }, select: { id: true } }),
        tx.neighborhood.findMany({ where: { cityId: null }, select: { id: true } }),
        tx.street.findMany({ where: { cityId: null }, select: { id: true } }),
        tx.healthProfessional.findMany({ where: { cbo: { not: null }, cboId: null }, select: { id: true } }),
        tx.socialFamily.findMany({ where: { masterFamilyId: null }, select: { id: true } }),
        tx.healthFamily.findMany({ where: { masterFamilyId: null }, select: { id: true } }),
        tx.material.findMany({ where: { catalogItemId: null }, select: { id: true } }),
      ]);
      const definitions = [
        ["EMPLOYEE_WITHOUT_PERSON", "Employee", "ALTA", "Servidor sem vínculo com pessoa mestre"],
        ["BANK_ACCOUNT_WITHOUT_MASTER", "BankAccount", "ALTA", "Conta bancária sem banco mestre"],
        ["NEIGHBORHOOD_WITHOUT_CITY", "Neighborhood", "MEDIA", "Bairro sem cidade mestre"],
        ["STREET_WITHOUT_CITY", "Street", "MEDIA", "Logradouro sem cidade mestre"],
        ["PROFESSIONAL_WITHOUT_CBO_MASTER", "HealthProfessional", "MEDIA", "Profissional com CBO textual sem vínculo ao catálogo"],
        ["SOCIAL_FAMILY_WITHOUT_MASTER", "SocialFamily", "ALTA", "Família setorial social sem família mestre"],
        ["HEALTH_FAMILY_WITHOUT_MASTER", "HealthFamily", "ALTA", "Família setorial de saúde sem família mestre"],
        ["MATERIAL_WITHOUT_CATALOG_ITEM", "Material", "MEDIA", "Material sem produto mestre"],
      ] as const;
      const issues = checks.flatMap((records, index) => records.map(record => ({ runId: run.id, area: "CADASTROS", issueType: definitions[index][0], recordType: definitions[index][1], recordId: record.id, severity: definitions[index][2], description: definitions[index][3] })));
      const identityIssues = (await readCanonicalIdentityIssues(tx)).map(issue => ({ ...issue, runId: run.id, area: "CADASTROS" }));
      if (issues.length || identityIssues.length) await tx.masterDataConsistencyIssue.createMany({ data: [...issues, ...identityIssues] });
      await tx.masterDataConsistencyRun.update({ where: { id: run.id }, data: { status: "CONCLUIDA", completedAt: new Date() } });
      await audit(tx, context.user.id, "MASTER_DATA_CONSISTENCY_RUN", run.id);
    }, { timeout: 30000 });
    revalidatePath("/app-domain/cadastros/qualidade");
    revalidatePath("/app-domain/cadastros");
    return {};
  } catch (error) {
    return resultError(error);
  }
}
