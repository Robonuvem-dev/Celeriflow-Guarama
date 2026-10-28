import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredFiscalDetails from "../../cadastros-fiscais/ConfiguredFiscalDetails";
import FiscalReferenceFilter from "../../cadastros-fiscais/FiscalReferenceFilter";
import PropertyProfilePosition from "./PropertyProfilePosition";

const labels: Record<string, string> = { municipalInsc: "Inscrição municipal", registration: "Matrícula", propertyType: "Tipo", status: "Situação", streetName: "Logradouro", number: "Número", complement: "Complemento", lot: "Lote", block: "Quadra", landArea: "Área do terreno", builtArea: "Área construída", propertyUse: "Uso", fiscalZone: "Zona fiscal", neighborhoodId: "Bairro", streetId: "Logradouro cadastrado", taxpayerId: "Titular principal" };

export default async function PropertyHistory({ database, id, at }: { database: DatabaseExecutor; id: string; at?: string }) {
  const entries = await listFiscalEntries(database, { entityType: "REAL_ESTATE", entityIds: [id], categories: ["CADASTRAL_HISTORY"] });
  const actorIds = [...new Set(entries.map(entry => entry.actorUsuarioId).filter((value): value is string => Boolean(value)))];
  const users = await listFiscalActorNames(database, actorIds);
  const names = new Map(users.map(user => [user.id, user.nome]));
  const date = at ? new Date(at) : null;
  const position = date && Number.isFinite(date.valueOf()) ? entries.find(entry => entry.effectiveFrom <= date) : null;
  const fields = taxScopeSnapshot(taxScopeSnapshot(position?.data).after);
  return <section className="shrink-0 rounded border bg-white p-3"><h2 className="text-sm font-bold">Histórico e espelho imobiliário</h2>
    <FiscalReferenceFilter at={at}/>
    {at && <div className="mt-2 bg-slate-50 p-2 text-xs">{position ? <dl className="grid gap-2 sm:grid-cols-3">{Object.entries(fields).filter(([key]) => key !== "id").map(([key, value]) => <div key={key}><dt className="font-semibold">{labels[key] ?? key}</dt><dd>{value === null ? "Não informado" : String(value)}</dd></div>)}</dl> : "Sem posição documentada na referência informada."}</div>}
    <div className="mt-2 max-h-40 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Data / usuário</th><th>Campo</th><th>Anterior</th><th>Novo</th></tr></thead><tbody>{entries.flatMap(entry => { const memory = taxScopeSnapshot(entry.data); const before = taxScopeSnapshot(memory.before); const after = taxScopeSnapshot(memory.after); const changed = Array.isArray(memory.fields) ? memory.fields.filter((field): field is string => typeof field === "string") : []; return changed.map(field => <tr key={`${entry.id}:${field}`} className="border-t"><td className="py-1">{entry.effectiveFrom.toLocaleString("pt-BR")} · {names.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId ?? "Origem sem usuário atribuído"}</td><td>{labels[field] ?? field}</td><td>{memory.baseline ? "Posição inicial" : String(before[field] ?? "Não informado")}</td><td>{String(after[field] ?? "Não informado")}</td></tr>); })}</tbody></table>{!entries.length && <p className="text-xs text-slate-500">Sem posições documentadas. O próximo movimento registrará a posição observada e a alteração.</p>}</div>
    <ConfiguredFiscalDetails database={database} entityType="REAL_ESTATE" entityId={id} at={at}/>
    <PropertyProfilePosition database={database} id={id} at={at}/>
  </section>;
}
