"use client";

import { useState } from "react";
import { Package, Plus, Edit, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import styles from "@/components/app-ui/operational/operational.module.css";

type ActionProductRow = {
  id: string;
  actionCode: string;
  actionName: string;
  programName: string;
  productType: "BEM" | "SERVICO" | "PRODUTO";
  productName: string;
  unitOfMeasure: string;
  targetQuantity: number;
  beneficiaries: string;
  status: string;
};

const columns = [
  operationalColumn("action", "Ação Orçamentária", 160, 240, { type: "identifier" }),
  operationalColumn("program", "Programa de Governo", 130, 200),
  operationalColumn("productType", "Tipo de Entrega", 90, 120),
  operationalColumn("productName", "Produto Único Resultante", 170, 260),
  operationalColumn("unit", "Unidade", 80, 100),
  operationalColumn("quantity", "Meta Física", 80, 100, { type: "text", align: "right" }),
  operationalColumn("beneficiaries", "Público-Alvo", 120, 180),
  operationalColumn("status", "Situação", 75, 90, { type: "status" }),
  operationalColumn("actions", "Ações", 75, 85, { type: "actions", details: "none", resizable: false }),
];

export default function ProdutosAcoesClient() {
  const [records, setRecords] = useState<ActionProductRow[]>([
    {
      id: "prod-1",
      actionCode: "2.012",
      actionName: "Manutenção do Transporte Escolar",
      programName: "0012 - Educação com Qualidade",
      productType: "SERVICO",
      productName: "Transporte Diário de Estudantes da Rede Pública",
      unitOfMeasure: "ALUNO",
      targetQuantity: 1250,
      beneficiaries: "Estudantes da zona rural e periférica",
      status: "Ativo",
    },
    {
      id: "prod-2",
      actionCode: "1.005",
      actionName: "Construção e Ampliação de UBS",
      programName: "0010 - Saúde Integral e Humanizada",
      productType: "BEM",
      productName: "Unidade Básica de Saúde Construída",
      unitOfMeasure: "UN",
      targetQuantity: 2,
      beneficiaries: "População dos bairros periféricos",
      status: "Ativo",
    },
    {
      id: "prod-3",
      actionCode: "2.045",
      actionName: "Distribuição de Cestas de Alimentos",
      programName: "0008 - Assistência Social e Inclusão",
      productType: "PRODUTO",
      productName: "Cesta de Alimentos Nutricionais Básicos",
      unitOfMeasure: "UN",
      targetQuantity: 3600,
      beneficiaries: "Famílias em vulnerabilidade extrema",
      status: "Ativo",
    },
    {
      id: "prod-4",
      actionCode: "2.078",
      actionName: "Manutenção de Estradas Vicinais",
      programName: "0015 - Infraestrutura e Desenvolvimento",
      productType: "SERVICO",
      productName: "Trecho de Estrada Vicinal Patrolada e Cascalhada",
      unitOfMeasure: "KM",
      targetQuantity: 180,
      beneficiaries: "Produtores rurais e moradores vicinais",
      status: "Ativo",
    },
  ]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ActionProductRow | null>(null);
  const [formData, setFormData] = useState<Partial<ActionProductRow>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.actionName.toLowerCase().includes(search.toLowerCase()) ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.actionCode.includes(search) ||
      r.programName.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "ALL" || r.productType === filterType;
    return matchesSearch && matchesType;
  });

  function handleOpenNew() {
    setSelectedRecord(null);
    setFormData({
      actionCode: "2.099",
      actionName: "Nova Ação Governamental",
      programName: "0010 - Saúde Integral",
      productType: "SERVICO",
      productName: "",
      unitOfMeasure: "UN",
      targetQuantity: 100,
      beneficiaries: "Comunidade local",
      status: "Ativo",
    });
    setErrorMessage(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(row: ActionProductRow) {
    setSelectedRecord(row);
    setFormData({ ...row });
    setErrorMessage(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // Regra estrita: 1 ação tem um único produto resultante
    const existing = records.find(
      (r) => r.actionCode === formData.actionCode && (!selectedRecord || r.id !== selectedRecord.id)
    );
    if (existing) {
      setErrorMessage(
        `Regra Violada: A ação '${formData.actionCode}' já possui o produto '${existing.productName}' cadastrado. Conforme a regra 18.71, para cada ação é permitido um ÚNICO produto resultante.`
      );
      return;
    }

    if (selectedRecord) {
      setRecords((prev) =>
        prev.map((item) => (item.id === selectedRecord.id ? ({ ...item, ...formData } as ActionProductRow) : item))
      );
      setFeedback("Produto da ação atualizado com sucesso!");
    } else {
      const newProd: ActionProductRow = {
        id: `prod-${Date.now()}`,
        actionCode: formData.actionCode ?? "2.000",
        actionName: formData.actionName ?? "Ação Governamental",
        programName: formData.programName ?? "Programa",
        productType: formData.productType ?? "SERVICO",
        productName: formData.productName ?? "Produto Resultante",
        unitOfMeasure: formData.unitOfMeasure ?? "UN",
        targetQuantity: formData.targetQuantity ?? 1,
        beneficiaries: formData.beneficiaries ?? "População",
        status: formData.status ?? "Ativo",
      };
      setRecords([newProd, ...records]);
      setFeedback("Produto resultante da ação cadastrado com sucesso!");
    }

    setTimeout(() => {
      setDialogOpen(false);
      setFeedback(null);
    }, 1000);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Produtos, Bens ou Serviços Resultantes da Ação (1 Ação = 1 Produto)"
        icon={<Package className="size-4 text-indigo-700" />}
      />

      <div className="bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-md text-xs text-indigo-900 flex items-center gap-2">
        <ShieldAlert className="size-4 text-indigo-600 shrink-0" />
        <span>
          <strong>Regra Metodológica do PPA (18.71):</strong> Toda ação governamental deve gerar exclusivamente{" "}
          <strong>um único produto</strong> (bem, serviço ou produto tangível), garantindo rastreabilidade direta do
          índice de execução física.
        </span>
      </div>

      <OperationalListFrame pagination={null}
        actions={
          <button onClick={handleOpenNew} className={styles.newButton}>
            <Plus />
            <span className={styles.newLabel}>Cadastrar Produto da Ação</span>
          </button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar por código da ação, produto ou programa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={filterType} onValueChange={(val) => setFilterType(val ?? "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[160px] bg-white">
                <SelectValue placeholder="Tipo de Entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Tipos</SelectItem>
                <SelectItem value="BEM">Bem</SelectItem>
                <SelectItem value="SERVICO">Serviço</SelectItem>
                <SelectItem value="PRODUTO">Produto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="planejamento-produtos-acoes"
          caption="Relação Unívoca entre Ações Orçamentárias e Produtos Resultantes"
          emptyMessage="Nenhum produto de ação cadastrado."
          rows={filtered.map((row) => ({
            id: row.id,
            label: `${row.actionCode} - ${row.productName}`,
            values: {
              action: `${row.actionCode} · ${row.actionName}`,
              program: row.programName,
              productType: row.productType === "BEM" ? "Bem" : row.productType === "SERVICO" ? "Serviço" : "Produto",
              productName: row.productName,
              unit: row.unitOfMeasure,
              quantity: row.targetQuantity.toLocaleString("pt-BR"),
              beneficiaries: row.beneficiaries,
              status: row.status,
            },
            actions: (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex items-center gap-1"
                onClick={() => handleOpenEdit(row)}
              >
                <Edit className="size-3 text-slate-600" />
                Editar
              </Button>
            ),
          }))}
        />
      </OperationalListFrame>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Package className="size-5 text-indigo-700" />
              {selectedRecord ? "Editar Produto da Ação" : "Vincular Produto Único Resultante à Ação"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Cadastre a especificação do bem ou serviço entregue pela ação orçamentária.
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs">
              <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {feedback && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs">
              <CheckCircle2 className="size-4 text-emerald-600" />
              {feedback}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-3 pt-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Código da Ação</Label>
                  <Input
                    placeholder="ex: 2.012"
                    value={formData.actionCode ?? ""}
                    onChange={(e) => setFormData({ ...formData, actionCode: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">Nome da Ação</Label>
                  <Input
                    placeholder="ex: Manutenção do Transporte Escolar"
                    value={formData.actionName ?? ""}
                    onChange={(e) => setFormData({ ...formData, actionName: e.target.value })}
                    className="h-8 text-xs mt-1"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Programa Vinculado</Label>
                <Input
                  placeholder="ex: 0012 - Educação com Qualidade"
                  value={formData.programName ?? ""}
                  onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Tipo de Entrega</Label>
                  <Select
                    value={formData.productType ?? "SERVICO"}
                    onValueChange={(val) => setFormData({ ...formData, productType: val as any })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BEM">Bem Tangível (Obra/Equipamento)</SelectItem>
                      <SelectItem value="SERVICO">Serviço Prestado / Continuado</SelectItem>
                      <SelectItem value="PRODUTO">Produto Distribuído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Unidade de Medida</Label>
                  <Select
                    value={formData.unitOfMeasure ?? "UN"}
                    onValueChange={(val) => setFormData({ ...formData, unitOfMeasure: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UN">UN - Unidade</SelectItem>
                      <SelectItem value="ALUNO">ALUNO - Aluno Atendido</SelectItem>
                      <SelectItem value="ATEND">ATEND - Atendimento Realizado</SelectItem>
                      <SelectItem value="FAM">FAM - Família Beneficiada</SelectItem>
                      <SelectItem value="KM">KM - Quilômetro</SelectItem>
                      <SelectItem value="M²">M² - Metro Quadrado</SelectItem>
                      <SelectItem value="%">% - Percentual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Descrição do Produto Resultante (Único)</Label>
                <Input
                  placeholder="ex: Transporte Diário de Estudantes da Rede Pública"
                  value={formData.productName ?? ""}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Meta Física Estimada</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.targetQuantity ?? 1}
                    onChange={(e) => setFormData({ ...formData, targetQuantity: Number(e.target.value) })}
                    className="h-8 text-xs mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Público-Alvo / Beneficiários</Label>
                  <Input
                    placeholder="ex: Estudantes da zona rural"
                    value={formData.beneficiaries ?? ""}
                    onChange={(e) => setFormData({ ...formData, beneficiaries: e.target.value })}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-700 hover:bg-indigo-800 text-white">
                Salvar Produto da Ação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
