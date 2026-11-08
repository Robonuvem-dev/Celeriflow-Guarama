"use client";

import { useState } from "react";
import { Ruler, Plus, Edit, CheckCircle2 } from "lucide-react";
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

type UnitMeasureRow = {
  id: string;
  code: string;
  symbol: string;
  name: string;
  type: string;
  decimals: number;
  description: string;
  status: string;
};

const columns = [
  operationalColumn("code", "Código", 70, 90, { type: "identifier" }),
  operationalColumn("symbol", "Símbolo/Sigla", 85, 110, { type: "identifier" }),
  operationalColumn("name", "Descrição da Unidade", 180, 260),
  operationalColumn("type", "Tipo de Indicador / Apuração", 140, 200),
  operationalColumn("decimals", "Casas Decimais", 90, 110, { type: "text", align: "right" }),
  operationalColumn("status", "Situação", 80, 100, { type: "status" }),
  operationalColumn("actions", "Ações", 75, 85, { type: "actions", details: "none", resizable: false }),
];

export default function UnidadesMedidaClient() {
  const [records, setRecords] = useState<UnitMeasureRow[]>([
    {
      id: "um-1",
      code: "001",
      symbol: "UN",
      name: "Unidade",
      type: "Quantitativo Absoluto",
      decimals: 0,
      description: "Contagem inteira de itens, bens ou equipamentos.",
      status: "Ativo",
    },
    {
      id: "um-2",
      code: "002",
      symbol: "%",
      name: "Percentual",
      type: "Índice Relativo / Cobertura",
      decimals: 2,
      description: "Taxa percentual de alcance, cobertura ou execução.",
      status: "Ativo",
    },
    {
      id: "um-3",
      code: "003",
      symbol: "KM",
      name: "Quilômetro",
      type: "Extensão Linear",
      decimals: 2,
      description: "Pavimentação, manutenção de estradas e vias vicinais.",
      status: "Ativo",
    },
    {
      id: "um-4",
      code: "004",
      symbol: "ALUNO",
      name: "Aluno Atendido",
      type: "População Beneficiada",
      decimals: 0,
      description: "Matrículas atendidas no ensino infantil e fundamental.",
      status: "Ativo",
    },
    {
      id: "um-5",
      code: "005",
      symbol: "ATEND",
      name: "Atendimento Realizado",
      type: "Serviço Prestado",
      decimals: 0,
      description: "Consultas médicas, odontológicas e exames no SUS.",
      status: "Ativo",
    },
    {
      id: "um-6",
      code: "006",
      symbol: "FAM",
      name: "Família Beneficiada",
      type: "Ação Social e Habitação",
      decimals: 0,
      description: "Famílias cadastradas no CadÚnico ou CRAS contempladas.",
      status: "Ativo",
    },
    {
      id: "um-7",
      code: "007",
      symbol: "M²",
      name: "Metro Quadrado",
      type: "Área Construída / Reforma",
      decimals: 2,
      description: "Área de edificações públicas reformadas ou construídas.",
      status: "Ativo",
    },
    {
      id: "um-8",
      code: "008",
      symbol: "HORA",
      name: "Hora Máquina",
      type: "Operação / Maquinário",
      decimals: 1,
      description: "Horas de serviços de patrolamento e maquinário agrícola.",
      status: "Ativo",
    },
  ]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<UnitMeasureRow | null>(null);
  const [formData, setFormData] = useState<Partial<UnitMeasureRow>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.symbol.toLowerCase().includes(search.toLowerCase()) ||
      r.code.includes(search);
    const matchesType = filterType === "ALL" || r.type.includes(filterType);
    return matchesSearch && matchesType;
  });

  function handleOpenNew() {
    setSelectedRecord(null);
    setFormData({
      code: String(records.length + 1).padStart(3, "0"),
      symbol: "",
      name: "",
      type: "Quantitativo Absoluto",
      decimals: 0,
      description: "",
      status: "Ativo",
    });
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(row: UnitMeasureRow) {
    setSelectedRecord(row);
    setFormData({ ...row });
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (selectedRecord) {
      setRecords((prev) =>
        prev.map((item) => (item.id === selectedRecord.id ? ({ ...item, ...formData } as UnitMeasureRow) : item))
      );
      setFeedback("Unidade de medida atualizada com sucesso!");
    } else {
      const newUm: UnitMeasureRow = {
        id: `um-${Date.now()}`,
        code: formData.code ?? "000",
        symbol: (formData.symbol ?? "UN").toUpperCase(),
        name: formData.name ?? "Nova Unidade",
        type: formData.type ?? "Quantitativo Absoluto",
        decimals: formData.decimals ?? 0,
        description: formData.description ?? "",
        status: formData.status ?? "Ativo",
      };
      setRecords([newUm, ...records]);
      setFeedback("Unidade de medida cadastrada com sucesso!");
    }

    setTimeout(() => {
      setDialogOpen(false);
      setFeedback(null);
    }, 1000);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Unidades de Medidas para Índices de Apuração"
        icon={<Ruler className="size-4 text-indigo-700" />}
      />

      <OperationalListFrame pagination={null}
        actions={
          <button onClick={handleOpenNew} className={styles.newButton}>
            <Plus />
            <span className={styles.newLabel}>Nova Unidade de Medida</span>
          </button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar por código, símbolo ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={filterType} onValueChange={(val) => setFilterType(val ?? "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
                <SelectValue placeholder="Tipo de Indicador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Tipos</SelectItem>
                <SelectItem value="Quantitativo">Quantitativo Absoluto</SelectItem>
                <SelectItem value="Relativo">Índice Relativo / Cobertura</SelectItem>
                <SelectItem value="Extensão">Extensão / Área</SelectItem>
                <SelectItem value="População">População / Beneficiário</SelectItem>
                <SelectItem value="Serviço">Serviço Prestado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="planejamento-unidades-medida"
          caption="Catálogo de Unidades de Medidas dos Indicadores"
          emptyMessage="Nenhuma unidade de medida cadastrada."
          rows={filtered.map((row) => ({
            id: row.id,
            label: `${row.symbol} - ${row.name}`,
            values: {
              code: row.code,
              symbol: row.symbol,
              name: row.name,
              type: row.type,
              decimals: String(row.decimals),
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Ruler className="size-5 text-indigo-700" />
              {selectedRecord ? "Editar Unidade de Medida" : "Cadastrar Unidade de Medida"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Defina a unidade de medida e precisão decimal para apuração física das metas do PPA e LOA.
            </DialogDescription>
          </DialogHeader>

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
                  <Label className="text-xs font-semibold text-slate-700">Código</Label>
                  <Input
                    value={formData.code ?? ""}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Símbolo / Sigla</Label>
                  <Input
                    placeholder="ex: UN, %, KM"
                    value={formData.symbol ?? ""}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    className="h-8 text-xs font-mono uppercase mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Casas Decimais</Label>
                  <Input
                    type="number"
                    min="0"
                    max="4"
                    value={formData.decimals ?? 0}
                    onChange={(e) => setFormData({ ...formData, decimals: Number(e.target.value) })}
                    className="h-8 text-xs mt-1"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Nome / Descrição da Unidade</Label>
                <Input
                  placeholder="ex: Quilo, Aluno Atendido, Consulta Realizada"
                  value={formData.name ?? ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Tipo de Apuração</Label>
                  <Select
                    value={formData.type ?? "Quantitativo Absoluto"}
                    onValueChange={(val) => setFormData({ ...formData, type: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Quantitativo Absoluto">Quantitativo Absoluto</SelectItem>
                      <SelectItem value="Índice Relativo / Cobertura">Índice Relativo / Cobertura</SelectItem>
                      <SelectItem value="Extensão Linear">Extensão Linear</SelectItem>
                      <SelectItem value="População Beneficiada">População Beneficiada</SelectItem>
                      <SelectItem value="Serviço Prestado">Serviço Prestado</SelectItem>
                      <SelectItem value="Área Construída / Reforma">Área Construída / Reforma</SelectItem>
                      <SelectItem value="Operação / Maquinário">Operação / Maquinário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Situação</Label>
                  <Select
                    value={formData.status ?? "Ativo"}
                    onValueChange={(val) => setFormData({ ...formData, status: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Finalidade / Detalhamento do Índice</Label>
                <Input
                  placeholder="Observação explicativa do índice de apuração"
                  value={formData.description ?? ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-700 hover:bg-indigo-800 text-white">
                Salvar Unidade
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
