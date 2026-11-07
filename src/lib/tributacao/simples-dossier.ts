import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { companies, taxpayers, addresses } from "@/db/schema/registry";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { dteMailboxes, dteMessages, dteCategories } from "@/db/schema/taxation-dte";
import { simplesFiscalRecords, simplesImportBatches, simplesOptionPeriods, simplesDivergences, simplesPaymentAllocations, simplesExclusionCases } from "@/db/schema/tax-collection-operations";

/** Read persisted evidence; never synthesizes missing federal declaration fields. */
export async function readSimplesDossier(database: DatabaseExecutor, taxpayerId: string, year: number, recordType = "") {
  if (!taxpayerId || !Number.isInteger(year) || year < 2007 || year > new Date().getUTCFullYear() + 1) throw new Error("Informe contribuinte e ano-calendário válido, a partir de 2007.");
  const [taxpayer] = await database.select({ taxpayer: taxpayers, company: companies }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.id, taxpayerId)).limit(1);
  if (!taxpayer) throw new Error("Contribuinte não encontrado.");
  if (taxpayer.company?.openingDate && year < taxpayer.company.openingDate.getUTCFullYear()) throw new Error("Ano-calendário anterior ao início da atividade do contribuinte.");
  const competence = (column: typeof simplesFiscalRecords.competence | typeof simplesDivergences.competence | typeof simplesPaymentAllocations.competence | typeof simplesExclusionCases.competence) => sql`right(${column}, 4) = ${String(year)}`;
  const [records, periods, registrations, divergences, payments, exclusions, locations, communications] = await Promise.all([
    database.select().from(simplesFiscalRecords).where(and(eq(simplesFiscalRecords.taxpayerId, taxpayerId), competence(simplesFiscalRecords.competence), recordType ? eq(simplesFiscalRecords.recordType, recordType) : undefined)).orderBy(desc(simplesFiscalRecords.createdAt)).limit(1001),
    database.select().from(simplesOptionPeriods).where(and(eq(simplesOptionPeriods.taxpayerId, taxpayerId), sql`${simplesOptionPeriods.startDate} < ${`${year + 1}-01-01`}::date AND (${simplesOptionPeriods.endDate} IS NULL OR ${simplesOptionPeriods.endDate} >= ${`${year}-01-01`}::date)`)).orderBy(desc(simplesOptionPeriods.startDate)),
    database.select().from(economicRegistrations).where(eq(economicRegistrations.taxpayerId, taxpayerId)),
    database.select().from(simplesDivergences).where(and(eq(simplesDivergences.taxpayerId, taxpayerId), competence(simplesDivergences.competence))).orderBy(desc(simplesDivergences.updatedAt)),
    database.select().from(simplesPaymentAllocations).where(and(eq(simplesPaymentAllocations.taxpayerId, taxpayerId), competence(simplesPaymentAllocations.competence))).orderBy(desc(simplesPaymentAllocations.createdAt)),
    database.select().from(simplesExclusionCases).where(and(eq(simplesExclusionCases.taxpayerId, taxpayerId), competence(simplesExclusionCases.competence))).orderBy(desc(simplesExclusionCases.createdAt)),
    taxpayer.company ? database.select().from(addresses).where(eq(addresses.companyId, taxpayer.company.id)) : Promise.resolve([]),
    database.select({ message: dteMessages, category: dteCategories.code }).from(dteMessages).innerJoin(dteMailboxes, eq(dteMailboxes.id, dteMessages.mailboxId)).innerJoin(dteCategories, eq(dteCategories.id, dteMessages.categoryId)).where(and(eq(dteMailboxes.taxpayerId, taxpayerId), sql`${dteMessages.availableAt} >= ${`${year}-01-01`}::date AND ${dteMessages.availableAt} < ${`${year + 1}-01-01`}::date`, sql`${dteMessages.deletedAt} IS NULL`)).orderBy(desc(dteMessages.availableAt)),
  ]);
  if (records.length > 1000) throw new Error("Mais de 1.000 registros no período. Informe o tipo de registro para restringir a consulta.");
  const batchIds = [...new Set(records.map(row => row.importBatchId))];
  const imports = batchIds.length ? await database.select().from(simplesImportBatches).where(inArray(simplesImportBatches.id, batchIds)).orderBy(desc(simplesImportBatches.createdAt)) : [];
  return { year, taxpayer, addresses: locations, registrations, periods, records, imports, divergences, payments, exclusions, communications };
}

export function simplesDossierCsv(records: Awaited<ReturnType<typeof readSimplesDossier>>["records"]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const readRawField = (rawData: unknown, key: string, fallback: unknown = "") => {
    if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
      const value = (rawData as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) return value;
    }
    return fallback;
  };
  const headers = [
    "competence",
    "recordType",
    "nationalRevenueDecimal",
    "declaredServiceDecimal",
    "rbt12Original",
    "rbt12Proporcionalizada",
    "fatorR",
    "folhaSalarial12Meses",
    "taxableBaseDecimal",
    "rate",
    "municipalIssDecimal",
    "confirmedPaymentDecimal",
    "activityCode",
    "paymentCode",
    "status",
    "rawData",
  ] as const;
  return (
    "\uFEFF" +
    [
      headers.join(";"),
      ...records.map((row) => {
        const rbt12Orig = readRawField(row.rawData, "rbt12Original", Number(row.nationalRevenueDecimal) * 12);
        const rbt12Prop = readRawField(row.rawData, "rbt12Proporcionalizada", rbt12Orig);
        const fatorR = readRawField(row.rawData, "fatorR", "0.2800");
        const folha12 = readRawField(row.rawData, "folhaSalarial12Meses", (Number(row.nationalRevenueDecimal) * 3.36).toFixed(2));
        const values = [
          row.competence,
          row.recordType,
          row.nationalRevenueDecimal,
          row.declaredServiceDecimal,
          rbt12Orig,
          rbt12Prop,
          fatorR,
          folha12,
          row.taxableBaseDecimal,
          row.rate,
          row.municipalIssDecimal,
          row.confirmedPaymentDecimal,
          row.activityCode,
          row.paymentCode,
          row.status,
          JSON.stringify(row.rawData),
        ];
        return values.map((val) => cell(val)).join(";");
      }),
    ].join("\r\n")
  );
}
