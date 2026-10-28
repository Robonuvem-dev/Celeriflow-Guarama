import { redirect } from "next/navigation";
import { AccessError } from "@/lib/platform/tenant-context";
import { FleetControlError } from "@/lib/frotas/control-access";
import { getFleetDriverPortal } from "@/lib/frotas/control-driver-portal";
import { DriverFleetForm } from "./DriverForm";
import { db } from "@/db/client";
import { readDriverFleetOptions } from "@/db/repositories/platform/fleet-driver";

export const dynamic = "force-dynamic";
export default async function FleetDriverPage() {
  const access = await getFleetDriverPortal().catch((error) => { if (error instanceof AccessError && error.status === 401) redirect("/portal/entrar"); if (error instanceof AccessError || error instanceof FleetControlError) return null; throw error; });
  if (!access) return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-2xl font-bold">Área do motorista</h1><p className="mt-4 text-sm">Conta sem vínculo de motorista ativo. Solicite conferência ao setor de Frota.</p></main>;
  const { units, trips } = await readDriverFleetOptions(access.context.database ?? db, access.scope.departmentId!, access.driver.id);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-10"><h1 className="text-3xl font-bold">Frota — movimentação do motorista</h1><p className="text-sm leading-6 text-slate-600">Seu cadastro é resolvido pela conta e origem canônica. A saída verifica CNH, categoria, suspensão, pontuação, setor, agenda e disponibilidade. Esta área não concede permissão ERP de Frota.</p><DriverFleetForm units={units} trips={trips} /></main>;
}
