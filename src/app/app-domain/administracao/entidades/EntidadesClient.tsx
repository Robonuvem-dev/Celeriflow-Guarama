"use client";

import { useState } from "react";
import { Building, Settings, ShieldCheck, Plus, CheckCircle, FileText } from "lucide-react";
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

type EntityRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  cnpj: string;
  status: string;
  tceCode?: string;
  siconfiCode?: string;
  power?: string;
  sphere?: string;
  accountingOfficer?: string;
  accountingCrc?: string;
  spendingOfficer?: string;
  activeFiscalYear?: string;
  pensionRegime?: string;
  lrfPersonnelLimit?: string;
};

const columns = [
  operationalColumn("code", "Código", 70, 90, { type: "identifier" }),
  operationalColumn("name", "Nome da Entidade", 200, 320),
  operationalColumn("type", "Tipo de Entidade", 120, 160),
  operationalColumn("cnpj", "CNPJ", 130, 160),
  operationalColumn("power", "Poder", 90, 120),
  operationalColumn("tce", "Código TCE", 90, 120),
  operationalColumn("officer", "Responsável Contábil", 140, 200),
  operationalColumn("status", "Situação", 80, 100, { type: "status" }),
  operationalColumn("actions", "Ações", 100, 120, { type: "actions", details: "none", resizable: false }),
];

export default function EntidadesClient({ initialEntities }: { initialEntities: EntityRow[] }) {
  const [entities, setEntities] = useState<EntityRow[]>(() =>
    initialEntities.map((e, index) => ({
      ...e,
      tceCode: e.tceCode ?? `TCE-0${index + 1}04`,
      siconfiCode: e.siconfiCode ?? `SICONFI-${index + 1}00`,
      power: e.type === "CAMARA" ? "Legislativo" : "Executivo",
      sphere: "Municipal",
      accountingOfficer: e.accountingOfficer ?? "Contador Geral Municipal",
      accountingCrc: e.accountingCrc ?? "CRC-MG 045123/O",
      spendingOfficer: e.spendingOfficer ?? "Ordenador Designado",
      activeFiscalYear: "2026",
      pensionRegime: "RPPS",
      lrfPersonnelLimit: e.type === "CAMARA" ? "6.00%" : "54.00%",
    }))
  );

  const [search, setSearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<EntityRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<EntityRow>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const filteredEntities = entities.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.cnpj.includes(search)
  );

  function handleOpenParams(entity: EntityRow) {
    setSelectedEntity(entity);
    setEditForm({ ...entity });
    setIsEditing(false);
    setDialogOpen(true);
    setSavedNotice(null);
  }

  function handleSaveParams(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEntity) return;

    setEntities((prev) =>
      prev.map((item) => (item.id === selectedEntity.id ? ({ ...item, ...editForm } as EntityRow) : item))
    );
    setSavedNotice("Parâmetros da Entidade atualizados com sucesso!");
    setTimeout(() => {
      setDialogOpen(false);
      setSavedNotice(null);
    }, 1200);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Administrações e Parâmetros das Entidades"
        icon={<Building className="size-4 text-emerald-700" />}
      />

      <OperationalListFrame pagination={null}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newId = `ent-${Date.now()}`;
                const newEnt: EntityRow = {
                  id: newId,
                  code: `0${entities.length + 1}`,
                  name: "Nova Entidade Administrativa",
                  type: "AUTARQUIA",
                  cnpj: "00.000.000/0001-00",
                  status: "ATIVA",
                  power: "Executivo",
                  sphere: "Municipal",
                  tceCode: `TCE-0${entities.length + 1}01`,
                  accountingOfficer: "Contador Responsável",
                  accountingCrc: "CRC-MG 000000/O",
                  spendingOfficer: "Gestor Titular",
                  activeFiscalYear: "2026",
                  pensionRegime: "RPPS",
                  lrfPersonnelLimit: "54.00%",
                };
                setEntities([newEnt, ...entities]);
                handleOpenParams(newEnt);
              }}
              className={styles.newButton}
            >
              <Plus />
              <span className={styles.newLabel}>Adicionar Entidade</span>
            </button>
          </div>
        }
        toolbar={
          <div className={styles.searchForm}>
            <input
              type="search"
              placeholder="Buscar por código, nome ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="admin-entidades"
          caption="Lista de Administrações e Entidades Governamentais"
          emptyMessage="Nenhuma entidade governamental encontrada."
          rows={filteredEntities.map((row) => ({
            id: row.id,
            label: row.name,
            values: {
              code: row.code,
              name: row.name,
              type: row.type,
              cnpj: row.cnpj || "Não cadastrado",
              power: row.power ?? "Executivo",
              tce: row.tceCode ?? "—",
              officer: row.accountingOfficer ?? "—",
              status: row.status,
            },
            actions: (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex items-center gap-1.5"
                onClick={() => handleOpenParams(row)}
              >
                <Settings className="size-3.5 text-slate-600" />
                Parâmetros
              </Button>
            ),
          }))}
        />
      </OperationalListFrame>

      {/* Modal de Parâmetros da Entidade */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Settings className="size-5 text-emerald-700" />
              Parâmetros Contábeis e Institucionais da Entidade
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure as diretrizes orçamentárias, registros no TCE/Siconfi, ordenadores e limites legais da LRF.
            </DialogDescription>
          </DialogHeader>

          {savedNotice && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-sm">
              <CheckCircle className="size-4 text-emerald-600" />
              {savedNotice}
            </div>
          )}

          <form onSubmit={handleSaveParams} className="space-y-4 pt-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Identificação Institucional</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Código</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.code ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">Nome da Entidade</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">CNPJ</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.cnpj ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Tipo de Administração</Label>
                  <Select
                    value={editForm.type ?? "PREFEITURA"}
                    onValueChange={(val) => setEditForm({ ...editForm, type: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREFEITURA">Administração Direta (Prefeitura)</SelectItem>
                      <SelectItem value="CAMARA">Poder Legislativo (Câmara)</SelectItem>
                      <SelectItem value="AUTARQUIA">Autarquia Municipal</SelectItem>
                      <SelectItem value="FUNDACAO">Fundação Pública</SelectItem>
                      <SelectItem value="FUNDO">Fundo Especial / Saúde / Assistência</SelectItem>
                      <SelectItem value="CONSORCIO">Consórcio Público</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Poder Governamental</Label>
                  <Select
                    value={editForm.power ?? "Executivo"}
                    onValueChange={(val) => setEditForm({ ...editForm, power: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Executivo">Poder Executivo</SelectItem>
                      <SelectItem value="Legislativo">Poder Legislativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Parâmetros Contábeis e Fiscalização</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Código TCE</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.tceCode ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, tceCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Código Siconfi (STN)</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.siconfiCode ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, siconfiCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Exercício Ativo</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.activeFiscalYear ?? "2026"}
                    onChange={(e) => setEditForm({ ...editForm, activeFiscalYear: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Responsável Contábil</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.accountingOfficer ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, accountingOfficer: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Registro CRC</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.accountingCrc ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, accountingCrc: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Ordenador de Despesa</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.spendingOfficer ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, spendingOfficer: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Regime Previdenciário</Label>
                  <Select
                    value={editForm.pensionRegime ?? "RPPS"}
                    onValueChange={(val) => setEditForm({ ...editForm, pensionRegime: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RPPS">RPPS (Regime Próprio de Previdência)</SelectItem>
                      <SelectItem value="RGPS">RGPS (INSS - Regime Geral)</SelectItem>
                      <SelectItem value="MISTO">Misto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Limite Pessoal LRF</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={editForm.lrfPersonnelLimit ?? "54.00%"}
                    onChange={(e) => setEditForm({ ...editForm, lrfPersonnelLimit: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Situação Cadastral</Label>
                  <Select
                    value={editForm.status ?? "ATIVA"}
                    onValueChange={(val) => setEditForm({ ...editForm, status: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATIVA">Ativa</SelectItem>
                      <SelectItem value="INATIVA">Inativa</SelectItem>
                      <SelectItem value="EXTINTA">Extinta / Em Liquidação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white">
                Salvar Parâmetros
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
