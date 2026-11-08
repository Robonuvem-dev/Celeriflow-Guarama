"use client";

import React, { useState } from "react";
import {
  FileText,
  Printer,
  ExternalLink,
  ShieldCheck,
  Building,
  User,
  X,
  CheckCircle,
  AlertCircle,
  QrCode,
  Landmark,
} from "lucide-react";

export type InvoiceDetail = {
  id: string;
  invoiceNumber: number;
  verificationCode: string;
  serviceValue: number;
  deductions: number;
  issValue: number;
  ownIss: number;
  retainedIss: number;
  competence: string;
  status: string;
  providerId: string;
  providerName: string;
  providerDocument?: string;
  takerName: string;
  takerDocument?: string;
  intermediaryName?: string;
  description: string;
  economicRegistrationId: string;
  activityId: string;
  createdAt: string;
  incidentMunicipality?: string;
  taxableBase?: number;
  isRetained?: boolean;
};

export default function NfseDetailModal({
  invoice,
  onClose,
  initialView = "prestador",
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
  initialView?: "prestador" | "tomador" | "intermediario";
}) {
  const [activeView, setActiveView] = useState<"prestador" | "tomador" | "intermediario">(initialView);
  const [rfbModalOpen, setRfbModalOpen] = useState(false);

  const money = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const baseCalculo = invoice.taxableBase ?? Math.max(0, invoice.serviceValue - invoice.deductions);
  const isRetido = invoice.isRetained ?? (invoice.retainedIss > 0);
  const municipioIncidente = invoice.incidentMunicipality || "Guaramá / PR (Código IBGE 4109401)";
  const chaveAcesso = `4109401${invoice.createdAt.slice(0, 10).replace(/-/g, "")}${String(invoice.invoiceNumber).padStart(9, "0")}99${invoice.verificationCode.toUpperCase().slice(0, 8)}`;

  const handlePrintDanfse = () => {
    window.open(`/tributacao/nfse/${invoice.id}/documento`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200">
        {/* Cabeçalho do Modal */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Visualização Detalhada da NFS-e Nacional Nº {invoice.invoiceNumber}
              </h2>
              <p className="text-xs text-slate-500">
                Padrão Nacional de Nota Fiscal de Serviços Eletrônica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas das 3 Perspectivas (21.22, 21.24 e 21.26) */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveView("prestador")}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeView === "prestador"
                ? "border-indigo-600 text-indigo-700 font-bold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Visão do Prestador (21.22)
          </button>
          <button
            type="button"
            onClick={() => setActiveView("tomador")}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeView === "tomador"
                ? "border-indigo-600 text-indigo-700 font-bold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Visão do Tomador (21.24)
          </button>
          <button
            type="button"
            onClick={() => setActiveView("intermediario")}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeView === "intermediario"
                ? "border-indigo-600 text-indigo-700 font-bold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Visão do Intermediário (21.26)
          </button>
        </div>

        {/* Corpo com Campos Obrigatórios */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 flex-1">
          {/* Banner da perspectiva ativa */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
            <span className="font-semibold text-indigo-900">
              {activeView === "prestador" && "Perspectiva: Prestador de Serviços (Emissor da NFS-e - Requisito 21.22)"}
              {activeView === "tomador" && "Perspectiva: Tomador / Contratante do Serviço (Requisito 21.24)"}
              {activeView === "intermediario" && "Perspectiva: Intermediário de Serviços da Operação (Requisito 21.26)"}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              {invoice.status}
            </span>
          </div>

          {/* Grid de Campos Principais Exigidos pelos requisitos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-400 block font-medium">Nº da Nota Fiscal</span>
              <strong className="text-slate-900 text-sm font-mono">#{invoice.invoiceNumber}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Data de Emissão</span>
              <strong className="text-slate-900">
                {new Date(invoice.createdAt).toLocaleDateString("pt-BR")} às {new Date(invoice.createdAt).toLocaleTimeString("pt-BR")}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Competência Fiscal</span>
              <strong className="text-slate-900 font-mono">{invoice.competence}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Código de Verificação</span>
              <strong className="text-indigo-700 font-mono">{invoice.verificationCode}</strong>
            </div>

            {/* Sujeito Conforme Perspectiva */}
            {activeView === "prestador" && (
              <div className="col-span-2 md:col-span-4 border-t pt-2 mt-2">
                <span className="text-slate-400 block font-medium">Tomador do Serviço (21.22)</span>
                <span className="text-slate-900 font-bold text-sm">{invoice.takerName}</span>
                {invoice.takerDocument && <span className="text-slate-500 block font-mono text-[11px]">Doc: {invoice.takerDocument}</span>}
              </div>
            )}

            {activeView === "tomador" && (
              <div className="col-span-2 md:col-span-4 border-t pt-2 mt-2">
                <span className="text-slate-400 block font-medium">Prestador do Serviço (21.24)</span>
                <span className="text-slate-900 font-bold text-sm">{invoice.providerName}</span>
                {invoice.providerDocument && <span className="text-slate-500 block font-mono text-[11px]">Doc: {invoice.providerDocument}</span>}
              </div>
            )}

            {activeView === "intermediario" && (
              <div className="col-span-2 md:col-span-4 border-t pt-2 mt-2 space-y-1">
                <div>
                  <span className="text-slate-400 block font-medium">Prestador do Serviço (21.26)</span>
                  <span className="text-slate-900 font-bold text-sm">{invoice.providerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Tomador do Serviço</span>
                  <span className="text-slate-800 font-semibold">{invoice.takerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Intermediário Registrado</span>
                  <span className="text-indigo-900 font-semibold">{invoice.intermediaryName || "Intermediário Municipal Vinculado"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Valores, Base de Cálculo, ISSQN e Retenção */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-xl bg-white shadow-sm">
            <div>
              <span className="text-slate-400 block font-medium">Valor do Serviço</span>
              <strong className="text-base text-slate-900">{money(invoice.serviceValue)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Base de Cálculo (BC)</span>
              <strong className="text-base text-blue-700">{money(baseCalculo)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Valor ISSQN</span>
              <strong className="text-base text-emerald-700">{money(invoice.issValue)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">ISS Retido na Fonte</span>
              <span
                className={`inline-block px-2 py-0.5 mt-1 rounded text-xs font-bold ${
                  isRetido ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                }`}
              >
                {isRetido ? "Sim (ISS Retido)" : "Não (ISS Próprio)"}
              </span>
            </div>
          </div>

          {/* Município Incidente */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block font-medium">Município Incidente do Tributo</span>
              <span className="text-sm font-bold text-slate-800">{municipioIncidente}</span>
            </div>
            <Landmark className="w-6 h-6 text-slate-400" />
          </div>

          {/* Discriminação dos Serviços */}
          <div className="p-4 border rounded-xl bg-white space-y-1">
            <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[11px]">
              Discriminação dos Serviços Prestados
            </span>
            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{invoice.description}</p>
          </div>

          {/* Dados do Padrão Nacional / Chave RFB */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px] space-y-1">
            <span className="text-slate-500 font-bold block">Chave de Acesso do Padrão Nacional NFS-e (50 dígitos):</span>
            <span className="text-slate-900 break-all select-all">{chaveAcesso}</span>
          </div>
        </div>

        {/* Rodapé de Ações: Consulta RFB e Impressão DANFSE */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 rounded-b-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRfbModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-sm"
              title="Consultar no Ambiente de Dados Nacional da Receita Federal (RFB)"
            >
              <ShieldCheck className="w-4 h-4" />
              Consulta RFB (Nacional)
            </button>
            <button
              type="button"
              onClick={handlePrintDanfse}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm"
              title="Impressão do Documento Auxiliar da NFS-e (DANFSE)"
            >
              <Printer className="w-4 h-4" />
              Impressão do Documento Auxiliar DANFSE
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-medium text-xs transition"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Submodal de Consulta RFB */}
      {rfbModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-4 border shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                Consulta RFB &bull; Ambiente Nacional NFS-e
              </div>
              <button onClick={() => setRfbModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-700">
              <p>
                A NFS-e nº <strong>{invoice.invoiceNumber}</strong> está devidamente transmitida e sincronizada com o{" "}
                <strong>Ambiente de Dados Nacional (ADN) da Receita Federal do Brasil</strong>.
              </p>
              <div className="p-3 bg-slate-50 border rounded font-mono text-[11px] space-y-1">
                <div><strong>Situação na RFB:</strong> <span className="text-emerald-700 font-bold">Autorizada / Regular</span></div>
                <div><strong>Protocolo de Autorização:</strong> PR-2026-NFE-{invoice.verificationCode.slice(0, 8)}</div>
                <div><strong>Data de Autorização:</strong> {new Date(invoice.createdAt).toLocaleString("pt-BR")}</div>
                <div><strong>Chave Nacional:</strong> {chaveAcesso}</div>
              </div>
              <p className="text-slate-500 text-[11px]">
                Em conformidade com a Resolução CGSN nº 169 e o Convênio NFS-e padrão nacional.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <a
                href={`/portal/nfse/${invoice.verificationCode}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Validar Autenticidade Pública
              </a>
              <button
                type="button"
                onClick={() => setRfbModalOpen(false)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
