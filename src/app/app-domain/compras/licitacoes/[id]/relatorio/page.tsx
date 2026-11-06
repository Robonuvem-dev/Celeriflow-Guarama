import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Filter, FileSpreadsheet, Gavel, Calendar } from "lucide-react";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { loadBiddingReport } from "@/db/repositories/procurement/bidding-reports";
import {
  BIDDING_REPORT_LABELS,
  BIDDING_REPORT_TYPES,
  type BiddingReportType,
  generateBiddingReport,
} from "@/lib/compras/bidding-reports";
import { PrintInstrumentReportButton } from "@/app/app-domain/compras/contratos/PrintInstrumentReportButton";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type SearchParamsValues = {
  tipo?: string | string[];
  inicio?: string | string[];
  fim?: string | string[];
  fornecedor?: string | string[];
  material?: string | string[];
  ordem?: string | string[];
};

function val(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function BiddingReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsValues>;
}) {
  await getTenantContextForModuleOperation("COMPRAS", "issueReports");
  const { id } = await params;
  const sp = await searchParams;

  const tipoRaw = val(sp.tipo) as BiddingReportType;
  const tipo: BiddingReportType =
    tipoRaw && Object.values(BIDDING_REPORT_TYPES).includes(tipoRaw)
      ? tipoRaw
      : BIDDING_REPORT_TYPES.CLASSIFICACAO;

  const inicio = val(sp.inicio);
  const fim = val(sp.fim);
  const fornecedor = val(sp.fornecedor);
  const material = val(sp.material);
  const ordem = (val(sp.ordem) as "asc" | "desc") || "asc";

  const biddingData = await loadBiddingReport(databaseConnection.db, id);
  if (!biddingData) notFound();

  const report = generateBiddingReport(tipo, biddingData, {
    startDate: inicio || undefined,
    endDate: fim || undefined,
    fornecedor: fornecedor || undefined,
    material: material || undefined,
    ordem,
  });

  const csvParams = new URLSearchParams();
  csvParams.set("tipo", tipo);
  if (inicio) csvParams.set("inicio", inicio);
  if (fim) csvParams.set("fim", fim);
  if (fornecedor) csvParams.set("fornecedor", fornecedor);
  if (material) csvParams.set("material", material);
  if (ordem) csvParams.set("ordem", ordem);
  const csvUrl = `/compras/licitacoes/${id}/relatorio/csv?${csvParams.toString()}`;

  return (
    <PageFrame className="mx-auto max-w-6xl space-y-4 p-4 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/compras/licitacoes/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-3.5" />
            Voltar para o certame
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Link href={csvUrl} target="_blank">
            <Button variant="outline" size="sm">
              <Download className="size-3.5" />
              Exportar CSV
            </Button>
          </Link>
          <PrintInstrumentReportButton />
        </div>
      </header>

      {/* Card de Filtros e Seleção do Relatório */}
      <Card className="print:hidden">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="size-4 text-primary" />
            Parâmetros do Relatório
          </CardTitle>
          <CardDescription className="text-xs">
            Selecione o modelo oficial de relatório CF11 (11.1 a 11.8) e configure os filtros desejados.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="tipo" className="text-xs font-medium">
                  Tipo de Relatório
                </Label>
                <select
                  id="tipo"
                  name="tipo"
                  defaultValue={tipo}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <optgroup label="Relatórios Requisitos CF11 (11.1 a 11.8)">
                    <option value={BIDDING_REPORT_TYPES.CLASSIFICACAO}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.CLASSIFICACAO]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.LANCES_VERBAIS}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.LANCES_VERBAIS]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.VENCEDORES}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.VENCEDORES]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.APURACAO}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.APURACAO]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.ITENS_PREGAO}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.ITENS_PREGAO]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.ITENS_OUTRAS_MODALIDADES}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.ITENS_OUTRAS_MODALIDADES]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.ETIQUETA}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.ETIQUETA]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.SALDO_RESTANTE}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.SALDO_RESTANTE]}
                    </option>
                  </optgroup>
                  <optgroup label="Outros Relatórios Operacionais">
                    <option value={BIDDING_REPORT_TYPES.RESUMO}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.RESUMO]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.LANCES}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.LANCES]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.HABILITACAO}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.HABILITACAO]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.DESCLASSIFICADOS}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.DESCLASSIFICADOS]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.FASES}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.FASES]}
                    </option>
                    <option value={BIDDING_REPORT_TYPES.ATOS}>
                      {BIDDING_REPORT_LABELS[BIDDING_REPORT_TYPES.ATOS]}
                    </option>
                  </optgroup>
                </select>
              </div>

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
                <Label htmlFor="ordem" className="text-xs font-medium">
                  Ordenação
                </Label>
                <select
                  id="ordem"
                  name="ordem"
                  defaultValue={ordem}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:border-primary focus:outline-none"
                >
                  <option value="asc">Crescente (A-Z / 1-9)</option>
                  <option value="desc">Decrescente (Z-A / 9-1)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="fornecedor" className="text-xs font-medium">
                  Filtrar por Fornecedor
                </Label>
                <Input
                  id="fornecedor"
                  name="fornecedor"
                  placeholder="Nome ou razão social"
                  defaultValue={fornecedor}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="material" className="text-xs font-medium">
                  Filtrar por Material / Item
                </Label>
                <Input
                  id="material"
                  name="material"
                  placeholder="Descrição ou código"
                  defaultValue={material}
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <Link href={`/compras/licitacoes/${id}/relatorio?tipo=${tipo}`}>
                <Button type="button" variant="ghost" size="sm">
                  Limpar Filtros
                </Button>
              </Link>
              <Button type="submit" size="sm">
                Emitir Relatório
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Relatório Formatado para Visualização e Impressão */}
      <article className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none">
        {/* Cabeçalho do Documento */}
        <header className="border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sistema Celeriflow · Módulo de Licitações (CF11)
            </p>
            <Badge variant="outline" className="text-[10px]">
              Emitido em {report.generatedAt}
            </Badge>
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{report.title}</h1>
          <p className="mt-1 text-xs text-slate-600">
            Certame: <span className="font-semibold text-slate-900">{report.biddingNumber}</span> ·
            Processo: <span className="font-semibold text-slate-900">{report.processNumber}</span> ·
            Modalidade: <span className="font-semibold text-slate-900">{report.modality}</span> ·
            Secretaria: <span className="font-semibold text-slate-900">{report.secretariat}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Objeto:</span> {report.object}
          </p>
        </header>

        {/* Tabelas do Relatório */}
        {report.tables.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum registro encontrado para os critérios e filtros selecionados.
          </p>
        ) : (
          report.tables.map((table, tIdx) => (
            <section key={tIdx} className="space-y-2">
              {table.title && (
                <div className="border-b border-slate-100 pb-1">
                  <h2 className="text-sm font-semibold text-slate-800">{table.title}</h2>
                  {table.description && (
                    <p className="text-xs text-slate-500">{table.description}</p>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600">
                    <tr>
                      {table.columns.map((col, cIdx) => (
                        <th key={cIdx} className="px-2.5 py-2 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {table.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={table.columns.length}
                          className="px-2.5 py-4 text-center text-slate-400"
                        >
                          Sem registros neste bloco.
                        </td>
                      </tr>
                    ) : (
                      table.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/50">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="px-2.5 py-2 whitespace-pre-wrap">
                              {String(cell ?? "-")}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}

        {/* Rodapé institucional para impressão */}
        <footer className="hidden border-t pt-3 text-[10px] text-slate-400 print:block">
          Documento extraído eletronicamente pelo Celeriflow em {report.generatedAt}. Todos os horários
          em conformidade com o horário oficial de Brasília.
        </footer>
      </article>
    </PageFrame>
  );
}
