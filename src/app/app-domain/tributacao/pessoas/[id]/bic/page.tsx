import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, FileText, Home, Layers, Printer, UserRound } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readFiscalTaxpayerCard } from "@/db/repositories/taxation-pages/cadastral-details";
import { institutions } from "@/db/schema/administration";

export const dynamic = "force-dynamic";

export default async function BicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; targetId?: string }>;
}) {
  const { id } = await params;
  const { type, targetId } = await searchParams;
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;

  const [taxpayer, instList] = await Promise.all([
    readFiscalTaxpayerCard(database, id),
    database
      .select({
        name: institutions.name,
        legalName: institutions.legalName,
        cnpj: institutions.cnpj,
        phone: institutions.phone,
        email: institutions.email,
        city: institutions.city,
        state: institutions.state,
      })
      .from(institutions)
      .limit(1),
  ]);

  if (!taxpayer) notFound();

  const institution = instList[0];
  const name = taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Contribuinte";
  const document = taxpayer.company?.cnpj ?? taxpayer.person?.cpf ?? "Não informado";
  const docType = taxpayer.taxpayerType === "PJ" ? "CNPJ" : "CPF";

  // Identifica inscrições
  const selectedRealEstate = targetId
    ? taxpayer.realEstates.find((item) => item.id === targetId)
    : undefined;
  const selectedEconomic = targetId
    ? taxpayer.economicRegistrations.find((item) => item.id === targetId)
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 text-slate-800 print:max-w-none print:p-0">
      {/* Barra de navegação não impressa */}
      <div className="flex items-center justify-between border-b pb-3 print:hidden">
        <Link
          href={`/tributacao/pessoas/${id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Voltar à Ficha da Pessoa
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="javascript:window.print()"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-bold text-white shadow hover:bg-emerald-800"
          >
            <Printer className="size-4" />
            Imprimir BIC
          </a>
        </div>
      </div>

      {/* Conteúdo oficial do BIC */}
      <div className="rounded-lg border bg-white p-6 shadow-sm print:border-none print:p-0 print:shadow-none">
        {/* Cabeçalho Oficial do Município */}
        <div className="border-b-2 border-slate-900 pb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-wider text-slate-950">
            {institution?.name ?? institution?.legalName ?? "Município de Guarará"}
          </h1>
          <p className="text-xs font-semibold text-slate-600">
            Secretaria Municipal de Fazenda e Tributação · Cadastro Técnico Municipal
          </p>
          <div className="mt-2 inline-block rounded border border-slate-900 bg-slate-50 px-4 py-1 text-sm font-black uppercase tracking-wide text-slate-900">
            Boletim de Informações Cadastrais — BIC
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Documento de consulta unificada e oficial das inscrições fiscais emitido em{" "}
            {new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </p>
        </div>

        {/* 1. Identificação do Contribuinte */}
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-1.5 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-900">
            <UserRound className="size-3.5 text-emerald-700" />
            1. Identificação da Pessoa / Contribuinte Geral
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="sm:col-span-2">
              <span className="block text-[10px] font-semibold text-slate-500">Nome / Razão Social:</span>
              <span className="font-bold text-slate-900">{name}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">{docType}:</span>
              <span className="font-mono font-medium text-slate-900">{document}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Inscrição Geral:</span>
              <span className="font-mono font-medium text-slate-900">{taxpayer.municipalInsc ?? "Não informada"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Tipo de Contribuinte:</span>
              <span>{taxpayer.taxpayerType === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-slate-500">Situação Cadastral:</span>
              <span className="font-semibold text-emerald-700">{taxpayer.status}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="block text-[10px] font-semibold text-slate-500">Atividades Econômicas:</span>
              <span>{taxpayer.economicActivities ?? "Não especificadas"}</span>
            </div>
          </div>
        </section>

        {/* 2. Inscrições no Cadastro Imobiliário */}
        {(!type || type === "imobiliario") && (
          <section className="mt-6">
            <h2 className="mb-2 flex items-center gap-1.5 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-900">
              <Home className="size-3.5 text-emerald-700" />
              2. Cadastro Imobiliário (BCI / BIC Imóveis) — {taxpayer.realEstates.length} inscrição(ões)
            </h2>
            {taxpayer.realEstates.length === 0 ? (
              <p className="text-xs italic text-slate-500">Nenhum imóvel vinculado a este contribuinte.</p>
            ) : (
              <div className="space-y-3">
                {taxpayer.realEstates
                  .filter((im) => !selectedRealEstate || im.id === selectedRealEstate.id)
                  .map((im) => (
                    <div key={im.id} className="rounded border border-slate-200 bg-slate-50/50 p-3 text-xs">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
                        <span className="font-bold text-slate-900">
                          Inscrição Municipal / Imóvel: {im.municipalInsc ?? im.registration ?? im.id}
                        </span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          {im.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <span className="block text-[10px] text-slate-500">Tipo do Imóvel:</span>
                          <span className="font-medium">{im.propertyType ?? "Predial / Territorial"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Matrícula RGI:</span>
                          <span className="font-mono">{im.registration ?? "—"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Área do Terreno:</span>
                          <span>{im.landArea ? `${im.landArea} m²` : "—"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Área Construída:</span>
                          <span>{im.builtArea ? `${im.builtArea} m²` : "—"}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-[10px] text-slate-500">Logradouro / Endereço:</span>
                          <span>
                            {im.streetName ?? "Endereço não cadastrado"}, {im.number ?? "s/n"}{" "}
                            {im.complement ? `· ${im.complement}` : ""}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Quadra / Lote:</span>
                          <span>{im.block ? `Qd. ${im.block}` : ""} {im.lot ? `Lt. ${im.lot}` : ""}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Zona Fiscal / Uso:</span>
                          <span>{im.fiscalZone ?? im.propertyUse ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* 3. Inscrições no Cadastro Econômico */}
        {(!type || type === "economico") && (
          <section className="mt-6">
            <h2 className="mb-2 flex items-center gap-1.5 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-900">
              <Building2 className="size-3.5 text-emerald-700" />
              3. Cadastro Econômico (Empresas / Atividades) — {taxpayer.economicRegistrations.length} inscrição(ões)
            </h2>
            {taxpayer.economicRegistrations.length === 0 ? (
              <p className="text-xs italic text-slate-500">Nenhuma empresa ou inscrição municipal econômica vinculada.</p>
            ) : (
              <div className="space-y-3">
                {taxpayer.economicRegistrations
                  .filter((eco) => !selectedEconomic || eco.id === selectedEconomic.id)
                  .map((eco) => (
                    <div key={eco.id} className="rounded border border-slate-200 bg-slate-50/50 p-3 text-xs">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
                        <span className="font-bold text-slate-900">
                          Inscrição Municipal (CMC): {eco.municipalInsc}
                        </span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          {eco.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <span className="block text-[10px] text-slate-500">CNAE Principal:</span>
                          <span className="font-mono font-medium">{eco.primaryCnae ?? "Não informado"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Regime Tributário:</span>
                          <span>{eco.taxRegime ?? "Geral / Simples"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Data de Início:</span>
                          <span>{eco.startDate ? new Date(eco.startDate).toLocaleDateString("pt-BR") : "—"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">Código da Unidade:</span>
                          <span className="font-mono">{eco.id}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* 4. Cadastros Diversos e Vínculos */}
        {(!type || type === "diversos") && (
          <section className="mt-6">
            <h2 className="mb-2 flex items-center gap-1.5 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-900">
              <Layers className="size-3.5 text-emerald-700" />
              4. Cadastros Diversos, Processos e Ocorrências
            </h2>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded border border-slate-200 p-2.5">
                <span className="block text-[10px] font-semibold text-slate-500">Vínculos a Processos:</span>
                {taxpayer.taxCaseLinks.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {taxpayer.taxCaseLinks.map((link) => (
                      <li key={link.id}>
                        Processo {link.processId ?? link.id} {link.purpose ? `(${link.purpose})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500">Sem processos fiscais autuados vinculados.</span>
                )}
              </div>
              <div className="rounded border border-slate-200 p-2.5">
                <span className="block text-[10px] font-semibold text-slate-500">Observações Fiscais Gerais:</span>
                <p className="mt-1 text-slate-700">{taxpayer.fiscalNotes ?? "Sem anotações fiscais pendentes."}</p>
              </div>
            </div>
          </section>
        )}

        {/* Autenticação e Rodapé */}
        <div className="mt-8 border-t border-slate-300 pt-4 text-[10px] text-slate-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Boletim de Informações Cadastrais — Celeriflow Tributário</span>
            <span>Chave de Validação: {taxpayer.id.slice(0, 16).toUpperCase()}</span>
            <span>Página 1 de 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
