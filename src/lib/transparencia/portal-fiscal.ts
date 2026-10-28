import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type { DatabaseExecutor as Db } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { publicCommitments, publicAppropriations, publicBudgetUnits, publicExpenseNatures, publicResourceSources, publicRevenues } from "@/db/schema/transparency-financial";
import { transparencyRevenueNatures } from "@/db/schema/transparency-planning";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { readPublicCommitments } from "@/db/repositories/transparency/financial";

function maskDocument(doc?: string | null): string {
  if (!doc) return "NÃO INFORMADO";
  const clean = doc.replace(/\D/g, "");
  if (clean.length === 11) {
    // CPF: ***.123.456-**
    return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  }
  if (clean.length === 14) {
    // CNPJ: 08.***.505/0001-**
    return `${clean.slice(0, 2)}.***.${clean.slice(5, 8)}/${clean.slice(8, 12)}-**`;
  }
  return "PROTEGIDO POR LGPD";
}

export type PublicDataFilter = {
  year?: number;
  search?: string;
  budgetUnitCode?: string;
  resourceSourceCode?: string;
  expenseNatureCode?: string;
  revenueClassification?: "ORCAMENTARIA" | "INTRAORCAMENTARIA" | "REDUTORA";
  page?: number;
  pageSize?: number;
};

export function parsePublicDataFilter(searchParams: URLSearchParams): PublicDataFilter {
  const parseOptionalInteger = (name: string, min: number, max: number) => {
    const value = searchParams.get(name);
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`Parâmetro ${name} inválido.`);
    }
    return parsed;
  };

  const search = searchParams.get("search")?.trim();
  if (search && search.length > 120) throw new Error("Parâmetro search inválido.");

  const parseOptionalCode = (name: string) => {
    const value = searchParams.get(name)?.trim();
    if (!value) return undefined;
    if (value.length > 80) throw new Error(`Parâmetro ${name} inválido.`);
    return value;
  };

  const budgetUnitCode = parseOptionalCode("budgetUnitCode");
  const resourceSourceCode = parseOptionalCode("resourceSourceCode");
  const expenseNatureCode = parseOptionalCode("expenseNatureCode");
  const revenueClassification = searchParams.get("revenueClassification");
  if (revenueClassification && !["ORCAMENTARIA", "INTRAORCAMENTARIA", "REDUTORA"].includes(revenueClassification)) {
    throw new Error("Parâmetro revenueClassification inválido.");
  }

  return {
    year: parseOptionalInteger("year", 2000, 2100),
    page: parseOptionalInteger("page", 1, 1_000_000),
    pageSize: parseOptionalInteger("pageSize", 1, 100),
    search: search || undefined,
    ...(budgetUnitCode ? { budgetUnitCode } : {}),
    ...(resourceSourceCode ? { resourceSourceCode } : {}),
    ...(expenseNatureCode ? { expenseNatureCode } : {}),
    ...(revenueClassification ? { revenueClassification: revenueClassification as PublicDataFilter["revenueClassification"] } : {}),
  };
}

function normalizePublicFilter(filter: PublicDataFilter = {}) {
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(filter.pageSize ?? 50)));
  const search = filter.search?.trim();
  return { ...filter, page, pageSize, search: search || undefined };
}

function publicSupplier(
  creditor: { name: string; document: string | null; personId: string | null } | null,
  supplier: {
    person: { cpf: string | null } | null;
    company: { corporateName: string; cnpj: string } | null;
  } | null,
) {
  if (creditor) {
    return {
      name: creditor.personId ? "PESSOA FÍSICA" : creditor.name,
      documentMasked: maskDocument(creditor.document),
    };
  }
  if (supplier?.person) return { name: "PESSOA FÍSICA", documentMasked: maskDocument(supplier.person.cpf) };
  if (supplier?.company) return { name: supplier.company.corporateName, documentMasked: maskDocument(supplier.company.cnpj) };
  return { name: "NÃO INFORMADO", documentMasked: "NÃO INFORMADO" };
}

export async function getPublicExpenses(db: Db, filter?: PublicDataFilter) {
  const normalized = normalizePublicFilter(filter);
  const pattern=`%${(normalized.search||"").replace(/[\\%_]/g,"\\$&")}%`;
  const appropriationCriteria=and(eq(publicAppropriations.id,publicCommitments.appropriationId),normalized.budgetUnitCode?eq(publicBudgetUnits.code,normalized.budgetUnitCode):undefined,normalized.resourceSourceCode?eq(publicResourceSources.code,normalized.resourceSourceCode):undefined,normalized.expenseNatureCode?eq(publicExpenseNatures.code,normalized.expenseNatureCode):undefined,normalized.search?or(ilike(publicCommitments.number,pattern),ilike(publicBudgetUnits.name,pattern),ilike(publicExpenseNatures.name,pattern),ilike(publicResourceSources.name,pattern)):undefined);
  const where=and(inArray(publicCommitments.status,["Emitido","Liquidado","Pago"]),normalized.year?and(gte(publicCommitments.date,new Date(Date.UTC(normalized.year,0,1))),lt(publicCommitments.date,new Date(Date.UTC(normalized.year+1,0,1)))):undefined,sql`EXISTS(SELECT 1 FROM ${publicAppropriations} JOIN ${publicBudgetUnits} ON ${publicBudgetUnits.id}=${publicAppropriations.budgetUnitId} JOIN ${publicExpenseNatures} ON ${publicExpenseNatures.id}=${publicAppropriations.expenseNatureId} JOIN ${publicResourceSources} ON ${publicResourceSources.id}=${publicAppropriations.resourceSourceId} WHERE ${appropriationCriteria})`);
  const [[{total}], commitments] = await Promise.all([
    db.select({total:count()}).from(publicCommitments).where(where),
    readPublicCommitments(db,where,{offset:(normalized.page-1)*normalized.pageSize,limit:normalized.pageSize}),
  ]);

  const data = commitments.map((c) => {
    const value = new Decimal(c.valueDecimal ?? c.value).toNumber();
    const supplier = publicSupplier(c.creditor, c.supplier);

    const totalSettled = c.settlements.reduce(
      (sum, s) => sum.add(s.valueDecimal ?? s.value),
      new Decimal(0),
    ).toNumber();

    const totalPaid = c.payments.reduce((sum, payment) => sum.add(payment.valueDecimal ?? payment.value), new Decimal(0)).toNumber();
    const latestSettlementDate = c.settlements.reduce<Date | null>(
      (latest, settlement) => !latest || settlement.date > latest ? settlement.date : latest,
      null,
    );
    const latestPaymentDate = c.payments.reduce<Date | null>(
      (latest, payment) => !latest || payment.date > latest ? payment.date : latest,
      null,
    );

    return {
      number: c.number,
      date: c.date,
      processNumber: c.purchaseProcess?.number ?? c.process?.protocolNumber ?? "PROC-S/N",
      contractNumber: c.contract?.number ?? "S/N",
      receiptNumber: c.purchaseReceipt?.number ?? "NÃO APLICÁVEL",
      receiptDate: c.purchaseReceipt?.receivedAt ?? null,
      biddingNumber: c.purchaseProcess?.number ?? c.process?.protocolNumber ?? "S/N",
      biddingModality: c.purchaseProcess?.modality ?? "NÃO INFORMADA",
      programCode: c.appropriation.programPPA?.code ?? "0000",
      programName: c.appropriation.programPPA?.name ?? "PROGRAMA DE GESTÃO E MANUTENÇÃO",
      actionCode: c.appropriation.actionPPA?.code ?? "2000",
      actionName: c.appropriation.actionPPA?.name ?? "MANUTENÇÃO DAS ATIVIDADES ADMINISTRATIVAS",
      functionCode: c.appropriation.code.substring(0, 2) || "04",
      functionName: "Administração",
      subfunctionCode: c.appropriation.code.substring(2, 5) || "122",
      subfunctionName: "Administração Geral",
      covenantNumber: c.covenant?.number ?? c.covenantNumber ?? "NÃO APLICÁVEL",
      supplierName: supplier.name,
      supplierDocumentMasked: supplier.documentMasked,
      budgetUnitCode: c.appropriation.budgetUnit.code,
      budgetUnitName: c.appropriation.budgetUnit.name,
      budgetClassificationCode: c.appropriation.code,
      expenseNatureCode: c.appropriation.expenseNature.code,
      expenseNatureName: c.appropriation.expenseNature.name,
      resourceSourceCode: c.appropriation.resourceSource.code,
      resourceSourceName: c.appropriation.resourceSource.name,
      description: c.history || "Despesa Pública Processada",
      committedValue: value,
      settledValue: totalSettled,
      paidValue: totalPaid,
      settlementCount: c.settlements.length,
      latestSettlementDate,
      paidPaymentCount: c.payments.length,
      latestPaymentDate,
      status: c.status,
    };
  });

  const updatedAt = commitments.reduce<Date | null>(
    (latest, commitment) => !latest || commitment.updatedAt > latest ? commitment.updatedAt : latest,
    null,
  );
  return { data, total, page: normalized.page, pageSize: normalized.pageSize, updatedAt };
}

export async function getPublicRevenues(db: Db, filter?: PublicDataFilter) {
  const normalized = normalizePublicFilter(filter);
  const pattern=`%${(normalized.search||"").replace(/[\\%_]/g,"\\$&")}%`;
  const where=and(eq(publicRevenues.stage,"ARRECADADA"),normalized.year?and(gte(publicRevenues.date,new Date(Date.UTC(normalized.year,0,1))),lt(publicRevenues.date,new Date(Date.UTC(normalized.year+1,0,1)))):undefined,normalized.resourceSourceCode?eq(publicResourceSources.code,normalized.resourceSourceCode):undefined,normalized.budgetUnitCode?eq(publicBudgetUnits.code,normalized.budgetUnitCode):undefined,normalized.revenueClassification?eq(publicRevenues.classification,normalized.revenueClassification):undefined,normalized.search?or(ilike(transparencyRevenueNatures.code,pattern),ilike(transparencyRevenueNatures.name,pattern),ilike(publicResourceSources.code,pattern),ilike(publicResourceSources.name,pattern)):undefined);
  const [[{total}],revenueRows]=await Promise.all([
    db.select({total:count()}).from(publicRevenues).innerJoin(transparencyRevenueNatures,eq(transparencyRevenueNatures.id,publicRevenues.revenueNatureId)).innerJoin(publicResourceSources,eq(publicResourceSources.id,publicRevenues.resourceSourceId)).leftJoin(reconciliationBankAccounts,eq(reconciliationBankAccounts.id,publicRevenues.bankAccountId)).leftJoin(publicBudgetUnits,eq(publicBudgetUnits.id,reconciliationBankAccounts.budgetUnitId)).where(where),
    db.select({revenue:publicRevenues,revenueNature:transparencyRevenueNatures,resourceSource:publicResourceSources,budgetUnit:publicBudgetUnits}).from(publicRevenues).innerJoin(transparencyRevenueNatures,eq(transparencyRevenueNatures.id,publicRevenues.revenueNatureId)).innerJoin(publicResourceSources,eq(publicResourceSources.id,publicRevenues.resourceSourceId)).leftJoin(reconciliationBankAccounts,eq(reconciliationBankAccounts.id,publicRevenues.bankAccountId)).leftJoin(publicBudgetUnits,eq(publicBudgetUnits.id,reconciliationBankAccounts.budgetUnitId)).where(where).orderBy(desc(publicRevenues.date)).offset((normalized.page-1)*normalized.pageSize).limit(normalized.pageSize),
  ]);
  const revenues=revenueRows.map(row=>({...row.revenue,revenueNature:row.revenueNature,resourceSource:row.resourceSource,bankAccount:{budgetUnit:row.budgetUnit}}));

  const data = revenues.map((r) => ({
    date: r.date,
    launchDate: r.launchDate,
    collectionDate: r.collectionDate,
    revenueNatureCode: r.revenueNature.code,
    revenueNatureName: r.revenueNature.name,
    resourceSourceCode: r.resourceSource.code,
    resourceSourceName: r.resourceSource.name,
    budgetUnitCode: r.bankAccount?.budgetUnit?.code ?? null,
    budgetUnitName: r.bankAccount?.budgetUnit?.name ?? null,
    classification: r.classification,
    description: r.history || "Arrecadação de Receita Pública",
    value: new Decimal(r.valueDecimal ?? r.value).toNumber(),
    status: r.status,
  }));
  const updatedAt = revenues.reduce<Date | null>(
    (latest, revenue) => !latest || revenue.updatedAt > latest ? revenue.updatedAt : latest,
    null,
  );
  return { data, total, page: normalized.page, pageSize: normalized.pageSize, updatedAt };
}

function escapeCsvValue(value: unknown) {
  const stringValue = value instanceof Date ? value.toISOString() : String(value ?? "");
  const formulaSafeValue = /^[\t\r ]*[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
  return `"${formulaSafeValue.replace(/"/g, '""')}"`;
}

export function exportPublicDataCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]).map(escapeCsvValue).join(",");
  const rows = data.map((row) =>
    Object.values(row)
      .map(escapeCsvValue)
      .join(","),
  );
  return [headers, ...rows].join("\n");
}

export function exportPublicDataTXT(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]).join("\t");
  const rows = data.map((row) =>
    Object.values(row)
      .map((val) => (val instanceof Date ? val.toISOString() : String(val ?? "").replace(/\t/g, " ")))
      .join("\t"),
  );
  return [headers, ...rows].join("\n");
}
