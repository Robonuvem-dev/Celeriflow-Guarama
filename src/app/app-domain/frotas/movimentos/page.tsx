import { randomUUID } from "node:crypto";
import Link from "next/link";
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { fleetScope } from "@/lib/frotas/service";
import { fleetDatabase, fleetDepartmentFilter, countFleetRecords } from "@/db/repositories/fleet/records";
import { fleetControlEvents, fleetUnits } from "@/db/schema/fleet";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { fleetMovementAction } from "./actions";

export const dynamic = "force-dynamic";
const columns: OperationalColumn[] = [
  { key: "operation", label: "Operação", type: "text", initialWidth: 180, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Registro", type: "text", initialWidth: 160, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "target", label: "Referência", type: "identifier", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "details", label: "Dados e histórico", type: "text", initialWidth: 350, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
];
const labels: Record<string, string> = { plate: "Placa externa / Vale Card", meter: "Troca de marcador", importFuel: "Importação de abastecimentos", importMaintenance: "Importação de manutenções", reverseFuel: "Estorno de consumo", reverseMaintenance: "Estorno de manutenção" };
export default async function FleetMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("FROTAS"), scope = fleetScope(context), db = fleetDatabase(context), query = await searchParams;
  const units = await db.select({ id: fleetUnits.id, code: fleetUnits.code, plate: fleetUnits.plate, name: fleetUnits.name }).from(fleetUnits).where(fleetDepartmentFilter(scope));
  const where = and(like(fleetControlEvents.operation, "MOVEMENT_%"), or(inArray(fleetControlEvents.unitId, units.map(unit => unit.id)), and(isNull(fleetControlEvents.unitId), eq(fleetControlEvents.actorId, scope.actorId))));
  const total = await countFleetRecords(db, fleetControlEvents, where), page = Math.min(Math.max(1, Math.floor(Number(query.page) || 1)), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const events = await db.select().from(fleetControlEvents).where(where).orderBy(desc(fleetControlEvents.createdAt), desc(fleetControlEvents.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  return <main className="space-y-4 p-4">
    <header><Link href="/frotas">← Frotas</Link><h1 className="text-2xl font-semibold">Movimentos e importações</h1></header>
    {query.salvo === "1" && <p role="status">Operação registrada.</p>}
    {canPerformModuleOperation(context.user, "FROTAS", "update") && <OperationalTablePanel title="Registrar movimento" triggerLabel="Registrar movimento ou importar arquivo">
      <form action={fleetMovementAction} className="grid gap-3 p-4 md:grid-cols-2">
        <input type="hidden" name="requestId" value={randomUUID()} />
        <label>Operação<select required name="operation" className="block w-full rounded border p-2">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Veículo (vínculo de placa ou troca do marcador)<select name="unitId" className="block w-full rounded border p-2"><option value="">Selecione</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.plate} · {unit.name}</option>)}</select></label>
        <label>Placa externa / Vale Card<input name="externalPlate" maxLength={20} className="block w-full rounded border p-2" /></label>
        <label>Leitura inicial do novo hodômetro/horímetro<input name="reading" inputMode="decimal" className="block w-full rounded border p-2" /></label>
        <label>ID do consumo ou da ordem de manutenção a estornar<input name="recordId" maxLength={100} className="block w-full rounded border p-2" /></label>
        <label>Arquivo CSV (até 200 linhas e 500 KB)<input name="file" type="file" accept=".csv,text/csv" className="block w-full rounded border p-2" /></label>
        <label className="md:col-span-2">Motivo / origem do arquivo<textarea required minLength={5} maxLength={2000} name="reason" className="block w-full rounded border p-2" /></label>
        <p className="text-sm md:col-span-2">CSV separado por ponto e vírgula. Abastecimentos: placa;referencia;data;descricao;quantidade;valor. Manutenções: placa;referencia;data;descricao;valor. Datas AAAA-MM-DD; valores totais e quantidades com ponto decimal. A referência identifica a transação da operadora; repetições idênticas não duplicam o lançamento. Relacione primeiro a placa externa quando ela diferir do cadastro. Exporte ou adapte o arquivo da operadora para essas colunas.</p>
        <p className="text-sm md:col-span-2">Estornos preservam a origem e registram os valores inversos na data do lançamento. A troca do marcador conserva a leitura anterior no histórico e exige que não haja viagem aberta.</p>
        <button className="w-fit rounded bg-teal-700 px-4 py-2 text-white">Confirmar operação</button>
      </form>
    </OperationalTablePanel>}
    <OperationalListFrame toolbar={<p>{total} movimentos registrados</p>} pagination={<OperationalLinkPagination pathname="/frotas/movimentos" page={page} total={total} values={{}} />}>
      <OperationalTable preferenceId="frotas-movimentos" caption="Histórico dos movimentos de Frotas" columns={columns} rows={events.map(event => ({ id: event.id, label: event.targetId, values: { operation: labels[event.operation.replace("MOVEMENT_", "")] || event.operation, date: event.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), target: event.targetId, details: JSON.stringify(event.snapshot, null, 2) } }))} />
    </OperationalListFrame>
  </main>;
}
