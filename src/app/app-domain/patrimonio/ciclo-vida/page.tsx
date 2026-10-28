import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { assets as assetTable, assetCategories, assetValueHistories, assetWriteOffs, assetValueAdjustments } from "@/db/schema/assets";
import { AssetLifecycleClient } from "./AssetLifecycleClient";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule, isSystemAdministrator, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import {
  clampPatrimonioListPage,
  patrimonioListHref,
  parsePatrimonioListPage,
  PATRIMONIO_LIST_PAGE_SIZE,
} from "../listing";

type LifecycleView = "posicao" | "baixas" | "ajustes";

type SearchParams = {
  page?: string;
  view?: string;
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseLifecycleView(value: string | undefined): LifecycleView {
  if (value === "baixas" || value === "ajustes") return value;
  return "posicao";
}

function lifecycleHref(view: LifecycleView, page: number) {
  return patrimonioListHref("/patrimonio/ciclo-vida", page, { view });
}

function viewLabel(view: LifecycleView) {
  if (view === "baixas") return "baixa(s) e alienação(ões)";
  if (view === "ajustes") return "ajuste(s) de valor";
  return "bem(ns) patrimonial(is)";
}

function adjustmentLabel(type: string) {
  return {
    REVALUATION: "Reavaliação",
    IMPAIRMENT: "Impairment",
    SUBSEQUENT_COST: "Custo subsequente",
  }[type] ?? type;
}

export default async function AssetLifecyclePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
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
  const view = parseLifecycleView(params?.view);
  const requestedPage = parsePatrimonioListPage(params?.page);
  const assetAccess = allowed ? or(inArray(assetTable.budgetUnitId, allowed),
    and(isNull(assetTable.budgetUnitId), sql`EXISTS (SELECT 1 FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Commitment" c ON c.id=r."commitmentId" JOIN "BudgetAppropriation" b ON b.id=c."appropriationId" WHERE i.id=${assetTable.purchaseReceiptItemId} AND ${inArray(sql`b."budgetUnitId"`, allowed)})`),
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
  const pageWindow = {
    skip: (page - 1) * PATRIMONIO_LIST_PAGE_SIZE,
    take: PATRIMONIO_LIST_PAGE_SIZE,
  };

  const [assets, writeOffs, adjustments] = await Promise.all([
    view === "posicao"
      ? db.select({ asset: assetTable, category: { name: assetCategories.name, lifeSpan: assetCategories.lifeSpan } }).from(assetTable).innerJoin(assetCategories, eq(assetCategories.id, assetTable.categoryId))
          .where(assetAccess).orderBy(asc(assetTable.patrimonyNumber)).offset(pageWindow.skip).limit(pageWindow.take)
          .then(async rows => {
            const history = rows.length ? await db.select({ history: assetValueHistories, reversalId: sql<string | null>`(SELECT r.id FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueHistories.accountingTransactionId})` }).from(assetValueHistories)
              .where(and(inArray(assetValueHistories.assetId, rows.map(row => row.asset.id)), sql`${assetValueHistories.referenceMonth}=(SELECT max(h."referenceMonth") FROM "AssetValueHistory" h WHERE h."assetId"=${assetValueHistories.assetId})`)) : [];
            return rows.map(row => ({ ...row.asset, category: row.category, valueHistory: history.filter(h => h.history.assetId === row.asset.id).map(h => ({ ...h.history, accountingTransaction: h.history.accountingTransactionId ? { reversedBy: h.reversalId ? { id: h.reversalId } : null } : null })) }));
          })
      : Promise.resolve([]),
    view === "baixas"
      ? db.select({ writeOff: assetWriteOffs, asset: { code: assetTable.code, patrimonyNumber: assetTable.patrimonyNumber, name: assetTable.name } }).from(assetWriteOffs).innerJoin(assetTable, eq(assetTable.id, assetWriteOffs.assetId))
          .where(assetAccess).orderBy(desc(assetWriteOffs.date)).offset(pageWindow.skip).limit(pageWindow.take).then(rows => rows.map(row => ({ ...row.writeOff, asset: row.asset })))
      : Promise.resolve([]),
    view === "ajustes"
      ? db.select({ adjustment: assetValueAdjustments, asset: { code: assetTable.code, patrimonyNumber: assetTable.patrimonyNumber, name: assetTable.name }, reversalId: sql<string | null>`(SELECT r.id FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueAdjustments.accountingTransactionId})` }).from(assetValueAdjustments).innerJoin(assetTable, eq(assetTable.id, assetValueAdjustments.assetId))
          .where(assetAccess).orderBy(desc(assetValueAdjustments.date)).offset(pageWindow.skip).limit(pageWindow.take).then(rows => rows.map(row => ({ ...row.adjustment, asset: row.asset, accountingTransaction: row.adjustment.accountingTransactionId ? { reversedBy: row.reversalId ? { id: row.reversalId } : null } : null })))
      : Promise.resolve([]),
  ]);

  const totalBookValue = activeAssetValue._sum?.currentValue ?? 0;
  const initialCompetence = new Date().toISOString().slice(0, 7);
  const valuationRecords = [
    ...assets.flatMap(asset => asset.valueHistory.filter(row => row.accountingTransactionId && !row.accountingTransaction?.reversedBy).map(row => ({ id: row.id, kind: "DEPRECIATION" as const, label: `${asset.patrimonyNumber} — depreciação ${row.referenceMonth.toISOString().slice(0, 7)}` }))),
    ...adjustments.filter(row => row.accountingTransactionId && !row.accountingTransaction?.reversedBy).map(row => ({ id: row.id, kind: "ADJUSTMENT" as const, label: `${row.asset.patrimonyNumber} — ${adjustmentLabel(row.type)} ${row.date.toISOString().slice(0, 10)}` })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      <ErpPageTitle
        title="Ciclo de vida patrimonial"
      />

      <details className="shrink-0 border border-slate-300 bg-white shadow-sm">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-800 marker:text-slate-500">
          Operações de ciclo de vida (depreciação, baixas e reavaliação)
        </summary>
        <div className="border-t border-slate-200 p-3">
          <AssetLifecycleClient valuationRecords={valuationRecords} initialCompetence={initialCompetence} budgetUnits={budgetUnits} bankAccounts={bankAccounts} revenueNatures={revenueNatures} resourceSources={resourceSources} />
        </div>
      </details>

      <ErpListFrame
        toolbar={
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <Link
              href={lifecycleHref("posicao", 1)}
              className={`rounded border px-2.5 py-1 transition-colors ${
                view === "posicao"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Posição patrimonial
            </Link>
            <Link
              href={lifecycleHref("baixas", 1)}
              className={`rounded border px-2.5 py-1 transition-colors ${
                view === "baixas"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Baixas e alienações ({writeOffTotal})
            </Link>
            <Link
              href={lifecycleHref("ajustes", 1)}
              className={`rounded border px-2.5 py-1 transition-colors ${
                view === "ajustes"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Ajustes de valor ({adjustmentTotal})
            </Link>
          </div>
        }
        summary={
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <p>
              Exibindo <strong className="text-slate-900">{total}</strong> {viewLabel(view)}
            </p>
            {view === "posicao" && (
              <p>
                Valor contábil total: <strong className="text-emerald-800">{currency(totalBookValue)}</strong>
              </p>
            )}
          </div>
        }
        pagination={
          <ErpPagination
            page={page}
            total={total}
            pageSize={PATRIMONIO_LIST_PAGE_SIZE}
            label={viewLabel(view)}
            previousHref={lifecycleHref(view, page - 1)}
            nextHref={lifecycleHref(view, page + 1)}
          />
        }
      >
        {view === "posicao" && (
          <table className="w-full table-fixed text-left text-[11px] leading-4 text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr className="h-7">
                 <th className="w-[14%] px-3 text-left">Código / tombamento</th>
                <th className="w-[36%] px-3 text-left">Descrição</th>
                <th className="hidden w-[16%] px-3 text-left md:table-cell">Categoria</th>
                <th className="w-[12%] px-3 text-left">Situação</th>
                <th className="hidden w-[10%] px-3 text-right lg:table-cell">Vida útil</th>
                <th className="w-[12%] px-3 text-right">Valor líquido</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    Nenhum bem patrimonial encontrado.
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id} className="h-[clamp(24px,2.8vh,34px)] border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-0 font-semibold text-emerald-800">
                      <Link className="block truncate underline-offset-2 hover:underline" href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`}>
                         {asset.code || asset.patrimonyNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-0 font-medium">
                      <span className="block truncate">{asset.name}</span>
                    </td>
                    <td className="hidden px-3 py-0 md:table-cell">
                      <span className="block truncate">{asset.category?.name || "—"}</span>
                    </td>
                    <td className="px-3 py-0">
                      <span className="block truncate font-semibold text-slate-700">{asset.status}</span>
                    </td>
                    <td className="hidden px-3 py-0 text-right tabular-nums lg:table-cell">
                       {asset.category?.lifeSpan ? `${asset.category.lifeSpan} meses` : "—"}
                    </td>
                    <td className="px-3 py-0 text-right font-semibold tabular-nums text-emerald-800">
                      {currency(Number(asset.currentValueDecimal ?? asset.currentValue))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {view === "baixas" && (
          <table className="w-full table-fixed text-left text-[11px] leading-4 text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr className="h-7">
                <th className="w-[12%] px-3 text-left">Data</th>
                 <th className="w-[13%] px-3 text-left">Código</th>
                <th className="w-[30%] px-3 text-left">Descrição do bem</th>
                <th className="w-[10%] px-3 text-left">Tipo</th>
                <th className="w-[12%] px-3 text-right">Valor contábil</th>
                <th className="w-[11%] px-3 text-right">Recebido</th>
                <th className="w-[12%] px-3 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {writeOffs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    Nenhuma baixa ou alienação registrada.
                  </td>
                </tr>
              ) : (
                writeOffs.map((writeOff) => (
                  <tr key={writeOff.id} className="h-[clamp(24px,2.8vh,34px)] border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-0 tabular-nums">{new Date(writeOff.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                    <td className="px-3 py-0 font-semibold text-emerald-800">
                       <span className="block truncate" title={`Tombamento ${writeOff.asset.patrimonyNumber}`}>{writeOff.asset.code || writeOff.asset.patrimonyNumber}</span>
                    </td>
                    <td className="px-3 py-0 font-medium">
                      <span className="block truncate">{writeOff.asset.name}</span>
                    </td>
                    <td className="px-3 py-0">
                      <span className="block truncate font-semibold">{writeOff.type}</span>
                    </td>
                    <td className="px-3 py-0 text-right tabular-nums">{currency(writeOff.bookValue)}</td>
                    <td className="px-3 py-0 text-right tabular-nums">{currency(writeOff.disposalValue)}</td>
                    <td className={`px-3 py-0 text-right font-semibold tabular-nums ${writeOff.gainLoss < 0 ? "text-rose-700" : writeOff.gainLoss > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                      {currency(writeOff.gainLoss)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {view === "ajustes" && (
          <table className="w-full table-fixed text-left text-[11px] leading-4 text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr className="h-7">
                <th className="w-[12%] px-3 text-left">Data</th>
                 <th className="w-[13%] px-3 text-left">Código</th>
                <th className="w-[32%] px-3 text-left">Descrição do bem</th>
                <th className="w-[15%] px-3 text-left">Tipo de ajuste</th>
                <th className="w-[14%] px-3 text-right">Valor ajuste</th>
                <th className="w-[14%] px-3 text-right">Novo valor contábil</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    Nenhum ajuste de valor registrado.
                  </td>
                </tr>
              ) : (
                adjustments.map((adjustment) => (
                  <tr key={adjustment.id} className="h-[clamp(24px,2.8vh,34px)] border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-0 tabular-nums">{new Date(adjustment.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                    <td className="px-3 py-0 font-semibold text-emerald-800">
                       <span className="block truncate" title={`Tombamento ${adjustment.asset.patrimonyNumber}`}>{adjustment.asset.code || adjustment.asset.patrimonyNumber}</span>
                    </td>
                    <td className="px-3 py-0 font-medium">
                      <span className="block truncate">{adjustment.asset.name}</span>
                    </td>
                    <td className="px-3 py-0">
                      <span className="block truncate font-semibold">{adjustmentLabel(adjustment.type)}</span>
                    </td>
                    <td className="px-3 py-0 text-right font-semibold tabular-nums text-emerald-800">
                      {currency(Number(adjustment.adjustmentValueDecimal ?? adjustment.adjustmentValue))}
                    </td>
                    <td className="px-3 py-0 text-right font-bold tabular-nums">
                      {currency(Number(adjustment.closingValueDecimal ?? adjustment.closingValue))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </ErpListFrame>
    </div>
  );
}
