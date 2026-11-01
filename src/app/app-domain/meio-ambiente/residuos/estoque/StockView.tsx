import type { RecyclingEntry } from "@/lib/environment/recycling-catalog";
import type { RecyclingMovementHistoryItem, RecyclingMovementResult, RecyclingStockPosition } from "@/lib/environment/recycling-stock";
import { MovementForm } from "./MovementForm";

type Props = {
  entries: RecyclingEntry[]; positions: RecyclingStockPosition[]; history: RecyclingMovementHistoryItem[];
  stockPage: number; historyPage: number; stockTotal: number; historyTotal: number; pageSize: number;
  canRecord: boolean; today: string; entryRequestKey: string;
  recordAction: (form: FormData) => Promise<RecyclingMovementResult>;
};
const decimal = (value: string) => value.replace(".", ",");
const date = (value: string) => value.split("-").reverse().join("/");
function Pagination({ page, total, pageSize, section, otherPage }: { page: number; total: number; pageSize: number; section: "stock" | "history"; otherPage: number }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const href = (next: number) => `?estoquePagina=${section === "stock" ? next : otherPage}&historicoPagina=${section === "history" ? next : otherPage}#${section === "stock" ? "saldos" : "historico"}`;
  return <nav aria-label={section === "stock" ? "Páginas de saldos" : "Páginas do histórico"} className="flex items-center gap-4 text-sm">
    {page > 1 ? <a className="underline" href={href(page - 1)}>Anterior</a> : <span aria-disabled="true">Anterior</span>}
    <span>Página {page} de {last} · {total} registros</span>
    {page < last ? <a className="underline" href={href(page + 1)}>Próxima</a> : <span aria-disabled="true">Próxima</span>}
  </nav>;
}
export function StockView(props: Props) {
  return <main className="space-y-6 p-5">
    <header className="space-y-2"><h1 className="text-xl font-semibold">Estoque de recicláveis</h1>
      <nav className="flex flex-wrap gap-4 text-sm"><a className="underline" href="/meio-ambiente/residuos">Registros de resíduos</a><a className="underline" href="/meio-ambiente/residuos/cadastros">Cadastros de reciclagem</a></nav>
    </header>
    {props.canRecord && <details><summary className="cursor-pointer font-semibold">Registrar entrada</summary><MovementForm entries={props.entries} today={props.today} initialRequestKey={props.entryRequestKey} recordAction={props.recordAction} /></details>}
    <section id="saldos" className="space-y-3"><h2 className="font-semibold">Saldo por depósito</h2>
      {!props.positions.length ? <p>Nenhum saldo registrado.</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><caption className="sr-only">Saldo atual de cada material por depósito e total do material em todos os depósitos</caption>
        <thead><tr>{["Material", "Tipo", "Unidade", "Depósito", "Quantidade no depósito", "Total do material", "Movimentação"].map(title => <th className="border p-2 text-left" key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{props.positions.map(position => <tr key={`${position.materialCode}:${position.depotCode}`}>
          <th scope="row" className="border p-2 text-left font-normal">{position.materialCode} · {position.materialName}</th>
          <td className="border p-2">{position.typeName}</td><td className="border p-2">{position.unitName}</td><td className="border p-2">{position.depotName}</td>
          <td className="border p-2 text-right tabular-nums">{decimal(position.quantity)}</td><td className="border p-2 text-right tabular-nums">{decimal(position.materialTotal)}</td>
          <td className="min-w-64 border p-2">{props.canRecord && position.canDispatch ? <details><summary className="cursor-pointer underline">Registrar saída</summary><MovementForm entries={props.entries} today={props.today} initialRequestKey={position.requestKey} position={position} recordAction={props.recordAction} /></details> : position.canDispatch ? "Consulta" : "Sem saldo disponível"}</td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination page={props.stockPage} total={props.stockTotal} pageSize={props.pageSize} section="stock" otherPage={props.historyPage} />
    </section>
    <section id="historico" className="space-y-3"><h2 className="font-semibold">Histórico de coletas e destinações</h2>
      {!props.history.length ? <p>Nenhuma movimentação registrada.</p> : <ol className="space-y-3">{props.history.map(movement => <li className="space-y-1 rounded border p-3 text-sm" key={movement.id}>
        <p className="font-semibold">{date(movement.occurredOn)} · {movement.kind === "ENTRY" ? "Entrada" : "Saída"} · {movement.snapshot.material.code} · {movement.snapshot.material.name}</p>
        <p>Depósito: {movement.snapshot.depot.name} · Tipo: {movement.snapshot.materialType.name}</p>
        <p>Quantidade: {decimal(movement.quantity)} {movement.snapshot.unit.name} · Saldo após a movimentação: {decimal(movement.quantityAfter)} {movement.snapshot.unit.name}</p>
        {movement.kind === "ENTRY" ? <p>Origem da coleta: {movement.origin}</p> : <><p>Destino: {movement.snapshot.destination?.name} {movement.snapshot.destination?.address}</p><p>Valor total obtido: R$ {decimal(movement.amount)}</p></>}
        {movement.notes && <p className="whitespace-pre-wrap">{movement.notes}</p>}
      </li>)}</ol>}
      <Pagination page={props.historyPage} total={props.historyTotal} pageSize={props.pageSize} section="history" otherPage={props.stockPage} />
    </section>
  </main>;
}
