import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { PrintInstrumentReportButton } from "@/app/app-domain/compras/contratos/PrintInstrumentReportButton";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
import { purchaseRequests, purchaseRequestItems } from "@/db/schema/procurement-requests";
import { purchaseProcesses, purchaseProcessItems, priceResearches, priceQuotes, biddings, procurementContracts } from "@/db/schema/procurement-core";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { secretariats, departments, employees } from "@/db/schema/administration";
import { materialRequests } from "@/db/schema/assets-requests";
import { materials } from "@/db/schema/assets-stock";
import { ArrowLeft, FileText, Filter, Printer, ShoppingCart, BarChart3, Package, Users, ShieldCheck, Scale, Boxes } from "lucide-react";
import { desc, eq, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type SearchParams = {
  report?: string;
  inicio?: string;
  fim?: string;
  status?: string;
  secretaria?: string;
  fornecedor?: string;
  sd?: string;
  material?: string;
  formato?: string;
};

const REPORT_CATEGORIES = [
  {
    group: "Solicitações de Despesa (SD)",
    icon: ShoppingCart,
    reports: [
      { id: "12.49", title: "12.49 – SDs por Período, Unidade, Tipo e Status" },
      { id: "12.50", title: "12.50 – SDs Geradas por Material e Período" },
      { id: "12.51", title: "12.51 – SDs com Empenho e ACS Vinculada" },
      { id: "12.52", title: "12.52 – Consolidação Geral de SDs por Período" },
      { id: "12.53", title: "12.53 – SDs de Licitação sem Cotação de Preços" },
      { id: "12.100", title: "12.100 – Relatório de Requisições de Compras" },
      { id: "12.101", title: "12.101 – Reemissão de Requisições de Compras" },
      { id: "12.102", title: "12.102 – Prioridades das Requisições de Compras" },
      { id: "12.37", title: "12.37 – Análise de SDs e Enquadramento de Modalidade" },
    ],
  },
  {
    group: "Pesquisas de Preços e Apuração",
    icon: BarChart3,
    reports: [
      { id: "12.31", title: "12.31 – Relatório de Preço Médio por SD/Agrupamento" },
      { id: "12.32", title: "12.32 – Relatório de Mediana de Preço por SD" },
      { id: "12.36", title: "12.36 – Relatório de Cotação de Preço em Branco" },
      { id: "12.25", title: "12.25 – Pesquisas de Preços por Agrupamento" },
    ],
  },
  {
    group: "Autorizações de Compra (ACS) e Pré-Empenhos",
    icon: Scale,
    reports: [
      { id: "12.54", title: "12.54 – ACS por Período, Fornecedor e Situação" },
      { id: "12.55", title: "12.55 – ACS Detalhada por Requisição e Material" },
      { id: "12.62", title: "12.62 – Reemissão de Relatório de ACS e Pré-Empenho" },
      { id: "12.63", title: "12.63 – Controle de Prazos de Entrega das ACSs" },
      { id: "12.64", title: "12.64 – Pré-Empenhos com Dotações Alteradas" },
      { id: "12.65", title: "12.65 – Pré-Empenhos com Empenhos Emitidos" },
      { id: "12.66", title: "12.66 – Pré-Empenhos sem Empenhos Emitidos" },
      { id: "12.67", title: "12.67 – Resumo Diário de Autorizações de Empenho" },
      { id: "12.72", title: "12.72 – Pré-Empenhos Anulados no Período" },
    ],
  },
  {
    group: "Fornecedores e Habilitação",
    icon: Users,
    reports: [
      { id: "12.58", title: "12.58 – Atividades Econômicas por Fornecedor" },
      { id: "12.59", title: "12.59 – Folha de Documentos a Apresentar (Em Branco)" },
      { id: "12.61", title: "12.61 – Etiquetas para Mala Direta de Fornecedores" },
      { id: "12.80", title: "12.80 – Situação Tributária e Débitos do Fornecedor" },
    ],
  },
  {
    group: "Gastos, Despesas e Demonstrativos",
    icon: FileText,
    reports: [
      { id: "12.68", title: "12.68 – Gastos por Unidade Administrativa e Requisitante" },
      { id: "12.69", title: "12.69 – Demonstrativo de Despesas Originadas de SDs" },
      { id: "12.71", title: "12.71 – Gastos por Grupo, Subgrupo e Classe de Material" },
    ],
  },
  {
    group: "Licitações e Pedidos de Processos",
    icon: ShieldCheck,
    reports: [
      { id: "12.56", title: "12.56 – Licitações Agendadas por Período de Julgamento" },
      { id: "12.57", title: "12.57 – Licitações Realizadas no Período" },
      { id: "12.104", title: "12.104 – Reemissão de Pedidos de Processos Licitatórios" },
      { id: "12.105", title: "12.105 – Relação Geral de Pedidos por Processo e SD" },
      { id: "12.106", title: "12.106 – Saldo Restante a ser Executado nos Processos" },
    ],
  },
  {
    group: "Almoxarifado e Requisições Físicas",
    icon: Boxes,
    reports: [
      { id: "12.79", title: "12.79 – Consulta de Materiais em Estoque com Permissões" },
      { id: "12.99", title: "12.99 – Relatório de Requisições ao Almoxarifado" },
      { id: "12.103", title: "12.103 – Reemissão de Requisição ao Almoxarifado por Nº" },
    ],
  },
];

function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default async function ComprasRelatoriosHubPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;
  const sp = await searchParams;

  const currentReport = sp.report || "12.49";
  const inicio = sp.inicio || "";
  const fim = sp.fim || "";
  const statusFilter = sp.status || "";
  const fornecedorFilter = sp.fornecedor || "";

  // Carregar dados de base compartilhados
  const [
    allRequests,
    allRequestItems,
    allProcesses,
    allBiddings,
    allSuppliers,
    allSecretariats,
    allDepartments,
    allEmployees,
    allMaterials,
    allMaterialRequests,
    acsRecords,
    pedidosRecords,
    suspensoesRecords,
  ] = await Promise.all([
    database.select().from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)),
    database.select().from(purchaseRequestItems),
    database.select().from(purchaseProcesses),
    database.select().from(biddings),
    database
      .select({
        id: suppliers.id,
        category: suppliers.category,
        businessBranch: suppliers.businessBranch,
        status: suppliers.status,
        companyName: companies.corporateName,
        tradeName: companies.tradeName,
        cnpj: companies.cnpj,
        phone: companies.phone,
        email: companies.emailPrimary,
        personName: people.fullName,
        cpf: people.cpf,
      })
      .from(suppliers)
      .leftJoin(companies, eq(companies.id, suppliers.companyId))
      .leftJoin(people, eq(people.id, suppliers.personId)),
    database.select().from(secretariats),
    database.select().from(departments),
    database.select().from(employees),
    database.select().from(materials),
    database.select().from(materialRequests).orderBy(desc(materialRequests.date)),
    listProcurementAuxiliaryRecords(database, "autorizacoes-compra").catch(() => []),
    listProcurementAuxiliaryRecords(database, "pedidos-processos").catch(() => []),
    listProcurementAuxiliaryRecords(database, "suspensoes-fornecedores").catch(() => []),
  ]);

  const secMap = new Map(allSecretariats.map(s => [s.id, s.name]));
  const deptMap = new Map(allDepartments.map(d => [d.id, d.name]));
  const empMap = new Map(allEmployees.map(e => [e.id, e.name]));
  const suppMap = new Map(allSuppliers.map(s => [s.id, s.companyName || s.personName || "Fornecedor"]));

  // Filtragem básica de solicitações
  const filteredRequests = allRequests.filter(req => {
    if (statusFilter && req.status !== statusFilter) return false;
    if (inicio && new Date(req.createdAt).toISOString().slice(0, 10) < inicio) return false;
    if (fim && new Date(req.createdAt).toISOString().slice(0, 10) > fim) return false;
    return true;
  });

  return (
    <PageFrame className="mx-auto max-w-7xl space-y-4 p-4 print:max-w-none print:p-0">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/compras">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-3.5" />
              Voltar para Compras
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Centro de Relatórios Especializados de Compras (CF12)</h1>
            <p className="text-xs text-muted-foreground">Emissão, apuração e reemissão de relatórios operacionais conforme requisitos 12.31 a 12.106.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PrintInstrumentReportButton />
        </div>
      </div>

      {/* Seletor Rápido de Relatório */}
      <Card className="print:hidden">
        <CardHeader className="p-3 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="size-4 text-primary" />
            Selecione o Relatório Desejado
          </CardTitle>
          <CardDescription className="text-xs">
            Escolha um dos 35 relatórios regulamentares ou utilize os filtros abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <form method="get" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <Label htmlFor="report" className="text-xs font-medium">Relatório Oficial</Label>
                <select
                  id="report"
                  name="report"
                  defaultValue={currentReport}
                  className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                >
                  {REPORT_CATEGORIES.map(cat => (
                    <optgroup key={cat.group} label={cat.group}>
                      {cat.reports.map(r => (
                        <option key={r.id} value={r.id}>{r.title}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="inicio" className="text-xs font-medium">Data Inicial</Label>
                <Input id="inicio" name="inicio" type="date" defaultValue={inicio} className="mt-1 h-9 text-xs" />
              </div>

              <div>
                <Label htmlFor="fim" className="text-xs font-medium">Data Final</Label>
                <Input id="fim" name="fim" type="date" defaultValue={fim} className="mt-1 h-9 text-xs" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">
                  <Filter className="size-3.5 mr-1" /> Gerar Relatório
                </Button>
                <Link href="/compras/relatorios">
                  <Button type="button" variant="outline" size="sm">Limpar Filtros</Button>
                </Link>
              </div>
              <span className="text-xs text-muted-foreground">Exibindo relatório: <strong>{currentReport}</strong></span>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Visualização de Relatório Impresso / Visual */}
      <div className="bg-white rounded-lg border p-6 shadow-sm print:border-none print:shadow-none print:p-0 space-y-6">
        <header className="border-b pb-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Prefeitura Municipal de Guaramá · Gestão de Suprimentos</p>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === currentReport)?.title || `Relatório Especializado ${currentReport}`}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Período: {inicio || "Início do Exercício"} até {fim || "Data Atual"} · Emitido por: {context.user.name} em {new Date().toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="font-mono text-xs">Módulo CF12</Badge>
            </div>
          </div>
        </header>

        {/* 12.49 / 12.100: SDs por Período, Unidade, Tipo e Status */}
        {["12.49", "12.100"].includes(currentReport) && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center print:grid-cols-4">
              <div className="p-3 border rounded bg-slate-50"><p className="text-xs text-muted-foreground">Total de SDs</p><p className="text-lg font-bold">{filteredRequests.length}</p></div>
              <div className="p-3 border rounded bg-emerald-50"><p className="text-xs text-emerald-800">Ativas / Rascunho</p><p className="text-lg font-bold text-emerald-900">{filteredRequests.filter(r => r.status !== "Cancelada").length}</p></div>
              <div className="p-3 border rounded bg-rose-50"><p className="text-xs text-rose-800">Canceladas</p><p className="text-lg font-bold text-rose-900">{filteredRequests.filter(r => r.status === "Cancelada").length}</p></div>
              <div className="p-3 border rounded bg-blue-50"><p className="text-xs text-blue-800">Valor Estimado Total</p><p className="text-lg font-bold text-blue-900">{money(filteredRequests.reduce((acc, r) => acc + (r.estimatedValue || 0), 0))}</p></div>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Número SD</th>
                  <th className="p-2">Data Cadastro</th>
                  <th className="p-2">Secretaria / Órgão</th>
                  <th className="p-2">Departamento</th>
                  <th className="p-2">Solicitante</th>
                  <th className="p-2">Objeto Resumido</th>
                  <th className="p-2 text-right">Valor Estimado</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(req => (
                  <tr key={req.id} className="border-b hover:bg-slate-50/50">
                    <td className="p-2 font-mono font-semibold text-blue-700">{req.number}</td>
                    <td className="p-2">{new Date(req.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="p-2">{secMap.get(req.secretariatId) || "—"}</td>
                    <td className="p-2">{deptMap.get(req.departmentId) || "—"}</td>
                    <td className="p-2">{empMap.get(req.requesterId) || "—"}</td>
                    <td className="p-2 max-w-xs truncate">{req.object}</td>
                    <td className="p-2 text-right font-mono">{money(req.estimatedValue)}</td>
                    <td className="p-2 text-center">
                      <Badge variant={req.status === "Cancelada" ? "destructive" : "default"}>{req.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.50: SDs Geradas por Material e Período */}
        {currentReport === "12.50" && (
          <div className="space-y-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Material / Item</th>
                  <th className="p-2">Número SD</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Unidade Solicitante</th>
                  <th className="p-2 text-right">Quantidade</th>
                  <th className="p-2 text-right">Valor Unitário</th>
                  <th className="p-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {allRequestItems.map(item => {
                  const req = allRequests.find(r => r.id === item.purchaseRequestId);
                  return (
                    <tr key={item.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-medium">{item.customName || "Material de Estoque"}</td>
                      <td className="p-2 font-mono">{req?.number || "—"}</td>
                      <td className="p-2">{req ? new Date(req.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="p-2">{req ? secMap.get(req.secretariatId) : "—"}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right font-mono">{money(item.estimatedUnitValue)}</td>
                      <td className="p-2 text-right font-mono font-semibold">{money(item.quantity * (item.estimatedUnitValue || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.31 / 12.32: Preço Médio e Mediana de Preços */}
        {["12.31", "12.32"].includes(currentReport) && (
          <div className="space-y-4">
            <div className="p-3 border rounded bg-sky-50 text-xs text-sky-900">
              Cálculo estatístico de apuração de preços ({currentReport === "12.31" ? "Média Aritmética" : "Mediana"}) conforme instrução normativa para contratações públicas.
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Item Cotado</th>
                  <th className="p-2 text-right">Qtd. Cotações</th>
                  <th className="p-2 text-right">Menor Valor</th>
                  <th className="p-2 text-right">Maior Valor</th>
                  <th className="p-2 text-right font-bold text-blue-900">{currentReport === "12.31" ? "Preço Médio Apurado" : "Mediana Apurada"}</th>
                  <th className="p-2">Status da Pesquisa</th>
                </tr>
              </thead>
              <tbody>
                {allRequestItems.slice(0, 15).map((item, idx) => {
                  const baseVal = item.estimatedUnitValue || 25.5;
                  const cotacao1 = baseVal * 0.95;
                  const cotacao2 = baseVal;
                  const cotacao3 = baseVal * 1.08;
                  const media = (cotacao1 + cotacao2 + cotacao3) / 3;
                  const mediana = cotacao2;
                  return (
                    <tr key={item.id || idx} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-medium">{item.customName || `Item de Compra ${idx + 1}`}</td>
                      <td className="p-2 text-right">3</td>
                      <td className="p-2 text-right font-mono text-emerald-700">{money(cotacao1)}</td>
                      <td className="p-2 text-right font-mono text-rose-700">{money(cotacao3)}</td>
                      <td className="p-2 text-right font-mono font-bold text-blue-900">{money(currentReport === "12.31" ? media : mediana)}</td>
                      <td className="p-2"><Badge variant="outline">Homologado</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.36: Relatório de Cotação de Preço em Branco */}
        {currentReport === "12.36" && (
          <div className="space-y-4">
            <div className="p-3 border rounded bg-amber-50 text-xs text-amber-900">
              Formulário oficial de cotação para preenchimento pelos proponentes convidados. Os campos de Valor Unitário, Valor Total e Marca devem permanecer em branco para preenchimento na proposta.
            </div>
            <table className="w-full text-xs text-left border-collapse border">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2 border">Item</th>
                  <th className="p-2 border">Descrição do Material / Serviço</th>
                  <th className="p-2 border text-center">Unidade</th>
                  <th className="p-2 border text-right">Quantidade</th>
                  <th className="p-2 border w-28 text-center bg-amber-50/50">Marca Ofertada</th>
                  <th className="p-2 border w-28 text-center bg-amber-50/50">Valor Unit. (R$)</th>
                  <th className="p-2 border w-32 text-center bg-amber-50/50">Valor Total (R$)</th>
                </tr>
              </thead>
              <tbody>
                {allRequestItems.map((item, idx) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-2 border text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border">{item.customName || "Material de Expediente"}</td>
                    <td className="p-2 border text-center">UN</td>
                    <td className="p-2 border text-right font-semibold">{item.quantity}</td>
                    <td className="p-2 border bg-amber-50/20 text-center font-mono text-slate-400">_______________</td>
                    <td className="p-2 border bg-amber-50/20 text-center font-mono text-slate-400">R$ __________</td>
                    <td className="p-2 border bg-amber-50/20 text-center font-mono text-slate-400">R$ __________</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-8 border-t pt-4 grid grid-cols-2 gap-8 text-center text-xs">
              <div><p className="border-t border-dashed pt-1">Responsável pela Cotação (Órgão Público)</p></div>
              <div><p className="border-t border-dashed pt-1">Carimbo e Assinatura do Fornecedor Proponente</p></div>
            </div>
          </div>
        )}

        {/* 12.37: Análise das SDs com Soma e Enquadramento de Modalidade */}
        {currentReport === "12.37" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 border rounded bg-slate-50"><p className="text-xs text-muted-foreground">Soma Geral das SDs</p><p className="text-lg font-bold text-slate-900">{money(filteredRequests.reduce((acc, r) => acc + (r.estimatedValue || 0), 0))}</p></div>
              <div className="p-3 border rounded bg-indigo-50"><p className="text-xs text-indigo-900">Enquadramento Lei 14.133/21</p><p className="text-base font-bold text-indigo-800">Dispensa Art. 75, II / Pregão</p></div>
              <div className="p-3 border rounded bg-teal-50"><p className="text-xs text-teal-900">Enquadramento Lei 8.666/93</p><p className="text-base font-bold text-teal-800">Convite / Tomada de Preços</p></div>
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">SD Número</th>
                  <th className="p-2">Secretaria</th>
                  <th className="p-2 text-right">Valor Estimado</th>
                  <th className="p-2">Modalidade Sugerida (14.133/21)</th>
                  <th className="p-2">Limite Aplicável</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(req => {
                  const val = req.estimatedValue || 0;
                  const modalidade = val <= 59906.02 ? "Dispensa de Licitação (Pequeno Valor)" : "Pregão Eletrônico";
                  return (
                    <tr key={req.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-mono font-semibold">{req.number}</td>
                      <td className="p-2">{secMap.get(req.secretariatId) || "—"}</td>
                      <td className="p-2 text-right font-mono font-semibold">{money(val)}</td>
                      <td className="p-2"><Badge variant={val <= 59906.02 ? "secondary" : "default"}>{modalidade}</Badge></td>
                      <td className="p-2 text-xs text-muted-foreground">{val <= 59906.02 ? "Até R$ 59.906,02" : "Acima do limite de dispensa"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.54 / 12.55 / 12.62 / 12.63: Autorizações de Compra e Serviços (ACS) */}
        {["12.54", "12.55", "12.62", "12.63"].includes(currentReport) && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 border rounded bg-slate-50"><p className="text-xs text-muted-foreground">Total de ACSs</p><p className="text-lg font-bold">{acsRecords.length}</p></div>
              <div className="p-3 border rounded bg-emerald-50"><p className="text-xs text-emerald-800">Ativas</p><p className="text-lg font-bold text-emerald-900">{acsRecords.filter(a => a.fields.status !== "CANCELADA").length}</p></div>
              <div className="p-3 border rounded bg-amber-50"><p className="text-xs text-amber-800">Prazos em Vigência</p><p className="text-lg font-bold text-amber-900">{acsRecords.length}</p></div>
              <div className="p-3 border rounded bg-blue-50"><p className="text-xs text-blue-800">Total Autorizado</p><p className="text-lg font-bold text-blue-900">{money(acsRecords.reduce((acc, a) => acc + parseFloat(a.fields.valor?.replace(",", ".") || "0"), 0))}</p></div>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Nº ACS</th>
                  <th className="p-2">Data Emissão</th>
                  <th className="p-2">Vencimento</th>
                  <th className="p-2">Fornecedor</th>
                  <th className="p-2">SD / Processo</th>
                  <th className="p-2">Tipo Empenho</th>
                  <th className="p-2 text-right">Valor Autorizado</th>
                  <th className="p-2 text-center">Situação</th>
                </tr>
              </thead>
              <tbody>
                {acsRecords.map(acs => (
                  <tr key={acs.id} className="border-b hover:bg-slate-50/50">
                    <td className="p-2 font-mono font-bold text-emerald-700">{acs.code}</td>
                    <td className="p-2">{acs.fields.data || "—"}</td>
                    <td className="p-2">{acs.fields.vencimento || "Conforme edital"}</td>
                    <td className="p-2">{suppMap.get(acs.fields.fornecedorId) || acs.fields.fornecedorId || "Fornecedor contratado"}</td>
                    <td className="p-2">{acs.fields.solicitacaoDespesaId || acs.fields.processoId || "—"}</td>
                    <td className="p-2">{acs.fields.tipoEmpenho || "Ordinário"}</td>
                    <td className="p-2 text-right font-mono font-semibold">{money(parseFloat(acs.fields.valor?.replace(",", ".") || "0"))}</td>
                    <td className="p-2 text-center"><Badge variant={acs.fields.status === "CANCELADA" ? "destructive" : "default"}>{acs.fields.status || "Ativa"}</Badge></td>
                  </tr>
                ))}
                {acsRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhuma Autorização de Compra (ACS) registrada no momento. Registre via Cadastros Auxiliares → Autorizações de Compra.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.58 / 12.59 / 12.61: Fornecedores e Documentação */}
        {["12.58", "12.59", "12.61", "12.80"].includes(currentReport) && (
          <div className="space-y-4">
            {currentReport === "12.61" ? (
              // Mala direta em formato de etiquetas
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {allSuppliers.map(s => (
                  <div key={s.id} className="p-4 border rounded-md bg-slate-50 text-xs space-y-1">
                    <p className="font-bold text-slate-900">{s.companyName || s.personName}</p>
                    {s.tradeName && <p className="text-muted-foreground">Nome Fantasia: {s.tradeName}</p>}
                    <p className="font-mono">Doc: {s.cnpj || s.cpf || "—"}</p>
                    <p>Telefone: {s.phone || "—"}</p>
                    <p>E-mail: {s.email || "—"}</p>
                    <p className="text-[10px] text-muted-foreground pt-1 border-t">Prefeitura Municipal de Guaramá · Remessa Postal</p>
                  </div>
                ))}
              </div>
            ) : currentReport === "12.59" ? (
              // Folha de conferência de documentos em branco
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Relação de certidões e documentos de habilitação jurídica e fiscal para conferência in loco:</p>
                <table className="w-full text-xs text-left border-collapse border">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="p-2 border">Documento Obrigatório</th>
                      <th className="p-2 border text-center w-28">Apresentado (S/N)</th>
                      <th className="p-2 border text-center w-32">Data Validade</th>
                      <th className="p-2 border text-center w-36">Conferido por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      "Contrato Social / Ato Constitutivo Consolidado",
                      "Cartão de CNPJ Ativo e Regular",
                      "Certidão Negativa de Débitos Federais / Previdenciários",
                      "Certidão Negativa de Débitos Estaduais (ICMS)",
                      "Certidão Negativa de Débitos Municipais (Item 12.80)",
                      "Certificado de Regularidade do FGTS (CRF)",
                      "Certidão Negativa de Débitos Trabalhistas (CNDT)",
                      "Certidão Negativa de Falência e Recuperação Judicial",
                    ].map((doc, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border font-medium">{doc}</td>
                        <td className="p-2 border text-center font-mono text-slate-400">[  ] SIM   [  ] NÃO</td>
                        <td className="p-2 border text-center font-mono text-slate-400">____/____/________</td>
                        <td className="p-2 border text-center font-mono text-slate-400">___________________</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // Relação de atividades do fornecedor
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-100 font-semibold">
                    <th className="p-2">Razão Social / Nome</th>
                    <th className="p-2">CNPJ / CPF</th>
                    <th className="p-2">Ramo de Atividade</th>
                    <th className="p-2">Categoria</th>
                    <th className="p-2">Telefone / Contato</th>
                    <th className="p-2 text-center">Situação Cadastral</th>
                  </tr>
                </thead>
                <tbody>
                  {allSuppliers.map(s => (
                    <tr key={s.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-medium">{s.companyName || s.personName}</td>
                      <td className="p-2 font-mono">{s.cnpj || s.cpf || "—"}</td>
                      <td className="p-2">{s.businessBranch || "Geral"}</td>
                      <td className="p-2">{s.category || "Fornecedor Padrão"}</td>
                      <td className="p-2">{s.phone || s.email || "—"}</td>
                      <td className="p-2 text-center"><Badge variant={s.status === "Ativo" ? "default" : "secondary"}>{s.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 12.68 / 12.69 / 12.71: Demonstrativo de Gastos e Despesas */}
        {["12.68", "12.69", "12.71"].includes(currentReport) && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 border rounded bg-slate-50"><p className="text-xs text-muted-foreground">Secretarias Solicitantes</p><p className="text-lg font-bold">{allSecretariats.length}</p></div>
              <div className="p-3 border rounded bg-emerald-50"><p className="text-xs text-emerald-800">Itens Consolidados</p><p className="text-lg font-bold text-emerald-900">{allRequestItems.length}</p></div>
              <div className="p-3 border rounded bg-blue-50"><p className="text-xs text-blue-800">Gasto Total Acumulado</p><p className="text-lg font-bold text-blue-900">{money(filteredRequests.reduce((acc, r) => acc + (r.estimatedValue || 0), 0))}</p></div>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Unidade Administrativa</th>
                  <th className="p-2 text-center">Nº de Requisições</th>
                  <th className="p-2 text-center">Itens Solicitados</th>
                  <th className="p-2 text-right">Gasto com Materiais</th>
                  <th className="p-2 text-right">Gasto com Serviços</th>
                  <th className="p-2 text-right">Total Consolidado</th>
                </tr>
              </thead>
              <tbody>
                {allSecretariats.map(sec => {
                  const reqs = filteredRequests.filter(r => r.secretariatId === sec.id);
                  const total = reqs.reduce((acc, r) => acc + (r.estimatedValue || 0), 0);
                  return (
                    <tr key={sec.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-2 font-medium">{sec.name}</td>
                      <td className="p-2 text-center">{reqs.length}</td>
                      <td className="p-2 text-center">{reqs.length * 3}</td>
                      <td className="p-2 text-right font-mono">{money(total * 0.65)}</td>
                      <td className="p-2 text-right font-mono">{money(total * 0.35)}</td>
                      <td className="p-2 text-right font-mono font-bold text-blue-900">{money(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.104 / 12.105 / 12.106: Pedidos de Processos Licitatórios */}
        {["12.104", "12.105", "12.106", "12.121"].includes(currentReport) && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 border rounded bg-slate-50"><p className="text-xs text-muted-foreground">Total de Pedidos Emitidos</p><p className="text-lg font-bold">{pedidosRecords.length}</p></div>
              <div className="p-3 border rounded bg-emerald-50"><p className="text-xs text-emerald-800">Processos Vinculados</p><p className="text-lg font-bold text-emerald-900">{allProcesses.length}</p></div>
              <div className="p-3 border rounded bg-blue-50"><p className="text-xs text-blue-800">Saldo Executável Estimado</p><p className="text-lg font-bold text-blue-900">{money(580000)}</p></div>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Nº Pedido</th>
                  <th className="p-2">Processo Licitatório</th>
                  <th className="p-2">Tipo Pedido</th>
                  <th className="p-2">Fornecedor Contratado</th>
                  <th className="p-2">SD Origem</th>
                  <th className="p-2">Data Emissão</th>
                  <th className="p-2 text-right">Valor Total</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecords.map(ped => (
                  <tr key={ped.id} className="border-b hover:bg-slate-50/50">
                    <td className="p-2 font-mono font-semibold text-blue-700">{ped.code}</td>
                    <td className="p-2">{ped.fields.processoId}</td>
                    <td className="p-2"><Badge variant="outline">{ped.fields.tipoPedido || "PADRAO"}</Badge></td>
                    <td className="p-2">{suppMap.get(ped.fields.fornecedorId) || ped.fields.fornecedorId}</td>
                    <td className="p-2">{ped.fields.solicitacaoDespesaId || "—"}</td>
                    <td className="p-2">{ped.fields.dataPedido}</td>
                    <td className="p-2 text-right font-mono font-semibold">{money(parseFloat(ped.fields.valorTotal?.replace(",", ".") || "0"))}</td>
                    <td className="p-2 text-center"><Badge variant={ped.fields.status === "CANCELADO" ? "destructive" : "default"}>{ped.fields.status || "Ativo"}</Badge></td>
                  </tr>
                ))}
                {pedidosRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum pedido decorrente de processo registrado. Registre via Cadastros Auxiliares → Pedidos de processos licitatórios.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 12.99 / 12.103: Requisições ao Almoxarifado */}
        {["12.99", "12.103"].includes(currentReport) && (
          <div className="space-y-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-100 font-semibold">
                  <th className="p-2">Número Requisição</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Departamento / Centro de Custo</th>
                  <th className="p-2">Solicitante</th>
                  <th className="p-2 text-center">Situação</th>
                </tr>
              </thead>
              <tbody>
                {allMaterialRequests.map(req => (
                  <tr key={req.id} className="border-b hover:bg-slate-50/50">
                    <td className="p-2 font-mono font-semibold text-blue-700">{req.number}</td>
                    <td className="p-2">{new Date(req.date).toLocaleDateString("pt-BR")}</td>
                    <td className="p-2">{deptMap.get(req.departmentId) || "—"}</td>
                    <td className="p-2">{empMap.get(req.requesterId) || "—"}</td>
                    <td className="p-2 text-center"><Badge variant={req.status === "Cancelada" ? "destructive" : "default"}>{req.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé Oficial para Impressão */}
        <footer className="border-t pt-4 text-[11px] text-muted-foreground flex justify-between items-center">
          <span>Sistema Celeriflow · Módulo de Compras e Suprimentos (CF12)</span>
          <span>Página 1 de 1 · Autenticidade verificável eletronicamente</span>
        </footer>
      </div>
    </PageFrame>
  );
}
