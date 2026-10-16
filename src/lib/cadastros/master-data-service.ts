export class MasterDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataValidationError";
  }
}

export type CodeNormalizationOptions = {
  digitsOnly?: boolean;
  length?: number;
};

export function normalizeMasterDataCode(value: string, options: CodeNormalizationOptions = {}) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(options.digitsOnly ? /\D/g : /[^A-Z0-9]/g, "");

  if (!normalized) throw new MasterDataValidationError("O codigo e obrigatorio.");
  if (options.length && normalized.length > options.length) {
    throw new MasterDataValidationError(`O codigo deve ter no maximo ${options.length} caracteres.`);
  }

  return options.digitsOnly && options.length ? normalized.padStart(options.length, "0") : normalized;
}

function normalizeDate(value: Date | string, field: string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new MasterDataValidationError(`${field} invalida.`);
  return date;
}

export function normalizeEffectivePeriod(input: {
  effectiveFrom: Date | string;
  effectiveUntil?: Date | string | null;
}) {
  const effectiveFrom = normalizeDate(input.effectiveFrom, "Data inicial");
  const effectiveUntil = input.effectiveUntil == null ? null : normalizeDate(input.effectiveUntil, "Data final");

  if (effectiveUntil && effectiveUntil < effectiveFrom) {
    throw new MasterDataValidationError("A data final nao pode ser anterior a data inicial.");
  }

  return { effectiveFrom, effectiveUntil };
}

export function assertExclusiveCanonicalIdentity(
  input: { personId?: string | null; companyId?: string | null },
  options: { required?: boolean } = { required: true },
) {
  const personId = input.personId?.trim() || null;
  const companyId = input.companyId?.trim() || null;

  if (personId && companyId) {
    throw new MasterDataValidationError("Informe identidade PF ou PJ, nunca ambas.");
  }
  if ((options.required ?? true) && !personId && !companyId) {
    throw new MasterDataValidationError("Informe uma identidade PF ou PJ.");
  }

  return { personId, companyId };
}

export function assertNoSelfReference(recordId: string, parentId?: string | null) {
  const normalizedRecordId = recordId.trim();
  const normalizedParentId = parentId?.trim() || null;

  if (!normalizedRecordId) throw new MasterDataValidationError("O identificador do registro e obrigatorio.");
  if (normalizedParentId === normalizedRecordId) {
    throw new MasterDataValidationError("Um registro nao pode ser pai de si mesmo.");
  }

  return { recordId: normalizedRecordId, parentId: normalizedParentId };
}

export type LegalReportSignerCandidate = {
  id: string;
  personId?: string | null;
  employeeId?: string | null;
  reportTypes: readonly string[];
  signatureOrder: number;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  status: string;
};

export function selectLegalReportSigners<T extends LegalReportSignerCandidate>(
  candidates: readonly T[],
  reportType: string,
  effectiveAt: Date = new Date(),
) {
  const normalizedReportType = normalizeMasterDataCode(reportType);
  const referenceDate = normalizeDate(effectiveAt, "Data de referencia");

  return candidates
    .filter((candidate) => {
      if (!candidate.personId && !candidate.employeeId) return false;
      if (normalizeMasterDataCode(candidate.status) !== "ATIVO") return false;
      if (candidate.effectiveFrom > referenceDate) return false;
      if (candidate.effectiveUntil && candidate.effectiveUntil < referenceDate) return false;
      return candidate.reportTypes.some((type) => normalizeMasterDataCode(type) === normalizedReportType);
    })
    .sort((left, right) => left.signatureOrder - right.signatureOrder || left.id.localeCompare(right.id));
}
