import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

export default async function ConfiguredFiscalDetails({ database, entityType, entityId, at }: { database: DatabaseExecutor; entityType: "REAL_ESTATE" | "ECONOMIC_REGISTRATION"; entityId: string; at?: string }) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const reference = at ? new Date(at) : new Date();
  if (!Number.isFinite(reference.valueOf())) return <p className="text-xs">Referência inválida.</p>;
  const entries = await listFiscalEntries(database, { entityType, entityIds: [entityId], categories: ["TYPED_FISCAL_RECORD"], recordedBy: reference, allowedBudgetUnitIds, order: "version-created" });
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.title)) latest.set(entry.title, entry);
  const visible = [...latest.values()].filter(entry => entry.status === "ATIVO");
  if (!visible.length) return null;
  return <section className="shrink-0 rounded border bg-white p-3"><h2 className="text-sm font-bold">Formulários e vínculos na referência {reference.toLocaleString("pt-BR")}</h2><div className="mt-2 max-h-48 overflow-auto space-y-2">{visible.map(entry => {
    const data = taxScopeSnapshot(entry.data); const values = taxScopeSnapshot(data.values);
    const fields = Array.isArray(data.fields) ? data.fields : [];
    return <article key={entry.id} className="rounded border p-2 text-xs"><h3 className="font-semibold">{String(data.kind)} · {String(data.name)} · versão {entry.version}</h3><dl className="mt-1 grid gap-1 sm:grid-cols-3">{fields.map((field, index) => { const definition = taxScopeSnapshot(field); const value = values[String(definition.key)]; return <div key={index}><dt className="font-semibold">{String(definition.label)}</dt><dd>{value === null || value === undefined ? "Não informado" : typeof value === "boolean" ? value ? "Sim" : "Não" : String(value)}</dd></div>; })}{data.kind === "PGV" && <><div><dt className="font-semibold">Valor do m²</dt><dd>{String(data.landUnitValue)}</dd></div><div><dt className="font-semibold">Testada</dt><dd>{String(data.frontage)} m</dd></div></>}</dl><p className="mt-1">Protocolo: {entry.processId ?? "Não informado"} · {entry.createdAt.toLocaleString("pt-BR")}</p>{Array.isArray(data.documentIds) && data.documentIds.length > 0 && <p>Anexos GED: {data.documentIds.map(String).join(", ")}</p>}</article>;
  })}</div></section>;
}
