import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles, secretariats } from "@/db/schema/administration";
import { materials } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";
import { catalogItems } from "@/db/schema/master-data";
import { people } from "@/db/schema/people";
import { companies, documents, suppliers } from "@/db/schema/registry";
import { procurementUnits } from "@/db/schema/procurement-budget";
import { procurementContracts, contractAmendments, purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { procurementCommitments, procurementCommitmentMovements, procurementSettlements, procurementPayments } from "@/db/schema/procurement-finance";
import { procurementCovenants, instrumentResponsibilityGroups, instrumentParties, instrumentMeasurements, instrumentMeasurementItems, instrumentInstallments, procurementLegalRepresentatives } from "@/db/schema/procurement-instruments";
import { procurementLifecycleEvents, purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";

type Reference = { kind: "CONTRACT" | "COVENANT"; id: string };
type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type Supplier = Row<typeof suppliers> & { company: Row<typeof companies> | null; person: Row<typeof people> | null };
type ProcessItem = Row<typeof purchaseProcessItems> & { catalogItem: Pick<Row<typeof catalogItems>, "name" | "unit"> | null; material: Pick<Row<typeof materials>, "name" | "unitOfMeasure"> | null };
type Representation = Row<typeof procurementLegalRepresentatives> & { representative: { fullName: string } };
export type InstrumentExecution = {
  responsibilityGroups: (Row<typeof instrumentResponsibilityGroups> & { _count: { members: number } })[];
  instrumentParties: (Row<typeof instrumentParties> & { person: Row<typeof people> | null; company: Row<typeof companies> | null; employee: Row<typeof employees> | null; supplier: Supplier | null; responsibilityGroup: Row<typeof instrumentResponsibilityGroups> | null })[];
  measurements: (Row<typeof instrumentMeasurements> & {
    document: { id: string; title: string } | null;
    items: (Row<typeof instrumentMeasurementItems> & { purchaseProcessItem: ProcessItem | null; purchaseReceiptItem: { id: string; purchaseReceipt: { number: string } } | null })[];
  })[];
  installments: (Row<typeof instrumentInstallments> & { payment: Row<typeof procurementPayments> | null })[];
  commitments: (Row<typeof procurementCommitments> & { movements: Row<typeof procurementCommitmentMovements>[]; settlements: Row<typeof procurementSettlements>[]; payments: Row<typeof procurementPayments>[] })[];
};
export type ContractDetail = Row<typeof procurementContracts> & InstrumentExecution & {
  process: Row<typeof purchaseProcesses> & { items: ProcessItem[] };
  supplier: Row<typeof suppliers> & { company: (Row<typeof companies> & { representatives: Representation[] }) | null; person: (Row<typeof people> & { legalRepresentations: Representation[] }) | null };
  secretariat: Row<typeof secretariats>; sourceBudgetUnit: Row<typeof procurementUnits> | null;
  manager: Row<typeof employees> | null; inspector: Row<typeof employees> | null;
  amendments: Row<typeof contractAmendments>[];
  receipts: (Row<typeof purchaseReceipts> & { items: (Row<typeof purchaseReceiptItems> & { material: { name: string; unitOfMeasure: string } })[] })[];
};
type ContractListEntry = Row<typeof procurementContracts> & { supplier: Supplier; secretariat: { name: string }; sourceBudgetUnit: { code: string; name: string } | null; _count: { amendments: number } };
type CovenantListEntry = Row<typeof procurementCovenants> & { _count: { instrumentParties: number; measurements: number; installments: number } };
type InstrumentEvent = Row<typeof procurementLifecycleEvents> & { actorUsuario: { nome: string } };
type ContractOptions = { processos: (Row<typeof purchaseProcesses> & { items: { quantity: number; purchaseProcessId: string }[] })[]; secretarias: Row<typeof secretariats>[]; unidadesGestoras: Row<typeof procurementUnits>[]; fornecedores: Supplier[] };
type InstrumentSelectors = {
  events: InstrumentEvent[];
  employees: { id: string; name: string; registration: string | null; role: { name: string } | null }[];
  suppliers: Supplier[]; people: { id: string; fullName: string }[];
  companies: { id: string; corporateName: string; tradeName: string | null }[]; documents: { id: string; title: string }[];
};
const supplierSelection = { supplier: suppliers, company: companies, person: people };

export async function loadContractHeader(db: DatabaseExecutor, id: string): Promise<typeof procurementContracts.$inferSelect | null> {
  return (await db.select().from(procurementContracts).where(eq(procurementContracts.id, id)).limit(1))[0] ?? null;
}

export async function loadCovenantHeader(db: DatabaseExecutor, id: string): Promise<typeof procurementCovenants.$inferSelect | null> {
  return (await db.select().from(procurementCovenants).where(eq(procurementCovenants.id, id)).limit(1))[0] ?? null;
}

export async function listProcurementContracts(db: DatabaseExecutor): Promise<ContractListEntry[]> {
  const rows = await db.select({ contract: procurementContracts, ...supplierSelection, secretariat: { name: secretariats.name }, sourceBudgetUnit: { code: procurementUnits.code, name: procurementUnits.name }, amendmentCount: sql<number>`(SELECT count(*)::integer FROM "ContractAmendment" a WHERE a."contractId" = ${procurementContracts.id})` }).from(procurementContracts)
    .innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .innerJoin(secretariats, eq(secretariats.id, procurementContracts.secretariatId)).leftJoin(procurementUnits, eq(procurementUnits.id, procurementContracts.sourceBudgetUnitId)).orderBy(desc(procurementContracts.createdAt));
  return rows.map(row => ({ ...row.contract, supplier: { ...row.supplier, company: row.company, person: row.person }, secretariat: row.secretariat, sourceBudgetUnit: row.sourceBudgetUnit, _count: { amendments: row.amendmentCount } }));
}

export async function listProcurementCovenants(db: DatabaseExecutor): Promise<CovenantListEntry[]> {
  const rows = await db.select({ covenant: procurementCovenants,
    partyCount: sql<number>`(SELECT count(*)::integer FROM "InstrumentParty" p WHERE p."covenantId" = ${procurementCovenants.id})`,
    measurementCount: sql<number>`(SELECT count(*)::integer FROM "InstrumentMeasurement" m WHERE m."covenantId" = ${procurementCovenants.id})`,
    installmentCount: sql<number>`(SELECT count(*)::integer FROM "InstrumentInstallment" i WHERE i."covenantId" = ${procurementCovenants.id})`,
  }).from(procurementCovenants).orderBy(desc(procurementCovenants.createdAt));
  return rows.map(row => ({ ...row.covenant, _count: { instrumentParties: row.partyCount, measurements: row.measurementCount, installments: row.installmentCount } }));
}

export async function loadContractOptions(db: DatabaseExecutor): Promise<ContractOptions> {
  const [processes, items, secretarias, unidadesGestoras, supplierRows] = await Promise.all([
    db.select().from(purchaseProcesses).orderBy(desc(purchaseProcesses.number)),
    db.select({ purchaseProcessId: purchaseProcessItems.purchaseProcessId, quantity: purchaseProcessItems.quantity }).from(purchaseProcessItems),
    db.select().from(secretariats).orderBy(asc(secretariats.name)), db.select().from(procurementUnits).orderBy(asc(procurementUnits.code)),
    db.select(supplierSelection).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).orderBy(desc(suppliers.createdAt)),
  ]);
  return { processos: processes.map(process => ({ ...process, items: items.filter(item => item.purchaseProcessId === process.id) })), secretarias, unidadesGestoras, fornecedores: supplierRows.map(row => ({ ...row.supplier, company: row.company, person: row.person })) };
}

export async function loadInstrumentEvents(db: DatabaseExecutor, reference: Reference): Promise<InstrumentEvent[]> {
  const rows = await db.select({ event: procurementLifecycleEvents, actorUsuario: { nome: users.nome } }).from(procurementLifecycleEvents).innerJoin(users, eq(users.id, procurementLifecycleEvents.actorUsuarioId))
    .where(and(eq(procurementLifecycleEvents.sourceType, reference.kind), eq(procurementLifecycleEvents.sourceId, reference.id))).orderBy(desc(procurementLifecycleEvents.createdAt)).limit(100);
  return rows.map(row => ({ ...row.event, actorUsuario: row.actorUsuario }));
}

export async function loadInstrumentSelectors(db: DatabaseExecutor, reference: Reference): Promise<InstrumentSelectors> {
  const [events, employeeRows, supplierRows, personRows, companyRows, documentRows] = await Promise.all([
    loadInstrumentEvents(db, reference),
    db.select({ id: employees.id, name: employees.name, registration: employees.registration, role: { name: roles.name } }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    db.select(supplierSelection).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).where(eq(suppliers.status, "Ativo")).orderBy(desc(suppliers.createdAt)),
    db.select({ id: people.id, fullName: people.fullName }).from(people).where(eq(people.status, "Ativo")).orderBy(asc(people.fullName)),
    db.select({ id: companies.id, corporateName: companies.corporateName, tradeName: companies.tradeName }).from(companies).where(eq(companies.status, "Ativo")).orderBy(asc(companies.corporateName)),
    db.select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.status, "Válido"), ne(documents.documentType, "Modelo"))).orderBy(desc(documents.createdAt)).limit(100),
  ]);
  return { events, employees: employeeRows, suppliers: supplierRows.map(row => ({ ...row.supplier, company: row.company, person: row.person })), people: personRows, companies: companyRows, documents: documentRows };
}

async function loadInstrumentExecution(db: DatabaseExecutor, reference: Reference): Promise<InstrumentExecution> {
  const [groups, parties, measurements, installments, commitments] = await Promise.all([
    db.select().from(instrumentResponsibilityGroups).where(reference.kind === "CONTRACT" ? eq(instrumentResponsibilityGroups.contractId, reference.id) : eq(instrumentResponsibilityGroups.covenantId, reference.id)).orderBy(asc(instrumentResponsibilityGroups.createdAt)),
    db.select({ party: instrumentParties, person: people, company: companies, employee: employees }).from(instrumentParties).leftJoin(people, eq(people.id, instrumentParties.personId)).leftJoin(companies, eq(companies.id, instrumentParties.companyId)).leftJoin(employees, eq(employees.id, instrumentParties.employeeId)).where(reference.kind === "CONTRACT" ? eq(instrumentParties.contractId, reference.id) : eq(instrumentParties.covenantId, reference.id)).orderBy(asc(instrumentParties.createdAt)),
    db.select({ measurement: instrumentMeasurements, document: { id: documents.id, title: documents.title } }).from(instrumentMeasurements).leftJoin(documents, eq(documents.id, instrumentMeasurements.documentId)).where(reference.kind === "CONTRACT" ? eq(instrumentMeasurements.contractId, reference.id) : eq(instrumentMeasurements.covenantId, reference.id)).orderBy(asc(instrumentMeasurements.number)),
    db.select({ installment: instrumentInstallments, payment: procurementPayments }).from(instrumentInstallments).leftJoin(procurementPayments, eq(procurementPayments.id, instrumentInstallments.paymentId)).where(reference.kind === "CONTRACT" ? eq(instrumentInstallments.contractId, reference.id) : eq(instrumentInstallments.covenantId, reference.id)).orderBy(asc(instrumentInstallments.number)),
    db.select().from(procurementCommitments).where(and(reference.kind === "CONTRACT" ? eq(procurementCommitments.contractId, reference.id) : eq(procurementCommitments.covenantId, reference.id), inArray(procurementCommitments.status, ["Emitido", "Liquidado", "Pago"]))),
  ]);
  const supplierIds = parties.flatMap(row => row.party.supplierId ? [row.party.supplierId] : []);
  const measurementIds = measurements.map(row => row.measurement.id);
  const commitmentIds = commitments.map(row => row.id);
  const [supplierRows, measurementItems, movements, settlements, payments] = await Promise.all([
    supplierIds.length ? db.select(supplierSelection).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).where(inArray(suppliers.id, supplierIds)) : [],
    measurementIds.length ? db.select({ item: instrumentMeasurementItems, processItem: purchaseProcessItems, catalogItem: { name: catalogItems.name, unit: catalogItems.unit }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure }, receiptItem: { id: purchaseReceiptItems.id }, receipt: { number: purchaseReceipts.number } }).from(instrumentMeasurementItems)
      .leftJoin(purchaseProcessItems, eq(purchaseProcessItems.id, instrumentMeasurementItems.purchaseProcessItemId)).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
      .leftJoin(purchaseReceiptItems, eq(purchaseReceiptItems.id, instrumentMeasurementItems.purchaseReceiptItemId)).leftJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId)).where(inArray(instrumentMeasurementItems.measurementId, measurementIds)).orderBy(asc(instrumentMeasurementItems.createdAt)) : [],
    commitmentIds.length ? db.select().from(procurementCommitmentMovements).where(inArray(procurementCommitmentMovements.commitmentId, commitmentIds)) : [],
    commitmentIds.length ? db.select().from(procurementSettlements).where(and(inArray(procurementSettlements.commitmentId, commitmentIds), eq(procurementSettlements.status, "Liquidado"))) : [],
    commitmentIds.length ? db.select().from(procurementPayments).where(and(inArray(procurementPayments.commitmentId, commitmentIds), inArray(procurementPayments.status, ["Pago", "Paga"]))) : [],
  ]);
  const supplierById = new Map(supplierRows.map(row => [row.supplier.id, { ...row.supplier, company: row.company, person: row.person }]));
  const groupById = new Map(groups.map(row => [row.id, row]));
  return {
    responsibilityGroups: groups.map(group => ({ ...group, _count: { members: parties.filter(row => row.party.responsibilityGroupId === group.id).length } })),
    instrumentParties: parties.map(row => ({ ...row.party, person: row.person, company: row.company, employee: row.employee, supplier: row.party.supplierId ? supplierById.get(row.party.supplierId) ?? null : null, responsibilityGroup: row.party.responsibilityGroupId ? groupById.get(row.party.responsibilityGroupId) ?? null : null })),
    measurements: measurements.map(row => ({ ...row.measurement, document: row.document, items: measurementItems.filter(item => item.item.measurementId === row.measurement.id).map(item => ({ ...item.item,
      purchaseProcessItem: item.processItem ? { ...item.processItem, catalogItem: item.catalogItem, material: item.material } : null,
      purchaseReceiptItem: item.receiptItem && item.receipt ? { ...item.receiptItem, purchaseReceipt: item.receipt } : null,
    })) })),
    installments: installments.map(row => ({ ...row.installment, payment: row.payment })),
    commitments: commitments.map(commitment => ({ ...commitment, movements: movements.filter(row => row.commitmentId === commitment.id), settlements: settlements.filter(row => row.commitmentId === commitment.id), payments: payments.filter(row => row.commitmentId === commitment.id) })),
  };
}

export async function loadCovenantDetail(db: DatabaseExecutor, id: string): Promise<(Row<typeof procurementCovenants> & InstrumentExecution) | null> {
  const header = await loadCovenantHeader(db, id);
  return header ? { ...header, ...await loadInstrumentExecution(db, { kind: "COVENANT", id }) } : null;
}

export async function loadContractDetail(db: DatabaseExecutor, id: string): Promise<ContractDetail | null> {
  const [row] = await db.select({ contract: procurementContracts, process: purchaseProcesses, ...supplierSelection, secretariat: secretariats, sourceBudgetUnit: procurementUnits }).from(procurementContracts)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId)).innerJoin(suppliers, eq(suppliers.id, procurementContracts.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .innerJoin(secretariats, eq(secretariats.id, procurementContracts.secretariatId)).leftJoin(procurementUnits, eq(procurementUnits.id, procurementContracts.sourceBudgetUnitId)).where(eq(procurementContracts.id, id)).limit(1);
  if (!row) return null;
  const employeeIds = [row.contract.managerId, row.contract.inspectorId].filter((value): value is string => value !== null);
  const [execution, items, amendments, responsibleEmployees, representatives, receipts] = await Promise.all([
    loadInstrumentExecution(db, { kind: "CONTRACT", id }),
    db.select({ item: purchaseProcessItems, catalogItem: { name: catalogItems.name, unit: catalogItems.unit }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(purchaseProcessItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).where(eq(purchaseProcessItems.purchaseProcessId, row.process.id)),
    db.select().from(contractAmendments).where(eq(contractAmendments.contractId, id)).orderBy(desc(contractAmendments.createdAt)),
    employeeIds.length ? db.select().from(employees).where(inArray(employees.id, employeeIds)) : [],
    row.supplier.companyId || row.supplier.personId ? db.select({ representation: procurementLegalRepresentatives, representative: { fullName: people.fullName } }).from(procurementLegalRepresentatives).innerJoin(people, eq(people.id, procurementLegalRepresentatives.representativeId)).where(and(eq(procurementLegalRepresentatives.status, "Ativo"), or(row.supplier.companyId ? eq(procurementLegalRepresentatives.representedCompanyId, row.supplier.companyId) : undefined, row.supplier.personId ? eq(procurementLegalRepresentatives.representedPersonId, row.supplier.personId) : undefined))) : [],
    db.select().from(purchaseReceipts).where(and(eq(purchaseReceipts.contractId, id), eq(purchaseReceipts.status, "APPROVED"))).orderBy(desc(purchaseReceipts.receivedAt)),
  ]);
  const receiptItems = receipts.length ? await db.select({ item: purchaseReceiptItems, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(purchaseReceiptItems).innerJoin(materials, eq(materials.id, purchaseReceiptItems.materialId)).where(inArray(purchaseReceiptItems.purchaseReceiptId, receipts.map(receipt => receipt.id))) : [];
  return { ...row.contract, ...execution,
    process: { ...row.process, items: items.map(item => ({ ...item.item, catalogItem: item.catalogItem, material: item.material })) },
    supplier: { ...row.supplier, company: row.company ? { ...row.company, representatives: representatives.filter(rep => rep.representation.representedCompanyId === row.company!.id).map(rep => ({ ...rep.representation, representative: rep.representative })) } : null,
      person: row.person ? { ...row.person, legalRepresentations: representatives.filter(rep => rep.representation.representedPersonId === row.person!.id).map(rep => ({ ...rep.representation, representative: rep.representative })) } : null },
    secretariat: row.secretariat, sourceBudgetUnit: row.sourceBudgetUnit,
    manager: responsibleEmployees.find(employee => employee.id === row.contract.managerId) ?? null, inspector: responsibleEmployees.find(employee => employee.id === row.contract.inspectorId) ?? null, amendments,
    receipts: receipts.map(receipt => ({ ...receipt, items: receiptItems.filter(item => item.item.purchaseReceiptId === receipt.id).map(item => ({ ...item.item, material: item.material })) })),
  };
}
