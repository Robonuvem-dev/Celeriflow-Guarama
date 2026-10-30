"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plus, Search, FileText, CheckCircle, ExternalLink, RefreshCw, Printer } from "lucide-react";

interface ExternalPriceRegistration {
  id: string;
  externalBody: string; // Órgão externo
  processNumber: string; // Processo de adesão
  biddingNumber: string; // Licitação de origem
  object: string; // Objeto
  status: "Ativo" | "Em adesão" | "Encerrado" | "Cancelado";
  validUntil: string;
  totalValue: number;
  sdList: { id: string; number: string; value: number; status: "Aprovada" | "Pendente" | "Cancelada"; date: string }[];
  acsList: { id: string; number: string; supplier: string; value: number; issuedAt: string }[];
  priceSurveys: { id: string; date: string; averagePrice: number; status: string }[];
}

const mockRegistrations: ExternalPriceRegistration[] = [
  {
    id: "rpe-1",
    externalBody: "Consórcio Intermunicipal de Saúde do Alto Tietê (CISAT)",
    processNumber: "ADE-001/2026",
    biddingNumber: "PE-045/2025",
    object: "Adesão para aquisição parcelada de medicamentos essenciais e materiais hospitalares.",
    status: "Ativo",
    validUntil: "2026-12-31",
    totalValue: 345000.0,
    sdList: [
      { id: "sd-101", number: "SD-2026/089", value: 45000.0, status: "Aprovada", date: "2026-02-10" },
      { id: "sd-102", number: "SD-2026/112", value: 32000.0, status: "Cancelada", date: "2026-03-01" },
    ],
    acsList: [
      { id: "acs-01", number: "ACS-2026/044", supplier: "Farma Distribuidora Nacional Ltda", value: 45000.0, issuedAt: "2026-02-12" },
    ],
    priceSurveys: [
      { id: "pesq-01", date: "2026-01-15", averagePrice: 42000.0, status: "Concluída e validada" },
    ],
  },
  {
    id: "rpe-2",
    externalBody: "Prefeitura Municipal de Belo Horizonte - MG",
    processNumber: "ADE-002/2026",
    biddingNumber: "PE-112/2025",
    object: "Adesão a ata de registro de preços para contratação de serviços de nuvem e segurança da informação.",
    status: "Ativo",
    validUntil: "2026-11-20",
    totalValue: 180000.0,
    sdList: [
      { id: "sd-201", number: "SD-2026/095", value: 90000.0, status: "Aprovada", date: "2026-02-25" },
    ],
    acsList: [
      { id: "acs-02", number: "ACS-2026/058", supplier: "Cloud Brasil Infraestrutura S.A.", value: 90000.0, issuedAt: "2026-02-28" },
    ],
    priceSurveys: [
      { id: "pesq-02", date: "2026-02-01", averagePrice: 91500.0, status: "Concluída" },
    ],
  },
];

export default function ExternalPriceRegistrationClient() {
  const [items, setItems] = useState<ExternalPriceRegistration[]>(mockRegistrations);
  const [selectedId, setSelectedId] = useState<string>(mockRegistrations[0].id);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modais / sub-forms
  const [activeModal, setActiveModal] = useState<"new-body" | "new-adhesion" | "new-survey" | "new-sd" | "emit-acs" | "transparency-docs" | null>(null);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    externalBody: "",
    processNumber: "",
    biddingNumber: "",
    object: "",
    totalValue: "",
    sdNumber: "",
    sdValue: "",
    acsSupplier: "",
    acsValue: "",
    surveyAverage: "",
  });

  const selectedItem = items.find((i) => i.id === selectedId) || items[0];

  const handleCreateAdhesion = (e: React.FormEvent) => {
    e.preventDefault();
    const newReg: ExternalPriceRegistration = {
      id: `rpe-${Date.now()}`,
      externalBody: formData.externalBody || "Órgão Externo Homologado",
      processNumber: formData.processNumber || `ADE-${Math.floor(Math.random() * 900 + 100)}/2026`,
      biddingNumber: formData.biddingNumber || "PE-099/2025",
      object: formData.object || "Adesão a Ata de Registro de Preços Externa",
      status: "Em adesão",
      validUntil: "2026-12-31",
      totalValue: parseFloat(formData.totalValue) || 100000,
      sdList: [],
      acsList: [],
      priceSurveys: [],
    };
    setItems([newReg, ...items]);
    setSelectedId(newReg.id);
    setActiveModal(null);
    setModalFeedback("Processo de adesão a registro de preços externo cadastrado com sucesso!");
    setTimeout(() => setModalFeedback(null), 4000);
  };

  const handleAddSD = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const newSd = {
      id: `sd-${Date.now()}`,
      number: formData.sdNumber || `SD-2026/${Math.floor(Math.random() * 900 + 100)}`,
      value: parseFloat(formData.sdValue) || 15000,
      status: "Aprovada" as const,
      date: new Date().toISOString().split("T")[0],
    };
    const updated = items.map((item) =>
      item.id === selectedItem.id ? { ...item, sdList: [...item.sdList, newSd] } : item
    );
    setItems(updated);
    setActiveModal(null);
    setModalFeedback(`Solicitação de Despesa (${newSd.number}) cadastrada com sucesso!`);
    setTimeout(() => setModalFeedback(null), 4000);
  };

  const handleCancelSD = (sdId: string) => {
    if (!selectedItem) return;
    const updated = items.map((item) =>
      item.id === selectedItem.id
        ? {
            ...item,
            sdList: item.sdList.map((sd) =>
              sd.id === sdId ? { ...sd, status: "Cancelada" as const } : sd
            ),
          }
        : item
    );
    setItems(updated);
    setModalFeedback("SD cancelada com sucesso!");
    setTimeout(() => setModalFeedback(null), 3000);
  };

  const handleEmitACS = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const newAcs = {
      id: `acs-${Date.now()}`,
      number: `ACS-2026/${Math.floor(Math.random() * 900 + 100)}`,
      supplier: formData.acsSupplier || "Fornecedor Detentor da Ata",
      value: parseFloat(formData.acsValue) || 25000,
      issuedAt: new Date().toISOString().split("T")[0],
    };
    const updated = items.map((item) =>
      item.id === selectedItem.id ? { ...item, acsList: [...item.acsList, newAcs] } : item
    );
    setItems(updated);
    setActiveModal(null);
    setModalFeedback(`Autorização de Compra e Serviços (${newAcs.number}) emitida com sucesso!`);
    setTimeout(() => setModalFeedback(null), 4000);
  };

  const handleAddSurvey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const newSurvey = {
      id: `pesq-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      averagePrice: parseFloat(formData.surveyAverage) || 20000,
      status: "Concluída e validada",
    };
    const updated = items.map((item) =>
      item.id === selectedItem.id ? { ...item, priceSurveys: [...item.priceSurveys, newSurvey] } : item
    );
    setItems(updated);
    setActiveModal(null);
    setModalFeedback("Pesquisa de preços anexada ao processo com sucesso!");
    setTimeout(() => setModalFeedback(null), 4000);
  };

  const filteredItems = items.filter(
    (i) =>
      i.externalBody.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.processNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.object.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/app-domain/compras" className="hover:underline">Compras</Link>
            <span>/</span>
            <Link href="/app-domain/compras/licitacoes" className="hover:underline">Licitações</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Registro de Preços Externo</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Processos de Registro de Preços Externo (Adesão/Carona)</h1>
          <p className="text-sm text-slate-600 mt-1">
            Gerencie o cadastro de órgãos externos, processos de adesão, pesquisas de preços, SDs, emissão de ACS e publicação de documentos no Portal da Transparência.
          </p>
        </div>

        {/* Ações principais do requisito 11.29 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveModal("new-adhesion")}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Processo de Adesão
          </button>
          <button
            onClick={() => setActiveModal("new-body")}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Órgão Externo
          </button>
        </div>
      </div>

      {modalFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{modalFeedback}</span>
        </div>
      )}

      {/* Grid de Consulta e Detalhamento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Processos */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b">
            <h2 className="font-semibold text-slate-900 text-sm">Processos Registrados ({filteredItems.length})</h2>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por órgão, adesão..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2 max-h-[550px] overflow-y-auto">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedItem?.id === item.id
                    ? "bg-blue-50/70 border-blue-400"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    {item.processNumber}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                    item.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {item.status}
                  </span>
                </div>
                <div className="font-semibold text-sm text-slate-800 mt-1 line-clamp-1">
                  {item.externalBody}
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.object}</p>
                <div className="flex justify-between items-center text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                  <span>Validade: {item.validUntil}</span>
                  <span className="font-semibold text-slate-700">R$ {item.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhes do Processo Selecionado (Requisitos 11.29 e 11.3) */}
        {selectedItem && (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                      {selectedItem.processNumber}
                    </span>
                    <span className="text-xs text-slate-500">Origem: {selectedItem.biddingNumber}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedItem.externalBody}</h2>
                  <p className="text-sm text-slate-600 mt-1">{selectedItem.object}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Valor Total Registrado</span>
                  <div className="text-xl font-bold text-slate-900">
                    R$ {selectedItem.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Botões operacionais do processo selecionado */}
              <div className="flex flex-wrap gap-2 pt-2 border-b pb-4">
                <button
                  onClick={() => setActiveModal("new-sd")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cadastrar SD para Compra
                </button>
                <button
                  onClick={() => setActiveModal("emit-acs")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Emitir ACS
                </button>
                <button
                  onClick={() => setActiveModal("new-survey")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg"
                >
                  <Search className="w-3.5 h-3.5" />
                  Pesquisa de Preços
                </button>
                <button
                  onClick={() => setActiveModal("transparency-docs")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Documentos p/ Portal da Transparência
                </button>
              </div>

              {/* Rastreabilidade de SDs (Requisito 11.3: consulta das SDs e ACSs geradas) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Solicitações de Despesa (SDs) Geradas ({selectedItem.sdList.length})
                  </h3>
                </div>
                {selectedItem.sdList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-dashed">
                    Nenhuma SD vinculada a este processo até o momento.
                  </p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                        <tr>
                          <th className="p-2.5">Número da SD</th>
                          <th className="p-2.5">Data</th>
                          <th className="p-2.5">Valor</th>
                          <th className="p-2.5">Situação</th>
                          <th className="p-2.5 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-slate-700">
                        {selectedItem.sdList.map((sd) => (
                          <tr key={sd.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-medium">{sd.number}</td>
                            <td className="p-2.5">{sd.date}</td>
                            <td className="p-2.5 font-semibold">
                              R$ {sd.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  sd.status === "Aprovada"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : sd.status === "Cancelada"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {sd.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              {sd.status !== "Cancelada" && (
                                <button
                                  onClick={() => handleCancelSD(sd.id)}
                                  className="text-rose-600 hover:text-rose-800 font-medium text-[11px] hover:underline"
                                >
                                  Cancelar SD
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Rastreabilidade de ACSs Emitidas */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    Autorizações de Compra e Serviços (ACSs) Emitidas ({selectedItem.acsList.length})
                  </h3>
                </div>
                {selectedItem.acsList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-dashed">
                    Nenhuma ACS emitida para este processo até o momento.
                  </p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                        <tr>
                          <th className="p-2.5">Número da ACS</th>
                          <th className="p-2.5">Fornecedor</th>
                          <th className="p-2.5">Emissão</th>
                          <th className="p-2.5">Valor Autorizado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-slate-700">
                        {selectedItem.acsList.map((acs) => (
                          <tr key={acs.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-medium">{acs.number}</td>
                            <td className="p-2.5">{acs.supplier}</td>
                            <td className="p-2.5">{acs.issuedAt}</td>
                            <td className="p-2.5 font-semibold text-emerald-700">
                              R$ {acs.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Histórico de Pesquisas de Preços */}
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold text-slate-900 text-sm">Pesquisas de Preço Anexadas ({selectedItem.priceSurveys.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedItem.priceSurveys.map((survey) => (
                    <div key={survey.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>Data: {survey.date}</span>
                        <span className="text-emerald-700">Média: R$ {survey.averagePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-slate-500 mt-1">Status: {survey.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Genérico / Formulários */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            {activeModal === "new-adhesion" && (
              <form onSubmit={handleCreateAdhesion} className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Cadastrar Processo de Adesão a Registro de Preços</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Órgão Gerenciador Externo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: CISAT, Prefeitura de SP, etc."
                      value={formData.externalBody}
                      onChange={(e) => setFormData({ ...formData, externalBody: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nº do Processo de Adesão</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ADE-003/2026"
                      value={formData.processNumber}
                      onChange={(e) => setFormData({ ...formData, processNumber: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nº do Pregão/Ata de Origem</label>
                    <input
                      type="text"
                      placeholder="Ex: PE-015/2025"
                      value={formData.biddingNumber}
                      onChange={(e) => setFormData({ ...formData, biddingNumber: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Objeto do Registro</label>
                    <textarea
                      rows={2}
                      placeholder="Descrição sucinta do objeto da ata"
                      value={formData.object}
                      onChange={(e) => setFormData({ ...formData, object: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Estimado Total (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.totalValue}
                      onChange={(e) => setFormData({ ...formData, totalValue: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Salvar Processo</button>
                </div>
              </form>
            )}

            {activeModal === "new-body" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Cadastrar Órgão Externo</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Razão Social / Nome do Órgão</label>
                    <input type="text" placeholder="Nome completo do órgão público" className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
                      <input type="text" placeholder="00.000.000/0000-00" className="w-full p-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Esfera</label>
                      <select className="w-full p-2 border rounded-lg text-sm">
                        <option>Municipal</option>
                        <option>Estadual</option>
                        <option>Federal</option>
                        <option>Consórcio</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      setModalFeedback("Órgão externo cadastrado e integrado com sucesso!");
                      setTimeout(() => setModalFeedback(null), 3000);
                    }}
                    className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Salvar Órgão
                  </button>
                </div>
              </div>
            )}

            {activeModal === "new-sd" && (
              <form onSubmit={handleAddSD} className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Cadastrar SD para Compra</h3>
                <p className="text-xs text-slate-500">Vincular nova Solicitação de Despesa ao processo {selectedItem?.processNumber}.</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Número da SD</label>
                    <input
                      type="text"
                      placeholder="Ex: SD-2026/150"
                      value={formData.sdNumber}
                      onChange={(e) => setFormData({ ...formData, sdNumber: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Valor da SD (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.sdValue}
                      onChange={(e) => setFormData({ ...formData, sdValue: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium">Cadastrar SD</button>
                </div>
              </form>
            )}

            {activeModal === "emit-acs" && (
              <form onSubmit={handleEmitACS} className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Emitir Autorização de Compra e Serviços (ACS)</h3>
                <p className="text-xs text-slate-500">Emitir documento oficial para fornecedor do processo {selectedItem?.processNumber}.</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fornecedor Beneficiário</label>
                    <input
                      type="text"
                      required
                      placeholder="Nome ou Razão Social da empresa vencedora"
                      value={formData.acsSupplier}
                      onChange={(e) => setFormData({ ...formData, acsSupplier: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Valor da Autorização (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.acsValue}
                      onChange={(e) => setFormData({ ...formData, acsValue: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Emitir ACS</button>
                </div>
              </form>
            )}

            {activeModal === "new-survey" && (
              <form onSubmit={handleAddSurvey} className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Registrar Pesquisa de Preços</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Médio Apurado (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.surveyAverage}
                      onChange={(e) => setFormData({ ...formData, surveyAverage: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveModal(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Gravar Pesquisa</button>
                </div>
              </form>
            )}

            {activeModal === "transparency-docs" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Documentos para o Portal da Transparência</h3>
                <p className="text-xs text-slate-500">Documentos vinculados para publicação obrigatória no portal:</p>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded border flex items-center justify-between">
                    <span>Ata de Registro de Preços Externa.pdf</span>
                    <span className="text-emerald-600 font-medium">Publicado</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border flex items-center justify-between">
                    <span>Termo de Adesão e Justificativa de Vantajosidade.pdf</span>
                    <span className="text-emerald-600 font-medium">Publicado</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border flex items-center justify-between">
                    <span>Autorização do Órgão Gerenciador.pdf</span>
                    <span className="text-emerald-600 font-medium">Publicado</span>
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-1.5 text-xs bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
