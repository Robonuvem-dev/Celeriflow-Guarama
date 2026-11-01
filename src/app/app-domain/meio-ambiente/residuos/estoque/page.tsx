import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { hasRecyclingStockSchema, loadRecyclingStockPage } from "@/db/repositories/environment/recycling-stock";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { parseRecyclingEntries, recyclingEntryKey } from "@/lib/environment/recycling-catalog";
import { recyclingToday } from "@/lib/environment/recycling-stock";
import { StockView } from "./StockView";
import { recordRecyclingMovementAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function RecyclingStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const database = context.database ?? db;
  const instance = await findOperationalInstance(database);
  if (!instance || !await hasRecyclingStockSchema(database)) return <main className="space-y-4 p-5"><h1 className="text-xl font-semibold">Estoque de recicláveis</h1><p>O controle de estoque ainda não está disponível nesta instância. Os cadastros e registros de resíduos continuam acessíveis.</p><Link className="underline" href="/meio-ambiente/residuos">Voltar aos registros de resíduos</Link></main>;
  const query = await searchParams;
  const text = (name: string) => typeof query[name] === "string" ? query[name] as string : undefined;
  const data = await loadRecyclingStockPage(database, instance.id, { stock: text("estoquePagina"), history: text("historicoPagina") });
  const entries = parseRecyclingEntries(instance.parametros.filter(parameter => parameter.chave.startsWith("RECYCLING_CATALOG:")).map(parameter => parameter.valor));
  const byKey = new Map(entries.map(entry => [recyclingEntryKey(entry), entry]));
  return <StockView entries={entries} stockPage={data.stockPage} historyPage={data.historyPage} stockTotal={data.stockTotal} historyTotal={data.historyTotal} pageSize={data.pageSize}
    canRecord={canPerformModuleOperation(context.user, "MEIO_AMBIENTE", "create")} today={recyclingToday()} entryRequestKey={randomUUID()} recordAction={recordRecyclingMovementAction}
    positions={data.stocks.map(stock => {
      const material = byKey.get(stock.materialKey), depot = byKey.get(stock.depotKey), unit = byKey.get(stock.unitKey), type = byKey.get(stock.typeKey);
      return { materialCode: material?.code ?? "", materialName: material?.name ?? "Material indisponível", typeName: type?.name ?? "Tipo indisponível", unitCode: unit?.code ?? "", unitName: unit?.name ?? "Unidade indisponível", depotCode: depot?.code ?? "", depotName: depot?.name ?? "Depósito indisponível",
        quantity: stock.quantity.toFixed(3), materialTotal: new Decimal(String(stock.materialTotal)).toFixed(3), canDispatch: stock.quantity.gt(0) && !!(material && depot && unit && type), requestKey: randomUUID() };
    })}
    history={data.movements.map(movement => ({ id: movement.id, kind: movement.kind, quantity: movement.quantity.toFixed(3), amount: movement.amount.toFixed(2), quantityAfter: movement.quantityAfter.toFixed(3), occurredOn: movement.occurredOn, origin: movement.origin, notes: movement.notes, snapshot: movement.snapshot }))}
  />;
}
