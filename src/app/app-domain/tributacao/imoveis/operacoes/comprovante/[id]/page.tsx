import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { notFound } from "next/navigation";
import PrintMovements from "../../../../movimentacoes-contabeis/PrintMovements";
import { db } from "@/db/client";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";

export default async function PropertyOperationCertificate({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports"); const { user } = context; const database = context.database ?? db;
  const { id } = await params;
  const entry = (await listFiscalEntries(database, { id, limit: 1 }))[0];
  if (!entry || entry.category !== "CADASTRAL_OPERATION" || entry.title !== "REORGANIZE_PROPERTY") notFound();
  const data = taxScopeSnapshot(entry.data);
  if (!isSystemAdministrator(user) && (typeof data.budgetUnitId !== "string" || !user.allowedBudgetUnitIds.includes(data.budgetUnitId))) notFound();
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const destinations = Array.isArray(data.destinations) ? data.destinations : [];
  const actor = entry.actorUsuarioId ? (await listFiscalActorNames(database, [entry.actorUsuarioId]))[0] : null;
  return <main className="h-full space-y-4 overflow-auto p-8"><h1 className="text-xl font-bold">Comprovante de {data.operation === "SPLIT" ? "desmembramento" : "remembramento"} imobiliário</h1><p className="text-sm">Identificador {entry.id} · {entry.createdAt.toLocaleString("pt-BR")} · {actor?.nome ?? entry.actorUsuarioId}</p><p className="text-sm">Fundamento: {String(data.reason)}</p><p className="text-sm">Protocolo: {entry.processId ?? "Não informado"}</p><h2 className="font-semibold">Imóveis de origem preservados</h2><ul>{sources.map((source, index) => { const value = taxScopeSnapshot(source); return <li key={index} className="text-sm">{String(value.municipalInsc ?? value.id)} · terreno {String(value.landArea)} m² · construção {String(value.builtArea)} m²</li>; })}</ul><h2 className="font-semibold">Novas inscrições</h2><ul>{destinations.map((destination, index) => { const value = taxScopeSnapshot(destination); return <li key={index} className="text-sm">{String(value.inscription)} · cadastro {String(value.id)}</li>; })}</ul><PrintMovements/></main>;
}
