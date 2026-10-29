import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { functionalServiceSchema } from "@/lib/portal-servidor/service-catalog";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ServiceConfigurationForm } from "./ServiceConfigurationForm";
import { db } from "@/db/client";
import { readPortalRules, readActiveRuleSets } from "@/db/repositories/personnel-pages/catalog";
import { readPublicServiceDescriptions } from "@/db/repositories/personnel-pages/requests";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

export const dynamic = "force-dynamic";
export default async function FunctionalServiceAdministration({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const rules = await readPortalRules(context.database ?? db, "service");
  const configured = rules.flatMap(rule => { const parsed = functionalServiceSchema.safeParse(rule.value); return parsed.success && (isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(parsed.data.budgetUnitId)) ? [{ rule, configuration: parsed.data }] : []; });
  const descriptions = await readPublicServiceDescriptions(context.database ?? db, configured.map(item => item.configuration.publicServiceId));
  const ruleSets = await readActiveRuleSets(context.database ?? db);
  const selected = configured.find(item => item.rule.id === params.edit), common = selected && descriptions.find(item => item.id === selected.configuration.publicServiceId);
  if ((params.new || selected && common) && params.view !== "manage") redirect(`/rh/servicos-funcionais?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")), view: "manage" })}`);
  if (params.view === "manage" && !params.new && !(selected && common)) redirect("/rh/servicos-funcionais");
  const configuration = selected ? { budgetUnitId: selected.configuration.budgetUnitId, group: selected.configuration.group, processTypeId: selected.configuration.processTypeId, subjectId: selected.configuration.subjectId, operation: selected.configuration.operation, employeeIds: selected.configuration.employeeIds, fields: selected.configuration.fields, requiredDocuments: selected.configuration.requiredDocuments, acceptance: selected.configuration.acceptance } : undefined;
  if (!params.new && !(selected && common)) {
    const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(configured.length / OPERATIONAL_PAGE_SIZE)));
    const columns = [rhColumn("name", "Serviço", 260, 150), rhColumn("code", "Código", 190, 120, "identifier"), rhColumn("group", "Grupo", 160, 100), rhColumn("version", "Versão", 90, 70, "text", "right"), rhColumn("status", "Situação", 150, 110, "status"), rhColumn("actions", "Ações", 90, 80, "actions")];
    return <OperationalListFrame label="Serviços funcionais do Portal" actions={<><RhNewLink href="?view=manage&new=1">Novo serviço</RhNewLink><OperationalFilters label="Navegação"><nav aria-label="Serviços funcionais" className={styles.filterFields}><Link href="/rh/solicitacoes">Fila de solicitações</Link><Link href="/configuracoes/processos">Tipos, assuntos e roteiros</Link></nav></OperationalFilters></>}
      pagination={<OperationalLinkPagination page={page} total={configured.length} pathname="/rh/servicos-funcionais" />}>
      <OperationalTable columns={columns} preferenceId="rh-servicos-funcionais" caption="Serviços funcionais do Portal" emptyMessage="Nenhum serviço cadastrado no seu escopo." rows={configured.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(({ rule, configuration }) => ({ id: rule.id, label: rule.name, values: { name: rule.name, code: rule.code, group: configuration.group, version: String(configuration.version), status: rule.isActive ? "Publicado" : "Não publicado" }, actions: <Link href={`?edit=${rule.id}`}>Editar</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Serviços funcionais do Portal" description="Catálogo comum, formulários, documentos e roteiros dos requerimentos internos." action={<Link href="?new=1">Novo serviço</Link>} />
    <div className="flex gap-3 text-xs"><Link href="/rh/solicitacoes" className="underline">Fila de solicitações</Link><Link href="/configuracoes/processos" className="underline">Tipos, assuntos e roteiros</Link></div>
    <Link href="/rh/servicos-funcionais" className="text-xs underline">Voltar à listagem</Link>
    <ServiceConfigurationForm key={selected?.rule.id || "new"} ruleSets={ruleSets} values={selected && common ? { id: selected.rule.id, ruleSetId: selected.rule.ruleSetId, code: selected.rule.code, name: common.name, description: common.description, requirements: common.requirements || "", steps: common.steps || "", deadline: common.deadline || "", isActive: selected.rule.isActive && common.isActive, configuration } : undefined} />
  </div>;
}
