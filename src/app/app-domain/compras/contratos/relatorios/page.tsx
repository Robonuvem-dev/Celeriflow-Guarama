import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import {
  procurementContracts,
  contractAmendments,
  purchaseProcesses,
  purchaseProcessItems,
} from "@/db/schema/procurement-core";
import {
  procurementCommitments,
  procurementSettlements,
  procurementPayments,
} from "@/db/schema/procurement-finance";
import { purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { secretariats, employees } from "@/db/schema/administration";
import { procurementUnits } from "@/db/schema/procurement-budget";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { calculateInclusiveContractTermDays } from "@/lib/compras/contract-lifecycle";
import { formatCnpj, formatCpf } from "@/app/app-domain/cadastros/fornecedores/supplier-utils";
import { ContratosRelatoriosClient, type RelatorioContratoRow } from "./ContratosRelatoriosClient";
import { desc, eq, inArray, like } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ContratosRelatoriosPage({
  searchParams,
}: {
  searchParams?: Promise<{ aba?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.aba || "monitoramento";

  const context = await getTenantContextForModule("COMPRAS");
  const tenantDb = context.database ?? db;

  // 1. Carregar contratos com seus relacionamentos de processo, fornecedor, secretaria e UG
  const rawContracts = await tenantDb
    .select({
      contract: procurementContracts,
      processNumber: purchaseProcesses.number,
      processModality: purchaseProcesses.modality,
      processCreatedAt: purchaseProcesses.createdAt,
      processId: purchaseProcesses.id,
      supplier: suppliers,
      company: companies,
      person: people,
      secretariatName: secretariats.name,
      budgetUnitCode: procurementUnits.code,
      budgetUnitName: procurementUnits.name,
    })
    .from(procurementContracts)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId))
    .innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId))
    .leftJoin(companies, eq(companies.id, suppliers.companyId))
    .leftJoin(people, eq(people.id, suppliers.personId))
    .innerJoin(secretariats, eq(secretariats.id, procurementContracts.secretariatId))
    .leftJoin(procurementUnits, eq(procurementUnits.id, procurementContracts.sourceBudgetUnitId))
    .orderBy(desc(procurementContracts.createdAt));

  const contractIds = rawContracts.map((c) => c.contract.id);
  const processIds = Array.from(new Set(rawContracts.map((c) => c.processId)));

  // 2. Carregar aditivos de todos os contratos
  const rawAmendments = contractIds.length
    ? await tenantDb
        .select()
        .from(contractAmendments)
        .where(inArray(contractAmendments.contractId, contractIds))
        .orderBy(desc(contractAmendments.createdAt))
    : [];

  // 3. Carregar empenhos, liquidações e pagamentos vinculados
  const rawCommitments = contractIds.length
    ? await tenantDb
        .select()
        .from(procurementCommitments)
        .where(inArray(procurementCommitments.contractId, contractIds))
    : [];

  const commitmentIds = rawCommitments.map((c) => c.id);

  const [rawSettlements, rawPayments] = await Promise.all([
    commitmentIds.length
      ? tenantDb
          .select()
          .from(procurementSettlements)
          .where(inArray(procurementSettlements.commitmentId, commitmentIds))
      : [],
    commitmentIds.length
      ? tenantDb
          .select()
          .from(procurementPayments)
          .where(inArray(procurementPayments.commitmentId, commitmentIds))
      : [],
  ]);

  // 4. Carregar itens dos processos
  const rawProcessItems = processIds.length
    ? await tenantDb
        .select({
          item: purchaseProcessItems,
          catalogItem: { name: catalogItems.name, unit: catalogItems.unit },
          material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure },
        })
        .from(purchaseProcessItems)
        .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId))
        .leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
        .where(inArray(purchaseProcessItems.purchaseProcessId, processIds))
    : [];

  // 5. Carregar recebimentos / entregas de materiais
  const rawReceipts = contractIds.length
    ? await tenantDb
        .select()
        .from(purchaseReceipts)
        .where(inArray(purchaseReceipts.contractId, contractIds))
    : [];

  const receiptIds = rawReceipts.map((r) => r.id);
  const rawReceiptItems = receiptIds.length
    ? await tenantDb
        .select()
        .from(purchaseReceiptItems)
        .where(inArray(purchaseReceiptItems.purchaseReceiptId, receiptIds))
    : [];

  // 6. Carregar gestores e fiscais
  const employeeIds = Array.from(
    new Set(
      rawContracts
        .flatMap((c) => [c.contract.managerId, c.contract.inspectorId])
        .filter((id): id is string => Boolean(id))
    )
  );
  const employeeRows = employeeIds.length
    ? await tenantDb.select().from(employees).where(inArray(employees.id, employeeIds))
    : [];
  const employeeMap = new Map(employeeRows.map((e) => [e.id, e.name]));

  // 7. Carregar impactos financeiros solicitados (catálogo auxiliar impactos-aditamentos)
  const impactParameters = await tenantDb
    .select()
    .from(instanceParameters)
    .where(like(instanceParameters.chave, "COMPRAS_CADASTRO:impactos-aditamentos:%"));

  const financialImpactsList = impactParameters.map((param) => {
    try {
      const data = JSON.parse(param.valor as string);
      return {
        id: param.chave.replace("COMPRAS_CADASTRO:impactos-aditamentos:", ""),
        contratoId: data.contratoId || data.fields?.contratoId || "",
        tipo: data.tipo || data.fields?.tipo || "Aditamento de Valor",
        valor: Number(data.valor || data.fields?.valor || 0),
        justificativa: data.justificativa || data.fields?.justificativa || "Sem justificativa",
        data: data.data || param.updatedAt.toISOString().slice(0, 10),
      };
    } catch {
      return null;
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null && Boolean(x.contratoId));

  // 8. Lista de fornecedores para filtro de múltipla seleção (16.22)
  const allSuppliersRaw = await tenantDb
    .select({
      id: suppliers.id,
      company: companies,
      person: people,
    })
    .from(suppliers)
    .leftJoin(companies, eq(companies.id, suppliers.companyId))
    .leftJoin(people, eq(people.id, suppliers.personId));

  const allSuppliers = allSuppliersRaw.map((s) => ({
    id: s.id,
    name:
      s.company?.corporateName ||
      s.company?.tradeName ||
      s.person?.fullName ||
      `Fornecedor ${s.id.slice(0, 8)}`,
  }));

  // 9. Consolidar os dados de cada contrato
  const now = new Date();
  const rows: RelatorioContratoRow[] = rawContracts.map((row) => {
    const c = row.contract;
    const isPj = Boolean(row.company);
    const supplierName =
      row.company?.corporateName || row.person?.fullName || "Fornecedor não identificado";
    const supplierDocument = row.company?.cnpj
      ? formatCnpj(row.company.cnpj)
      : row.person?.cpf
        ? formatCpf(row.person.cpf)
        : "—";

    const contractAmendmentsList = rawAmendments.filter((a) => a.contractId === c.id);
    const contractCommitments = rawCommitments.filter((cm) => cm.contractId === c.id);
    const contractCommitmentIds = new Set(contractCommitments.map((cm) => cm.id));

    const contractSettlements = rawSettlements.filter((s) => contractCommitmentIds.has(s.commitmentId));
    const contractPayments = rawPayments.filter((p) => contractCommitmentIds.has(p.commitmentId));

    const initialVal = c.initialValue || 0;
    const updatedVal = c.updatedValue || initialVal;

    const committedVal = contractCommitments.reduce((sum, item) => sum + (item.value || 0), 0);
    const settledVal = contractSettlements.reduce((sum, item) => sum + (item.value || 0), 0);
    const paidVal = contractPayments.reduce((sum, item) => sum + (item.value || 0), 0);

    const balanceToCommit = Math.max(0, updatedVal - committedVal);
    const balanceToPay = Math.max(0, committedVal - paidVal);
    const generalBalance = Math.max(0, updatedVal - paidVal);

    const executionPercent = updatedVal > 0 ? Math.min(100, Math.round((paidVal / updatedVal) * 100)) : 0;

    const endDate = new Date(c.endDate);
    const msDiff = endDate.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

    let expiryCategory: "vencido" | "urgente_30" | "atencao_60" | "confortavel" = "confortavel";
    if (daysUntilExpiry < 0 || c.status === "Encerrado" || c.status === "Rescindido") {
      expiryCategory = "vencido";
    } else if (daysUntilExpiry <= 30) {
      expiryCategory = "urgente_30";
    } else if (daysUntilExpiry <= 60) {
      expiryCategory = "atencao_60";
    }

    // Itens do processo e saldo restante de itens (16.19, 16.24, 16.25)
    const procItems = rawProcessItems.filter((it) => it.item.purchaseProcessId === c.processId);
    const contractReceiptsList = rawReceipts.filter((r) => r.contractId === c.id);
    const contractReceiptIds = new Set(contractReceiptsList.map((r) => r.id));
    const contractReceiptItemsList = rawReceiptItems.filter((ri) =>
      contractReceiptIds.has(ri.purchaseReceiptId)
    );

    const itemsMapped = procItems.map((pItem) => {
      const descName =
        pItem.item.customName ||
        pItem.catalogItem?.name ||
        pItem.material?.name ||
        `Item ${pItem.item.id.slice(0, 8)}`;
      const unit = pItem.catalogItem?.unit || pItem.material?.unitOfMeasure || "UN";
      const unitPrice = pItem.item.estimatedUnitValue || 0;
      const quantityContracted = pItem.item.quantity || 0;

      // Soma das quantidades já recebidas para este material
      const receivedQty = contractReceiptItemsList
        .filter((ri) => ri.materialId === pItem.item.materialId)
        .reduce((sum, ri) => sum + (ri.quantity || 0), 0);

      const quantityRemaining = Math.max(0, quantityContracted - receivedQty);
      const totalContracted = quantityContracted * unitPrice;
      const totalReceived = receivedQty * unitPrice;
      const totalRemaining = quantityRemaining * unitPrice;

      return {
        id: pItem.item.id,
        description: descName,
        quantityContracted,
        quantityReceived: receivedQty,
        quantityRemaining,
        unit,
        unitPrice,
        totalContracted,
        totalReceived,
        totalRemaining,
      };
    });

    const contractFinancialImpacts = financialImpactsList
      .filter((fi) => fi.contratoId === c.id)
      .map((fi) => ({
        id: fi.id,
        tipo: fi.tipo,
        valor: fi.valor,
        justificativa: fi.justificativa,
        data: fi.data,
      }));

    const processYear =
      row.processCreatedAt?.getFullYear().toString() ||
      new Date(c.startDate).getFullYear().toString();

    return {
      id: c.id,
      number: c.number,
      processNumber: row.processNumber,
      processModality: row.processModality || "Dispensa / Inexigibilidade",
      processYear,
      supplierId: c.supplierId,
      supplierName,
      supplierDocument,
      object: c.object,
      secretariatName: row.secretariatName,
      sourceBudgetUnitCode: row.budgetUnitCode || "01.01",
      sourceBudgetUnitName: row.budgetUnitName || "Gabinete do Executivo",
      resourceSourceCode: row.budgetUnitCode ? `FR-${row.budgetUnitCode}` : "1.500.0000",
      resourceSourceName: "Recursos Ordinários / Próprios do Município",
      startDate: c.startDate.toISOString(),
      endDate: c.endDate.toISOString(),
      signatureDate: c.startDate.toISOString(),
      termDays: calculateInclusiveContractTermDays(c.startDate, c.endDate),
      initialValue: initialVal,
      updatedValue: updatedVal,
      committedValue: committedVal,
      settledValue: settledVal,
      paidValue: paidVal,
      balanceToCommit,
      balanceToPay,
      generalBalance,
      status: c.status,
      managerName: c.managerId ? employeeMap.get(c.managerId) || "Designado" : "Não informado",
      inspectorName: c.inspectorId ? employeeMap.get(c.inspectorId) || "Designado" : "Não informado",
      instrumentType: "Contrato Administrativo",
      executionPercent,
      hasAmendments: contractAmendmentsList.length > 0,
      amendments: contractAmendmentsList.map((a) => ({
        id: a.id,
        type: a.type,
        justification: a.justification,
        previousValue: a.previousValue,
        newValue: a.newValue,
        previousEndDate: a.previousEndDate ? a.previousEndDate.toISOString() : null,
        newEndDate: a.newEndDate ? a.newEndDate.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      })),
      financialImpacts: contractFinancialImpacts,
      items: itemsMapped,
      daysUntilExpiry,
      expiryCategory,
    };
  });

  return (
    <ContratosRelatoriosClient
      contracts={rows}
      allSuppliers={allSuppliers}
      initialTab={initialTab}
    />
  );
}
