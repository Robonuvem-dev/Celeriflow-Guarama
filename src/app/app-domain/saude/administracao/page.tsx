import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { healthAdministrationPageData, healthAdministrationReferences } from "@/db/repositories/health-pages/administration";
import AdministracaoClient, { type AdministrationSituation, type AdministrationTab } from "./AdministracaoClient";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

type SearchParams = { aba?: string | string[]; page?: string | string[]; q?: string | string[]; situacao?: string | string[]; de?: string | string[]; ate?: string | string[] };
const tabs: AdministrationTab[] = ["unidades", "profissionais", "especialidades", "grupos", "servicos", "cbo", "agendamentos", "feriados", "pessoas", "empresas", "acessos"];
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function parseTab(value: string | undefined): AdministrationTab { return value && tabs.includes(value as AdministrationTab) ? value as AdministrationTab : "unidades"; }
function parseSituation(value: string | undefined): AdministrationSituation { return value === "ativo" || value === "inativo" ? value : ""; }
function parsePage(value: string | undefined) { if (!value || !/^\d+$/.test(value)) return 1; const page = Number(value); return Number.isSafeInteger(page) && page > 0 ? page : 1; }
function parseDate(value: string | undefined, fallback: Date) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback.toISOString().slice(0, 10); }

export default async function SaudeAdministracaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const params = await searchParams;
  const tab = parseTab(firstValue(params.aba)), query = (firstValue(params.q) || "").trim().slice(0, 200), situation = parseSituation(firstValue(params.situacao)), requestedPage = parsePage(firstValue(params.page));
  const today = new Date(), thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  const usageFrom = parseDate(firstValue(params.de), thirtyDaysAgo), usageUntil = parseDate(firstValue(params.ate), today);
  const canManageAccess = isSystemAdministrator(context.user);
  if (tab === "acessos" && !canManageAccess) throw new Error("Apenas o administrador do sistema pode gerenciar usuários e acessos.");
  const [data, references] = await Promise.all([healthAdministrationPageData(database, { tab, situation, query, requestedPage, usageFrom, usageUntil }), healthAdministrationReferences(database)]);
  const { total, page, unitRows, professionalRows, specialtyRows, groupRows, serviceRows, cboRows, schedulingGroupRows, holidayRows, personRows, companyRows, accessRows, usageRows } = data;
  const { unitOptions, specialtyOptions, serviceOptions, cboOptions, groupOptions, employeeOptions, profiles } = references;

  return (
    <PageFrame className="flex h-full min-h-0 max-w-none flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Administração da Saúde" icon={<Building2 className="size-4 shrink-0 text-emerald-700" />} className="mb-0 shrink-0" action={<OperationalFilters label="Áreas administrativas"><nav className="grid gap-3 text-sm" aria-label="Áreas administrativas"><Link href="/app-domain/saude/administracao/documentos">Documentos</Link><Link href="/app-domain/saude/administracao/unificacoes">Unificações</Link><Link href="/app-domain/saude/administracao/laboratorio">Laboratório</Link><Link href="/saude/administracao/importacoes">Cargas SUS</Link><Link href="/saude/administracao/procedimentos">Procedimentos</Link></nav></OperationalFilters>} />
      <AdministracaoClient
        activeTab={tab}
        query={query}
        situation={situation}
        page={page}
        total={total}
        unitRows={unitRows}
        professionalRows={professionalRows}
        specialtyRows={specialtyRows}
        groupRows={groupRows}
        serviceRows={serviceRows}
        cboRows={cboRows}
        schedulingGroupRows={schedulingGroupRows}
        holidayRows={holidayRows}
        personRows={personRows}
        companyRows={companyRows}
        accessRows={accessRows}
        usageRows={usageRows}
        usageFrom={usageFrom}
        usageUntil={usageUntil}
        unitOptions={unitOptions}
        specialtyOptions={specialtyOptions}
        serviceOptions={serviceOptions}
        cboOptions={cboOptions}
        groupOptions={groupOptions}
        employeeOptions={employeeOptions}
        profileOptions={profiles.map(profile => ({ id: profile.id, name: profile.nome }))}
        canManageAccess={canManageAccess}
        canCreate={canPerformModuleOperation(context.user, "SAUDE", "create")}
        canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")}
      />
    </PageFrame>
  );
}
