import { randomUUID } from "node:crypto";
import Link from "next/link";
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { fleetScope } from "@/lib/frotas/service";
import { fleetDatabase, fleetDepartmentFilter, countFleetRecords } from "@/db/repositories/fleet/records";
import { fleetControlEvents, fleetUnits } from "@/db/schema/fleet";
import { FleetMovementPanel } from "./FleetMovementPanel";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
const columns: OperationalColumn[] = [
  { key: "operation", label: "Operação", type: "text", initialWidth: 180, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Registro", type: "text", initialWidth: 160, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "target", label: "Referência", type: "identifier", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "details", label: "Dados e histórico", type: "text", initialWidth: 350, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
];
const labels: Record<string, string> = {
  plate: "Placa externa / Vale Card",
  meter: "Troca de marcador",
  importFuel: "Importação de abastecimentos",
  importMaintenance: "Importação de manutenções",
  reverseFuel: "Estorno de consumo",
  reverseMaintenance: "Estorno de manutenção",
};

export default async function FleetMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("FROTAS"),
    scope = fleetScope(context),
    db = fleetDatabase(context),
    query = await searchParams;
  const units = await db
    .select({ id: fleetUnits.id, code: fleetUnits.code, plate: fleetUnits.plate, name: fleetUnits.name })
    .from(fleetUnits)
    .where(fleetDepartmentFilter(scope));
  const unitIds = units.map((unit) => unit.id);
  const actorMatch = and(isNull(fleetControlEvents.unitId), eq(fleetControlEvents.actorId, scope.actorId));
  const where = and(
    like(fleetControlEvents.operation, "MOVEMENT_%"),
    unitIds.length > 0 ? or(inArray(fleetControlEvents.unitId, unitIds), actorMatch) : actorMatch,
  );
  const total = await countFleetRecords(db, fleetControlEvents, where),
    page = Math.min(Math.max(1, Math.floor(Number(query.page) || 1)), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const events = await db
    .select()
    .from(fleetControlEvents)
    .where(where)
    .orderBy(desc(fleetControlEvents.createdAt), desc(fleetControlEvents.id))
    .limit(OPERATIONAL_PAGE_SIZE)
    .offset((page - 1) * OPERATIONAL_PAGE_SIZE);

  const actions = <>
      <Link href="/frotas/gestao" className={styles.filterButton}>Gestão operacional</Link>
      <Link href="/frotas" className={styles.filterButton}>Painel de Frotas</Link>
      {canPerformModuleOperation(context.user, "FROTAS", "update") && (
        <FleetMovementPanel units={units} labels={labels} requestId={randomUUID()} />
      )}
    </>;
  return (
      <OperationalListFrame
        label="Movimentos e importações" actions={actions}
        toolbar={<><p className="text-xs font-semibold text-slate-600">{total} movimentos registrados</p>{query.salvo === "1" && <p role="status" className="text-xs font-semibold text-emerald-900">Operação registrada com sucesso.</p>}</>}
        pagination={<OperationalLinkPagination pathname="/frotas/movimentos" page={page} total={total} values={{}} />}
      >
        <OperationalTable
          preferenceId="frotas-movimentos"
          caption="Histórico dos movimentos de Frotas"
          columns={columns}
          rows={events.map((event) => ({
            id: event.id,
            label: event.targetId,
            values: {
              operation: labels[event.operation.replace("MOVEMENT_", "")] || event.operation,
              date: event.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
              target: event.targetId,
              details: JSON.stringify(event.snapshot, null, 2),
            },
          }))}
        />
      </OperationalListFrame>
  );
}
