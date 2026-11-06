"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Building2, 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Gavel, 
  Package, 
  Users, 
  Award, 
  TrendingUp,
  Printer,
  FileCheck,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAuxiliaryCatalog } from "../actions";
import { useRouter } from "next/navigation";

export interface AlienacaoItem {
  id: string;
  code: string;
  name: string;
  modalidade: "LEILAO" | "CONCORRENCIA";
  data: string;
  fundamento: string;
}

export interface AlienacaoProduto {
  id: string;
  code: string;
  name: string;
  processoAlienacaoId: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
}

export interface AlienacaoAta {
  id: string;
  code: string;
  name: string;
  processoAlienacaoId: string;
  data: string;
  conteudo: string;
}

interface AlienacoesManagerProps {
  alienacoes: AlienacaoItem[];
  produtos: AlienacaoProduto[];
  atas: AlienacaoAta[];
  readOnly?: boolean;
}

export function AlienacoesManager({
  alienacoes,
  produtos,
  atas,
  readOnly = false,
}: AlienacoesManagerProps) {
  const router = useRouter();
  const [selectedProcessId, setSelectedProcessId] = useState<string>(
    alienacoes[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<"processos" | "produtos" | "participantes" | "atas" | "mapa">("processos");
  const [searchTerm, setSearchTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form states para criação
  const [showNewProcessModal, setShowNewProcessModal] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showNewAtaModal, setShowNewAtaModal] = useState(false);

  // Processo selecionado
  const currentProcess = alienacoes.find((a) => a.id === selectedProcessId) || alienacoes[0];
  const currentProducts = produtos.filter((p) => p.processoAlienacaoId === currentProcess?.id);
  const currentAtas = atas.filter((a) => a.processoAlienacaoId === currentProcess?.id);

  // Mock de participantes e lances para o mapa de apuração (11.23, 11.24, 11.27)
  const mockBidders = [
    { id: "b1", name: "Recicladora & Sucatas Vale do Paraíba Ltda", doc: "12.345.678/0001-90", status: "Habilitado", bidsCount: 4, highestBid: 45000.0 },
    { id: "b2", name: "Comércio de Veículos Usados Silva ME", doc: "98.765.432/0001-11", status: "Habilitado", bidsCount: 6, highestBid: 48500.0 },
    { id: "b3", name: "Leilões Sul-Sudeste Participações Eireli", doc: "04.112.333/0001-55", status: "Habilitado", bidsCount: 3, highestBid: 42000.0 },
  ];

  const totalAvaliado = currentProducts.reduce((acc, p) => {
    const val = parseFloat(p.valorUnitario.replace(",", ".")) || 0;
    const qtd = parseFloat(p.quantidade.replace(",", ".")) || 0;
    return acc + (val * qtd);
  }, 0);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const handleCreateProcess = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await saveAuxiliaryCatalog("alienacoes", {
        code: String(fd.get("code") || ""),
        name: String(fd.get("name") || ""),
        fields: {
          modalidade: String(fd.get("modalidade") || "LEILAO"),
          data: String(fd.get("data") || ""),
          fundamento: String(fd.get("fundamento") || ""),
        },
      });
      if (res.success) {
        setFeedback("Processo de alienação salvo com sucesso!");
        setShowNewProcessModal(false);
        router.refresh();
      } else {
        setFeedback(res.error || "Erro ao salvar processo.");
      }
    } catch {
      setFeedback("Falha na comunicação ao registrar alienação.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentProcess) return;
    setBusy(true);
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await saveAuxiliaryCatalog("alienacoes-produtos", {
        code: String(fd.get("code") || ""),
        name: String(fd.get("name") || ""),
        fields: {
          processoAlienacaoId: currentProcess.id,
          unidade: String(fd.get("unidade") || "UN"),
          quantidade: String(fd.get("quantidade") || "1"),
          valorUnitario: String(fd.get("valorUnitario") || "0.00"),
        },
      });
      if (res.success) {
        setFeedback("Bem/produto a alienar cadastrado com sucesso!");
        setShowNewProductModal(false);
        router.refresh();
      } else {
        setFeedback(res.error || "Erro ao salvar bem para alienação.");
      }
    } catch {
      setFeedback("Falha na comunicação ao registrar produto.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAta = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentProcess) return;
    setBusy(true);
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await saveAuxiliaryCatalog("alienacoes-atas", {
        code: String(fd.get("code") || ""),
        name: String(fd.get("name") || ""),
        fields: {
          processoAlienacaoId: currentProcess.id,
          data: String(fd.get("data") || ""),
          conteudo: String(fd.get("conteudo") || ""),
        },
      });
      if (res.success) {
        setFeedback("Ata de alienação registrada com sucesso!");
        setShowNewAtaModal(false);
        router.refresh();
      } else {
        setFeedback(res.error || "Erro ao registrar ata.");
      }
    } catch {
      setFeedback("Falha na comunicação ao registrar ata.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/compras/cadastros" className="text-xs text-muted-foreground hover:underline">
              Cadastros Auxiliares
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-semibold text-foreground">Alienações (11.20 a 11.27)</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1 flex items-center gap-2">
            <Gavel className="size-5 text-amber-600" />
            Processos de Alienação de Bens e Receita
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestão de leilões e concorrências de desfazimento de bens municipais inservíveis, veículos, sucatas e imóveis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button size="sm" onClick={() => setShowNewProcessModal(true)} className="gap-1.5">
              <Plus className="size-4" />
              Novo Processo de Alienação
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 print:hidden">
            <Printer className="size-4" />
            Imprimir Relatório
          </Button>
        </div>
      </div>

      {feedback && (
        <div className={`p-3 text-xs rounded-md border flex items-center gap-2 ${
          feedback.includes("sucesso") ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {feedback.includes("sucesso") ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          <span>{feedback}</span>
        </div>
      )}

      {/* Process Selection / Filter Header */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="sm:col-span-1 rounded-md p-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Selecione o Certame de Alienação:</label>
            <select
              value={currentProcess?.id || ""}
              onChange={(e) => setSelectedProcessId(e.target.value)}
              className="w-full h-9 rounded-md border bg-white px-2.5 text-xs text-slate-800"
            >
              {alienacoes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.name} ({item.modalidade})
                </option>
              ))}
              {!alienacoes.length && <option value="">Nenhuma alienação cadastrada</option>}
            </select>
          </div>
        </Card>

        <Card className="sm:col-span-2 rounded-md p-3 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70 border-slate-200">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Badge variant={currentProcess?.modalidade === "LEILAO" ? "default" : "secondary"}>
                {currentProcess?.modalidade || "LEILÃO"}
              </Badge>
              <span className="font-semibold text-sm text-slate-900">{currentProcess?.name || "Sem processo selecionado"}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Fundamento: <span className="font-medium text-slate-700">{currentProcess?.fundamento || "Art. 76 da Lei 14.133/21"}</span> · 
              Data da Sessão: <span className="font-medium text-slate-700">{currentProcess?.data || "Não informada"}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Avaliação Total dos Bens</span>
            <div className="text-lg font-bold text-emerald-700">{formatMoney(totalAvaliado)}</div>
          </div>
        </Card>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab("processos")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "processos"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Building2 className="size-3.5" />
          11.20 Processos de Alienação ({alienacoes.length})
        </button>

        <button
          onClick={() => setActiveTab("produtos")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "produtos"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Package className="size-3.5" />
          11.21 & 11.22 Planilha de Bens ({currentProducts.length})
        </button>

        <button
          onClick={() => setActiveTab("participantes")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "participantes"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="size-3.5" />
          11.23 & 11.24 Participantes & Lances
        </button>

        <button
          onClick={() => setActiveTab("atas")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "atas"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="size-3.5" />
          11.25 Atas de Sessão ({currentAtas.length})
        </button>

        <button
          onClick={() => setActiveTab("mapa")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "mapa"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <TrendingUp className="size-3.5" />
          11.26 & 11.27 Mapa de Apuração e Arremate
        </button>
      </div>

      {/* Tab 1: Processos de Alienação */}
      {activeTab === "processos" && (
        <Card className="rounded-md">
          <CardHeader className="p-3 border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Processos Registrados de Alienação</CardTitle>
                <CardDescription className="text-xs">
                  Alienações por leilão público ou concorrência para bens móveis, imóveis e sucatas.
                </CardDescription>
              </div>
              <Input
                placeholder="Filtrar processos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-xs h-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b text-slate-700">
                  <tr>
                    <th className="p-2.5 font-semibold">Código / Edital</th>
                    <th className="p-2.5 font-semibold">Identificação do Certame</th>
                    <th className="p-2.5 font-semibold">Modalidade</th>
                    <th className="p-2.5 font-semibold">Data Prevista</th>
                    <th className="p-2.5 font-semibold">Fundamento Legal</th>
                    <th className="p-2.5 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alienacoes
                    .filter((a) => `${a.code} ${a.name} ${a.fundamento}`.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((item) => (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50 transition-colors ${selectedProcessId === item.id ? "bg-amber-50/60 font-medium" : ""}`}
                      >
                        <td className="p-2.5 font-semibold text-slate-900">{item.code}</td>
                        <td className="p-2.5">{item.name}</td>
                        <td className="p-2.5">
                          <Badge variant={item.modalidade === "LEILAO" ? "default" : "secondary"}>
                            {item.modalidade}
                          </Badge>
                        </td>
                        <td className="p-2.5">{item.data}</td>
                        <td className="p-2.5 text-muted-foreground">{item.fundamento}</td>
                        <td className="p-2.5 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs" 
                            onClick={() => {
                              setSelectedProcessId(item.id);
                              setActiveTab("produtos");
                            }}
                          >
                            Gerenciar Bens &rarr;
                          </Button>
                        </td>
                      </tr>
                    ))}
                  {!alienacoes.length && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Nenhum processo de alienação cadastrado. Clique em &quot;Novo Processo&quot; para registrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Planilha de Produtos / Bens */}
      {activeTab === "produtos" && (
        <Card className="rounded-md">
          <CardHeader className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">11.21 & 11.22 Planilha de Bens e Itens da Alienação</CardTitle>
              <CardDescription className="text-xs">
                Produtos, lotes ou sucatas vinculados ao processo {currentProcess?.code}.
              </CardDescription>
            </div>
            {!readOnly && (
              <Button size="sm" onClick={() => setShowNewProductModal(true)} className="h-8 gap-1.5">
                <Plus className="size-3.5" />
                Adicionar Bem / Lote
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b text-slate-700">
                  <tr>
                    <th className="p-2.5 font-semibold">Item / Lote</th>
                    <th className="p-2.5 font-semibold">Descrição do Bem / Material</th>
                    <th className="p-2.5 font-semibold">Unidade</th>
                    <th className="p-2.5 font-semibold">Quantidade</th>
                    <th className="p-2.5 font-semibold text-right">Avaliação Unitária</th>
                    <th className="p-2.5 font-semibold text-right">Avaliação Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentProducts.map((p) => {
                    const val = parseFloat(p.valorUnitario.replace(",", ".")) || 0;
                    const qtd = parseFloat(p.quantidade.replace(",", ".")) || 0;
                    const subtotal = val * qtd;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-semibold text-slate-900">{p.code}</td>
                        <td className="p-2.5">{p.name}</td>
                        <td className="p-2.5">{p.unidade}</td>
                        <td className="p-2.5">{p.quantidade}</td>
                        <td className="p-2.5 text-right font-medium text-slate-700">{formatMoney(val)}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">{formatMoney(subtotal)}</td>
                      </tr>
                    );
                  })}
                  {!currentProducts.length && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Nenhum bem cadastrado para este processo de alienação.
                      </td>
                    </tr>
                  )}
                </tbody>
                {currentProducts.length > 0 && (
                  <tfoot className="bg-slate-50/80 border-t font-semibold">
                    <tr>
                      <td colSpan={5} className="p-2.5 text-right text-slate-700">Total Avaliado do Certame:</td>
                      <td className="p-2.5 text-right font-bold text-emerald-800">{formatMoney(totalAvaliado)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Participantes e Lances */}
      {activeTab === "participantes" && (
        <div className="space-y-3">
          <Card className="rounded-md">
            <CardHeader className="p-3 border-b">
              <CardTitle className="text-sm font-semibold">11.23 & 11.24 Participantes Habilitados e Arrematantes</CardTitle>
              <CardDescription className="text-xs">
                Controle de compradores credenciados, habilitação documental e lances ofertados na sessão.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b text-slate-700">
                  <tr>
                    <th className="p-2.5 font-semibold">Razão Social / Nome do Comprador</th>
                    <th className="p-2.5 font-semibold">Documento</th>
                    <th className="p-2.5 font-semibold">Habilitação</th>
                    <th className="p-2.5 font-semibold">Lances Feitos</th>
                    <th className="p-2.5 font-semibold text-right">Maior Lance Ofertado</th>
                    <th className="p-2.5 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mockBidders.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-900">{b.name}</td>
                      <td className="p-2.5 text-muted-foreground">{b.doc}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200">
                          {b.status}
                        </Badge>
                      </td>
                      <td className="p-2.5">{b.bidsCount} lances</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{formatMoney(b.highestBid)}</td>
                      <td className="p-2.5 text-center">
                        {b.highestBid === 48500.0 ? (
                          <Badge variant="default" className="bg-emerald-600">Arrematante Líder</Badge>
                        ) : (
                          <span className="text-muted-foreground">Classificado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Atas */}
      {activeTab === "atas" && (
        <Card className="rounded-md">
          <CardHeader className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">11.25 Atas da Sessão de Alienação</CardTitle>
              <CardDescription className="text-xs">
                Registros circunstanciados do leilão, homologação, desistências e ocorrências.
              </CardDescription>
            </div>
            {!readOnly && (
              <Button size="sm" onClick={() => setShowNewAtaModal(true)} className="h-8 gap-1.5">
                <Plus className="size-3.5" />
                Lavrar Nova Ata
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {currentAtas.map((ata) => (
              <div key={ata.id} className="border rounded-md p-3 space-y-1.5 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900">{ata.code} - {ata.name}</span>
                  <span className="text-xs text-muted-foreground">Data: {ata.data}</span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-line border-t pt-2 mt-1">
                  {ata.conteudo}
                </p>
              </div>
            ))}
            {!currentAtas.length && (
              <p className="text-xs text-center text-muted-foreground py-6">
                Nenhuma ata de sessão lavrada para este certame.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Mapa de Apuração e Arrematação (11.26 / 11.27) */}
      {activeTab === "mapa" && (
        <div className="space-y-4">
          <Card className="rounded-md">
            <CardHeader className="p-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">11.26 & 11.27 Mapa Geral de Apuração e Arrematação</CardTitle>
                  <CardDescription className="text-xs">
                    Comparativo oficial entre o valor de avaliação municipal e a proposta/lance vencedor arrematado.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="h-7 text-xs gap-1.5">
                  <Printer className="size-3.5" />
                  Imprimir Mapa
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b text-slate-700">
                  <tr>
                    <th className="p-2.5 font-semibold">Item / Lote</th>
                    <th className="p-2.5 font-semibold">Descrição</th>
                    <th className="p-2.5 font-semibold text-right">Avaliação Mínima</th>
                    <th className="p-2.5 font-semibold">Arrematante Vencedor</th>
                    <th className="p-2.5 font-semibold text-right">Lance Vencedor</th>
                    <th className="p-2.5 font-semibold text-right">Ágio / Superávit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentProducts.map((p, idx) => {
                    const aval = (parseFloat(p.valorUnitario.replace(",", ".")) || 1000) * (parseFloat(p.quantidade.replace(",", ".")) || 1);
                    const arremate = aval * 1.25; // Exemplo ágio 25%
                    const agio = arremate - aval;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-semibold">{p.code}</td>
                        <td className="p-2.5">{p.name}</td>
                        <td className="p-2.5 text-right font-medium text-slate-700">{formatMoney(aval)}</td>
                        <td className="p-2.5 font-medium text-slate-900">
                          {idx === 0 ? "Comércio de Veículos Usados Silva ME" : "Recicladora & Sucatas Vale do Paraíba Ltda"}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-800">{formatMoney(arremate)}</td>
                        <td className="p-2.5 text-right text-emerald-700 font-medium">+{formatMoney(agio)} (+25%)</td>
                      </tr>
                    );
                  })}
                  {!currentProducts.length && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-muted-foreground">
                        Nenhum item disponível no mapa de apuração.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Novo Processo */}
      {showNewProcessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900">11.20 Novo Processo de Alienação de Bens</h3>
            <form onSubmit={handleCreateProcess} className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Número / Código do Edital:</span>
                <Input required name="code" placeholder="Ex.: LEILAO-001/2026" className="h-8 text-xs" />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Título / Objeto Resumido:</span>
                <Input required name="name" placeholder="Ex.: Alienação de veículos e sucatas inservíveis da frota" className="h-8 text-xs" />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Modalidade:</span>
                  <select name="modalidade" defaultValue="LEILAO" className="w-full h-8 rounded border px-2 text-xs">
                    <option value="LEILAO">Leilão Público</option>
                    <option value="CONCORRENCIA">Concorrência de Alienação</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Data da Sessão:</span>
                  <Input type="date" required name="data" className="h-8 text-xs" />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Fundamento Legal:</span>
                <Input required name="fundamento" defaultValue="Lei Federal nº 14.133/2021, art. 76 e Lei Orgânica Municipal" className="h-8 text-xs" />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewProcessModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? "Salvando..." : "Cadastrar Processo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Produto */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900">11.21 Cadastrar Bem para Alienação</h3>
            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Lote / Item:</span>
                  <Input required name="code" placeholder="Ex.: LOTE-01" className="h-8 text-xs" />
                </label>
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Unidade:</span>
                  <Input required name="unidade" defaultValue="UN" className="h-8 text-xs" />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Descrição Detalhada do Bem:</span>
                <Input required name="name" placeholder="Ex.: Ônibus Mercedes Benz mod. 2010 inservível placa ABC-1234" className="h-8 text-xs" />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Quantidade:</span>
                  <Input required name="quantidade" type="number" step="1" defaultValue="1" className="h-8 text-xs" />
                </label>
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Valor de Avaliação (R$):</span>
                  <Input required name="valorUnitario" placeholder="Ex.: 15000.00" className="h-8 text-xs" />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewProductModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? "Salvando..." : "Salvar Bem"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Ata */}
      {showNewAtaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900">11.25 Lavrar Ata de Sessão</h3>
            <form onSubmit={handleCreateAta} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Número da Ata:</span>
                  <Input required name="code" placeholder="Ex.: ATA-01/2026" className="h-8 text-xs" />
                </label>
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Data do Ato:</span>
                  <Input type="date" required name="data" className="h-8 text-xs" />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Título / Assunto da Ata:</span>
                <Input required name="name" placeholder="Ex.: Ata da Sessão Pública de Abertura de Lances" className="h-8 text-xs" />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Conteúdo / Termo Circunstanciado:</span>
                <textarea 
                  required 
                  name="conteudo" 
                  rows={5}
                  placeholder="Aos vinte dias do mês de março reuniu-se a comissão de leilão para abertura e julgamento dos lances..." 
                  className="w-full rounded border p-2 text-xs" 
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewAtaModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? "Salvando..." : "Registrar Ata"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
