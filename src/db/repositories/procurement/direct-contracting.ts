import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { directContractings, purchaseProcesses, biddings, biddingParticipants, biddingResults, purchaseProcessItems } from "@/db/schema/procurement-core";
import { companies, suppliers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type DirectContractingSupplier = Row<typeof suppliers> & { company: Row<typeof companies> | null; person: { fullName: string } | null };
type DirectContractingDetail = Row<typeof directContractings> & { process: Row<typeof purchaseProcesses>; supplier: DirectContractingSupplier };
type DirectContractingOptions = { processos: Row<typeof purchaseProcesses>[]; fornecedores: DirectContractingSupplier[] };

export type CompetitionBiddingRow = Row<typeof biddings> & {
  process: Pick<Row<typeof purchaseProcesses>, "id" | "number" | "object">;
  suppliers: { id: string; name: string }[];
  materials: string[];
  hasWon: boolean;
};

export type CompetitionDirectRow = Row<typeof directContractings> & {
  process: Pick<Row<typeof purchaseProcesses>, "id" | "number" | "object">;
  suppliers: { id: string; name: string }[];
  materials: string[];
  hasWon: boolean;
};

type CompetitionRows = {
  biddings: CompetitionBiddingRow[];
  directContractings: CompetitionDirectRow[];
};
const supplierSelection = { supplier: suppliers, company: companies, person: { fullName: people.fullName } };

export async function loadDirectContracting(db: DatabaseExecutor, id: string): Promise<DirectContractingDetail | null> {
  const [row] = await db.select({ contracting: directContractings, process: purchaseProcesses, ...supplierSelection }).from(directContractings)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, directContractings.processId)).innerJoin(suppliers, eq(suppliers.id, directContractings.supplierId))
    .leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).where(eq(directContractings.id, id)).limit(1);
  return row ? { ...row.contracting, process: row.process, supplier: { ...row.supplier, company: row.company, person: row.person } } : null;
}

export async function loadDirectContractingOptions(db: DatabaseExecutor): Promise<DirectContractingOptions> {
  const [processos, rows] = await Promise.all([
    db.select().from(purchaseProcesses).orderBy(desc(purchaseProcesses.number)),
    db.select(supplierSelection).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).orderBy(asc(companies.corporateName)),
  ]);
  return { processos, fornecedores: rows.map(row => ({ ...row.supplier, company: row.company, person: row.person })) };
}

export async function loadProcurementCompetitionRows(db: DatabaseExecutor): Promise<CompetitionRows> {
  const [biddingRows, directRows] = await Promise.all([
    db.select({ bidding: biddings, process: { id: purchaseProcesses.id, number: purchaseProcesses.number, object: purchaseProcesses.object } })
      .from(biddings)
      .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId))
      .orderBy(desc(biddings.createdAt)),
    db.select({ contracting: directContractings, process: { id: purchaseProcesses.id, number: purchaseProcesses.number, object: purchaseProcesses.object } })
      .from(directContractings)
      .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, directContractings.processId))
      .orderBy(desc(directContractings.createdAt)),
  ]);

  const allProcessIds = [...new Set([...biddingRows.map(r => r.process.id), ...directRows.map(r => r.process.id)])];
  const allBiddingIds = biddingRows.map(r => r.bidding.id);
  const directSupplierIds = directRows.map(r => r.contracting.supplierId).filter(Boolean) as string[];

  const [items, biddingSups, directSups, winners] = await Promise.all([
    allProcessIds.length
      ? db.select({
          processId: purchaseProcessItems.purchaseProcessId,
          name: sql<string>`COALESCE(${catalogItems.name}, ${materials.name}, ${purchaseProcessItems.customName})`,
        })
        .from(purchaseProcessItems)
        .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId))
        .leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
        .where(inArray(purchaseProcessItems.purchaseProcessId, allProcessIds))
      : [],
    allBiddingIds.length
      ? db.select({
          biddingId: biddingParticipants.biddingId,
          supplierId: suppliers.id,
          supplierName: sql<string>`COALESCE(${companies.corporateName}, ${companies.tradeName}, ${people.fullName})`,
        })
        .from(biddingParticipants)
        .innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId))
        .leftJoin(companies, eq(companies.id, suppliers.companyId))
        .leftJoin(people, eq(people.id, suppliers.personId))
        .where(inArray(biddingParticipants.biddingId, allBiddingIds))
      : [],
    directSupplierIds.length
      ? db.select({
          supplierId: suppliers.id,
          supplierName: sql<string>`COALESCE(${companies.corporateName}, ${companies.tradeName}, ${people.fullName})`,
        })
        .from(suppliers)
        .leftJoin(companies, eq(companies.id, suppliers.companyId))
        .leftJoin(people, eq(people.id, suppliers.personId))
        .where(inArray(suppliers.id, directSupplierIds))
      : [],
    allBiddingIds.length
      ? db.select({
          biddingId: biddingParticipants.biddingId,
          status: biddingResults.status,
        })
        .from(biddingResults)
        .innerJoin(biddingParticipants, eq(biddingParticipants.id, biddingResults.participantId))
        .where(and(inArray(biddingParticipants.biddingId, allBiddingIds), eq(biddingResults.isCurrent, true)))
      : [],
  ]);

  const biddingsResult: CompetitionBiddingRow[] = biddingRows.map(row => {
    const processItems = items.filter(item => item.processId === row.process.id && item.name).map(item => item.name);
    const rowSuppliers = biddingSups.filter(s => s.biddingId === row.bidding.id && s.supplierName).map(s => ({ id: s.supplierId, name: s.supplierName }));
    const hasWon = winners.some(w => w.biddingId === row.bidding.id && (w.status === "Homologado" || w.status === "Arrematado" || w.status === "Adjudicado")) || row.bidding.status === "Homologada" || row.bidding.status === "Adjudicada" || row.bidding.status === "Concluída";

    return {
      ...row.bidding,
      process: row.process,
      materials: [...new Set(processItems)],
      suppliers: rowSuppliers,
      hasWon,
    };
  });

  const directResult: CompetitionDirectRow[] = directRows.map(row => {
    const processItems = items.filter(item => item.processId === row.process.id && item.name).map(item => item.name);
    const sup = directSups.find(s => s.supplierId === row.contracting.supplierId);
    const rowSuppliers = sup ? [{ id: sup.supplierId, name: sup.supplierName }] : [];
    const hasWon = row.contracting.status === "Concluída" || row.contracting.status === "Publicada";

    return {
      ...row.contracting,
      process: row.process,
      materials: [...new Set(processItems)],
      suppliers: rowSuppliers,
      hasWon,
    };
  });

  return { biddings: biddingsResult, directContractings: directResult };
}
