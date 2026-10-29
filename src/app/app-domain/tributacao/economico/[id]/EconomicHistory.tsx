import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredFiscalDetails from "../../cadastros-fiscais/ConfiguredFiscalDetails";
import FiscalReferenceFilter from "../../cadastros-fiscais/FiscalReferenceFilter";
import EconomicProfilePosition from "./EconomicProfilePosition";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";

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
    <OperationalTablePanel title="Histórico cadastral econômico" triggerLabel="Abrir histórico cadastral em tabela" description="Alterações documentadas do cadastro econômico, sem reconstruir posições anteriores.">
      <TaxOperationalTable id="historico-economico" resetKey={`${registrationId}:${at ?? ""}`} emptyMessage="Histórico será registrado a partir da próxima alteração; posições anteriores não foram reconstruídas."
        toolbar={<span className="text-[13px]">Inscrição {registrationId} · referência {at ?? "atual"}</span>}
        columns={[["date", "Data", 80, 165], ["actor", "Usuário", 80, 175], ["field", "Campo", 80, 160], ["before", "Anterior", 100, 300], ["after", "Novo", 100, 300]]}
        rows={entries.flatMap(entry => {
          const memory = taxScopeSnapshot(entry.data); const before = taxScopeSnapshot(memory.before); const after = taxScopeSnapshot(memory.after);
          const changed = Array.isArray(memory.fields) ? memory.fields.filter((field): field is string => typeof field === "string") : [];
          const display = (value: unknown) => value == null ? "Não informado" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
          return changed.map(field => ({ id: `${entry.id}:${field}`, label: field, values: { date: entry.effectiveFrom.toLocaleString("pt-BR"), actor: names.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId ?? "Origem sem usuário atribuído", field, before: memory.baseline ? "Posição inicial documentada" : display(before[field]), after: display(after[field]) } }));
        })} />
    </OperationalTablePanel>
    <ConfiguredFiscalDetails database={database} entityType="ECONOMIC_REGISTRATION" entityId={registrationId} at={at}/>
    <EconomicProfilePosition database={database} id={registrationId} at={at}/>
  </section>;
}
