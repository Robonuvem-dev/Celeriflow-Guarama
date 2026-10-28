import { asc, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { directContractings, purchaseProcesses, biddings } from "@/db/schema/procurement-core";
import { companies, suppliers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type DirectContractingSupplier = Row<typeof suppliers> & { company: Row<typeof companies> | null; person: { fullName: string } | null };
type DirectContractingDetail = Row<typeof directContractings> & { process: Row<typeof purchaseProcesses>; supplier: DirectContractingSupplier };
type DirectContractingOptions = { processos: Row<typeof purchaseProcesses>[]; fornecedores: DirectContractingSupplier[] };
type CompetitionRows = {
  biddings: (Row<typeof biddings> & { process: Pick<Row<typeof purchaseProcesses>, "number" | "object"> })[];
  directContractings: (Row<typeof directContractings> & { process: Pick<Row<typeof purchaseProcesses>, "number" | "object"> })[];
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
    db.select({ bidding: biddings, process: { number: purchaseProcesses.number, object: purchaseProcesses.object } }).from(biddings).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId)).orderBy(desc(biddings.createdAt)),
    db.select({ contracting: directContractings, process: { number: purchaseProcesses.number, object: purchaseProcesses.object } }).from(directContractings).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, directContractings.processId)).orderBy(desc(directContractings.createdAt)),
  ]);
  return { biddings: biddingRows.map(row => ({ ...row.bidding, process: row.process })), directContractings: directRows.map(row => ({ ...row.contracting, process: row.process })) };
}
