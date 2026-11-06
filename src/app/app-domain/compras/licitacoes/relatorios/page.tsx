import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet, Filter, Gavel } from "lucide-react";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { listBiddingRegisterSummary } from "@/db/repositories/procurement/bidding-register";
import { formatBrasiliaDate, formatBrasiliaDateTime } from "@/lib/brasilia-datetime";
import { PrintInstrumentReportButton } from "@/app/app-domain/compras/contratos/PrintInstrumentReportButton";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BIDDING_MODALITIES } from "@/lib/compras/bidding-workflow";

export const dynamic = "force-dynamic";

type SearchParamsValues = {
  inicio?: string | string[];
  fim?: string | string[];
  modalidade?: string | string[];
  situacao?: string | string[];
};

function val(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function money(val: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export default async function BiddingRegisterSummaryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsValues>;
}) {
  await getTenantContextForModuleOperation("COMPRAS", "issueReports");
  const sp = await searchParams;

  const inicio = val(sp.inicio);
  const fim = val(sp.fim);
  const modalidade = val(sp.modalidade);
  const situacao = val(sp.situacao);

  const items = await listBiddingRegisterSummary(databaseConnection.db, {
    startDate: inicio || undefined,
    endDate: fim || undefined,
    modality: modalidade || undefined,
    status: situacao || undefined,
  });

  const totalEstimado = items.reduce((acc, curr) => acc + curr.estimatedValue, 0);
  const totalLotes = items.reduce((acc, curr) => acc + curr.lotCount, 0);
  const totalItens = items.reduce((acc, curr) => acc + curr.itemCount, 0);
  const totalParticipantes = items.reduce((acc, curr) => acc + curr.participantCount, 0);

  return (
    <PageFrame className="mx-auto max-w-7xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/compras/licitacoes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-3.5" />
            Voltar para Licitações
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <PrintInstrumentReportButton />
        </div>
      </header>

      {/* Painel de Filtros Consolidados */}
      <Card className="print:hidden">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="size-4 text-primary" />
            Filtros do Relatório Geral de Licitações
          </CardTitle>
          <CardDescription className="text-xs">
            Consolidação cadastral e operacional de todos os certames licitatórios registrados no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="inicio" className="text-xs font-medium">
                  Período Inicial (Brasília)
                </Label>
                <Input
                  id="inicio"
                  name="inicio"
                  type="date"
                  defaultValue={inicio}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="fim" className="text-xs font-medium">
                  Período Final (Brasília)
                </Label>
                <Input
                  id="fim"
                  name="fim"
                  type="date"
                  defaultValue={fim}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="modalidade" className="text-xs font-medium">
                  Modalidade
                </Label>
                <select
                  id="modalidade"
                  name="modalidade"
                  defaultValue={modalidade}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Todas as modalidades</option>
                  {BIDDING_MODALITIES.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="situacao" className="text-xs font-medium">
                  Situação
                </Label>
                <select
                  id="situacao"
                  name="situacao"
                  defaultValue={situacao}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Todas as situações</option>
                  <option value="Aberta">Aberta</option>
                  <option value="Anulada">Anulada</option>
                  <option value="Recurso">Recurso (Em Recurso / Julgamento)</option>
                  <option value="Encerrada">Encerrada (Homologada / Concluída / Adjudicada)</option>
                  <option value="Em Elaboração">Em Elaboração</option>
                  <option value="Publicada">Publicada</option>
                  <option value="Suspensa">Suspensa</option>
                  <option value="Revogada">Revogada</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <Link href="/compras/licitacoes/relatorios">
                <Button type="button" variant="ghost" size="sm">
                  Limpar Filtros
                </Button>
              </Link>
              <Button type="submit" size="sm">
                Filtrar Resultados
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Relatório Documental */}
      <article className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sistema Celeriflow · Módulo de Licitações (CF11)
            </p>
            <Badge variant="outline" className="text-[10px]">
              Emitido em {formatBrasiliaDateTime(new Date())}
            </Badge>
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Relatório Consolidado de Processos Licitatórios
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Visão consolidada de certames, lotes, quantidades de itens, participantes e valores estimados.
          </p>
        </header>

        {/* Indicadores Consolidados */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500 font-medium">Total de Certames</p>
            <p className="text-lg font-bold text-slate-900">{items.length}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500 font-medium">Lotes Cadastrados</p>
            <p className="text-lg font-bold text-slate-900">{totalLotes}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500 font-medium">Itens de Compra</p>
            <p className="text-lg font-bold text-slate-900">{totalItens}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500 font-medium">Valor Total Estimado</p>
            <p className="text-lg font-bold text-slate-900">{money(totalEstimado)}</p>
          </div>
        </div>

        {/* Tabela de Certames */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-2.5 py-2 font-semibold">Certame</th>
                <th className="px-2.5 py-2 font-semibold">Processo</th>
                <th className="px-2.5 py-2 font-semibold">Modalidade</th>
                <th className="px-2.5 py-2 font-semibold">Situação</th>
                <th className="px-2.5 py-2 font-semibold">Secretaria</th>
                <th className="px-2.5 py-2 font-semibold">Objeto</th>
                <th className="px-2.5 py-2 font-semibold">Abertura / Sessão</th>
                <th className="px-2.5 py-2 font-semibold text-right">Valor Estimado</th>
                <th className="px-2.5 py-2 font-semibold text-center">Lotes</th>
                <th className="px-2.5 py-2 font-semibold text-center">Itens</th>
                <th className="px-2.5 py-2 font-semibold text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2.5 py-6 text-center text-slate-400">
                    Nenhum certame atende aos filtros informados.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-2.5 py-2 font-medium text-slate-900">
                      <Link
                        href={`/compras/licitacoes/${item.id}`}
                        className="hover:underline text-primary"
                      >
                        {item.number}
                      </Link>
                    </td>
                    <td className="px-2.5 py-2 text-slate-600">{item.processNumber}</td>
                    <td className="px-2.5 py-2">{item.modality}</td>
                    <td className="px-2.5 py-2">
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-2 text-slate-600 max-w-[140px] truncate" title={item.secretariatName}>
                      {item.secretariatName}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600 max-w-[200px] truncate" title={item.object}>
                      {item.object}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">
                      {item.sessionDate ? formatBrasiliaDateTime(item.sessionDate) : "-"}
                    </td>
                    <td className="px-2.5 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
                      {money(item.estimatedValue)}
                    </td>
                    <td className="px-2.5 py-2 text-center text-slate-700">{item.lotCount}</td>
                    <td className="px-2.5 py-2 text-center text-slate-700">{item.itemCount}</td>
                    <td className="px-2.5 py-2 text-center print:hidden">
                      <Link
                        href={`/compras/licitacoes/${item.id}/relatorio`}
                        className="text-primary hover:underline font-medium text-[11px]"
                      >
                        Relatórios
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="hidden border-t pt-3 text-[10px] text-slate-400 print:block">
          Relatório Consolidado emitido pelo Sistema Celeriflow. Conformidade legal com Lei Federal nº 14.133/2021.
        </footer>
      </article>
    </PageFrame>
  );
}
