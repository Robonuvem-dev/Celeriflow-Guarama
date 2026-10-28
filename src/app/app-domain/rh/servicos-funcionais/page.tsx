import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { functionalServiceSchema } from "@/lib/portal-servidor/service-catalog";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ServiceConfigurationForm } from "./ServiceConfigurationForm";
import { db } from "@/db/client";
import { readPortalRules, readActiveRuleSets } from "@/db/repositories/personnel-pages/catalog";
import { readPublicServiceDescriptions } from "@/db/repositories/personnel-pages/requests";

export const dynamic = "force-dynamic";
export default async function FunctionalServiceAdministration({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const rules = await readPortalRules(context.database ?? db, "service");
  const configured = rules.flatMap(rule => { const parsed = functionalServiceSchema.safeParse(rule.value); return parsed.success && (isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(parsed.data.budgetUnitId)) ? [{ rule, configuration: parsed.data }] : []; });
  const descriptions = await readPublicServiceDescriptions(context.database ?? db, configured.map(item => item.configuration.publicServiceId));
  const ruleSets = await readActiveRuleSets(context.database ?? db);
  const selected = configured.find(item => item.rule.id === params.edit), common = selected && descriptions.find(item => item.id === selected.configuration.publicServiceId);
  const configuration = selected ? { budgetUnitId: selected.configuration.budgetUnitId, group: selected.configuration.group, processTypeId: selected.configuration.processTypeId, subjectId: selected.configuration.subjectId, operation: selected.configuration.operation, employeeIds: selected.configuration.employeeIds, fields: selected.configuration.fields, requiredDocuments: selected.configuration.requiredDocuments, acceptance: selected.configuration.acceptance } : undefined;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Serviços funcionais do Portal" description="Catálogo comum, formulários, documentos e roteiros dos requerimentos internos." action={<Link href="?new=1">Novo serviço</Link>} />
    <div className="flex gap-3 text-xs"><Link href="/rh/solicitacoes" className="underline">Fila de solicitações</Link><Link href="/configuracoes/processos" className="underline">Tipos, assuntos e roteiros</Link></div>
    {params.new || selected && common ? <ServiceConfigurationForm key={selected?.rule.id || "new"} ruleSets={ruleSets} values={selected && common ? { id: selected.rule.id, ruleSetId: selected.rule.ruleSetId, code: selected.rule.code, name: common.name, description: common.description, requirements: common.requirements || "", steps: common.steps || "", deadline: common.deadline || "", isActive: selected.rule.isActive && common.isActive, configuration } : undefined} /> : <section className="rounded border border-slate-300 bg-white"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Serviço</th><th>Grupo</th><th>Versão</th><th>Situação</th></tr></thead><tbody>{configured.map(({ rule, configuration }) => <tr key={rule.id} className="border-t"><td className="p-2"><Link href={`?edit=${rule.id}`} className="font-semibold text-emerald-800 underline">{rule.name}</Link><p className="text-slate-500">{rule.code}</p></td><td>{configuration.group}</td><td>{configuration.version}</td><td>{rule.isActive ? "Publicado" : "Não publicado"}</td></tr>)}</tbody></table>{!configured.length && <p className="p-4 text-sm">Nenhum serviço cadastrado no seu escopo.</p>}</section>}
  </div>;
}
