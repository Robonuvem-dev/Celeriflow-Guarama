"use client";

import { useState } from "react";
import { Printer, Filter, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TaxOperationalTable } from "../../TaxOperationalTable";

type TaxpayerOption = {
  id: string;
  label: string;
};

type Item = {
  id: string;
  municipalInsc: string;
  registration: string;
  address: string;
  block: string;
  lot: string;
  status: string;
  landArea: number;
  builtArea: number;
  venalTerritorial: number;
  venalPredial: number;
  venalTotal: number;
};

type TaxpayerGroup = {
  taxpayerId: string;
  taxpayerName: string;
  document: string;
  items: Item[];
  sumTerritorial: number;
  sumPredial: number;
  sumTotal: number;
};

export default function RelatorioValorVenalClient(props: {
  taxpayers: TaxpayerOption[];
  reportData: {
    groups: TaxpayerGroup[];
    totalProperties: number;
    grandTotalTerritorial: number;
    grandTotalPredial: number;
    grandTotal: number;
  };
  filters: {
    localityMode?: "TODOS" | "SEDE" | "DISTRITO";
    taxpayerId?: string;
    statusMode?: "TODOS" | "ATIVOS" | "BAIXADOS";
    onlyWithVenalValue?: boolean;
  };
}) {
  const [locality, setLocality] = useState(props.filters.localityMode ?? "TODOS");
  const [taxpayerId, setTaxpayerId] = useState(props.filters.taxpayerId ?? "");
  const [status, setStatus] = useState(props.filters.statusMode ?? "TODOS");
  const [onlyVenal, setOnlyVenal] = useState(props.filters.onlyWithVenalValue ?? false);

  const money = (val: number) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const printUrl = `/tributacao/imoveis/relatorio-valor-venal/imprimir?locality=${locality}&taxpayerId=${taxpayerId}&status=${status}&onlyVenal=${onlyVenal}`;

  const allItems = props.reportData.groups.flatMap(g =>
    g.items.map(it => ({
      ...it,
      taxpayerName: g.taxpayerName,
      taxpayerDoc: g.document
    }))
  );

  return (
    <div className="h-full space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/tributacao/imoveis" className="inline-flex h-8 items-center gap-1 rounded border bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
          <div>
            <h1 className="text-lg font-bold">Relatório de Imóveis por Contribuinte · Valor Venal</h1>
            <p className="text-xs text-slate-500">
              Inscrição, cadastro imobiliário, titular, endereço, quadra, lote, valor venal predial, territorial e somatórios.
            </p>
          </div>
        </div>

        <a
          href={printUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
        >
          <Printer className="size-3.5" />
          Imprimir Relatório Formatado
        </a>
      </div>

      {/* Faixa compacta de filtros operacionais */}
      <form method="GET" className="grid gap-3 rounded border bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div>
          <label className="font-medium text-slate-600 block mb-1">Localidade</label>
          <select
            name="locality"
            value={locality}
            onChange={e => setLocality(e.target.value as any)}
            className="w-full rounded border p-1.5 text-xs"
          >
            <option value="TODOS">Todas (Sede e Distritos)</option>
            <option value="SEDE">Sede Urbana</option>
            <option value="DISTRITO">Distritos / Zona Rural</option>
          </select>
        </div>

        <div>
          <label className="font-medium text-slate-600 block mb-1">Contribuinte Específico</label>
          <select
            name="taxpayerId"
            value={taxpayerId}
            onChange={e => setTaxpayerId(e.target.value)}
            className="w-full rounded border p-1.5 text-xs"
          >
            <option value="">Todos os Contribuintes</option>
            {props.taxpayers.map(tp => (
              <option key={tp.id} value={tp.id}>{tp.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-medium text-slate-600 block mb-1">Situação do Imóvel</label>
          <select
            name="status"
            value={status}
            onChange={e => setStatus(e.target.value as any)}
            className="w-full rounded border p-1.5 text-xs"
          >
            <option value="TODOS">Todos (Ativos e Baixados)</option>
            <option value="ATIVOS">Apenas Imóveis Ativos / Regulares</option>
            <option value="BAIXADOS">Apenas Imóveis Baixados / Inativos</option>
          </select>
        </div>

        <div className="flex items-center gap-2 h-8">
          <label className="flex items-center gap-1.5 font-medium text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              name="onlyVenal"
              value="true"
              checked={onlyVenal}
              onChange={e => setOnlyVenal(e.target.checked)}
            />
            Somente c/ Valor Venal
          </label>
        </div>

        <div>
          <button
            type="submit"
            className="w-full h-8 rounded bg-slate-800 text-white font-semibold text-xs hover:bg-slate-900"
          >
            Aplicar Filtros
          </button>
        </div>
      </form>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded border bg-white p-3 shadow-sm">
          <span className="text-slate-500 block">Total de Imóveis</span>
          <span className="text-base font-bold text-slate-800">{props.reportData.totalProperties}</span>
        </div>
        <div className="rounded border bg-white p-3 shadow-sm">
          <span className="text-slate-500 block">Total Venal Territorial</span>
          <span className="text-base font-bold text-slate-800">R$ {money(props.reportData.grandTotalTerritorial)}</span>
        </div>
        <div className="rounded border bg-white p-3 shadow-sm">
          <span className="text-slate-500 block">Total Venal Predial</span>
          <span className="text-base font-bold text-slate-800">R$ {money(props.reportData.grandTotalPredial)}</span>
        </div>
        <div className="rounded border bg-emerald-50 p-3 shadow-sm border-emerald-200">
          <span className="text-emerald-800 block font-semibold">Valor Venal Total do Município</span>
          <span className="text-base font-bold text-emerald-900">R$ {money(props.reportData.grandTotal)}</span>
        </div>
      </div>

      {/* Visualização em Tabela Operacional */}
      <TaxOperationalTable
        id="tabela-relatorio-venal"
        emptyMessage="Nenhum imóvel encontrado para os filtros selecionados."
        columns={[
          ["taxpayer", "Contribuinte / Titular", 160, 220],
          ["insc", "Inscrição", 100, 120, "identifier"],
          ["registration", "Matrícula", 80, 100],
          ["address", "Endereço", 180, 250],
          ["block", "Quadra", 60, 70],
          ["lot", "Lote", 60, 70],
          ["territorial", "Venal Territorial (R$)", 110, 130, "text", "right"],
          ["predial", "Venal Predial (R$)", 110, 130, "text", "right"],
          ["total", "Venal Total (R$)", 115, 140, "text", "right"],
          ["status", "Status", 75, 85, "status"]
        ]}
        rows={allItems.map(it => ({
          id: it.id,
          label: `${it.municipalInsc} - ${it.taxpayerName}`,
          values: {
            taxpayer: it.taxpayerName,
            insc: it.municipalInsc,
            registration: it.registration,
            address: it.address,
            block: it.block,
            lot: it.lot,
            territorial: money(it.venalTerritorial),
            predial: money(it.venalPredial),
            total: money(it.venalTotal),
            status: it.status
          }
        }))}
      />
    </div>
  );
}
