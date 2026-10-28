import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { companies, suppliers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { materials } from "@/db/schema/assets-stock";
import { catalogItems } from "@/db/schema/master-data";
import { priceQuotes, priceResearches, purchaseProcessItems, purchaseProcesses } from "@/db/schema/procurement-core";
import { purchaseRequests } from "@/db/schema/procurement-requests";

const supplierIdentity = {
  id: suppliers.id, status: suppliers.status,
  person: { fullName: people.fullName, email: people.email },
  // Drizzle's left-join nullification uses the first projected column as the
  // presence marker. An existing company may have no trade name.
  company: { corporateName: companies.corporateName, tradeName: companies.tradeName, emailPrimary: companies.emailPrimary },
};
type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type PriceResearchSupplier = { id: string; status: string; person: Pick<Row<typeof people>, "fullName" | "email"> | null; company: Pick<Row<typeof companies>, "tradeName" | "corporateName" | "emailPrimary"> | null };
type PriceResearchProcess = Row<typeof purchaseProcesses> & { purchaseRequest: { number: string } | null; items: (Row<typeof purchaseProcessItems> & { catalogItem: { name: string; unit: string } | null; material: { name: string; unitOfMeasure: string } | null })[] };
type PriceInvitation = Row<typeof priceQuotes> & { research: Row<typeof priceResearches>; supplier: PriceResearchSupplier };
type PriceResearchDetail = Row<typeof priceResearches> & { process: PriceResearchProcess; quotes: (Row<typeof priceQuotes> & { supplier: PriceResearchSupplier })[] };
type PriceResearchListEntry = Row<typeof priceResearches> & { process: Pick<Row<typeof purchaseProcesses>, "number" | "object"> & { purchaseRequest: { number: string } | null }; _count: { quotes: number } };
type PriceResearchProcessOption = Pick<Row<typeof purchaseProcesses>, "id" | "number" | "object"> & {
  purchaseRequest: { number: string } | null; _count: { items: number };
  items: { processId: string; customName: string | null; catalogItem: Pick<Row<typeof catalogItems>, "code" | "name"> | null }[];
};

export async function loadPriceResearchSupplier(db: DatabaseExecutor, id: string): Promise<PriceResearchSupplier | null> {
  const [supplier] = await db.select(supplierIdentity).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(suppliers.id, id)).limit(1);
  return supplier ?? null;
}

export async function listPriceResearchSuppliers(db: DatabaseExecutor): Promise<PriceResearchSupplier[]> {
  return db.select(supplierIdentity).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(suppliers.status, "Ativo")).orderBy(desc(suppliers.createdAt));
}

export async function loadPriceResearchProcess(db: DatabaseExecutor, processId: string): Promise<PriceResearchProcess | null> {
  const [row] = await db.select({ process: purchaseProcesses, purchaseRequest: { number: purchaseRequests.number } }).from(purchaseProcesses).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).where(eq(purchaseProcesses.id, processId)).limit(1);
  if (!row) return null;
  const items = await db.select({ item: purchaseProcessItems, catalogItem: { name: catalogItems.name, unit: catalogItems.unit }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(purchaseProcessItems)
    .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
    .where(eq(purchaseProcessItems.purchaseProcessId, processId)).orderBy(asc(purchaseProcessItems.createdAt));
  return { ...row.process, purchaseRequest: row.purchaseRequest, items: items.map(item => ({ ...item.item, catalogItem: item.catalogItem, material: item.material })) };
}

export async function loadPriceInvitation(db: DatabaseExecutor, input: { invitationId: string; researchId?: string; supplierId?: string }): Promise<PriceInvitation | null> {
  const [row] = await db.select({ invitation: priceQuotes, research: priceResearches, ...supplierIdentity }).from(priceQuotes)
    .innerJoin(priceResearches, eq(priceResearches.id, priceQuotes.researchId)).innerJoin(suppliers, eq(suppliers.id, priceQuotes.supplierId))
    .leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(and(eq(priceQuotes.id, input.invitationId), input.researchId ? eq(priceQuotes.researchId, input.researchId) : undefined, input.supplierId ? eq(priceQuotes.supplierId, input.supplierId) : undefined)).limit(1);
  return row ? { ...row.invitation, research: row.research, supplier: { id: row.id, status: row.status, person: row.person, company: row.company } } : null;
}

export async function loadPriceResearchDetail(db: DatabaseExecutor, id: string): Promise<PriceResearchDetail | null> {
  const [research] = await db.select().from(priceResearches).where(eq(priceResearches.id, id)).limit(1);
  if (!research) return null;
  const process = await loadPriceResearchProcess(db, research.processId);
  if (!process) throw new Error("Processo da pesquisa não encontrado.");
  const quotes = await db.select({ quote: priceQuotes, ...supplierIdentity }).from(priceQuotes).innerJoin(suppliers, eq(suppliers.id, priceQuotes.supplierId))
    .leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(eq(priceQuotes.researchId, id)).orderBy(asc(priceQuotes.createdAt));
  return { ...research, process, quotes: quotes.map(row => ({ ...row.quote, supplier: { id: row.id, status: row.status, person: row.person, company: row.company } })) };
}

export async function listPriceResearches(db: DatabaseExecutor): Promise<PriceResearchListEntry[]> {
  const rows = await db.select({ research: priceResearches, process: { number: purchaseProcesses.number, object: purchaseProcesses.object }, purchaseRequest: { number: purchaseRequests.number }, submittedCount: sql<number>`(SELECT count(*)::integer FROM "PriceQuote" q WHERE q."researchId" = ${priceResearches.id} AND q.status IN ('CONVITE_APRESENTADA', 'Ativa'))` })
    .from(priceResearches).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, priceResearches.processId)).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).orderBy(desc(priceResearches.createdAt));
  return rows.map(row => ({ ...row.research, process: { ...row.process, purchaseRequest: row.purchaseRequest }, _count: { quotes: row.submittedCount } }));
}

export async function listPriceResearchProcessOptions(db: DatabaseExecutor): Promise<PriceResearchProcessOption[]> {
  const processes = await db.select({ id: purchaseProcesses.id, number: purchaseProcesses.number, object: purchaseProcesses.object, purchaseRequest: { number: purchaseRequests.number } }).from(purchaseProcesses)
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).where(isNotNull(purchaseProcesses.purchaseRequestId)).orderBy(desc(purchaseProcesses.createdAt));
  const items = processes.length ? await db.select({ processId: purchaseProcessItems.purchaseProcessId, customName: purchaseProcessItems.customName, catalogItem: { code: catalogItems.code, name: catalogItems.name } }).from(purchaseProcessItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).where(inArray(purchaseProcessItems.purchaseProcessId, processes.map(process => process.id))) : [];
  return processes.map(process => { const lines = items.filter(item => item.processId === process.id); return { ...process, _count: { items: lines.length }, items: lines }; });
}
