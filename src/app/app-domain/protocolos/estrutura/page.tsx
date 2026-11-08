import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  FolderTree,
  Landmark,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Search,
  UserCheck,
  XCircle,
} from "lucide-react";
import { db } from "@/db/client";
import { administrativeUnits, departments, employees, secretariats } from "@/db/schema/administration";
import { processDepartmentMetadata, processUnitMetadata } from "@/db/schema/process-reference-catalog";
import { getTenantContextForModule, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { saveProcessStructure } from "./actions";
import { SectorResponsiblesView, type SectorResponsibleRow } from "./SectorResponsiblesView";

export const dynamic = "force-dynamic";

type Option = { id: string; name: string };
type RecordData = {
  id: string;
  name: string;
  secretariatId: string;
  isActive: boolean;
  acronym: string | null;
  unitId?: string | null;
  responsibleEmployeeId?: string | null;
};

async function resolveStructureContext() {
  try {
    return await getTenantContextForSystemAdministration();
  } catch {
    return await getTenantContextForModule("PROCESSOS");
  }
}

function StructureFields({
  kind,
  record,
  orgs,
  units,
  staff,
}: {
  kind: "unit" | "department";
  record?: RecordData;
  orgs: Option[];
  units: Option[];
  staff: Option[];
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={record?.id ?? ""} />

      <div className="grid gap-3 md:grid-cols-12">
        <label className="field md:col-span-4">
          <span>Órgão / Secretaria *</span>
          <select name="secretariatId" required defaultValue={record?.secretariatId ?? ""} className="input">
            <option value="">Selecione o órgão...</option>
            {orgs.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field md:col-span-5">
          <span>{kind === "unit" ? "Nome da Unidade Administrativa *" : "Nome do Setor / Departamento *"}</span>
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={record?.name}
            placeholder={
              kind === "unit"
                ? "Ex: Coordenadoria de Protocolo Geral"
                : "Ex: Setor de Triagem e Autuação"
            }
            className="input"
          />
        </label>

        <label className="field md:col-span-3">
          <span>Sigla Oficial *</span>
          <input
            name="acronym"
            required
            maxLength={30}
            defaultValue={record?.acronym ?? ""}
            placeholder="Ex: CPG / STA"
            className="input uppercase"
          />
        </label>

        {kind === "department" && (
          <>
            <label className="field md:col-span-6">
              <span>Unidade Administrativa Vinculada *</span>
              <select required name="unitId" defaultValue={record?.unitId ?? ""} className="input">
                <option value="">Selecione a unidade do órgão...</option>
                {units.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field md:col-span-6">
              <span>Servidor Responsável pelo Setor</span>
              <select
                name="responsibleEmployeeId"
                defaultValue={record?.responsibleEmployeeId ?? ""}
                className="input"
              >
                <option value="">Sem responsável designado</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={record?.isActive ?? true}
            className="h-4 w-4 rounded border-slate-300 text-[#0e4c7e] focus:ring-[#0e4c7e]"
          />
          Registro ativo para tramitação de processos e ouvidoria
        </label>

        <button
          type="submit"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0e4c7e] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#0b3d66]"
        >
          <Save className="h-3.5 w-3.5" />
          {record ? "Salvar Alterações" : kind === "unit" ? "Cadastrar Unidade" : "Cadastrar Setor"}
        </button>
      </div>
    </div>
  );
}

export default async function StructurePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const context = await resolveStructureContext();
  const database = context.database ?? db;
  const { q: raw = "", tab = "all" } = await searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 200) : "";

  const [orgs, unitRows, departmentRows, staff] = await Promise.all([
    database
      .select({ id: secretariats.id, name: secretariats.name, acronym: secretariats.acronym, isActive: secretariats.isActive })
      .from(secretariats)
      .orderBy(asc(secretariats.name)),
    database
      .select({ record: administrativeUnits, metadata: processUnitMetadata })
      .from(administrativeUnits)
      .leftJoin(processUnitMetadata, eq(processUnitMetadata.unitId, administrativeUnits.id))
      .orderBy(asc(administrativeUnits.name)),
    database
      .select({ record: departments, metadata: processDepartmentMetadata })
      .from(departments)
      .leftJoin(processDepartmentMetadata, eq(processDepartmentMetadata.departmentId, departments.id))
      .orderBy(asc(departments.name)),
    database
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
  ]);

  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
  const unitMap = new Map(unitRows.map((u) => [u.record.id, u.record.name]));
  const staffMap = new Map(staff.map((s) => [s.id, s.name]));

  const units = unitRows.map((row) => ({ id: row.record.id, name: row.record.name }));
  const matches = (name: string, acronym: string | null, orgName?: string) =>
    !q ||
    `${name} ${acronym ?? ""} ${orgName ?? ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(q.toLocaleLowerCase("pt-BR"));

  const filteredUnits = unitRows.filter((row) =>
    matches(row.record.name, row.metadata?.acronym ?? null, orgMap.get(row.record.secretariatId)),
  );
  const filteredDepartments = departmentRows.filter((row) =>
    matches(row.record.name, row.metadata?.acronym ?? null, orgMap.get(row.record.secretariatId)),
  );

  const showUnits = tab === "all" || tab === "unit";
  const showDepartments = tab === "all" || tab === "department";
  const showResponsibles = tab === "responsaveis";

  const responsibleRows: SectorResponsibleRow[] = departmentRows.map((row) => ({
    departmentId: row.record.id,
    departmentName: row.record.name,
    acronym: row.metadata?.acronym ?? null,
    secretariatId: row.record.secretariatId,
    secretariatName: orgMap.get(row.record.secretariatId) || "Órgão não identificado",
    unitId: row.metadata?.unitId ?? null,
    unitName: row.metadata?.unitId ? unitMap.get(row.metadata.unitId) || "—" : "—",
    responsibleEmployeeId: row.metadata?.responsibleEmployeeId ?? null,
    responsibleName: row.metadata?.responsibleEmployeeId ? staffMap.get(row.metadata.responsibleEmployeeId) || null : null,
    isResponsibleActive: Boolean(row.metadata?.responsibleEmployeeId && row.record.isActive),
  }));

  return (
    <PageFrame className="space-y-5 pb-6">
      <PageHeader
        title="Estrutura de Atendimento e Processos"
        icon={<FolderTree className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/administracao/secretarias/novo"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0e4c7e] px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0b3d66]"
            >
              <Plus className="h-3.5 w-3.5" />
              Cadastrar Órgão ou Secretaria
            </Link>
            <Link
              href="/administracao/secretarias"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Landmark className="h-3.5 w-3.5 text-[#0e4c7e]" />
              Ver Órgãos ({orgs.length})
            </Link>
            <Link
              href="/protocolos"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Voltar aos Protocolos
            </Link>
          </div>
        }
      />

      {/* Resumo de Indicadores da Estrutura */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold text-slate-500">Órgãos e Secretarias</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{orgs.length}</p>
          </div>
          <div className="rounded-lg bg-[#0e4c7e]/10 p-2.5 text-[#0e4c7e]">
            <Landmark className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold text-slate-500">Unidades Administrativas</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{unitRows.length}</p>
          </div>
          <div className="rounded-lg bg-[#0e4c7e]/10 p-2.5 text-[#0e4c7e]">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold text-slate-500">Setores e Departamentos</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{departmentRows.length}</p>
          </div>
          <div className="rounded-lg bg-[#0e4c7e]/10 p-2.5 text-[#0e4c7e]">
            <Layers className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Barra de Abas + Pesquisa */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "Visão Completa", count: unitRows.length + departmentRows.length },
            { id: "unit", label: "Unidades Administrativas", count: unitRows.length },
            { id: "department", label: "Setores e Responsáveis", count: departmentRows.length },
            { id: "responsaveis", label: "Consulta de Responsáveis (19.40)", count: departmentRows.filter(d => d.metadata?.responsibleEmployeeId).length },
          ].map((item) => {
            const active = tab === item.id;
            const href = `/protocolos/estrutura?tab=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={item.id}
                href={href}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-[#0e4c7e] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-white/20 text-white" : "bg-white text-slate-600"
                  }`}
                >
                  {item.count}
                </span>
              </Link>
            );
          })}
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              aria-label="Descrição ou sigla"
              placeholder="Buscar unidade, setor, sigla ou órgão..."
              className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-[#0e4c7e] focus:bg-white sm:w-72"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 text-xs font-bold text-white hover:bg-slate-900"
          >
            Pesquisar
          </button>
          {q && (
            <Link
              href={`/protocolos/estrutura?tab=${tab}`}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar
            </Link>
          )}
        </form>
      </div>

      {/* Seção 1: Unidades Administrativas */}
      {showUnits && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Building2 className="h-5 w-5 text-[#0e4c7e]" />
                Unidades Administrativas
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Unidades vinculadas a cada Secretaria ou Órgão Administrativo para organização territorial e funcional.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {filteredUnits.length} unidade(s)
            </span>
          </div>

          {/* Acordeão para Nova Unidade */}
          <details className="group rounded-xl border border-[#0e4c7e]/25 bg-[#0e4c7e]/[0.03] open:bg-white open:shadow-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-bold text-[#0e4c7e]">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar Nova Unidade Administrativa
              </span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <form action={saveProcessStructure} className="border-t border-slate-100 p-4">
              <StructureFields kind="unit" orgs={orgs} units={units} staff={staff} />
            </form>
          </details>

          {/* Lista de Unidades em Acordeão */}
          <div className="space-y-2 pt-1">
            {filteredUnits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
                Nenhuma unidade encontrada para o filtro informado.
              </div>
            ) : (
              filteredUnits.map((row) => {
                const orgName = orgMap.get(row.record.secretariatId) || "Órgão não identificado";
                const acronym = row.metadata?.acronym ?? null;
                return (
                  <details
                    key={row.record.id}
                    className="group rounded-xl border border-slate-200 bg-slate-50/60 transition open:border-[#0e4c7e]/40 open:bg-white open:shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-md bg-[#0e4c7e]/10 px-2 py-0.5 text-xs font-bold uppercase text-[#0e4c7e]">
                          {acronym || "SEM SIGLA"}
                        </span>
                        <span className="text-sm font-bold text-slate-900">{row.record.name}</span>
                        <span className="text-xs text-slate-500">• {orgName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.record.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                            <XCircle className="h-3 w-3" />
                            Inativa
                          </span>
                        )}
                        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <form action={saveProcessStructure} className="border-t border-slate-100 p-4">
                      <StructureFields
                        kind="unit"
                        record={{
                          ...row.record,
                          acronym,
                        }}
                        orgs={orgs}
                        units={units}
                        staff={staff}
                      />
                    </form>
                  </details>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Seção 2: Setores e Responsáveis */}
      {showDepartments && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Layers className="h-5 w-5 text-[#0e4c7e]" />
                Setores e Responsáveis
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Departamentos internos de tramitação vinculados às unidades administrativas e seus respectivos responsáveis.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {filteredDepartments.length} setor(es)
            </span>
          </div>

          {/* Acordeão para Novo Setor */}
          <details className="group rounded-xl border border-[#0e4c7e]/25 bg-[#0e4c7e]/[0.03] open:bg-white open:shadow-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-bold text-[#0e4c7e]">
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar Novo Setor e Designar Responsável
              </span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <form action={saveProcessStructure} className="border-t border-slate-100 p-4">
              <StructureFields kind="department" orgs={orgs} units={units} staff={staff} />
            </form>
          </details>

          {/* Lista de Setores em Acordeão */}
          <div className="space-y-2 pt-1">
            {filteredDepartments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
                Nenhum setor encontrado para o filtro informado.
              </div>
            ) : (
              filteredDepartments.map((row) => {
                const orgName = orgMap.get(row.record.secretariatId) || "Órgão não identificado";
                const unitName = row.metadata?.unitId ? unitMap.get(row.metadata.unitId) : null;
                const responsibleName = row.metadata?.responsibleEmployeeId
                  ? staffMap.get(row.metadata.responsibleEmployeeId)
                  : null;
                const acronym = row.metadata?.acronym ?? null;

                return (
                  <details
                    key={row.record.id}
                    className="group rounded-xl border border-slate-200 bg-slate-50/60 transition open:border-[#0e4c7e]/40 open:bg-white open:shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-md bg-[#0e4c7e]/10 px-2 py-0.5 text-xs font-bold uppercase text-[#0e4c7e]">
                          {acronym || "SETOR"}
                        </span>
                        <span className="text-sm font-bold text-slate-900">{row.record.name}</span>
                        <span className="text-xs text-slate-500">
                          • {orgName}
                          {unitName ? ` / ${unitName}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {responsibleName && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            <UserCheck className="h-3 w-3 text-[#0e4c7e]" />
                            {responsibleName}
                          </span>
                        )}
                        {row.record.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                            <XCircle className="h-3 w-3" />
                            Inativo
                          </span>
                        )}
                        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <form action={saveProcessStructure} className="border-t border-slate-100 p-4">
                      <StructureFields
                        kind="department"
                        record={{
                          ...row.record,
                          acronym,
                          unitId: row.metadata?.unitId,
                          responsibleEmployeeId: row.metadata?.responsibleEmployeeId,
                        }}
                        orgs={orgs}
                        units={units}
                        staff={staff}
                      />
                    </form>
                  </details>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Seção 3: Consulta de Responsáveis com Filtros e Exportação (19.40, 19.8, 19.39) */}
      {(showResponsibles || tab === "all") && (
        <SectorResponsiblesView
          rows={responsibleRows}
          orgs={orgs}
          units={units}
          staff={staff}
          canUpdate={context.user.profileCode === "ADMIN" || Boolean(context.user.permissions?.includes("ALL"))}
        />
      )}
    </PageFrame>
  );
}
