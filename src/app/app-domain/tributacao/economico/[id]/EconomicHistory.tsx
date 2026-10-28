import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredFiscalDetails from "../../cadastros-fiscais/ConfiguredFiscalDetails";
import FiscalReferenceFilter from "../../cadastros-fiscais/FiscalReferenceFilter";
import EconomicProfilePosition from "./EconomicProfilePosition";

export default async function EconomicHistory({ database, registrationId, at }: { database: DatabaseExecutor; registrationId: string; at?: string }) {
  const entries = await listFiscalEntries(database, { entityType: "ECONOMIC_REGISTRATION", entityIds: [registrationId], categories: ["CADASTRAL_HISTORY"] });
  const actorIds = [...new Set(entries.map(entry => entry.actorUsuarioId).filter((id): id is string => Boolean(id)))];
  const users = await listFiscalActorNames(database, actorIds);
  const names = new Map(users.map(user => [user.id, user.nome]));
  const reference = at ? new Date(at) : null;
  const valid = reference && Number.isFinite(reference.valueOf());
  const position = valid ? entries.find(entry => entry.effectiveFrom <= reference) : null;
  const data = taxScopeSnapshot(position?.data);
  const fields = taxScopeSnapshot(data.after);
  return <section className="shrink-0 rounded border bg-white p-3">
    <h2 className="text-sm font-bold">Histórico e espelho cadastral</h2>
    <FiscalReferenceFilter at={at}/>
    {at && <div className="mt-2 rounded bg-slate-50 p-2 text-xs">{position ? <><p>Posição registrada por {names.get(position.actorUsuarioId ?? "") ?? position.actorUsuarioId} · {position.effectiveFrom.toLocaleString("pt-BR")}</p><dl className="mt-1 grid gap-1 sm:grid-cols-3">{Object.entries(fields).map(([key, value]) => <div key={key}><dt className="font-semibold">{key}</dt><dd>{value === null ? "Não informado" : String(value)}</dd></div>)}</dl></> : "Não há posição documentada na referência informada. O cadastro atual não é usado para presumir o passado."}</div>}
    <div className="mt-2 max-h-40 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Data / usuário</th><th>Campo</th><th>Anterior</th><th>Novo</th></tr></thead><tbody>{entries.flatMap(entry => { const memory = taxScopeSnapshot(entry.data); const before = taxScopeSnapshot(memory.before); const after = taxScopeSnapshot(memory.after); const changed = Array.isArray(memory.fields) ? memory.fields.filter((field): field is string => typeof field === "string") : []; return changed.map(field => <tr key={`${entry.id}:${field}`} className="border-t"><td className="py-1">{entry.effectiveFrom.toLocaleString("pt-BR")} · {names.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId}</td><td>{field}</td><td>{memory.baseline ? "Posição inicial documentada" : String(before[field] ?? "Não informado")}</td><td>{String(after[field] ?? "Não informado")}</td></tr>); })}</tbody></table>{!entries.length && <p className="text-xs text-slate-500">Histórico será registrado a partir da próxima alteração; posições anteriores não foram reconstruídas.</p>}</div>
    <ConfiguredFiscalDetails database={database} entityType="ECONOMIC_REGISTRATION" entityId={registrationId} at={at}/>
    <EconomicProfilePosition database={database} id={registrationId} at={at}/>
  </section>;
}
