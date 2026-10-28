import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { ingestStockValuationDocumentAction, reconcileStockValuationAction } from "./actions";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { materials, materialStocks, materialStockValuations, materialStockValuationEvents, warehouses } from "@/db/schema/assets-stock";
import { costCenters } from "@/db/schema/master-data";
import { documents as documentTable } from "@/db/schema/registry";
import { documentClasses as documentClassTable, documentVersions } from "@/db/schema/document-workflow";

export default async function StockValuationPage({ searchParams }: { searchParams: Promise<{ yearId?: string; unitId?: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  await getTenantContextForModule("FINANCEIRO");
  await getTenantContextForModule("DOCUMENTOS");
   const { user } = context;
   const units = (await db.execute<{ budgetUnitId: string; governmentEntityId: string; budgetUnit: { name: string; secretariatId: string | null }; governmentEntity: { name: string } }>(sql`SELECT p."budgetUnitId", p."governmentEntityId", json_build_object('name',u.name,'secretariatId',u."secretariatId") AS "budgetUnit", json_build_object('name',g.name) AS "governmentEntity" FROM "PlanningEntityUnit" p JOIN "BudgetUnit" u ON u.id=p."budgetUnitId" JOIN "GovernmentEntity" g ON g.id=p."governmentEntityId" WHERE ${isSystemAdministrator(user) ? sql`true` : inArray(sql`p."budgetUnitId"`, user.allowedBudgetUnitIds)}`)).rows;
  const query = await searchParams;
  const unit = units.find(row => row.budgetUnitId === query.unitId) ?? units[0];
  if (!unit) return <p className="p-6">Valorização exige UG explicitamente vinculada à entidade.</p>;
   const years = (await db.execute<{ id: string; year: number }>(sql`SELECT id, year FROM "FinancialYear" WHERE "governmentEntityId"=${unit.governmentEntityId} ORDER BY year DESC`)).rows;
  const year = years.find(row => row.id === query.yearId) ?? years[0];
  if (!year) return <p className="p-6">Cadastre o exercício da entidade.</p>;
  const [stocks, accounts, documents, documentClasses] = await Promise.all([
     db.select({ stock: materialStocks, material: { code: materials.code, name: materials.name }, warehouse: { name: warehouses.name }, valuation: materialStockValuations }).from(materialStocks)
       .innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).innerJoin(costCenters, eq(costCenters.id, warehouses.costCenterId))
       .leftJoin(materialStockValuations, eq(materialStockValuations.stockId, materialStocks.id))
       .where(and(eq(costCenters.governmentEntityId, unit.governmentEntityId), unit.budgetUnit.secretariatId ? eq(costCenters.secretariatId, unit.budgetUnit.secretariatId) : isNull(costCenters.secretariatId), or(isNull(materialStockValuations.id), eq(materialStockValuations.budgetUnitId, unit.budgetUnitId))))
       .orderBy(asc(materialStocks.id)).limit(250).then(async rows => {
         const ids = rows.flatMap(row => row.valuation ? [row.valuation.id] : []);
         const events = ids.length ? await db.select().from(materialStockValuationEvents).where(and(inArray(materialStockValuationEvents.valuationId, ids), sql`(SELECT count(*) FROM "MaterialStockValuationEvent" later WHERE later."valuationId"=${materialStockValuationEvents.valuationId} AND later.sequence>${materialStockValuationEvents.sequence})<10`)).orderBy(desc(materialStockValuationEvents.sequence)) : [];
         return rows.map(row => ({ ...row.stock, material: row.material, warehouse: row.warehouse, valuation: row.valuation ? { ...row.valuation, events: events.filter(event => event.valuationId === row.valuation!.id) } : null }));
       }),
     db.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "AccountingPlan" ORDER BY code ASC`).then(result => result.rows),
     db.select({ version: { id: documentVersions.id, versionNumber: documentVersions.versionNumber }, document: { title: documentTable.title } }).from(documentVersions).innerJoin(documentTable, eq(documentTable.id, documentVersions.documentId))
       .where(and(inArray(documentVersions.status, ["FINAL", "SIGNED"]), eq(documentTable.documentType, `ESTOQUE:${unit.governmentEntityId}:${unit.budgetUnitId}`), eq(documentTable.status, "Válido"), isNull(documentTable.personId), isNull(documentTable.companyId)))
       .orderBy(desc(documentVersions.createdAt)).limit(100).then(rows => rows.map(row => ({ ...row.version, document: row.document }))),
     db.select({ id: documentClassTable.id, code: documentClassTable.code, label: documentClassTable.label }).from(documentClassTable).where(and(eq(documentClassTable.isActive, true), or(sql`starts_with(${documentClassTable.code},'PATRIMONIO')`, sql`starts_with(${documentClassTable.code},'ALMOXARIFADO')`, sql`starts_with(${documentClassTable.code},'ESTOQUE')`))).orderBy(asc(documentClassTable.code)),
  ]);
  const field = "rounded border p-2";
  return <main className="space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Valorização do estoque</h1>
    <p>Custo médio móvel por posição/material/lote. A abertura preserva o saldo físico e exige memória GED do ente/UG. Transferências conservam o valor de origem; consumo contábil exige liquidação que tenha reconhecido o ativo.</p>
    <form className="flex gap-3"><select name="unitId" defaultValue={unit.budgetUnitId} className={field}>{units.map(row => <option key={row.budgetUnitId} value={row.budgetUnitId}>{row.governmentEntity.name} · {row.budgetUnit.name}</option>)}</select><select name="yearId" defaultValue={year.id} className={field}>{years.map(row => <option key={row.id} value={row.id}>{row.year}</option>)}</select><button className={field}>Consultar</button></form>
    <p className="text-sm">Até 250 posições do recorte selecionado. Tipo GED da conciliação: <code>{`ESTOQUE:${unit.governmentEntityId}:${unit.budgetUnitId}`}</code>.</p>
    <details className="rounded border p-4"><summary>Arquivar memória de conciliação no GED</summary><form action={ingestStockValuationDocumentAction} className="grid gap-3 pt-3 md:grid-cols-2"><input type="hidden" name="financialYearId" value={year.id} /><input type="hidden" name="budgetUnitId" value={unit.budgetUnitId} /><label>Título<input name="title" className={`${field} block w-full`} required minLength={5} maxLength={200} /></label><label>Classe documental<select name="documentClassCode" className={`${field} block w-full`} required><option value="">Selecione classe ativa de estoque/patrimônio</option>{documentClasses.map(documentClass => <option key={documentClass.id} value={documentClass.code}>{documentClass.code} · {documentClass.label}</option>)}</select></label><label>Arquivo da memória<input type="file" name="file" className={`${field} block w-full`} required /></label><button className={field}>Arquivar versão e hash</button></form></details>
    {stocks.map(stock => <section key={stock.id} className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">{stock.material.code} · {stock.material.name} — {stock.warehouse.name} — lote {stock.batchNumber || "sem lote"}</h2>
      {stock.valuation ? <>
        <p>Saldo conciliado: {stock.valuation.quantity.toFixed(6)} · R$ {stock.valuation.amount.toFixed(2)}</p>
        <p className="break-all text-sm">Memória inicial SHA-256: {stock.valuation.openingHash}</p>
        <table className="w-full text-sm"><thead><tr><th>Data/movimento</th><th>Quantidade</th><th>Valor</th><th>Saldo</th></tr></thead><tbody>{stock.valuation.events.map(event => <tr key={event.id}><td>{event.createdAt.toISOString().slice(0, 10)} · {event.movementId}</td><td>{event.quantityDelta.toFixed(6)}</td><td>{event.amountDelta.toFixed(2)}</td><td>{event.amountAfter.toFixed(2)}</td></tr>)}</tbody></table>
      </> : <form action={reconcileStockValuationAction} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="stockId" value={stock.id} /><input type="hidden" name="financialYearId" value={year.id} /><input type="hidden" name="budgetUnitId" value={unit.budgetUnitId} />
        <label>Quantidade física conciliada<input className={`${field} block w-full`} name="quantity" defaultValue={String(stock.quantity)} required /></label>
        <label>Valor total conciliado (R$)<input className={`${field} block w-full`} name="amount" inputMode="decimal" placeholder="0.00" required /></label>
        <label>Conta do ativo de estoque<select className={`${field} block w-full`} name="inventoryAccountId" required><option value="">Selecione</option>{accounts.filter(account => /^115/.test(account.code.replace(/\D/g, ""))).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label>Conta de VPD do consumo<select className={`${field} block w-full`} name="consumptionAccountId" required><option value="">Selecione</option>{accounts.filter(account => /^331/.test(account.code.replace(/\D/g, ""))).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label>Versão GED da conciliação<select className={`${field} block w-full`} name="documentVersionId" required><option value="">Selecione</option>{documents.map(document => <option key={document.id} value={document.id}>{document.document.title} · versão {document.versionNumber}</option>)}</select></label>
        <label>Fundamento<textarea className={`${field} block w-full`} name="reason" minLength={10} maxLength={4000} required /></label>
        <button className={field}>Registrar abertura conciliada</button>
      </form>}
    </section>)}
  </main>;
}
