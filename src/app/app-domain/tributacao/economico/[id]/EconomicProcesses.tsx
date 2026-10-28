import Link from "next/link";
import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { readEconomicProcessLinks } from "@/db/repositories/taxation-pages/economic-processes";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export default async function EconomicProcesses({ database, registrationId }: { database: DatabaseExecutor; registrationId: string }) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const profile = (await listFiscalEntries(database, { entityType: "ECONOMIC_REGISTRATION", entityIds: [registrationId], categories: ["ECONOMIC_PROFILE"], limit: 1 }))[0];
  const origin = taxScopeSnapshot(profile?.data);
  if (!origin.budgetUnitId || !origin.governmentEntityId || allowed && !allowed.includes(String(origin.budgetUnitId))) return null;
  const processes = await readEconomicProcessLinks(database, registrationId, origin);
  return <section className="max-h-64 shrink-0 space-y-2 overflow-auto rounded border bg-white p-3 text-xs"><h2 className="font-semibold">Processos vinculados à inscrição · todos os exercícios ({processes.length})</h2>{!processes.length && <p>Nenhum protocolo explicitamente vinculado à inscrição, seus lançamentos ou alvarás.</p>}{processes.map(process => <article key={process.id} className="rounded border p-2"><Link href={`/protocolos/processos/${process.id}`} className="font-semibold text-emerald-700 underline">{process.protocolNumber} · {process.status}</Link><p>{process.processType.name} · {process.subject.name} · aberto em {process.createdAt.toLocaleDateString("pt-BR")}</p><p>{process.description}</p><p>Setor: {process.currentDepartment?.name ?? "Não informado"} · {process._count.movements} trâmites · {process._count.documents} anexos · {process._count.dispatches} pareceres/despachos</p></article>)}</section>;
}
