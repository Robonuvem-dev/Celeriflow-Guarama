import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { ingestStockValuationDocumentAction, reconcileStockValuationAction } from "./actions";

export default async function StockValuationPage({ searchParams }: { searchParams: Promise<{ yearId?: string; unitId?: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  await getTenantContextForModule("FINANCEIRO");
  await getTenantContextForModule("DOCUMENTOS");
  const { prisma, user } = context;
  const units = await prisma.planningEntityUnit.findMany({ where: isSystemAdministrator(user) ? {} : { budgetUnitId: { in: user.allowedBudgetUnitIds } }, include: { budgetUnit: true, governmentEntity: true } });
  const query = await searchParams;
  const unit = units.find(row => row.budgetUnitId === query.unitId) ?? units[0];
  if (!unit) return <p className="p-6">Valorização exige UG explicitamente vinculada à entidade.</p>;
  const years = await prisma.financialYear.findMany({ where: { governmentEntityId: unit.governmentEntityId }, orderBy: { year: "desc" } });
  const year = years.find(row => row.id === query.yearId) ?? years[0];
  if (!year) return <p className="p-6">Cadastre o exercício da entidade.</p>;
  const [stocks, accounts, documents, documentClasses] = await Promise.all([
    prisma.materialStock.findMany({ where: { warehouse: { costCenter: { governmentEntityId: unit.governmentEntityId, secretariatId: unit.budgetUnit.secretariatId } }, OR: [{ valuation: { is: null } }, { valuation: { budgetUnitId: unit.budgetUnitId } }] }, include: { material: true, warehouse: true, valuation: { include: { events: { orderBy: { sequence: "desc" }, take: 10 } } } }, orderBy: { id: "asc" }, take: 250 }),
    prisma.accountingPlan.findMany({ orderBy: { code: "asc" } }),
    prisma.documentVersion.findMany({ where: { status: { in: ["FINAL", "SIGNED"] }, document: { documentType: `ESTOQUE:${unit.governmentEntityId}:${unit.budgetUnitId}`, status: "Válido", personId: null, companyId: null } }, include: { document: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.documentClass.findMany({ where: { isActive: true, OR: [{ code: { startsWith: "PATRIMONIO" } }, { code: { startsWith: "ALMOXARIFADO" } }, { code: { startsWith: "ESTOQUE" } }] }, orderBy: { code: "asc" } }),
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
