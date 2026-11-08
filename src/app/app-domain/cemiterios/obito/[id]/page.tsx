import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readWorkflowDeceased, readWorkflowTaxpayer } from "@/db/repositories/cemeteries/workflow-pages";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import CemeteryPrintButton from "@/components/cemeteries/CemeteryPrintButton";
import { ArrowLeft, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeathRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("CEMITERIOS", "issueReports");
  const database = context.database ?? db;
  const row = await readWorkflowDeceased(database, (await params).id);
  if (!row) notFound();

  const declarant = row.declarantTaxpayerId ? await readWorkflowTaxpayer(database, row.declarantTaxpayerId) : null;
  const groups = row.groups && typeof row.groups === "object" && !Array.isArray(row.groups) ? row.groups : {};

  const civilFields: Record<string, string | null | undefined> = {
    "Identificador Funerário": row.id,
    "Nome do Falecido": row.fullName,
    "Data de Nascimento": row.birthDate ? row.birthDate.toLocaleDateString("pt-BR") : "Não informada",
    "Data do Óbito": row.deathDate.toLocaleDateString("pt-BR"),
    "Hora do Óbito": row.deathTime || "Não informada",
    "Documento de Identificação": row.document || "Não informado",
    "Sexo": row.gender || "Não informado",
    "Estado Civil": row.maritalStatus || "Não informado",
    "Nacionalidade": typeof groups.nacionalidade === "string" ? groups.nacionalidade : (typeof (groups.dados as any)?.nationality === "string" ? (groups.dados as any).nationality : null),
    "Raça / Cor": typeof groups.racaCor === "string" ? groups.racaCor : (typeof (groups.dados as any)?.raceColor === "string" ? (groups.dados as any).raceColor : null),
    "Filiação Paterna": row.fatherName || "Não informado",
    "Filiação Materna": row.motherName || "Não informada",
    "Endereço de Residência": row.address || "Não informado",
    "Local de Falecimento": typeof groups.localFalecimento === "string" ? groups.localFalecimento : (typeof (groups.dados as any)?.deathPlace === "string" ? (groups.dados as any).deathPlace : null),
    "Médico Declarativo": row.doctorName,
    "CRM": row.doctorCrm,
    "Causa Mortis": row.cause?.description ?? row.causeText,
    "Local de Sepultamento": row.grave ? `${row.grave.cemetery.name} — ${row.grave.code}` : row.status,
    "Responsável Declarante": declarant?.person?.fullName ?? declarant?.company?.corporateName ?? row.declarantTaxpayerId,
    "Parentesco do Declarante": typeof groups.parentescoDeclarante === "string" ? groups.parentescoDeclarante : (typeof (groups.dados as any)?.kinship === "string" ? (groups.dados as any).kinship : null),
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6 text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
        <Link
          href="/cemiterios/complementos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5" /> Voltar aos relatórios
        </Link>
        <CemeteryPrintButton />
      </div>

      <header className="border-b-2 border-slate-900 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Registro Municipal de Óbito — Reemissão (23.1)
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Secretaria Municipal de Administração e Serviços Funerários de Guaramá — PR
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              <Building2 className="size-3 text-slate-600" />
              Certidão Administrativa
            </span>
            <p className="mt-1 text-[11px] text-slate-400">Emissão oficial para sepultamento e jazigo</p>
          </div>
        </div>
      </header>

      <p className="text-xs text-slate-500 italic">
        Aviso legal: Este documento constitui certidão administrativa funerária de controle do cemitério municipal e não substitui a certidão de óbito do Cartório de Registro Civil nem a declaração médica oficial de óbito (DO).
      </p>

      {/* Grade de dados civis e de endereçamento */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1.5">
          Dados Civis, Filiação, Endereço e Declarante
        </h2>
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {Object.entries(civilFields).map(([label, value]) => (
            <div key={label} className="border-b border-slate-100 pb-1.5">
              <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
              <dd className="text-xs font-medium text-slate-900">{value || "Não informado"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Informações complementares dos grupos */}
      {Object.keys(groups).length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-1.5">
            Grupos Complementares da Declaração Funerária
          </h2>
          <dl className="space-y-3 text-xs">
            {Object.entries(groups)
              .filter(([key]) => !key.startsWith("_"))
              .map(([key, value]) => (
                <div key={key} className="rounded bg-slate-50 p-2.5 border border-slate-100">
                  <dt className="font-bold text-slate-700 uppercase text-[11px] mb-1">{key}</dt>
                  <dd className="whitespace-pre-wrap text-slate-600">
                    {value && typeof value === "object" && !Array.isArray(value)
                      ? Object.entries(value)
                          .filter(([, item]) => item !== "" && item !== null)
                          .map(([name, item]) => `${name}: ${typeof item === "string" ? item : JSON.stringify(item)}`)
                          .join("\n")
                      : String(value ?? "Não informado")}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}
    </main>
  );
}
