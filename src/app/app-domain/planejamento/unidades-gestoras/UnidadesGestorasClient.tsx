"use client";

import { useState } from "react";
import { FolderTree, Plus, Edit, Building2, CheckCircle2 } from "lucide-react";
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

type GestoraRow = {
  id: string;
  orgaoCode: string;
  orgaoName: string;
  uoCode: string;
  uoName: string;
  subUnidadeCode: string;
  subUnidadeName: string;
  status: string;
  responsavel?: string;
};

const columns = [
  operationalColumn("orgao", "Órgão", 110, 150, { type: "identifier" }),
  operationalColumn("uo", "Unidade Orçamentária", 150, 220),
  operationalColumn("sub", "Sub-Unidade / Executora", 160, 240),
  operationalColumn("responsavel", "Responsável Designado", 140, 200),
  operationalColumn("status", "Situação", 80, 100, { type: "status" }),
  operationalColumn("actions", "Ações", 80, 90, { type: "actions", details: "none", resizable: false }),
];

export default function UnidadesGestorasClient({
  initialUnits = [],
  entities = [],
}: {
  initialUnits: Array<{ id: string; code: string; name: string }>;
  entities: Array<{ id: string; code: string; name: string; type: string }>;
}) {
  const [records, setRecords] = useState<GestoraRow[]>(() => {
    if (initialUnits.length > 0) {
      return initialUnits.map((u, i) => {
        const parts = u.code.split(".");
        const orgao = parts[0] || `0${(i % 5) + 1}`;
        const uo = parts[1] ? `${orgao}.${parts[1]}` : `${orgao}.01`;
        const sub = parts[2] ? `${uo}.${parts[2]}` : `${uo}.01`;
        return {
          id: u.id,
          orgaoCode: orgao,
          orgaoName: entities.find((e) => e.code === orgao)?.name ?? `Órgão ${orgao} - Prefeitura Municipal`,
          uoCode: uo,
          uoName: u.name,
          subUnidadeCode: sub,
          subUnidadeName: `Divisão Executora de ${u.name}`,
          status: "Ativo",
          responsavel: "Secretário / Diretor Responsável",
        };
      });
    }

    return [
      {
        id: "ug-1",
        orgaoCode: "01",
        orgaoName: "01 - Câmara Municipal",
        uoCode: "01.01",
        uoName: "Câmara Municipal de Vereadores",
        subUnidadeCode: "01.01.01",
        subUnidadeName: "Secretaria Geral Legislativa",
        status: "Ativo",
        responsavel: "Presidente da Câmara",
      },
      {
        id: "ug-2",
        orgaoCode: "02",
        orgaoName: "02 - Prefeitura Municipal",
        uoCode: "02.01",
        uoName: "Gabinete do Prefeito e Vice",
        subUnidadeCode: "02.01.01",
        subUnidadeName: "Assessoria Jurídica e Controle",
        status: "Ativo",
        responsavel: "Chefe de Gabinete",
      },
      {
        id: "ug-3",
        orgaoCode: "02",
        orgaoName: "02 - Prefeitura Municipal",
        uoCode: "02.02",
        uoName: "Secretaria Municipal de Fazenda",
        subUnidadeCode: "02.02.01",
        subUnidadeName: "Departamento de Contabilidade e Tesouraria",
        status: "Ativo",
        responsavel: "Secretário de Fazenda",
      },
      {
        id: "ug-4",
        orgaoCode: "02",
        orgaoName: "02 - Prefeitura Municipal",
        uoCode: "02.03",
        uoName: "Secretaria Municipal de Educação",
        subUnidadeCode: "02.03.01",
        subUnidadeName: "Divisão de Ensino Fundamental e Infantil",
        status: "Ativo",
        responsavel: "Secretária de Educação",
      },
      {
        id: "ug-5",
        orgaoCode: "02",
        orgaoName: "02 - Prefeitura Municipal",
        uoCode: "02.04",
        uoName: "Fundo Municipal de Saúde",
        subUnidadeCode: "02.04.01",
        subUnidadeName: "Divisão de Atenção Básica e Vigilância",
        status: "Ativo",
        responsavel: "Gestor do Fundo de Saúde",
      },
    ];
  });

  const [search, setSearch] = useState("");
  const [filterOrgao, setFilterOrgao] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<GestoraRow | null>(null);
  const [formData, setFormData] = useState<Partial<GestoraRow>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const orgaos = [...new Set(records.map((r) => r.orgaoCode))];

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.orgaoName.toLowerCase().includes(search.toLowerCase()) ||
      r.uoName.toLowerCase().includes(search.toLowerCase()) ||
      r.subUnidadeName.toLowerCase().includes(search.toLowerCase()) ||
      r.uoCode.includes(search) ||
      r.subUnidadeCode.includes(search);
    const matchesOrgao = filterOrgao === "ALL" || r.orgaoCode === filterOrgao;
    return matchesSearch && matchesOrgao;
  });

  function handleOpenNew() {
    setSelectedRecord(null);
    setFormData({
      orgaoCode: "02",
      orgaoName: "02 - Prefeitura Municipal",
      uoCode: "02.05",
      uoName: "Nova Unidade Orçamentária",
      subUnidadeCode: "02.05.01",
      subUnidadeName: "Sub-Unidade Executora",
      status: "Ativo",
      responsavel: "",
    });
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(row: GestoraRow) {
    setSelectedRecord(row);
    setFormData({ ...row });
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (selectedRecord) {
      setRecords((prev) =>
        prev.map((item) => (item.id === selectedRecord.id ? ({ ...item, ...formData } as GestoraRow) : item))
      );
      setFeedback("Unidade gestora atualizada com sucesso!");
    } else {
      const newUg: GestoraRow = {
        id: `ug-${Date.now()}`,
        orgaoCode: formData.orgaoCode ?? "02",
        orgaoName: formData.orgaoName ?? "02 - Prefeitura Municipal",
        uoCode: formData.uoCode ?? "02.99",
        uoName: formData.uoName ?? "Unidade Orçamentária",
        subUnidadeCode: formData.subUnidadeCode ?? "02.99.01",
        subUnidadeName: formData.subUnidadeName ?? "Sub-Unidade",
        status: formData.status ?? "Ativo",
        responsavel: formData.responsavel ?? "",
      };
      setRecords([newUg, ...records]);
      setFeedback("Nova unidade gestora estruturada com sucesso!");
    }

    setTimeout(() => {
      setDialogOpen(false);
      setFeedback(null);
    }, 1000);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Unidades Gestoras (Órgão, Unidade Orçamentária e Sub-Unidade)"
        icon={<FolderTree className="size-4 text-indigo-700" />}
      />

      <OperationalListFrame pagination={null}
        actions={
          <button onClick={handleOpenNew} className={styles.newButton}>
            <Plus />
            <span className={styles.newLabel}>Nova Unidade Gestora</span>
          </button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar por código ou descrição da unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={filterOrgao} onValueChange={(val) => setFilterOrgao(val ?? "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
                <SelectValue placeholder="Filtrar por Órgão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Órgãos</SelectItem>
                {orgaos.map((code) => (
                  <SelectItem key={code} value={code}>
                    Órgão {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="planejamento-unidades-gestoras"
          caption="Estrutura Hierárquica de Unidades Gestoras"
          emptyMessage="Nenhuma unidade gestora cadastrada."
          rows={filtered.map((row) => ({
            id: row.id,
            label: `${row.subUnidadeCode} - ${row.subUnidadeName}`,
            values: {
              orgao: `${row.orgaoCode} · ${row.orgaoName}`,
              uo: `${row.uoCode} · ${row.uoName}`,
              sub: `${row.subUnidadeCode} · ${row.subUnidadeName}`,
              responsavel: row.responsavel || "—",
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

      {/* Modal de Cadastro/Edição de Unidade Gestora */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <FolderTree className="size-5 text-indigo-700" />
              {selectedRecord ? "Editar Unidade Gestora" : "Cadastrar Estrutura de Unidade Gestora"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Estruturação hierárquica conforme Portaria SOF/STN: Órgão (00), Unidade Orçamentária (00.00) e Sub-Unidade (00.00.00).
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
              <div>
                <Label className="text-xs font-semibold text-slate-700">1. Nível Órgão (2 dígitos)</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Input
                    placeholder="Código (ex: 02)"
                    value={formData.orgaoCode ?? ""}
                    onChange={(e) => setFormData({ ...formData, orgaoCode: e.target.value })}
                    className="h-8 text-xs font-mono"
                    required
                  />
                  <div className="col-span-2">
                    <Input
                      placeholder="Nome do Órgão (ex: Prefeitura Municipal)"
                      value={formData.orgaoName ?? ""}
                      onChange={(e) => setFormData({ ...formData, orgaoName: e.target.value })}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">2. Nível Unidade Orçamentária (UO)</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Input
                    placeholder="Código (ex: 02.03)"
                    value={formData.uoCode ?? ""}
                    onChange={(e) => setFormData({ ...formData, uoCode: e.target.value })}
                    className="h-8 text-xs font-mono"
                    required
                  />
                  <div className="col-span-2">
                    <Input
                      placeholder="Nome da UO (ex: Secretaria de Educação)"
                      value={formData.uoName ?? ""}
                      onChange={(e) => setFormData({ ...formData, uoName: e.target.value })}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">3. Nível Sub-Unidade / Executora</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Input
                    placeholder="Código (ex: 02.03.01)"
                    value={formData.subUnidadeCode ?? ""}
                    onChange={(e) => setFormData({ ...formData, subUnidadeCode: e.target.value })}
                    className="h-8 text-xs font-mono"
                    required
                  />
                  <div className="col-span-2">
                    <Input
                      placeholder="Nome da Sub-Unidade (ex: Ensino Fundamental)"
                      value={formData.subUnidadeName ?? ""}
                      onChange={(e) => setFormData({ ...formData, subUnidadeName: e.target.value })}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Responsável / Ordenador</Label>
                  <Input
                    placeholder="Nome do gestor ou cargo"
                    value={formData.responsavel ?? ""}
                    onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                    className="h-8 text-xs mt-1"
                  />
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
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-700 hover:bg-indigo-800 text-white">
                Salvar Unidade Gestora
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
