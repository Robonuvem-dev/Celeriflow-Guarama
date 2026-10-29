import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredFiscalDetails from "../../cadastros-fiscais/ConfiguredFiscalDetails";
import FiscalReferenceFilter from "../../cadastros-fiscais/FiscalReferenceFilter";
import PropertyProfilePosition from "./PropertyProfilePosition";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";

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
    <OperationalTablePanel title="Histórico cadastral imobiliário" triggerLabel="Abrir histórico imobiliário em tabela" description="Campos e posições efetivamente documentados no cadastro imobiliário.">
      <TaxOperationalTable id="historico-imobiliario" resetKey={`${id}:${at ?? ""}`} emptyMessage="Sem posições documentadas. O próximo movimento registrará a posição observada e a alteração."
        toolbar={<span className="text-[13px]">Imóvel {id} · referência {at ?? "atual"}</span>}
        columns={[["date", "Data", 80, 165], ["actor", "Usuário", 80, 175], ["field", "Campo", 80, 160], ["before", "Anterior", 100, 300], ["after", "Novo", 100, 300]]}
        rows={entries.flatMap(entry => {
          const memory = taxScopeSnapshot(entry.data); const before = taxScopeSnapshot(memory.before); const after = taxScopeSnapshot(memory.after);
          const changed = Array.isArray(memory.fields) ? memory.fields.filter((field): field is string => typeof field === "string") : [];
          const display = (value: unknown) => value == null ? "Não informado" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
          return changed.map(field => ({ id: `${entry.id}:${field}`, label: labels[field] ?? field, values: { date: entry.effectiveFrom.toLocaleString("pt-BR"), actor: names.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId ?? "Origem sem usuário atribuído", field: labels[field] ?? field, before: memory.baseline ? "Posição inicial" : display(before[field]), after: display(after[field]) } }));
        })} />
    </OperationalTablePanel>
    <ConfiguredFiscalDetails database={database} entityType="REAL_ESTATE" entityId={id} at={at}/>
    <PropertyProfilePosition database={database} id={id} at={at}/>
  </section>;
}
