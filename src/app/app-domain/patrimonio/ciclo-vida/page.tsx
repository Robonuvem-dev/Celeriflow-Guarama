import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { assets as assetTable, assetCategories, assetValueHistories, assetWriteOffs, assetValueAdjustments } from "@/db/schema/assets";
import { AssetLifecycleClient } from "./AssetLifecycleClient";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getTenantContextForModule, isSystemAdministrator, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { clampPatrimonioListPage, patrimonioListHref, parsePatrimonioListPage, PATRIMONIO_LIST_PAGE_SIZE } from "../listing";

type LifecycleView = "posicao" | "baixas" | "ajustes";
type SearchParams = { page?: string; view?: string; sourceView?: string };
const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const lifecycleHref = (view: LifecycleView, page: number) => patrimonioListHref("/patrimonio/ciclo-vida", page, { view });
function parseLifecycleView(value: string | undefined): LifecycleView { return value === "baixas" || value === "ajustes" ? value : "posicao"; }
function adjustmentLabel(type: string) { return ({ REVALUATION: "Reavaliação", IMPAIRMENT: "Impairment", SUBSEQUENT_COST: "Custo subsequente" })[type] ?? type; }

export default async function AssetLifecyclePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const { user } = await getTenantContextForModule("PATRIMONIO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const canCollect = canPerformModuleOperation(user, "FINANCEIRO", "create");
  const [budgetUnits, bankAccounts, revenueNatures, resourceSources] = await Promise.all([
    db.execute<{ id: string; code: string; name: string; secretariatId: string | null }>(sql`SELECT u.id, u.code, u.name, u."secretariatId" FROM "BudgetUnit" u WHERE EXISTS (SELECT 1 FROM "PlanningEntityUnit" p WHERE p."budgetUnitId"=u.id) AND ${allowed ? inArray(sql`u.id`, allowed) : sql`true`} ORDER BY u.code ASC`).then(result => result.rows),
    canCollect ? db.execute<{ id: string; bankName: string; accountNumber: string; budgetUnitId: string | null }>(sql`SELECT id, "bankName", "accountNumber", "budgetUnitId" FROM "BankAccount" WHERE "isActive"=true AND ${allowed ? inArray(sql`"budgetUnitId"`, allowed) : sql`true`} ORDER BY "bankName" ASC`).then(result => result.rows) : [],
    canCollect ? db.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "RevenueNature" ORDER BY code ASC`).then(result => result.rows) : [],
    canCollect ? db.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "ResourceSource" ORDER BY code ASC`).then(result => result.rows) : [],
  ]);
  const params = await searchParams;
  const view = parseLifecycleView(params?.view === "operacoes" ? params.sourceView : params?.view);
  const requestedPage = parsePatrimonioListPage(params?.page);
  const assetAccess = allowed ? or(inArray(assetTable.budgetUnitId, allowed),
    and(isNull(assetTable.budgetUnitId), sql`EXISTS (SELECT 1 FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Commitment" c ON c."purchaseReceiptId"=r.id JOIN "BudgetAppropriation" b ON b.id=c."appropriationId" WHERE i.id=${assetTable.purchaseReceiptItemId} AND ${inArray(sql`b."budgetUnitId"`, allowed)})`),
    and(isNull(assetTable.budgetUnitId), isNull(assetTable.purchaseReceiptItemId), sql`EXISTS (SELECT 1 FROM "Department" d WHERE d.id=${assetTable.departmentId} AND ${inArray(sql`d."secretariatId"`, budgetUnits.map(unit => unit.secretariatId))})`)) : undefined;
  const activeAssetWhere = notInArray(assetTable.status, ["Baixado", "Inativo"]);
  const [assetTotal, activeAssetValue, writeOffTotal, adjustmentTotal] = await Promise.all([
    view === "posicao" ? db.select({ count: count() }).from(assetTable).where(assetAccess).then(rows => rows[0].count) : Promise.resolve(0),
    view === "posicao" ? db.select({ currentValue: sum(assetTable.currentValue) }).from(assetTable).where(and(activeAssetWhere, assetAccess)).then(rows => ({ _sum: { currentValue: rows[0].currentValue === null ? null : Number(rows[0].currentValue) } })) : Promise.resolve({ _sum: { currentValue: 0 } }),
    db.select({ count: count() }).from(assetWriteOffs).innerJoin(assetTable, eq(assetTable.id, assetWriteOffs.assetId)).where(assetAccess).then(rows => rows[0].count),
    db.select({ count: count() }).from(assetValueAdjustments).innerJoin(assetTable, eq(assetTable.id, assetValueAdjustments.assetId)).where(assetAccess).then(rows => rows[0].count),
  ]);
  const total = view === "posicao" ? assetTotal : view === "baixas" ? writeOffTotal : adjustmentTotal;
  const page = clampPatrimonioListPage(requestedPage, total);
  const pageWindow = { skip: (page - 1) * PATRIMONIO_LIST_PAGE_SIZE, take: PATRIMONIO_LIST_PAGE_SIZE };
  const [assets, writeOffs, adjustments] = await Promise.all([
    view === "posicao" ? db.select({ asset: assetTable, category: { name: assetCategories.name, lifeSpan: assetCategories.lifeSpan } }).from(assetTable).innerJoin(assetCategories, eq(assetCategories.id, assetTable.categoryId))
      .where(assetAccess).orderBy(asc(assetTable.patrimonyNumber)).offset(pageWindow.skip).limit(pageWindow.take)
      .then(async rows => {
        const history = rows.length ? await db.select({ history: assetValueHistories, reversalId: sql<string | null>`(SELECT r.id FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueHistories.accountingTransactionId})` }).from(assetValueHistories)
          .where(and(inArray(assetValueHistories.assetId, rows.map(row => row.asset.id)), sql`${assetValueHistories.referenceMonth}=(SELECT max(h."referenceMonth") FROM "AssetValueHistory" h WHERE h."assetId"=${assetValueHistories.assetId})`)) : [];
        return rows.map(row => ({ ...row.asset, category: row.category, valueHistory: history.filter(h => h.history.assetId === row.asset.id).map(h => ({ ...h.history, accountingTransaction: h.history.accountingTransactionId ? { reversedBy: h.reversalId ? { id: h.reversalId } : null } : null })) }));
      }) : Promise.resolve([]),
    view === "baixas" ? db.select({ writeOff: assetWriteOffs, asset: { code: assetTable.code, patrimonyNumber: assetTable.patrimonyNumber, name: assetTable.name } }).from(assetWriteOffs).innerJoin(assetTable, eq(assetTable.id, assetWriteOffs.assetId))
      .where(assetAccess).orderBy(desc(assetWriteOffs.date)).offset(pageWindow.skip).limit(pageWindow.take).then(rows => rows.map(row => ({ ...row.writeOff, asset: row.asset }))) : Promise.resolve([]),
    view === "ajustes" ? db.select({ adjustment: assetValueAdjustments, asset: { code: assetTable.code, patrimonyNumber: assetTable.patrimonyNumber, name: assetTable.name }, reversalId: sql<string | null>`(SELECT r.id FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueAdjustments.accountingTransactionId})` }).from(assetValueAdjustments).innerJoin(assetTable, eq(assetTable.id, assetValueAdjustments.assetId))
      .where(assetAccess).orderBy(desc(assetValueAdjustments.date)).offset(pageWindow.skip).limit(pageWindow.take).then(rows => rows.map(row => ({ ...row.adjustment, asset: row.asset, accountingTransaction: row.adjustment.accountingTransactionId ? { reversedBy: row.reversalId ? { id: row.reversalId } : null } : null }))) : Promise.resolve([]),
  ]);
  const totalBookValue = activeAssetValue._sum?.currentValue ?? 0;
  const initialCompetence = new Date().toISOString().slice(0, 7);
  const valuationRecords = [
    ...assets.flatMap(asset => asset.valueHistory.filter(row => row.accountingTransactionId && !row.accountingTransaction?.reversedBy).map(row => ({ id: row.id, kind: "DEPRECIATION" as const, label: `${asset.patrimonyNumber} — depreciação ${row.referenceMonth.toISOString().slice(0, 7)}` }))),
    ...adjustments.filter(row => row.accountingTransactionId && !row.accountingTransaction?.reversedBy).map(row => ({ id: row.id, kind: "ADJUSTMENT" as const, label: `${row.asset.patrimonyNumber} — ${adjustmentLabel(row.type)} ${row.date.toISOString().slice(0, 10)}` })),
  ];
  if (params?.view === "operacoes") return <main className="space-y-3 p-3"><h1 className="text-lg font-semibold">Operações de ciclo de vida</h1><Link href={lifecycleHref(view, page)}>Voltar à consulta</Link><AssetLifecycleClient valuationRecords={valuationRecords} initialCompetence={initialCompetence} budgetUnits={budgetUnits} bankAccounts={bankAccounts} revenueNatures={revenueNatures} resourceSources={resourceSources} /></main>;
  return <OperationalListFrame actions={<Link href={`?view=operacoes&sourceView=${view}&page=${page}`} className={styles.dialogButton}>Operações de ciclo de vida</Link>} toolbar={<>
    <nav aria-label="Visões do ciclo de vida" className="flex items-center gap-1">{([["posicao", "Posição patrimonial"], ["baixas", `Baixas e alienações (${writeOffTotal})`], ["ajustes", `Ajustes de valor (${adjustmentTotal})`]] as const).map(([value, label]) => <Link key={value} href={lifecycleHref(value, 1)} aria-current={view === value ? "page" : undefined} className={styles.dialogButton}>{label}</Link>)}</nav>
    {view === "posicao" && <span className="whitespace-nowrap">Valor contábil total: {currency(totalBookValue)}</span>}
  </>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/patrimonio/ciclo-vida" values={{ view }} />}>
    {view === "posicao" && <OperationalTable preferenceId="patrimonio-ciclo-posicao" caption="Posição patrimonial" columns={operationalColumns([
      ["code", "Código", 140, 100, "identifier"], ["patrimony", "Tombamento", 140, 100], ["name", "Descrição", 300, 150], ["category", "Categoria", 170, 100], ["status", "Situação", 120, 90, "status"], ["life", "Vida útil", 100, 80, "text", "right"], ["value", "Valor líquido", 150, 120, "text", "right"],
    ])} rows={assets.map(asset => ({ id: asset.id, label: asset.name, values: { code: asset.code || asset.patrimonyNumber, patrimony: asset.patrimonyNumber, name: asset.name, category: asset.category?.name || "—", status: asset.status, life: asset.category?.lifeSpan ? `${asset.category.lifeSpan} meses` : "—", value: currency(Number(asset.currentValueDecimal ?? asset.currentValue)) }, cells: { code: <Link href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`}>{asset.code || asset.patrimonyNumber}</Link> } }))} />}
    {view === "baixas" && <OperationalTable preferenceId="patrimonio-ciclo-baixas" caption="Baixas e alienações" columns={operationalColumns([
      ["date", "Data", 110, 90], ["code", "Código", 130, 90, "identifier"], ["patrimony", "Tombamento", 130, 100], ["name", "Descrição do bem", 260, 140], ["type", "Tipo", 100, 80], ["book", "Valor contábil", 140, 120, "text", "right"], ["received", "Recebido", 140, 120, "text", "right"], ["result", "Resultado", 140, 120, "text", "right"],
    ])} rows={writeOffs.map(row => ({ id: row.id, label: row.asset.name, values: { date: new Date(row.date).toLocaleDateString("pt-BR", { timeZone: "UTC" }), code: row.asset.code || row.asset.patrimonyNumber, patrimony: row.asset.patrimonyNumber, name: row.asset.name, type: row.type, book: currency(row.bookValue), received: currency(row.disposalValue), result: currency(row.gainLoss) } }))} />}
    {view === "ajustes" && <OperationalTable preferenceId="patrimonio-ciclo-ajustes" caption="Ajustes de valor" columns={operationalColumns([
      ["date", "Data", 110, 90], ["code", "Código", 130, 90, "identifier"], ["patrimony", "Tombamento", 130, 100], ["name", "Descrição do bem", 260, 140], ["type", "Tipo de ajuste", 160, 110], ["value", "Valor ajuste", 150, 120, "text", "right"], ["closing", "Novo valor contábil", 170, 140, "text", "right"],
    ])} rows={adjustments.map(row => ({ id: row.id, label: row.asset.name, values: { date: new Date(row.date).toLocaleDateString("pt-BR", { timeZone: "UTC" }), code: row.asset.code || row.asset.patrimonyNumber, patrimony: row.asset.patrimonyNumber, name: row.asset.name, type: adjustmentLabel(row.type), value: currency(Number(row.adjustmentValueDecimal ?? row.adjustmentValue)), closing: currency(Number(row.closingValueDecimal ?? row.closingValue)) } }))} />}
  </OperationalListFrame>;
}
