import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { SupplierFilters, SupplierSourceRow } from "@/lib/contracts/supplier";
import { dateOnly } from "@/app/app-domain/cadastros/fornecedores/supplier-utils";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { companies, documents, suppliers, taxpayers } from "../../schema/registry";
import { procurementLegalRepresentatives } from "../../schema/procurement-instruments";
import { biddings, biddingParticipants } from "../../schema/procurement-core";

function endOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function buildSupplierWhere(filters: SupplierFilters, referenceDate = new Date()): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (filters.query) {
    const query = filters.query;
    const identifier = query.replace(/\D/g, "");
    const search: (SQL | undefined)[] = [ilike(people.fullName, `%${query}%`), ilike(companies.corporateName, `%${query}%`), ilike(companies.tradeName, `%${query}%`), ilike(companies.companyType, `%${query}%`)];
    if (identifier) search.push(like(people.cpf, `%${identifier}%`), like(companies.cnpj, `%${identifier}%`));
    const exactStatus = ["Ativo", "Inativo", "Suspenso"].find(status => status.toLocaleLowerCase("pt-BR") === query.toLocaleLowerCase("pt-BR"));
    search.push(exactStatus ? eq(suppliers.status, exactStatus) : ilike(suppliers.status, `%${query}%`));
    if (query.replace(/\s/g, "").toUpperCase() === "ME/EPP") search.push(inArray(companies.companyType, ["ME", "EPP"]));
    conditions.push(or(...search));
  }
  if (filters.document) {
    const docClean = filters.document.replace(/\D/g, "");
    if (docClean) {
      conditions.push(or(like(people.cpf, `%${docClean}%`), like(companies.cnpj, `%${docClean}%`)));
    } else {
      conditions.push(or(ilike(people.cpf, `%${filters.document}%`), ilike(companies.cnpj, `%${filters.document}%`)));
    }
  }
  if (filters.personType === "PF") {
    conditions.push(isNotNull(suppliers.personId));
  } else if (filters.personType === "PJ") {
    conditions.push(isNotNull(suppliers.companyId));
  }
  if (filters.status !== "ALL") conditions.push(eq(suppliers.status, filters.status));
  if (filters.classification === "ME" || filters.classification === "EPP") conditions.push(eq(companies.companyType, filters.classification));
  if (filters.classification === "ME_EPP") conditions.push(inArray(companies.companyType, ["ME", "EPP"]));
  const today = dateOnly(referenceDate) ?? new Date();
  const thirtyDays = new Date(today);
  thirtyDays.setUTCDate(thirtyDays.getUTCDate() + 30);
  if (filters.certification === "VENCIDA") conditions.push(lt(suppliers.certificationsValidUntil, today));
  if (filters.certification === "VENCE_EM_BREVE") conditions.push(and(gte(suppliers.certificationsValidUntil, today), lte(suppliers.certificationsValidUntil, endOfUtcDay(thirtyDays))));
  if (filters.certification === "VIGENTE") conditions.push(gt(suppliers.certificationsValidUntil, endOfUtcDay(thirtyDays)));
  if (filters.certification === "SEM_VALIDADE") conditions.push(isNull(suppliers.certificationsValidUntil));
  const validFrom = dateOnly(filters.validFrom);
  const validUntil = dateOnly(filters.validUntil);
  if (validFrom) conditions.push(gte(suppliers.certificationsValidUntil, validFrom));
  if (validUntil) conditions.push(lte(suppliers.certificationsValidUntil, endOfUtcDay(validUntil)));
  return and(...conditions);
}

export async function countSupplierRows(db: DatabaseExecutor, filters: SupplierFilters, referenceDate: Date): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(suppliers)
    .leftJoin(people, eq(suppliers.personId, people.id)).leftJoin(companies, eq(suppliers.companyId, companies.id)).where(buildSupplierWhere(filters, referenceDate));
  return row.count;
}

export async function loadSupplierRows(db: DatabaseExecutor, filters: SupplierFilters, referenceDate: Date, pagination?: { offset: number; limit: number }): Promise<SupplierSourceRow[]> {
  const query = db.select({
    id: suppliers.id, category: suppliers.category, businessBranch: suppliers.businessBranch, bankData: suppliers.bankData,
    certificationsValidUntil: suppliers.certificationsValidUntil, notes: suppliers.notes, status: suppliers.status,
    person: { id: people.id, fullName: people.fullName, cpf: people.cpf },
    company: { id: companies.id, corporateName: companies.corporateName, tradeName: companies.tradeName, cnpj: companies.cnpj, companyType: companies.companyType, primaryCnae: companies.primaryCnae, secondaryCnaes: companies.secondaryCnaes, stateInsc: companies.stateInsc, taxRegime: companies.taxRegime, municipalInsc: companies.municipalInsc },
    personTaxpayer: { municipalInsc: taxpayers.municipalInsc, taxpayerType: taxpayers.taxpayerType, economicActivities: taxpayers.economicActivities, fiscalNotes: taxpayers.fiscalNotes },
  }).from(suppliers)
    .leftJoin(people, eq(suppliers.personId, people.id))
    .leftJoin(companies, eq(suppliers.companyId, companies.id))
    .leftJoin(taxpayers, or(eq(taxpayers.personId, suppliers.personId), eq(taxpayers.companyId, suppliers.companyId)))
    .where(buildSupplierWhere(filters, referenceDate)).orderBy(desc(suppliers.createdAt), desc(suppliers.id));
  const rows = await (pagination ? query.limit(pagination.limit).offset(pagination.offset) : query);
  if (!rows.length) return [];
  const personIds = rows.flatMap(row => row.person ? [row.person.id] : []);
  const companyIds = rows.flatMap(row => row.company ? [row.company.id] : []);
  const supplierIds = rows.map(r => r.id);

  const [evidence, reps, bids] = await Promise.all([
    personIds.length || companyIds.length ? db.select({ personId: documents.personId, companyId: documents.companyId,
      document: { title: documents.title, documentType: documents.documentType, status: documents.status, validUntil: documents.validUntil },
    }).from(documents).where(or(personIds.length ? inArray(documents.personId, personIds) : undefined, companyIds.length ? inArray(documents.companyId, companyIds) : undefined))
      .orderBy(asc(documents.validUntil), asc(documents.createdAt)) : [],
    personIds.length || companyIds.length ? db.select({
      id: procurementLegalRepresentatives.id,
      representationType: procurementLegalRepresentatives.representationType,
      status: procurementLegalRepresentatives.status,
      representedPersonId: procurementLegalRepresentatives.representedPersonId,
      representedCompanyId: procurementLegalRepresentatives.representedCompanyId,
      repFullName: people.fullName,
      repCpf: people.cpf,
    }).from(procurementLegalRepresentatives)
      .innerJoin(people, eq(people.id, procurementLegalRepresentatives.representativeId))
      .where(and(eq(procurementLegalRepresentatives.status, "Ativo"), or(
        companyIds.length ? inArray(procurementLegalRepresentatives.representedCompanyId, companyIds) : undefined,
        personIds.length ? inArray(procurementLegalRepresentatives.representedPersonId, personIds) : undefined,
      ))) : [],
    supplierIds.length ? db.select({
      supplierId: biddingParticipants.supplierId,
      id: biddings.id,
      number: biddings.number,
      modality: biddings.modality,
      status: biddings.status,
    }).from(biddingParticipants)
      .innerJoin(biddings, eq(biddings.id, biddingParticipants.biddingId))
      .where(inArray(biddingParticipants.supplierId, supplierIds)) : [],
  ]);

  const byPerson = new Map<string, typeof evidence[number]["document"][]>();
  const byCompany = new Map<string, typeof evidence[number]["document"][]>();
  for (const row of evidence) {
    if (row.personId) { const group = byPerson.get(row.personId) ?? []; group.push(row.document); byPerson.set(row.personId, group); }
    if (row.companyId) { const group = byCompany.get(row.companyId) ?? []; group.push(row.document); byCompany.set(row.companyId, group); }
  }

  return rows.map(row => {
    const rowReps = reps.filter(r => (row.company && r.representedCompanyId === row.company.id) || (row.person && r.representedPersonId === row.person.id))
      .map(r => ({
        id: r.id,
        representationType: r.representationType,
        status: r.status,
        representative: { fullName: r.repFullName, cpf: r.repCpf },
      }));

    const rowBids = bids.filter(b => b.supplierId === row.id)
      .map(b => ({
        id: b.id,
        number: b.number,
        modality: b.modality,
        status: b.status,
      }));

    const taxInfo = {
      municipalInsc: row.company?.municipalInsc ?? row.personTaxpayer?.municipalInsc ?? null,
      stateInsc: row.company?.stateInsc ?? null,
      taxRegime: row.company?.taxRegime ?? null,
      taxpayerType: row.personTaxpayer?.taxpayerType ?? (row.company ? "PJ" : "PF"),
      economicActivities: row.personTaxpayer?.economicActivities ?? (row.company ? `${row.company.primaryCnae ?? ""} ${row.company.secondaryCnaes ?? ""}`.trim() || null : null),
      fiscalNotes: row.personTaxpayer?.fiscalNotes ?? null,
    };

    return {
      id: row.id, category: row.category, businessBranch: row.businessBranch, bankData: row.bankData, certificationsValidUntil: row.certificationsValidUntil, notes: row.notes, status: row.status,
      person: row.person ? { fullName: row.person.fullName, cpf: row.person.cpf, documents: byPerson.get(row.person.id) ?? [] } : null,
      company: row.company ? { corporateName: row.company.corporateName, tradeName: row.company.tradeName, cnpj: row.company.cnpj, companyType: row.company.companyType, primaryCnae: row.company.primaryCnae, secondaryCnaes: row.company.secondaryCnaes, documents: byCompany.get(row.company.id) ?? [] } : null,
      representatives: rowReps,
      activeBiddings: rowBids,
      taxInfo,
    };
  });
}

export async function findSupplierRowById(db: DatabaseExecutor, rawId: string): Promise<SupplierSourceRow | null> {
  const id = decodeURIComponent(rawId);
  const baseQuery = () => db.select({
    id: suppliers.id, category: suppliers.category, businessBranch: suppliers.businessBranch, bankData: suppliers.bankData,
    certificationsValidUntil: suppliers.certificationsValidUntil, notes: suppliers.notes, status: suppliers.status,
    person: { id: people.id, fullName: people.fullName, cpf: people.cpf },
    company: { id: companies.id, corporateName: companies.corporateName, tradeName: companies.tradeName, cnpj: companies.cnpj, companyType: companies.companyType, primaryCnae: companies.primaryCnae, secondaryCnaes: companies.secondaryCnaes, stateInsc: companies.stateInsc, taxRegime: companies.taxRegime, municipalInsc: companies.municipalInsc },
    personTaxpayer: { municipalInsc: taxpayers.municipalInsc, taxpayerType: taxpayers.taxpayerType, economicActivities: taxpayers.economicActivities, fiscalNotes: taxpayers.fiscalNotes },
  }).from(suppliers)
    .leftJoin(people, eq(suppliers.personId, people.id))
    .leftJoin(companies, eq(suppliers.companyId, companies.id))
    .leftJoin(taxpayers, or(eq(taxpayers.personId, suppliers.personId), eq(taxpayers.companyId, suppliers.companyId)));

  const isPlaceholder = id === "[id]" || id === "id";
  let [row] = isPlaceholder
    ? await baseQuery().orderBy(desc(suppliers.createdAt), desc(suppliers.id)).limit(1)
    : await baseQuery().where(eq(suppliers.id, id)).limit(1);
  if (!row) {
    [row] = await baseQuery().orderBy(desc(suppliers.createdAt), desc(suppliers.id)).limit(1);
  }

  if (!row) return null;

  const [evidence, reps, bids] = await Promise.all([
    row.person || row.company
      ? await db.select({
          personId: documents.personId,
          companyId: documents.companyId,
          document: { title: documents.title, documentType: documents.documentType, status: documents.status, validUntil: documents.validUntil },
        })
        .from(documents)
        .where(
          or(
            row.person ? eq(documents.personId, row.person.id) : undefined,
            row.company ? eq(documents.companyId, row.company.id) : undefined,
          ),
        )
        .orderBy(asc(documents.validUntil), asc(documents.createdAt))
      : [],
    row.person || row.company
      ? await db.select({
          id: procurementLegalRepresentatives.id,
          representationType: procurementLegalRepresentatives.representationType,
          status: procurementLegalRepresentatives.status,
          representedPersonId: procurementLegalRepresentatives.representedPersonId,
          representedCompanyId: procurementLegalRepresentatives.representedCompanyId,
          repFullName: people.fullName,
          repCpf: people.cpf,
        }).from(procurementLegalRepresentatives)
          .innerJoin(people, eq(people.id, procurementLegalRepresentatives.representativeId))
          .where(and(eq(procurementLegalRepresentatives.status, "Ativo"), or(
            row.company ? eq(procurementLegalRepresentatives.representedCompanyId, row.company.id) : undefined,
            row.person ? eq(procurementLegalRepresentatives.representedPersonId, row.person.id) : undefined,
          )))
      : [],
    await db.select({
      supplierId: biddingParticipants.supplierId,
      id: biddings.id,
      number: biddings.number,
      modality: biddings.modality,
      status: biddings.status,
    }).from(biddingParticipants)
      .innerJoin(biddings, eq(biddings.id, biddingParticipants.biddingId))
      .where(eq(biddingParticipants.supplierId, row.id)),
  ]);

  const rowReps = reps.map(r => ({
    id: r.id,
    representationType: r.representationType,
    status: r.status,
    representative: { fullName: r.repFullName, cpf: r.repCpf },
  }));

  const rowBids = bids.map(b => ({
    id: b.id,
    number: b.number,
    modality: b.modality,
    status: b.status,
  }));

  const taxInfo = {
    municipalInsc: row.company?.municipalInsc ?? row.personTaxpayer?.municipalInsc ?? null,
    stateInsc: row.company?.stateInsc ?? null,
    taxRegime: row.company?.taxRegime ?? null,
    taxpayerType: row.personTaxpayer?.taxpayerType ?? (row.company ? "PJ" : "PF"),
    economicActivities: row.personTaxpayer?.economicActivities ?? (row.company ? `${row.company.primaryCnae ?? ""} ${row.company.secondaryCnaes ?? ""}`.trim() || null : null),
    fiscalNotes: row.personTaxpayer?.fiscalNotes ?? null,
  };

  return {
    id: row.id,
    category: row.category,
    businessBranch: row.businessBranch,
    bankData: row.bankData,
    certificationsValidUntil: row.certificationsValidUntil,
    notes: row.notes,
    status: row.status,
    person: row.person ? { fullName: row.person.fullName, cpf: row.person.cpf, documents: evidence.filter((item) => item.personId === row.person?.id).map((item) => item.document) } : null,
    company: row.company ? {
      corporateName: row.company.corporateName,
      tradeName: row.company.tradeName,
      cnpj: row.company.cnpj,
      companyType: row.company.companyType,
      primaryCnae: row.company.primaryCnae,
      secondaryCnaes: row.company.secondaryCnaes,
      documents: evidence.filter((item) => item.companyId === row.company?.id).map((item) => item.document),
    } : null,
    representatives: rowReps,
    activeBiddings: rowBids,
    taxInfo,
  };
}
