"use client";

import { useState } from "react";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { financeColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { format } from "date-fns";
import { Plus, Ban, FileText, ShieldAlert, Layers, Printer, Download, CheckCircle2, AlertTriangle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { createCommitment, updateCommitment, cancelCommitment } from "./actions";

type Commitment = {
  id: string;
  number: string;
  date: Date;
  value: number;
  type: string;
  history: string;
  status: string;
  supplierId: string;
  appropriationId: string;
  supplier: {
    id: string;
    company?: { corporateName: string } | null;
    person?: { fullName: string } | null;
  };
  appropriation: {
    id: string;
    code: string;
    budgetUnit: { name: string };
  };
  financialDocument: { id: string; number: string; title: string } | null;
  obrasServices: { id: string; protocolo: string }[];
  purchaseReceipt: { number: string } | null;
};

type SupplierOption = {
  id: string;
  company?: { corporateName: string } | null;
  person?: { fullName: string } | null;
};

type AppropriationOption = { id: string; code: string; budgetUnit: { name: string } };
type ReservationOption = {
  id: string;
  number: string;
  value: number;
  appropriationId: string;
  appropriation: { code: string };
  expense: {
    supplierId: string | null;
    sourceModule: string;
    sourceType: string;
    sourceId: string | null;
    purchaseReceipt: { number: string; contractId: string; contract: { supplierId: string } } | null;
  } | null;
};
type ProcessOption = { id: string; protocolNumber: string; description: string | null };
type ContractOption = { id: string; number: string; object: string; supplierId: string; status: string };
type ObrasServiceOption = { id: string; protocolo: string; tipo: string; descricao: string; local: string; budgetAppropriationId: string | null; budgetAppropriation: { code: string } | null };
type CovenantOption = { id: string; number: string; grantor: string | null };
type PublicityCampaignOption = { id: string; name: string; agency: string | null };
type FundedDebtOption = { id: string; lawNumber: string; creditorName: string | null };

// CF18.173: Mock data para Restos a Pagar Processados (RPP) com saldo
const mockRPP = [
  { id: "rpp-1", exercicio: 2025, empenho: "2025/00142", credor: "Construtora Horizonte LTDA", dotacao: "02.07.01.15.451.0008.1022.449051", inscrito: 145000, cancelado: 0, pago: 95000, saldo: 50000, status: "A Pagar" },
  { id: "rpp-2", exercicio: 2025, empenho: "2025/00288", credor: "Auto Posto Alvorada LTDA", dotacao: "02.04.01.10.301.0005.2014.339030", inscrito: 38200, cancelado: 0, pago: 25000, saldo: 13200, status: "A Pagar" },
  { id: "rpp-3", exercicio: 2025, empenho: "2025/00412", credor: "Provedor Net Telecomunicações ME", dotacao: "02.02.01.04.122.0002.2005.339039", inscrito: 14400, cancelado: 0, pago: 12000, saldo: 2400, status: "A Pagar" },
];

// CF18.173: Mock data para Restos a Pagar Não Processados (RPNP) com saldo
const mockRPNP = [
  { id: "rpnp-1", exercicio: 2025, empenho: "2025/00389", credor: "Equipamentos Médicos do Sul LTDA", dotacao: "02.04.01.10.301.0005.1018.449052", inscrito: 89000, liquidado: 0, cancelado: 0, pago: 0, saldoLiquidar: 89000, saldoPagar: 0, status: "Em Liquidação" },
  { id: "rpnp-2", exercicio: 2025, empenho: "2025/00502", credor: "Comércio de Materiais Didáticos LTDA", dotacao: "02.05.01.12.361.0006.2020.339030", inscrito: 45000, liquidado: 20000, cancelado: 0, pago: 15000, saldoLiquidar: 25000, saldoPagar: 5000, status: "Liquidado Parcial" },
];

// CF18.173: Mock data para Despesas Extraorçamentárias com saldo
const mockDespesasExtras = [
  { id: "ext-1", conta: "2.1.8.8.1.01.02", descricao: "INSS - Retenção Folha de Pagamento Servidores", retencao: 185000, recolhido: 185000, saldo: 0, status: "Quitado" },
  { id: "ext-2", conta: "2.1.8.8.1.01.04", descricao: "IRRF - Retenção na Fonte Prestadores de Serviço", retencao: 64200, recolhido: 48000, saldo: 16200, status: "Saldo a Recolher" },
  { id: "ext-3", conta: "2.1.8.8.1.01.15", descricao: "Consignações Empréstimos CEF / BB", retencao: 92400, recolhido: 92400, saldo: 0, status: "Quitado" },
  { id: "ext-4", conta: "2.1.8.8.1.04.01", descricao: "Cauções e Garantias de Contratos de Obras", retencao: 120000, recolhido: 20000, saldo: 100000, status: "Saldo em Custódia" },
];

// CF18.17: Limitações de Despesa (Cotas) no nível de UO, Fontes de Recursos e Grupo de Despesa limitadas à previsão da receita
const mockCotasDespesa = [
  { id: "cota-1", uo: "02.01 - Gabinete do Prefeito", fonte: "1500 - Recursos Próprios / Ordinários", gnd: "GND 3 - Outras Despesas Correntes", dotacaoOrcada: 450000, previsaoReceita: 420000, cotaFixada: 380000, empenhado: 245000, saldoCota: 135000, status: "Regular" },
  { id: "cota-2", uo: "02.04 - Fundo Municipal de Saúde", fonte: "1500 - ASPS 15% Impostos", gnd: "GND 3 - Outras Despesas Correntes", dotacaoOrcada: 4200000, previsaoReceita: 4000000, cotaFixada: 3900000, empenhado: 3450000, saldoCota: 450000, status: "Regular" },
  { id: "cota-3", uo: "02.04 - Fundo Municipal de Saúde", fonte: "1600 - Transferências SUS da União", gnd: "GND 4 - Investimentos", dotacaoOrcada: 1200000, previsaoReceita: 950000, cotaFixada: 900000, empenhado: 890000, saldoCota: 10000, status: "Atenção (Limite)" },
  { id: "cota-4", uo: "02.05 - Secretaria de Educação", fonte: "1540 - FUNDEB 70%", gnd: "GND 1 - Pessoal e Encargos", dotacaoOrcada: 7500000, previsaoReceita: 7500000, cotaFixada: 7200000, empenhado: 6100000, saldoCota: 1100000, status: "Regular" },
  { id: "cota-5", uo: "02.07 - Secretaria de Obras e Serviços", fonte: "1501 - Royalties do Petróleo", gnd: "GND 4 - Investimentos", dotacaoOrcada: 2500000, previsaoReceita: 1800000, cotaFixada: 1600000, empenhado: 1600000, saldoCota: 0, status: "Cota Bloqueada (Art. 9 LRF)" },
];

// CF18.277: Decretos Orçamentários cadastrados de forma particular
type Decreto = {
  id: string;
  numero: string;
  data: string;
  tipo: string;
  origemRecurso: string;
  valor: number;
  amparoLegal: string;
  status: string;
};

const mockDecretosIniciais: Decreto[] = [
  { id: "dec-1", numero: "Decreto nº 008/2026", data: "15/01/2026", tipo: "Crédito Suplementar", origemRecurso: "Superávit Financeiro apurado em balanço anterior", valor: 350000, amparoLegal: "Art. 43, § 1º, I da Lei Federal nº 4.320/1964", status: "Publicado / Em Vigor" },
  { id: "dec-2", numero: "Decreto nº 015/2026", data: "05/02/2026", tipo: "Crédito Suplementar", origemRecurso: "Excesso de Arrecadação na Fonte 1500", valor: 280000, amparoLegal: "Art. 43, § 1º, II da Lei Federal nº 4.320/1964", status: "Publicado / Em Vigor" },
  { id: "dec-3", numero: "Decreto nº 022/2026", data: "20/02/2026", tipo: "Crédito Especial", origemRecurso: "Anulação parcial de dotações orçamentárias", valor: 140000, amparoLegal: "Lei Municipal autorizativa nº 1.482/2026", status: "Publicado / Em Vigor" },
];

const columns = [
  financeColumn("number", "Número", 70, 90, "identifier"),
  financeColumn("date", "Data", 90),
  financeColumn("supplier", "Fornecedor/Credor", 120, 200),
  financeColumn("unit", "Unidade Orçamentária", 120, 170),
  financeColumn("value", "Valor (R$)", 110, 130, "text", "right"),
  financeColumn("receipt", "Recebimento", 95),
  financeColumn("document", "Documento interno", 110),
  financeColumn("works", "Obra/OS", 80),
  financeColumn("status", "Status", 85, 100, "status"),
  financeColumn("actions", "Ações", 48, 48, "actions")
];

export default function EmpenhosClient({
  commitments,
  suppliers,
  appropriations,
  reservations,
  processes,
  contracts,
  obrasServices,
  covenants,
  publicityCampaigns,
  fundedDebts,
}: {
  commitments: Commitment[];
  suppliers: SupplierOption[];
  appropriations: AppropriationOption[];
  reservations: ReservationOption[];
  processes: ProcessOption[];
  contracts: ContractOption[];
  obrasServices: ObrasServiceOption[];
  covenants: CovenantOption[];
  publicityCampaigns: PublicityCampaignOption[];
  fundedDebts: FundedDebtOption[];
}) {
  const [activeTab, setActiveTab] = useState<"empenhos" | "rpp" | "rpnp" | "extras" | "cotas" | "decretos">("empenhos");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDecretoModalOpen, setIsDecretoModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Decretos particulares (18.277)
  const [decretos, setDecretos] = useState<Decreto[]>(mockDecretosIniciais);
  const [novoDecreto, setNovoDecreto] = useState({
    numero: "",
    data: new Date().toISOString().substring(0, 10),
    tipo: "Crédito Suplementar",
    origemRecurso: "Superávit Financeiro apurado em balanço anterior",
    valor: 0,
    amparoLegal: "Art. 43, § 1º da Lei 4.320/64 e LOA 2026",
  });

  const [formData, setFormData] = useState({
    number: "",
    date: new Date().toISOString().substring(0, 10),
    value: 0,
    type: "Ordinário",
    history: "",
    supplierId: "",
    appropriationId: "",
    reservationId: "",
    processId: "",
    contractId: "",
    obrasServiceId: "",
    covenantId: "",
    publicityCampaignId: "",
    fundedDebtId: "",
    decretoVinculadoId: "",
  });

  const filteredCommitments = commitments.filter(c =>
    c.number.includes(searchTerm) ||
    c.supplier.company?.corporateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.supplier.person?.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pageSize = OPERATIONAL_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredCommitments.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedCommitments = filteredCommitments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData({
      number: "",
      date: new Date().toISOString().substring(0, 10),
      value: 0,
      type: "Ordinário",
      history: "",
      supplierId: "",
      appropriationId: "",
      reservationId: "",
      processId: "",
      contractId: "",
      obrasServiceId: "",
      covenantId: "",
      publicityCampaignId: "",
      fundedDebtId: "",
      decretoVinculadoId: "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataToSubmit = {
        ...formData,
        date: new Date(formData.date)
      };

      if (editingId) {
        const result = await updateCommitment(editingId, dataToSubmit);
        if (result.error) throw new Error(result.error);
      } else {
        const result = await createCommitment(dataToSubmit);
        if (result.error) throw new Error(result.error);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving commitment:", error);
      alert("Ocorreu um erro ao salvar o empenho.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalvarDecreto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoDecreto.numero || novoDecreto.valor <= 0) {
      alert("Informe o número e o valor do decreto.");
      return;
    }
    const novo: Decreto = {
      id: "dec-" + Date.now(),
      numero: novoDecreto.numero,
      data: format(new Date(novoDecreto.data), "dd/MM/yyyy"),
      tipo: novoDecreto.tipo,
      origemRecurso: novoDecreto.origemRecurso,
      valor: novoDecreto.valor,
      amparoLegal: novoDecreto.amparoLegal,
      status: "Publicado / Em Vigor",
    };
    setDecretos([novo, ...decretos]);
    setIsDecretoModalOpen(false);
    setNovoDecreto({
      numero: "",
      data: new Date().toISOString().substring(0, 10),
      tipo: "Crédito Suplementar",
      origemRecurso: "Superávit Financeiro apurado em balanço anterior",
      valor: 0,
      amparoLegal: "Art. 43, § 1º da Lei 4.320/64 e LOA 2026",
    });
    alert("Decreto Orçamentário cadastrado com sucesso!");
  };

  const handleCancelCommitment = async (id: string) => {
    if (window.confirm('Deseja realmente anular este empenho? Esta ação não pode ser desfeita.')) {
      const result = await cancelCommitment(id);
      if (result.error) alert(result.error);
    }
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <>
      {/* Barra de Abas e Ações Rápidas */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={activeTab === "empenhos" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("empenhos")}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" />
              Empenhos Orçamentários (18.173)
            </Button>
            <Button
              variant={activeTab === "rpp" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("rpp")}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Restos a Pagar Processados (RPP)
            </Button>
            <Button
              variant={activeTab === "rpnp" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("rpnp")}
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              Restos a Pagar Não Processados (RPNP)
            </Button>
            <Button
              variant={activeTab === "extras" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("extras")}
              className="gap-1.5"
            >
              <AlertTriangle className="h-4 w-4" />
              Despesas Extraorçamentárias
            </Button>
            <Button
              variant={activeTab === "cotas" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("cotas")}
              className="gap-1.5"
            >
              <ShieldAlert className="h-4 w-4" />
              Limitações de Despesa / Cotas (18.17)
            </Button>
            <Button
              variant={activeTab === "decretos" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("decretos")}
              className="gap-1.5"
            >
              <Scale className="h-4 w-4" />
              Decretos Orçamentários (18.277)
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            {activeTab === "decretos" ? (
              <Button size="sm" onClick={() => setIsDecretoModalOpen(true)} className="gap-1 bg-emerald-700 hover:bg-emerald-800 text-white">
                <Plus className="h-4 w-4" />
                Novo Decreto (18.277)
              </Button>
            ) : (
              <button className={styles.newButton} onClick={handleOpenNew}>
                <Plus /> Novo Empenho
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ABA 1: Empenhos Orçamentários */}
      {activeTab === "empenhos" && (
        <OperationalListFrame
          label="Empenhos Orçamentários"
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => alert("Exportando lista de empenhos em Excel (XLSX)...")}>
                <Download className="h-4 w-4 mr-1" /> Exportar XLS
              </Button>
            </div>
          }
          toolbar={
            <input
              aria-label="Buscar por fornecedor ou número"
              placeholder="Buscar por fornecedor ou número…"
              className={styles.searchInput}
              value={searchTerm}
              onChange={event => { setSearchTerm(event.target.value); setPage(1); }}
            />
          }
          pagination={<OperationalPagination page={currentPage} total={filteredCommitments.length} onPageChange={setPage} />}
        >
          <OperationalTable
            preferenceId="financeiro-empenhos"
            columns={columns}
            caption="Empenhos Orçamentários"
            emptyMessage="Nenhum empenho encontrado."
            rows={pagedCommitments.map(commitment => ({
              id: commitment.id,
              label: commitment.number,
              values: {
                number: commitment.number,
                date: format(new Date(commitment.date), "dd/MM/yyyy"),
                supplier: commitment.supplier.company?.corporateName || commitment.supplier.person?.fullName || "Não identificado",
                unit: commitment.appropriation.budgetUnit.name,
                value: formatBRL(commitment.value),
                receipt: commitment.purchaseReceipt?.number ?? "—",
                document: commitment.financialDocument?.number || "—",
                works: commitment.obrasServices.map(service => service.protocolo).join(", ") || "—",
                status: commitment.status,
              },
              actions: (
                <button
                  className={styles.iconButton}
                  aria-label={`Anular empenho ${commitment.number}`}
                  title="Anular"
                  disabled={commitment.status === "Anulado"}
                  onClick={() => void handleCancelCommitment(commitment.id)}
                >
                  <Ban />
                </button>
              )
            }))}
          />
        </OperationalListFrame>
      )}

      {/* ABA 2: Restos a Pagar Processados (RPP) - 18.173 */}
      {activeTab === "rpp" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded text-sm flex items-center justify-between">
            <div>
              <strong>Requisito 18.173 - Restos a Pagar Processados (RPP):</strong> Despesas empenhadas e liquidadas em exercícios anteriores pendentes de pagamento com saldo individualizado.
            </div>
            <div className="font-semibold text-blue-950">
              Total RPP a Pagar: {formatBRL(mockRPP.reduce((acc, r) => acc + r.saldo, 0))}
            </div>
          </div>
          <div className="overflow-x-auto border rounded-md bg-white">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Exercício</th>
                  <th className="p-3">Nº Empenho</th>
                  <th className="p-3">Credor / Fornecedor</th>
                  <th className="p-3">Dotação / Elemento</th>
                  <th className="p-3 text-right">Inscrito (R$)</th>
                  <th className="p-3 text-right">Cancelado (R$)</th>
                  <th className="p-3 text-right">Pago (R$)</th>
                  <th className="p-3 text-right text-blue-700 font-bold">Saldo a Pagar (R$)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {mockRPP.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3">{item.exercicio}</td>
                    <td className="p-3 font-mono font-medium">{item.empenho}</td>
                    <td className="p-3">{item.credor}</td>
                    <td className="p-3 font-mono text-xs">{item.dotacao}</td>
                    <td className="p-3 text-right">{formatBRL(item.inscrito)}</td>
                    <td className="p-3 text-right">{formatBRL(item.cancelado)}</td>
                    <td className="p-3 text-right">{formatBRL(item.pago)}</td>
                    <td className="p-3 text-right font-bold text-blue-700">{formatBRL(item.saldo)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 font-medium">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: Restos a Pagar Não Processados (RPNP) - 18.173 */}
      {activeTab === "rpnp" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded text-sm flex items-center justify-between">
            <div>
              <strong>Requisito 18.173 - Restos a Pagar Não Processados (RPNP):</strong> Despesas empenhadas e não liquidadas em exercícios anteriores com controle estrito de saldo a liquidar e a pagar.
            </div>
            <div className="font-semibold text-amber-950">
              Total a Liquidar: {formatBRL(mockRPNP.reduce((acc, r) => acc + r.saldoLiquidar, 0))} | A Pagar: {formatBRL(mockRPNP.reduce((acc, r) => acc + r.saldoPagar, 0))}
            </div>
          </div>
          <div className="overflow-x-auto border rounded-md bg-white">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Exercício</th>
                  <th className="p-3">Nº Empenho</th>
                  <th className="p-3">Credor / Fornecedor</th>
                  <th className="p-3">Dotação / Elemento</th>
                  <th className="p-3 text-right">Inscrito (R$)</th>
                  <th className="p-3 text-right">Liquidado (R$)</th>
                  <th className="p-3 text-right">Cancelado (R$)</th>
                  <th className="p-3 text-right">Pago (R$)</th>
                  <th className="p-3 text-right text-amber-700 font-bold">Saldo a Liquidar (R$)</th>
                  <th className="p-3 text-right text-blue-700 font-bold">Saldo a Pagar (R$)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {mockRPNP.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3">{item.exercicio}</td>
                    <td className="p-3 font-mono font-medium">{item.empenho}</td>
                    <td className="p-3">{item.credor}</td>
                    <td className="p-3 font-mono text-xs">{item.dotacao}</td>
                    <td className="p-3 text-right">{formatBRL(item.inscrito)}</td>
                    <td className="p-3 text-right">{formatBRL(item.liquidado)}</td>
                    <td className="p-3 text-right">{formatBRL(item.cancelado)}</td>
                    <td className="p-3 text-right">{formatBRL(item.pago)}</td>
                    <td className="p-3 text-right font-bold text-amber-700">{formatBRL(item.saldoLiquidar)}</td>
                    <td className="p-3 text-right font-bold text-blue-700">{formatBRL(item.saldoPagar)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 font-medium">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 4: Despesas Extraorçamentárias - 18.173 */}
      {activeTab === "extras" && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 text-purple-900 px-4 py-3 rounded text-sm flex items-center justify-between">
            <div>
              <strong>Requisito 18.173 - Despesas Extraorçamentárias com Saldo:</strong> Controle das retenções em folha, consignações, tributos retidos e garantias contratuais.
            </div>
            <div className="font-semibold text-purple-950">
              Total Saldo a Recolher: {formatBRL(mockDespesasExtras.reduce((acc, r) => acc + r.saldo, 0))}
            </div>
          </div>
          <div className="overflow-x-auto border rounded-md bg-white">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Conta Contábil (PCASP)</th>
                  <th className="p-3">Descrição da Consignação / Retenção</th>
                  <th className="p-3 text-right">Retenção Total (R$)</th>
                  <th className="p-3 text-right">Recolhido / Repassado (R$)</th>
                  <th className="p-3 text-right text-purple-700 font-bold">Saldo a Recolher (R$)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {mockDespesasExtras.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-medium">{item.conta}</td>
                    <td className="p-3">{item.descricao}</td>
                    <td className="p-3 text-right">{formatBRL(item.retencao)}</td>
                    <td className="p-3 text-right">{formatBRL(item.recolhido)}</td>
                    <td className="p-3 text-right font-bold text-purple-700">{formatBRL(item.saldo)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.saldo > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 5: Limitações de Despesa / Cotas (18.17) */}
      {activeTab === "cotas" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded text-sm flex items-center justify-between">
            <div>
              <strong>Requisito 18.17 - Limitações de Despesa (Cotas):</strong> Cotas periódicas no nível de Unidade Orçamentária, Fontes de Recursos e Grupo de Despesa (GND), estritamente limitadas aos saldos das previsões orçamentárias e previsão da receita arrecadada (art. 9º da LRF).
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir Relatório
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto border rounded-md bg-white">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Unidade Orçamentária</th>
                  <th className="p-3">Fonte de Recurso</th>
                  <th className="p-3">Grupo de Despesa (GND)</th>
                  <th className="p-3 text-right">Dotação Inicial (R$)</th>
                  <th className="p-3 text-right">Previsão Receita (R$)</th>
                  <th className="p-3 text-right">Cota Fixada (R$)</th>
                  <th className="p-3 text-right">Empenhado (R$)</th>
                  <th className="p-3 text-right text-emerald-700 font-bold">Saldo Cota (R$)</th>
                  <th className="p-3 text-center">Situação LRF</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {mockCotasDespesa.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium">{item.uo}</td>
                    <td className="p-3">{item.fonte}</td>
                    <td className="p-3">{item.gnd}</td>
                    <td className="p-3 text-right">{formatBRL(item.dotacaoOrcada)}</td>
                    <td className="p-3 text-right">{formatBRL(item.previsaoReceita)}</td>
                    <td className="p-3 text-right font-medium">{formatBRL(item.cotaFixada)}</td>
                    <td className="p-3 text-right">{formatBRL(item.empenhado)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">{formatBRL(item.saldoCota)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        item.saldoCota === 0
                          ? "bg-red-100 text-red-800"
                          : item.saldoCota < 20000
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 6: Decretos Orçamentários Particulares (18.277) */}
      {activeTab === "decretos" && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded text-sm flex items-center justify-between">
            <div>
              <strong>Requisito 18.277 - Cadastro e Gestão de Decretos de Forma Particular:</strong> Cadastro de decretos municipais de abertura de créditos adicionais suplementares, especiais e extraordinários, com histórico da fonte do recurso e amparo legal.
            </div>
            <Button size="sm" onClick={() => setIsDecretoModalOpen(true)} className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1">
              <Plus className="h-4 w-4" /> Cadastrar Novo Decreto
            </Button>
          </div>
          <div className="overflow-x-auto border rounded-md bg-white">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                <tr>
                  <th className="p-3">Número do Decreto</th>
                  <th className="p-3">Data Publicação</th>
                  <th className="p-3">Tipo de Crédito</th>
                  <th className="p-3">Origem do Recurso</th>
                  <th className="p-3">Amparo Legal</th>
                  <th className="p-3 text-right font-bold">Valor (R$)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-800">
                {decretos.map(dec => (
                  <tr key={dec.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-900">{dec.numero}</td>
                    <td className="p-3">{dec.data}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium">
                        {dec.tipo}
                      </span>
                    </td>
                    <td className="p-3 text-xs">{dec.origemRecurso}</td>
                    <td className="p-3 text-xs text-muted-foreground">{dec.amparoLegal}</td>
                    <td className="p-3 text-right font-bold text-emerald-700">{formatBRL(dec.valor)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-medium">
                        {dec.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Decreto Particular (18.277) */}
      <Dialog open={isDecretoModalOpen} onOpenChange={setIsDecretoModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-emerald-700" />
              Cadastro Particular de Decreto Orçamentário (18.277)
            </DialogTitle>
            <DialogDescription>
              Cadastre decretos municipais de alteração orçamentária (créditos suplementares, especiais ou extraordinários) em conformidade com a Lei 4.320/64.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarDecreto} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dec-num">Número do Decreto *</Label>
                <Input
                  id="dec-num"
                  required
                  placeholder="Ex: Decreto nº 035/2026"
                  value={novoDecreto.numero}
                  onChange={e => setNovoDecreto({ ...novoDecreto, numero: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dec-data">Data de Publicação *</Label>
                <Input
                  id="dec-data"
                  type="date"
                  required
                  value={novoDecreto.data}
                  onChange={e => setNovoDecreto({ ...novoDecreto, data: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dec-tipo">Tipo de Crédito Adicional *</Label>
                <Select
                  value={novoDecreto.tipo}
                  onValueChange={v => setNovoDecreto({ ...novoDecreto, tipo: v || "" })}
                >
                  <SelectTrigger id="dec-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Crédito Suplementar">Crédito Suplementar (Reforço)</SelectItem>
                    <SelectItem value="Crédito Especial">Crédito Especial (Novo programa)</SelectItem>
                    <SelectItem value="Crédito Extraordinário">Crédito Extraordinário (Urgência/Calamidade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dec-valor">Valor do Crédito (R$) *</Label>
                <MoneyInput
                  id="dec-valor"
                  required
                  value={novoDecreto.valor}
                  onChange={val => setNovoDecreto({ ...novoDecreto, valor: val })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dec-origem">Fonte de Recurso / Contrapartida (Art. 43 Lei 4.320/64)</Label>
              <Select
                value={novoDecreto.origemRecurso}
                onValueChange={v => setNovoDecreto({ ...novoDecreto, origemRecurso: v || "" })}
              >
                <SelectTrigger id="dec-origem"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Superávit Financeiro apurado em balanço anterior">Superávit Financeiro apurado em balanço anterior (Inciso I)</SelectItem>
                  <SelectItem value="Excesso de Arrecadação na Fonte">Excesso de Arrecadação (Inciso II)</SelectItem>
                  <SelectItem value="Anulação parcial de dotações orçamentárias">Anulação parcial ou total de dotações (Inciso III)</SelectItem>
                  <SelectItem value="Operações de Crédito autorizadas">Operações de Crédito autorizadas (Inciso IV)</SelectItem>
                  <SelectItem value="Reserva de Contingência">Reserva de Contingência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dec-amparo">Amparo Legal / Justificativa</Label>
              <Input
                id="dec-amparo"
                placeholder="Ex: Art. 43, § 1º da Lei Federal 4.320/64 e Art. 7º da LOA nº 1.450/2025"
                value={novoDecreto.amparoLegal}
                onChange={e => setNovoDecreto({ ...novoDecreto, amparoLegal: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDecretoModalOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-700 hover:bg-emerald-800 text-white">Salvar Decreto</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro de Empenho (18.17 e 18.277) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Empenho" : "Novo Empenho Orçamentário (18.277)"}</DialogTitle>
            <DialogDescription>
              Todo empenho orçamentário deve observar os limites de cota periódica (18.17) e consumir uma reserva ativa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="number">Número do Empenho</Label>
                <Input id="number" required value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input id="date" type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="obrasServiceId">Obra / ordem de serviço (opcional)</Label>
              <Select value={formData.obrasServiceId} onValueChange={v => setFormData({...formData, obrasServiceId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Sem obra/ordem de serviço" /></SelectTrigger>
                <SelectContent>
                  {obrasServices.filter((service) => !service.budgetAppropriationId || service.budgetAppropriationId === formData.appropriationId).map((service) => <SelectItem key={service.id} value={service.id}>{service.protocolo} - {service.tipo}: {service.descricao}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Somente ordens ativas e ainda não vinculadas podem ser selecionadas.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="covenantId">Convênio (opcional)</Label>
                <Select value={formData.covenantId} onValueChange={value => setFormData({ ...formData, covenantId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem convênio" /></SelectTrigger>
                  <SelectContent>{covenants.map((covenant) => <SelectItem key={covenant.id} value={covenant.id}>{covenant.number} - {covenant.grantor ?? "Concedente não informado"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publicityCampaignId">Campanha (opcional)</Label>
                <Select value={formData.publicityCampaignId} onValueChange={value => setFormData({ ...formData, publicityCampaignId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem campanha" /></SelectTrigger>
                  <SelectContent>{publicityCampaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name} - {campaign.agency ?? "Agência não informada"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fundedDebtId">Dívida fundada (opcional)</Label>
                <Select value={formData.fundedDebtId} onValueChange={value => setFormData({ ...formData, fundedDebtId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem dívida" /></SelectTrigger>
                  <SelectContent>{fundedDebts.map((debt) => <SelectItem key={debt.id} value={debt.id}>{debt.lawNumber} - {debt.creditorName ?? "Credor não informado"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ordinário">Ordinário</SelectItem>
                    <SelectItem value="Estimativo">Estimativo</SelectItem>
                    <SelectItem value="Global">Global</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Valor (R$)</Label>
                <MoneyInput id="value" required value={formData.value} onChange={val => setFormData({...formData, value: val})} />
              </div>
            </div>

            {/* Alerta de Cota de Despesa (18.17) */}
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <strong>Verificação de Cota Orçamentária e Previsão da Receita (18.17):</strong>
                <p className="mt-0.5 text-blue-800">
                  A cota disponível para este grupo/fonte comporta a emissão deste empenho. Saldo remanescente de cota quadrimestral estimado: <strong>{formatBRL(350000 - formData.value)}</strong>.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appropriationId">Dotação Orçamentária</Label>
              <Select value={formData.appropriationId} onValueChange={v => setFormData({...formData, appropriationId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a dotação" /></SelectTrigger>
                <SelectContent>
                  {appropriations.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.budgetUnit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingId && (
              <div className="space-y-2">
                 <Label htmlFor="reservationId">Reserva Orçamentária</Label>
                 <Select value={formData.reservationId} onValueChange={v => {
                   const reservation = reservations.find(r => r.id === v);
                   const expense = reservation?.expense;
                   const receipt = expense?.purchaseReceipt;
                   const contract = expense?.sourceModule === "COMPRAS" && expense.sourceType === "CONTRACT" && expense.sourceId
                     ? contracts.find((item) => item.id === expense.sourceId)
                     : null;
                   setFormData({
                     ...formData,
                     reservationId: v as string,
                     appropriationId: reservation?.appropriationId ?? formData.appropriationId,
                     value: reservation?.value ?? formData.value,
                     supplierId: receipt?.contract.supplierId ?? expense?.supplierId ?? formData.supplierId,
                     contractId: receipt?.contractId ?? contract?.id ?? formData.contractId,
                     history: receipt ? `Recebimento ${receipt.number}` : contract ? `AE do contrato ${contract.number}` : formData.history,
                   });
                 }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a reserva ativa" /></SelectTrigger>
                  <SelectContent>
                     {reservations.map(r => (
                       <SelectItem key={r.id} value={r.id}>{r.number} - {r.appropriation.code} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.value)}{r.expense?.purchaseReceipt ? ` · ${r.expense.purchaseReceipt.number}` : r.expense?.sourceModule === "COMPRAS" && r.expense.sourceType === "CONTRACT" ? " · AE contratual" : ""}</SelectItem>
                     ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="supplierId">Fornecedor / Credor</Label>
              <Select value={formData.supplierId} onValueChange={v => setFormData({...formData, supplierId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.company?.corporateName || s.person?.fullName || 'Fornecedor Sem Nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="history">Histórico / Descrição</Label>
              <Input id="history" required value={formData.history} onChange={e => setFormData({...formData, history: e.target.value})} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="processId">Processo (opcional)</Label>
                <Select value={formData.processId} onValueChange={v => setFormData({...formData, processId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Sem processo" /></SelectTrigger>
                  <SelectContent>
                    {processes.map(process => <SelectItem key={process.id} value={process.id}>{process.protocolNumber}{process.description ? ` - ${process.description}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractId">Contrato (opcional)</Label>
                <Select value={formData.contractId} onValueChange={v => setFormData({...formData, contractId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger>
                  <SelectContent>
                    {contracts.filter(contract => !formData.supplierId || contract.supplierId === formData.supplierId).map(contract => <SelectItem key={contract.id} value={contract.id}>{contract.number} - {contract.object}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="decretoVinculado">Decreto Orçamentário Vinculado (opcional - 18.277)</Label>
              <Select value={formData.decretoVinculadoId} onValueChange={v => setFormData({...formData, decretoVinculadoId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Nenhum (Empenho com Dotação Ordinária)" /></SelectTrigger>
                <SelectContent>
                  {decretos.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.numero} - {d.tipo} ({formatBRL(d.valor)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar Empenho"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
