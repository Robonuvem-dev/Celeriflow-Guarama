import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ChevronDown, Layers, Plus, Route, Save } from "lucide-react";
import { db } from "@/db/client";
import { administrativeUnits, departments, secretariats } from "@/db/schema/administration";
import { ombudsmanConfigurations, ombudsmanReferenceCatalog } from "@/db/schema/ombudsman-reference-catalog";
import { getAttendanceContext } from "@/lib/attendance/access";
import { ombudsmanRequestTypes } from "@/lib/attendance/reference-catalog";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { saveOmbudsmanConfiguration } from "../actions";

export const dynamic = "force-dynamic";

const kinds = {
  ROUTE: "Roteiros da solicitação",
  QUESTIONNAIRE: "Questionários de classificação",
  STATUS: "Situações da solicitação",
} as const;

type Kind = keyof typeof kinds;
type RecordData = typeof ombudsmanConfigurations.$inferSelect;
type Option = { id: string; name: string };
type Catalog = typeof ombudsmanReferenceCatalog.$inferSelect;

function ConfigurationFields({
  kind,
  record,
  catalog,
  orgs,
  units,
  sectors,
}: {
  kind: Kind;
  record?: RecordData;
  catalog: Catalog[];
  orgs: Option[];
  units: Option[];
  sectors: Option[];
}) {
  const settings = record?.settings ?? {};
  return (
    <div className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={record?.id ?? ""} />

      {record && (
        <div className="inline-block rounded bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-600">
          Código: {record.id}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="field md:col-span-2">
          <span>Descrição <span className="text-red-600">*</span></span>
          <input
            className="input"
            name="name"
            required
            maxLength={200}
            defaultValue={record?.name}
            placeholder={
              kind === "ROUTE"
                ? "Ex.: Roteiro padrão — Zeladoria e Obras"
                : kind === "QUESTIONNAIRE"
                  ? "Ex.: Avaliação de urgência e impacto urbano"
                  : "Ex.: Encaminhado para vistoria técnica"
            }
          />
        </label>

        {kind === "ROUTE" && (
          <>
            <label className="field">
              <span>Tipo de solicitação <span className="text-red-600">*</span></span>
              <select className="input" name="requestType" defaultValue={settings.requestType ?? "Solicitação"}>
                {ombudsmanRequestTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Assunto <span className="text-red-600">*</span></span>
              <select name="subjectId" className="input" required defaultValue={settings.subjectId ?? ""}>
                <option value="">Selecione</option>
                {catalog
                  .filter((row) => row.kind === "SUBJECT")
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.requestType} — {row.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field md:col-span-2">
              <span>Subassunto <span className="text-red-600">*</span></span>
              <select name="subsubjectId" className="input" required defaultValue={settings.subsubjectId ?? ""}>
                <option value="">Selecione</option>
                {catalog
                  .filter((row) => row.kind === "SUBSUBJECT")
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.requestType} — {catalog.find((parent) => parent.id === row.subjectId)?.name} — {row.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field">
              <span>Número da rota <span className="text-red-600">*</span></span>
              <input
                className="input"
                name="routeNumber"
                type="number"
                min={1}
                required
                defaultValue={settings.routeNumber ?? 1}
              />
            </label>

            <label className="field">
              <span>Sequência <span className="text-red-600">*</span></span>
              <input
                className="input"
                name="sequence"
                type="number"
                min={1}
                required
                defaultValue={settings.sequence ?? 1}
              />
            </label>

            <label className="field">
              <span>Previsão de dias (SLA) <span className="text-red-600">*</span></span>
              <input
                className="input"
                name="dueDays"
                type="number"
                min={0}
                max={3650}
                required
                defaultValue={settings.dueDays ?? 5}
              />
            </label>

            {(
              [
                { name: "secretariatId", label: "Órgão", rows: orgs },
                { name: "unitId", label: "Unidade", rows: units },
                { name: "departmentId", label: "Setor", rows: sectors },
              ] as const
            ).map((field) => (
              <label key={field.name} className="field">
                <span>
                  {field.label} <span className="text-red-600">*</span>
                </span>
                <select
                  className="input"
                  name={field.name}
                  required
                  defaultValue={settings[field.name] ?? ""}
                >
                  <option value="">Selecione</option>
                  {field.rows.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        )}

        {kind === "STATUS" && (
          <label className="field">
            <span>Status operacional correspondente</span>
            <select className="input" name="status" defaultValue={settings.status ?? "Movimentado"}>
              <option value="Cancelado">Cancelado</option>
              <option value="Encerrado">Encerrado</option>
              <option value="Movimentado">Movimentado</option>
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-5">
          {kind === "STATUS" && (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                name="availableToApplicant"
                type="checkbox"
                defaultChecked={settings.availableToApplicant ?? true}
                className="size-4 rounded border-slate-300 text-[#0e4c7e]"
              />
              Disponível ao requerente no Portal
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={record?.isActive ?? true}
              className="size-4 rounded border-slate-300 text-[#0e4c7e]"
            />
            Ativo
          </label>
        </div>

        <button className="portal-btn h-8 cursor-pointer px-4 text-xs">
          <Save className="size-3.5" />
          {record ? "Salvar" : "Cadastrar"}
        </button>
      </div>
    </div>
  );
}

export default async function OmbudsmanConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isManager) {
    throw new Error("Somente gestores podem configurar a Ouvidoria.");
  }
  const database = context.database ?? db;
  const { kind: requested } = await searchParams;
  const kind: Kind = requested && Object.hasOwn(kinds, requested) ? (requested as Kind) : "ROUTE";

  const [records, catalog, orgs, units, sectors] = await Promise.all([
    database
      .select()
      .from(ombudsmanConfigurations)
      .where(eq(ombudsmanConfigurations.kind, kind))
      .orderBy(asc(ombudsmanConfigurations.name))
      .catch(() => []),
    database
      .select()
      .from(ombudsmanReferenceCatalog)
      .orderBy(asc(ombudsmanReferenceCatalog.name))
      .catch(() => []),
    database
      .select({ id: secretariats.id, name: secretariats.name })
      .from(secretariats)
      .where(eq(secretariats.isActive, true))
      .orderBy(asc(secretariats.name))
      .catch(() => []),
    database
      .select({ id: administrativeUnits.id, name: administrativeUnits.name })
      .from(administrativeUnits)
      .where(eq(administrativeUnits.isActive, true))
      .orderBy(asc(administrativeUnits.name))
      .catch(() => []),
    database
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(asc(departments.name))
      .catch(() => []),
  ]);

  const fields = { kind, catalog, orgs, units, sectors };

  return (
    <PageFrame className="max-w-6xl space-y-4">
      <PageHeader
        title={`Ouvidoria — ${kinds[kind]}`}
        icon={<Layers className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <Link
            href="/atendimento/cadastros"
            className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Assuntos, subassuntos e justificativas
          </Link>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <nav aria-label="Configurações de ouvidoria" className="flex flex-wrap gap-2">
            {(Object.entries(kinds) as [Kind, string][]).map(([value, label]) => {
              const active = kind === value;
              return (
                <Link
                  key={value}
                  href={`/atendimento/cadastros/configuracoes?kind=${value}`}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                    active
                      ? "bg-[#0e4c7e] text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Route className="size-3.5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 sm:p-5">
          <details open className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-slate-100/80 px-4 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200/60">
              <span className="flex items-center gap-2">
                <Plus className="size-4 text-[#0e4c7e]" />
                Novo cadastro — {kinds[kind]}
              </span>
              <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-200 bg-white p-4">
              {kind === "QUESTIONNAIRE" && (
                <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700">
                  O código é gerado automaticamente ao cadastrar a descrição.
                </p>
              )}
              <form action={saveOmbudsmanConfiguration}>
                <ConfigurationFields {...fields} />
              </form>
            </div>
          </details>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900">Registros ({records.length})</h2>
          <span className="text-xs text-slate-500">Clique sobre um registro para expandir e editar</span>
        </div>

        {records.length > 0 ? (
          <div className="space-y-2.5">
            {records.map((record, index) => (
              <details
                key={record.id}
                open={index < 3}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{record.name}</span>
                    {record.settings?.status && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#0e4c7e]">
                        {record.settings.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        record.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {record.isActive ? "Ativo" : "Inativo"}
                    </span>
                    <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <form action={saveOmbudsmanConfiguration} className="border-t border-slate-200 bg-slate-50/40 p-4">
                  <ConfigurationFields {...fields} record={record} />
                </form>
              </details>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nenhum registro configurado para esta categoria.
          </div>
        )}
      </section>
    </PageFrame>
  );
}
