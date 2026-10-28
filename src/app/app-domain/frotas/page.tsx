import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { fleetQuerySchema, type FleetQuery } from "@/lib/frotas/contract";
import { queryFleet } from "@/lib/frotas/queries";
import { fleetScope } from "@/lib/frotas/service";
import { fleetDatabase } from "@/db/repositories/fleet/records";
import { fleetSelectedUnit, fleetSelectedUnits } from "@/db/repositories/fleet/page-data";
import { fleetPageIssue } from "@/lib/frotas/page-errors";
import { FrotasClient } from "./FrotasClient";
import { FleetUnavailable } from "./FleetUnavailable";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadFleetPage(query: FleetQuery) {
  try {
    const context = await getTenantContextForModule("FROTAS"), scope = fleetScope(context);
    const [list, selectedUnit, selectedUnits] = await Promise.all([
      queryFleet(context, query),
      query.unitId ? fleetSelectedUnit(fleetDatabase(context), scope, query.unitId) : null,
      query.unitIds ? fleetSelectedUnits(fleetDatabase(context), scope, query.unitIds.split(",")) : [],
    ]);
    const permissions = { create: canPerformModuleOperation(context.user, "FROTAS", "create"), update: canPerformModuleOperation(context.user, "FROTAS", "update"), issueReports: canPerformModuleOperation(context.user, "FROTAS", "issueReports") };
    return { ok: true as const, list, selectedUnit, selectedUnits, permissions, departmentId: scope.departmentId || "" };
  } catch (error) {
    const issue = fleetPageIssue(error);
    if (!issue) throw error;
    return { ok: false as const, issue };
  }
}

export default async function FrotasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = fleetQuerySchema.safeParse(raw);
  if (!parsed.success) return <div role="alert" className="rounded border border-red-200 bg-white p-5 text-sm text-red-800">Filtros inválidos: {parsed.error.issues.map(i => i.message).join(" ")} <a href="/frotas" className="underline">Limpar filtros</a></div>;
  const query = parsed.data;
  const result = await loadFleetPage(query);
  if (!result.ok) return <FleetUnavailable issue={result.issue} />;
  return <><Link href="/frotas/gestao" className="m-2 inline-flex w-fit rounded border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Gestão: CNH, agenda, guarita, autorizações, componentes, multas e sinistros →</Link><FrotasClient key={JSON.stringify(query)} query={query} list={result.list} selectedUnit={result.selectedUnit} selectedUnits={result.selectedUnits.map(v => ({ id: v.id, label: `${v.code} · ${v.name}` }))} permissions={result.permissions} departmentId={result.departmentId} /></>;
}
