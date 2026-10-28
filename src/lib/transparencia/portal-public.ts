import { createHash } from "node:crypto";
import { MUNICIPALITY_INSTITUTION_NAME, MUNICIPALITY_LABEL } from "@/lib/municipality-identity";
import { and, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DatabaseExecutor as Db } from "@/db/transaction";
import { financialYears } from "@/db/schema/finance-years";
import { governmentEntities } from "@/db/schema/master-data";
import { annualAccountingCloses } from "@/db/schema/finance-accounting";
import { documents as documentTable, suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { secretariats } from "@/db/schema/administration";
import { documentVersions } from "@/db/schema/document-workflow";
import { procurementContracts, purchaseProcesses, biddings as biddingTable } from "@/db/schema/procurement-core";

export const publicFinancialReportOptions = [
  { type: "RREO", label: "RREO" },
  { type: "RGF", label: "RGF" },
  { type: "BALANCETE", label: "Balancete Contábil" },
  { type: "BALANCO_ORCAMENTARIO", label: "Balanço Orçamentário" },
  { type: "BALANCO_PATRIMONIAL", label: "Balanço Patrimonial" },
  { type: "PCA", label: "Prestação de Contas Anual (PCA)" },
] as const;

export type PublicFinancialReportType = (typeof publicFinancialReportOptions)[number]["type"];

const annualReportTypes = new Set<PublicFinancialReportType>(["BALANCO_ORCAMENTARIO", "BALANCO_PATRIMONIAL"]);

export function isPublicFinancialReportType(value: string | null): value is PublicFinancialReportType {
  return publicFinancialReportOptions.some((option) => option.type === value);
}

// A deterministic type associates a generated report document to its exercise without relying on its title.
export function publicFinancialReportDocumentType(financialYearId: string, reportType: PublicFinancialReportType) {
  return `PUBLIC_FINANCIAL_REPORT:${financialYearId}:${reportType}`;
}

function maskDocument(doc?: string | null): string {
  if (!doc) return "NÃO INFORMADO";
  const clean = doc.replace(/\D/g, "");
  if (clean.length === 11) return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  if (clean.length === 14) return `${clean.slice(0, 2)}.***.${clean.slice(5, 8)}/${clean.slice(8, 12)}-**`;
  return "PROTEGIDO POR LGPD";
}

function publicSupplier(supplier: {
  person: { fullName: string; cpf: string | null } | null;
  company: { corporateName: string; tradeName: string | null; cnpj: string } | null;
}) {
  if (supplier.person) return { name: "PESSOA FÍSICA", documentMasked: maskDocument(supplier.person.cpf) };
  if (supplier.company) return { name: supplier.company.tradeName || supplier.company.corporateName, documentMasked: maskDocument(supplier.company.cnpj) };
  return { name: "NÃO INFORMADO", documentMasked: "NÃO INFORMADO" };
}

export async function getPublicFinancialReportSnapshots(db: Db) {
  const yearRows=await db.select({id:financialYears.id,year:financialYears.year,governmentEntityId:financialYears.governmentEntityId,governmentEntity:{name:governmentEntities.name}}).from(financialYears).leftJoin(governmentEntities,eq(governmentEntities.id,financialYears.governmentEntityId)).orderBy(desc(financialYears.year));
  const closes=yearRows.length?await db.select({financialYearId:annualAccountingCloses.financialYearId,status:annualAccountingCloses.status,closedAt:annualAccountingCloses.closedAt}).from(annualAccountingCloses).where(inArray(annualAccountingCloses.financialYearId,yearRows.map(row=>row.id))):[];
  const years=yearRows.map(row=>({...row,annualAccountingCloses:closes.filter(close=>close.financialYearId===row.id)}));
  const documentRows=years.length?await db.select({id:documentTable.id,documentType:documentTable.documentType}).from(documentTable).where(and(eq(documentTable.status,"Publicado"),inArray(documentTable.documentType,years.flatMap(year=>publicFinancialReportOptions.map(report=>publicFinancialReportDocumentType(year.id,report.type)))))):[];
  const versions=documentRows.length?await db.select({documentId:documentVersions.documentId,versionNumber:documentVersions.versionNumber,finalizedAt:documentVersions.finalizedAt}).from(documentVersions).where(and(inArray(documentVersions.documentId,documentRows.map(row=>row.id)),inArray(documentVersions.status,["FINAL","SIGNED"]))).orderBy(desc(documentVersions.versionNumber)):[];
  const documents=documentRows.map(row=>({...row,versions:versions.filter(version=>version.documentId===row.id)}));
  const documentsByType = new Map(documents.map((document) => [document.documentType, document]));

  return years.flatMap((year) => publicFinancialReportOptions.flatMap((report) => {
    if (annualReportTypes.has(report.type) && !year.annualAccountingCloses.some((close) => close.status === "ENCERRADO")) return [];
    const document = documentsByType.get(publicFinancialReportDocumentType(year.id, report.type));
    const version = document?.versions[0];
    if (!document || !version) return [];
    return [{
      year: year.year,
      governmentEntityId: year.governmentEntityId,
      governmentEntityName: year.governmentEntity?.name ?? "Legado",
      type: report.type,
      label: report.label,
      version: version.versionNumber,
      finalizedAt: version.finalizedAt,
      annualCloseAt: annualReportTypes.has(report.type) ? year.annualAccountingCloses.find((close) => close.status === "ENCERRADO")?.closedAt ?? null : null,
    }];
  }));
}

export async function getPublicFinancialReportSnapshot(
  db: Db,
  input: { year: number; reportType: PublicFinancialReportType; version?: number; governmentEntityId?: string },
) {
  const [financialYear] = await db.select({id:financialYears.id}).from(financialYears).where(and(eq(financialYears.year,input.year),input.governmentEntityId?eq(financialYears.governmentEntityId,input.governmentEntityId):isNull(financialYears.governmentEntityId))).limit(1);
  if (!financialYear) return null;
  if (annualReportTypes.has(input.reportType) && !(await db.select({id:annualAccountingCloses.id}).from(annualAccountingCloses).where(and(eq(annualAccountingCloses.financialYearId,financialYear.id),eq(annualAccountingCloses.status,"ENCERRADO"))).limit(1)).length) return null;
  const [document]=await db.select({id:documentTable.id}).from(documentTable).where(and(eq(documentTable.status,"Publicado"),eq(documentTable.documentType,publicFinancialReportDocumentType(financialYear.id,input.reportType)))).limit(1);
  if(!document)return null;
  return (await db.select({fileUrl:documentVersions.fileUrl,versionNumber:documentVersions.versionNumber}).from(documentVersions).where(and(eq(documentVersions.documentId,document.id),inArray(documentVersions.status,["FINAL","SIGNED"]),input.version?eq(documentVersions.versionNumber,input.version):undefined)).orderBy(desc(documentVersions.versionNumber)).limit(1))[0]??null;
}

export async function getPublicContracts(db: Db) {
  const rows=await db.select({contract:procurementContracts,person:{fullName:people.fullName,cpf:people.cpf},company:{corporateName:companies.corporateName,tradeName:companies.tradeName,cnpj:companies.cnpj},process:{number:purchaseProcesses.number,modality:purchaseProcesses.modality},secretariat:{name:secretariats.name}}).from(procurementContracts).innerJoin(suppliers,eq(suppliers.id,procurementContracts.supplierId)).leftJoin(people,eq(people.id,suppliers.personId)).leftJoin(companies,eq(companies.id,suppliers.companyId)).innerJoin(purchaseProcesses,eq(purchaseProcesses.id,procurementContracts.processId)).innerJoin(secretariats,eq(secretariats.id,procurementContracts.secretariatId)).where(notInArray(procurementContracts.status,["Minuta","Rascunho","Em Elaboração"])).orderBy(desc(procurementContracts.startDate)).limit(100);
  const contracts=rows.map(row=>({...row.contract,supplier:{person:row.person,company:row.company},process:row.process,secretariat:row.secretariat}));
  return contracts.map((contract) => ({
    number: contract.number,
    object: contract.object,
    initialValue: contract.initialValue,
    updatedValue: contract.updatedValue,
    startDate: contract.startDate,
    endDate: contract.endDate,
    status: contract.status,
    supplier: publicSupplier(contract.supplier),
    processNumber: contract.process.number,
    modality: contract.process.modality,
    secretariat: contract.secretariat.name,
  }));
}

export async function getPublicBiddings(db: Db) {
  const rows=await db.select({bidding:biddingTable,process:{number:purchaseProcesses.number,object:purchaseProcesses.object,estimatedValue:purchaseProcesses.estimatedValue},secretariat:{name:secretariats.name}}).from(biddingTable).innerJoin(purchaseProcesses,eq(purchaseProcesses.id,biddingTable.processId)).innerJoin(secretariats,eq(secretariats.id,purchaseProcesses.secretariatId)).where(and(isNotNull(biddingTable.publicationDate),notInArray(biddingTable.status,["Em Elaboração","Rascunho"]))).orderBy(desc(biddingTable.publicationDate)).limit(100);
  const biddings=rows.map(row=>({...row.bidding,process:{...row.process,secretariat:row.secretariat}}));
  return biddings.map((bidding) => ({
    number: bidding.number,
    modality: bidding.modality,
    status: bidding.status,
    publicationDate: bidding.publicationDate!,
    sessionDate: bidding.sessionDate,
    processNumber: bidding.process.number,
    object: bidding.process.object,
    estimatedValue: bidding.process.estimatedValue,
    secretariat: bidding.process.secretariat.name,
  }));
}

export async function publishApprovedSnapshot(
  db: Db,
  input: {
    financialYearId: string;
    reportType: PublicFinancialReportType;
    title: string;
    fileUrl: string;
    versionNumber?: number;
  },
) {
  const [year] = await db.select({id:financialYears.id}).from(financialYears).where(eq(financialYears.id,input.financialYearId)).limit(1);
  if (!year) throw new Error("Exercício financeiro não encontrado.");

  if (annualReportTypes.has(input.reportType)) {
    const [closed] = await db.select({id:annualAccountingCloses.id}).from(annualAccountingCloses).where(and(eq(annualAccountingCloses.financialYearId,year.id),eq(annualAccountingCloses.status,"ENCERRADO"))).limit(1);
    if (!closed) throw new Error("Balanços anuais e PCA exigem o encerramento anual concluído.");
  }

  const docType = publicFinancialReportDocumentType(year.id, input.reportType);
  let [document] = await db.select({id:documentTable.id}).from(documentTable).where(eq(documentTable.documentType,docType)).limit(1);

  if (!document) {
    [document] = await db.insert(documentTable).values({
        title: input.title,
        documentType: docType,
        fileUrl: input.fileUrl,
        status: "Publicado",
    }).returning({id:documentTable.id});
  }

  const [lastVersion] = await db.select({versionNumber:documentVersions.versionNumber}).from(documentVersions).where(eq(documentVersions.documentId,document.id)).orderBy(desc(documentVersions.versionNumber)).limit(1);

  const nextVersion = input.versionNumber ?? (lastVersion ? lastVersion.versionNumber + 1 : 1);
  const hashSha256 = createHash("sha256").update(input.fileUrl).digest("hex");

  const [version] = await db.insert(documentVersions).values({
      documentId: document.id,
      versionNumber: nextVersion,
      fileUrl: input.fileUrl,
      hashSha256,
      status: "FINAL",
      finalizedAt: new Date(),
  }).returning({id:documentVersions.id,versionNumber:documentVersions.versionNumber});

  return { documentId: document.id, versionId: version.id, versionNumber: version.versionNumber };
}

export function getPublicHelpFaqAndContactInfo() {
  return {
    portalInfo: {
      title: `Portal da Transparência Pública — ${MUNICIPALITY_INSTITUTION_NAME}`,
      lawRef: "Lei Complementar nº 131/2009 & Lei nº 12.527/2011 (Lei de Acesso à Informação - LAI)",
      description: "Garantia de acesso amplo, simultâneo e em tempo real a todas as informações financeiras, orçamentárias, patrimoniais, licitações e contratos públicos.",
    },
    faq: [
      {
        question: "Como consultar os gastos públicos da Prefeitura?",
        answer: "Acesse a aba 'Despesas Públicas' e filtre por ano, unidade gestora, natureza de despesa ou fornecedor. Todos os campos de processo, empenho, liquidação e pagamento estão disponíveis.",
      },
      {
        question: "Onde encontro os balanços anuais, RREO e RGF oficiais?",
        answer: "Na seção 'Demonstrativos Fiscais', são publicados automaticamente os snapshots oficiais do RREO, RGF, Balancetes e Prestação de Contas Anual (PCA).",
      },
      {
        question: "Os dados públicos são idênticos aos dados da contabilidade interna?",
        answer: "Sim. O sistema utiliza um Motor de Reconciliação em Tempo Real que valida que o valor total de despesas e receitas expostas no portal bate centavo a centavo (R$ 0,00 de divergência) com o razão contábil.",
      },
      {
        question: "Como solicitar dados adicionais via e-SIC (Transparência Passiva)?",
        answer: "Acesse o módulo e-SIC, preencha o requerimento com seu identificador público e receba o número de protocolo com prazo legal de resposta monitorado.",
      },
    ],
    contact: {
      ombudsmanName: "Ouvidoria Geral e Serviço de Informação ao Cidadão (e-SIC)",
      address: MUNICIPALITY_LABEL,
      email: "Não informado",
      phone: "Não informado",
      openingHours: "Consulte os canais institucionais",
    },
  };
}
