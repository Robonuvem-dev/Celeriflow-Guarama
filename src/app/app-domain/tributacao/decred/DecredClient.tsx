"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, Code2, Edit3, FileText, Plus, Receipt, ShieldCheck, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import {
  CARD_OPERATION_NATURE_LABELS,
  DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC,
  type CardAdministratorDam,
  type CardAdministratorDeclaration,
  type CardDeclarationType,
  type CardEquipmentRecord,
  type CardOperationNature,
  type FiscalNaturezaReportRow,
  type ResponsibilityTermAcceptance,
} from "@/lib/tributacao/card-administrators-decred-service";

type ActiveTab = "equipamentos" | "declaracoes" | "relatorio-natureza" | "relatorio-equipamentos" | "termo";

type Props = {
  initialEquipments: CardEquipmentRecord[];
  initialTerms: ResponsibilityTermAcceptance[];
  initialDeclarations: CardAdministratorDeclaration[];
  initialDams: CardAdministratorDam[];
  initialReportByNatureza: FiscalNaturezaReportRow[];
  initialReportEquipments: Array<
    CardEquipmentRecord & {
      quantidadeDeclaracoesVinculadas: number;
      totalMovimentadoNoEquipamento: number;
      totalTaxaServicoNoEquipamento: number;
    }
  >;
  responsibilityTermText: string;
  activeTab: ActiveTab;
  page: number;
};

const pathname = "/tributacao/decred";

const equipmentColumns: readonly OperationalColumn[] = [
  { key: "terminal", label: "Nº Identificador (29.1/29.9)", type: "identifier", initialWidth: 165, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
  { key: "model", label: "Modelo / Vínculo", type: "text", initialWidth: 195, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "contribuinte", label: "Inscrição Municipal / PF ou PJ (29.1)", type: "text", initialWidth: 270, minWidth: 185, resizable: true, sortable: false, details: "overflow" },
  { key: "administradora", label: "Administradora Credenciadora", type: "text", initialWidth: 235, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 120, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Editar", type: "actions", initialWidth: 95, minWidth: 85, maxWidth: 110, resizable: false, sortable: false, details: "none", align: "right" },
];

const declarationColumns: readonly OperationalColumn[] = [
  { key: "id", label: "Protocolo / Comp.", type: "identifier", initialWidth: 165, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
  { key: "admin", label: "Administradora & Responsável (29.4)", type: "text", initialWidth: 245, minWidth: 170, resizable: true, sortable: false, details: "overflow" },
  { key: "natureza", label: "Natureza / Terminal", type: "text", initialWidth: 215, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "totalOps", label: "Total Operações", type: "text", initialWidth: 135, minWidth: 115, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "servico", label: "Valor Serviço (Taxa)", type: "text", initialWidth: 145, minWidth: 120, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "iss", label: "ISS / DAM (29.5)", type: "status", initialWidth: 170, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "DAM / Detalhes", type: "actions", initialWidth: 135, minWidth: 125, maxWidth: 150, resizable: false, sortable: false, details: "none", align: "right" },
];

const naturezaReportColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Código Natureza", type: "identifier", initialWidth: 185, minWidth: 145, resizable: true, sortable: false, details: "overflow" },
  { key: "label", label: "Natureza da Operação Declarada (29.8)", type: "text", initialWidth: 270, minWidth: 185, resizable: true, sortable: false, details: "overflow" },
  { key: "decls", label: "Qtd. Declarações", type: "text", initialWidth: 135, minWidth: 110, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "txs", label: "Operações Autorizadas", type: "text", initialWidth: 165, minWidth: 130, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "gross", label: "Valor Total das Operações", type: "text", initialWidth: 175, minWidth: 140, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "service", label: "Valor Prestação Serviço", type: "text", initialWidth: 175, minWidth: 140, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "iss", label: "ISSQN Apurado", type: "text", initialWidth: 145, minWidth: 120, resizable: true, sortable: false, details: "overflow", align: "right" },
];

const equipmentFiscalReportColumns: readonly OperationalColumn[] = [
  { key: "terminal", label: "Equipamento (29.9)", type: "identifier", initialWidth: 150, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  { key: "serial", label: "Nº Série / Modelo", type: "text", initialWidth: 210, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "contribuinte", label: "Estabelecimento (IM / CPF-CNPJ)", type: "text", initialWidth: 260, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "admin", label: "Administradora Vinculada", type: "text", initialWidth: 215, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "movimento", label: "Total Movimentado", type: "text", initialWidth: 155, minWidth: 125, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "servico", label: "Total Prestação Serviço", type: "text", initialWidth: 165, minWidth: 135, resizable: true, sortable: false, details: "overflow", align: "right" },
];

const termColumns: readonly OperationalColumn[] = [
  { key: "id", label: "Termo ID", type: "identifier", initialWidth: 120, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "credenciado", label: "Usuário Credenciado (29.3)", type: "text", initialWidth: 270, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "doc", label: "CPF/CNPJ & Inscrição Municipal", type: "text", initialWidth: 220, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "acceptedAt", label: "Data/Hora do Aceite", type: "text", initialWidth: 170, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação Legal", type: "status", initialWidth: 165, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
];

function money(val: number) {
  return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EquipmentUpsertDialog({
  existing,
  onSaved,
}: {
  existing?: CardEquipmentRecord;
  onSaved: (state: ReturnType<typeof Object>) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  const [terminalNumber, setTerminalNumber] = useState(existing?.terminalNumber ?? "POS-99501");
  const [serialNumber, setSerialNumber] = useState(existing?.serialNumber ?? "SN-INGENICO-99501");
  const [equipmentModel, setEquipmentModel] = useState<CardEquipmentRecord["equipmentModel"]>(
    existing?.equipmentModel ?? "SMART_POS",
  );
  const [ownershipType, setOwnershipType] = useState<CardEquipmentRecord["ownershipType"]>(
    existing?.ownershipType ?? "LOCADO_CREDENCIADORA",
  );
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState(existing?.inscricaoMunicipal ?? "IM-44510");
  const [contribuinteCpfCnpj, setContribuinteCpfCnpj] = useState(existing?.contribuinteCpfCnpj ?? "14.582.900/0001-42");
  const [contribuinteNome, setContribuinteNome] = useState(
    existing?.contribuinteNome ?? "Agropecuária e Serviços Triângulo Ltda",
  );
  const [administradoraNome, setAdministradoraNome] = useState(existing?.administradoraNome ?? "Cielo S.A.");
  const [administradoraCnpj, setAdministradoraCnpj] = useState(existing?.administradoraCnpj ?? "01.027.058/0001-91");
  const [status, setStatus] = useState<CardEquipmentRecord["status"]>(existing?.status ?? "ATIVO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tributacao/decred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_EQUIPMENT",
          id: existing?.id,
          terminalNumber,
          serialNumber,
          equipmentModel,
          ownershipType,
          inscricaoMunicipal,
          contribuinteCpfCnpj,
          contribuinteNome,
          administradoraNome,
          administradoraCnpj,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Erro ao salvar equipamento.");
        return;
      }
      onSaved(data.state);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {existing ? (
        <button
          ref={trigger}
          type="button"
          className={styles.iconButton}
          aria-label={`Editar equipamento ${existing.terminalNumber}`}
          title="Editar equipamento (Requisito 29.1)"
          onClick={() => setOpen(true)}
        >
          <Edit3 />
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={`${styles.dialogButton} ${styles.primaryButton}`}
          onClick={() => setOpen(true)}
        >
          <Plus />
          Incluir Equipamento POS/TEF (29.1)
        </button>
      )}
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>{existing ? `Editar Equipamento ${existing.terminalNumber}` : "Incluir Equipamento de Cartão (POS / TEF)"}</DialogTitle>
          <DialogDescription>Requisito 29.1 — Inclusão, Consulta e Edição por Pessoa Física ou Inscrição Municipal</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Formulário de Equipamento POS/TEF"
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${styles.dialogButton} ${styles.primaryButton}`}
                disabled={saving}
                onClick={() => void handleSave()}
              >
                <CheckCircle2 />
                {saving ? "Salvando..." : existing ? "Salvar Alterações" : "Cadastrar Equipamento"}
              </button>
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Cancelar
              </button>
            </div>
          }
        >
          <div className="grid gap-2.5 text-xs">
            {error && <p className="rounded bg-rose-100 p-2 font-medium text-rose-900">{error}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-semibold">Nº Identificador do Equipamento (29.9)</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={terminalNumber}
                  onChange={(e) => setTerminalNumber(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Número de Série</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="font-semibold">Tipo de Equipamento</span>
                <select
                  className="h-8 rounded border border-slate-300 px-2"
                  value={equipmentModel}
                  onChange={(e) => setEquipmentModel(e.target.value as CardEquipmentRecord["equipmentModel"])}
                >
                  <option value="SMART_POS">SmartPOS</option>
                  <option value="POS_SEMPRE_ATIVO">POS Tradicional</option>
                  <option value="TEF_INTEGRADO">TEF Integrado</option>
                  <option value="GATEWAY_ECOMMERCE">Gateway E-Commerce</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Propriedade / Vínculo</span>
                <select
                  className="h-8 rounded border border-slate-300 px-2"
                  value={ownershipType}
                  onChange={(e) => setOwnershipType(e.target.value as CardEquipmentRecord["ownershipType"])}
                >
                  <option value="LOCADO_CREDENCIADORA">Locado da Credenciadora</option>
                  <option value="PROPRIO">Próprio</option>
                  <option value="COMPARTILHADO">Compartilhado</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Situação Cadastral</span>
                <select
                  className="h-8 rounded border border-slate-300 px-2"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CardEquipmentRecord["status"])}
                >
                  <option value="ATIVO">ATIVO</option>
                  <option value="SUSPENSO">SUSPENSO</option>
                  <option value="BAIXADO">BAIXADO</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="font-semibold">Inscrição Municipal</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={inscricaoMunicipal}
                  onChange={(e) => setInscricaoMunicipal(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">CPF ou CNPJ do Contribuinte</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={contribuinteCpfCnpj}
                  onChange={(e) => setContribuinteCpfCnpj(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Nome / Razão Social</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={contribuinteNome}
                  onChange={(e) => setContribuinteNome(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-semibold">Administradora de Cartão</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={administradoraNome}
                  onChange={(e) => setAdministradoraNome(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">CNPJ da Administradora</span>
                <input
                  className="h-8 rounded border border-slate-300 px-2"
                  value={administradoraCnpj}
                  onChange={(e) => setAdministradoraCnpj(e.target.value)}
                />
              </label>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function NewDeclarationDialog({
  onSaved,
}: {
  onSaved: (state: ReturnType<typeof Object>) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  const [competencia, setCompetencia] = useState("11/2026");
  const [tipoDeclaracao, setTipoDeclaracao] = useState<CardDeclarationType>("NORMAL_ORIGINAL");
  const [responsavelNome, setResponsavelNome] = useState("Roberto Almeida");
  const [responsavelCpf, setResponsavelCpf] = useState("284.910.448-12");
  const [responsavelEmail, setResponsavelEmail] = useState("fiscal@cielo.com.br");
  const [administradoraNome, setAdministradoraNome] = useState("Cielo S.A.");
  const [administradoraCnpj, setAdministradoraCnpj] = useState("01.027.058/0001-91");
  const [naturezaOperacao, setNaturezaOperacao] = useState<CardOperationNature>("CREDITO_A_VISTA");
  const [terminalNumber, setTerminalNumber] = useState("POS-98442");
  const [descricaoServicos, setDescricaoServicos] = useState(
    "Prestação de serviços de administração, captura e liquidação de cartões (Subitem 15.01 LC 116/03)",
  );
  const [valorTotalOperacoes, setValorTotalOperacoes] = useState("125000.00");
  const [valorPrestacaoServico, setValorPrestacaoServico] = useState("3125.00");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await fetch("/api/tributacao/decred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_DECLARATION",
          competencia,
          tipoDeclaracao,
          responsavelNome,
          responsavelCpf,
          responsavelEmail,
          administradoraNome,
          administradoraCnpj,
          naturezaOperacao,
          terminalNumber,
          descricaoServicos,
          valorTotalOperacoes: Number(valorTotalOperacoes),
          valorPrestacaoServico: Number(valorPrestacaoServico),
        }),
      });
      const data = await res.json();
      if (data.state) {
        onSaved(data.state);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        className={`${styles.dialogButton} ${styles.primaryButton}`}
        onClick={() => setOpen(true)}
      >
        <Plus />
        Nova Declaração de Movimentação (29.4)
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Declaração da Movimentação da Administradora de Cartão (29.4)</DialogTitle>
          <DialogDescription>Competência, tipo, dados do responsável, natureza, descrição, valor total e valor da prestação do serviço</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Formulário de Declaração DECRED"
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${styles.dialogButton} ${styles.primaryButton}`}
                disabled={saving}
                onClick={() => void handleSubmit()}
              >
                <CheckCircle2 />
                {saving ? "Transmitindo..." : "Transmitir Declaração (29.4)"}
              </button>
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Cancelar
              </button>
            </div>
          }
        >
          <div className="grid gap-2.5 text-xs">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="font-semibold">Competência (MM/AAAA)</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Tipo da Declaração</span>
                <select
                  className="h-8 rounded border border-slate-300 px-2"
                  value={tipoDeclaracao}
                  onChange={(e) => setTipoDeclaracao(e.target.value as CardDeclarationType)}
                >
                  <option value="NORMAL_ORIGINAL">Original / Normal</option>
                  <option value="RETIFICADORA">Retificadora</option>
                  <option value="SEM_MOVIMENTO">Sem Movimento</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Natureza da Operação</span>
                <select
                  className="h-8 rounded border border-slate-300 px-2"
                  value={naturezaOperacao}
                  onChange={(e) => setNaturezaOperacao(e.target.value as CardOperationNature)}
                >
                  {Object.entries(CARD_OPERATION_NATURE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="font-semibold">Nome do Responsável</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">CPF do Responsável</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={responsavelCpf} onChange={(e) => setResponsavelCpf(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">E-mail do Responsável</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={responsavelEmail} onChange={(e) => setResponsavelEmail(e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="font-semibold">Administradora de Cartão</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={administradoraNome} onChange={(e) => setAdministradoraNome(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">CNPJ da Administradora</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={administradoraCnpj} onChange={(e) => setAdministradoraCnpj(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Equipamento Vinculado</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={terminalNumber} onChange={(e) => setTerminalNumber(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="font-semibold">Descrição da Prestação do Serviço</span>
              <input className="h-8 rounded border border-slate-300 px-2" value={descricaoServicos} onChange={(e) => setDescricaoServicos(e.target.value)} />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="font-semibold">Valor Total das Operações (R$)</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={valorTotalOperacoes} onChange={(e) => setValorTotalOperacoes(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Valor da Prestação do Serviço / Taxa Base ISS (R$)</span>
                <input className="h-8 rounded border border-slate-300 px-2" value={valorPrestacaoServico} onChange={(e) => setValorPrestacaoServico(e.target.value)} />
              </label>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function DeclarationAndDamDialog({
  declaration,
  onGenerateDam,
  busyId,
}: {
  declaration: CardAdministratorDeclaration;
  onGenerateDam: (id: string) => Promise<void>;
  busyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        className={styles.iconButton}
        aria-label={`Ver DAM e operações detalhadas da declaração ${declaration.id}`}
        title="Ver DAM (29.5) e operações detalhadas (29.4 / 29.7)"
        onClick={() => setOpen(true)}
      >
        <FileText />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Declaração {declaration.protocoloRecepcao} & DAM Municipal (29.4 / 29.5 / 29.7)</DialogTitle>
          <DialogDescription>{declaration.administradoraNome} ({declaration.administradoraCnpj}) · Competência {declaration.competencia}</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Detalhes da Declaração e DAM"
          footer={
            <div className="flex items-center gap-2">
              {!declaration.damGerado && (
                <button
                  type="button"
                  className={`${styles.dialogButton} ${styles.primaryButton}`}
                  disabled={busyId === declaration.id}
                  onClick={() => void onGenerateDam(declaration.id)}
                >
                  <Receipt />
                  Gerar DAM de ISS (29.5)
                </button>
              )}
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Fechar
              </button>
            </div>
          }
        >
          <div className="grid gap-3 text-xs">
            <dl className="grid gap-1.5 rounded border border-slate-200 bg-slate-50 p-2.5">
              <div><b>Tipo da Declaração:</b> {declaration.tipoDeclaracao} · <b>Origem:</b> {declaration.origemRecepcao}</div>
              <div><b>Responsável pela Declaração (29.4):</b> {declaration.responsavelNome} (CPF {declaration.responsavelCpf} · {declaration.responsavelEmail})</div>
              <div><b>Natureza da Operação:</b> {declaration.naturezaOperacaoLabel} · <b>Equipamento:</b> {declaration.terminalNumber}</div>
              <div><b>Descrição:</b> {declaration.descricaoServicos}</div>
              <div>
                <b>Valor Total das Operações:</b> {money(declaration.valorTotalOperacoes)} ·{" "}
                <b>Valor da Prestação do Serviço:</b> {money(declaration.valorPrestacaoServico)} ·{" "}
                <b>ISS Apurado ({declaration.aliquotaIssPercent}%):</b> {money(declaration.valorIssDevido)}
              </div>
            </dl>

            {declaration.damGerado && (
              <div className="rounded border border-emerald-300 bg-emerald-50 p-2.5">
                <p className="font-bold text-emerald-950">
                  Documento de Arrecadação Municipal — DAM Emitido (Requisito 29.5): {declaration.damGerado.damNumber}
                </p>
                <p className="mt-1">
                  Receita: <code className="font-mono">{declaration.damGerado.codigoReceitaMunicipal}</code> · Vencimento:{" "}
                  <b>{declaration.damGerado.dataVencimento}</b> · Valor do DAM: <b>{money(declaration.damGerado.valorTotalDam)}</b>
                </p>
                <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-900">
                  Linha Digitável FEBRABAN: {declaration.damGerado.linhaDigitavel48}
                </p>
                <p className="break-all font-mono text-[11px] text-slate-600">
                  Código de Barras (44 pos): {declaration.damGerado.codigoBarras44}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 font-bold text-slate-800">
                Operações Realizadas e Autorizadas Detalhadas na Declaração (Requisito 29.7):
              </p>
              <div className=" grid gap-1.5">
                {declaration.operacoesAutorizadasDetalhe.map((op) => (
                  <div key={op.authorizationCode} className="rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">
                    Autorização: <b>{op.authorizationCode}</b> | NSU: {op.nsuHost} | Terminal: <b>{op.terminalNumber}</b> | Estab.: {op.estabelecimentoCpfCnpj} ({op.estabelecimentoInscricaoMunicipal}) | Bruto: {money(op.grossTransactionAmount)} | Serviço: {money(op.serviceFeeAmount)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function WebServiceSpecDialog({
  onSimulateBatch,
  busy,
}: {
  onSimulateBatch: () => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button ref={trigger} type="button" className={styles.dialogButton} onClick={() => setOpen(true)}>
        <Code2 />
        Web Service Recepção (29.7)
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Módulo de Recepção via Web Service — Layout Padrão (Requisito 29.7)</DialogTitle>
          <DialogDescription>{DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC.version} · {DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC.endpoint}</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Especificação Técnica do Web Service DECRED"
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${styles.dialogButton} ${styles.primaryButton}`}
                disabled={busy}
                onClick={() => void onSimulateBatch()}
              >
                <CheckCircle2 />
                {busy ? "Recepcionando..." : "Simular Recepção Lote WebService (29.7)"}
              </button>
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Fechar
              </button>
            </div>
          }
        >
          <div className="grid gap-3 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
              <p className="font-bold text-slate-900">Critérios Técnicos Obrigatórios para Utilização do Web Service (29.7):</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC.technicalCriteria.map((crit) => (
                  <li key={crit}>{crit}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-700">Estrutura do Layout Padrão (Campos Obrigatórios):</p>
              <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
                {JSON.stringify(DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC, null, 2)}
              </pre>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

export function DecredClient(props: Props) {
  const [equipments, setEquipments] = useState(props.initialEquipments);
  const [terms, setTerms] = useState(props.initialTerms);
  const [declarations, setDeclarations] = useState(props.initialDeclarations);
  const [reportByNatureza, setReportByNatureza] = useState(props.initialReportByNatureza);
  const [reportEquipments, setReportEquipments] = useState(props.initialReportEquipments);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyState(state: any) {
    if (!state) return;
    if (state.equipments) setEquipments(state.equipments);
    if (state.terms) setTerms(state.terms);
    if (state.declarations) setDeclarations(state.declarations);
    if (state.reportByNatureza) setReportByNatureza(state.reportByNatureza);
    if (state.reportEquipments) setReportEquipments(state.reportEquipments);
  }

  async function handleGenerateDam(declarationId: string) {
    setBusyId(declarationId);
    setFeedback(null);
    try {
      const res = await fetch("/api/tributacao/decred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "GENERATE_DAM", declarationId }),
      });
      const data = await res.json();
      if (data.state) applyState(data.state);
      if (data.dam) {
        setFeedback(`DAM ${data.dam.damNumber} emitido com sucesso! Linha digitável: ${data.dam.linhaDigitavel48}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleSimulateWebServiceReception() {
    setBusyId("WS");
    setFeedback(null);
    try {
      const res = await fetch("/api/tributacao/declaracao-cartoes/webservice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia: "11/2026",
          administradoraNome: "Stone Instituição de Pagamento S.A.",
          administradoraCnpj: "16.501.555/0001-57",
          naturezaOperacao: "CREDITO_A_VISTA",
        }),
      });
      const data = await res.json();
      if (data.state) applyState(data.state);
      if (data.protocoloRecepcao) {
        setFeedback(
          `Lote recepcionado via Web Service (29.7): Protocolo ${data.protocoloRecepcao} com DAM ${data.dam?.damNumber} gerado automaticamente.`,
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptTerm() {
    setBusyId("TERM");
    setFeedback(null);
    try {
      const res = await fetch("/api/tributacao/decred", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT_TERM",
          credenciadoLogin: "credenciado.operadora@municipio.gov.br",
          credenciadoNome: "Responsável Credenciado homologado na Sessão",
          credenciadoCpfCnpj: "14.582.900/0001-42",
          inscricaoMunicipal: "IM-44510",
          accepted: true,
        }),
      });
      const data = await res.json();
      if (data.state) applyState(data.state);
      setFeedback("Termo de Responsabilidade (Requisito 29.3) aceito e registrado com auditoria!");
    } finally {
      setBusyId(null);
    }
  }

  const tabHref = (tab: ActiveTab) => {
    const query = new URLSearchParams();
    if (tab !== "equipamentos") query.set("aba", tab);
    return `${pathname}${query.size ? `?${query}` : ""}`;
  };

  const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
  let activeColumns: readonly OperationalColumn[] = equipmentColumns;
  let rows: OperationalRow[] = [];
  let total = equipments.length;
  let preferenceId = "cf29-decred-equipments";
  let caption = "Cadastro, Consulta e Edição de Equipamentos POS/TEF por PF ou Inscrição Municipal (Requisito 29.1)";

  if (props.activeTab === "declaracoes") {
    activeColumns = declarationColumns;
    total = declarations.length;
    preferenceId = "cf29-decred-declarations";
    caption = "Declarações de Movimentação das Administradoras (29.4), Emissão de DAM (29.5) e Recepção WebService (29.7)";
    rows = declarations.slice(start, start + OPERATIONAL_PAGE_SIZE).map((decl) => ({
      id: decl.id,
      label: `${decl.protocoloRecepcao} · ${decl.administradoraNome}`,
      values: {
        id: `${decl.protocoloRecepcao} (${decl.competencia})`,
        admin: `${decl.administradoraNome} · Resp.: ${decl.responsavelNome}`,
        natureza: `${decl.naturezaOperacaoLabel} · Term.: ${decl.terminalNumber}`,
        totalOps: money(decl.valorTotalOperacoes),
        servico: money(decl.valorPrestacaoServico),
        iss: decl.damGerado
          ? `${money(decl.valorIssDevido)} (${decl.damGerado.damNumber})`
          : `${money(decl.valorIssDevido)} (Pendente DAM)`,
      },
      actions: (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            className={`${styles.dialogButton} ${styles.primaryButton}`}
            disabled={busyId === decl.id}
            onClick={() => void handleGenerateDam(decl.id)}
            title="Emitir/Visualizar DAM para pagamento dos serviços da administradora (Requisito 29.5)"
          >
            <Receipt />
            DAM (29.5)
          </button>
          <DeclarationAndDamDialog declaration={decl} onGenerateDam={handleGenerateDam} busyId={busyId} />
        </div>
      ),
    }));
  } else if (props.activeTab === "relatorio-natureza") {
    activeColumns = naturezaReportColumns;
    total = reportByNatureza.length;
    preferenceId = "cf29-decred-report-natureza";
    caption = "Relatório de Gestão da Fiscalização — Toda a Movimentação Declarada por Natureza de Operação (Requisito 29.8)";
    rows = reportByNatureza.map((r) => ({
      id: r.naturezaOperacao,
      label: r.naturezaLabel,
      values: {
        code: r.naturezaOperacao,
        label: r.naturezaLabel,
        decls: String(r.quantidadeDeclaracoes),
        txs: r.quantidadeTransacoesAutorizadas.toLocaleString("pt-BR"),
        gross: money(r.valorTotalOperacoes),
        service: money(r.valorTotalPrestacaoServico),
        iss: money(r.valorTotalIssApurado),
      },
    }));
  } else if (props.activeTab === "relatorio-equipamentos") {
    activeColumns = equipmentFiscalReportColumns;
    total = reportEquipments.length;
    preferenceId = "cf29-decred-report-equipments";
    caption = "Relatório de Gestão da Fiscalização — Todos os Equipamentos Cadastrados (Requisito 29.9)";
    rows = reportEquipments.slice(start, start + OPERATIONAL_PAGE_SIZE).map((eq) => ({
      id: eq.id,
      label: `${eq.terminalNumber} · ${eq.contribuinteNome}`,
      values: {
        terminal: eq.terminalNumber,
        serial: `${eq.serialNumber} (${eq.equipmentModel})`,
        contribuinte: `${eq.inscricaoMunicipal} · ${eq.contribuinteNome} (${eq.contribuinteCpfCnpj})`,
        admin: `${eq.administradoraNome} (${eq.administradoraCnpj})`,
        movimento: money(eq.totalMovimentadoNoEquipamento),
        servico: money(eq.totalTaxaServicoNoEquipamento),
      },
    }));
  } else if (props.activeTab === "termo") {
    activeColumns = termColumns;
    total = terms.length;
    preferenceId = "cf29-decred-terms";
    caption = "Registro de Aceite Obrigatório dos Termos de Responsabilidade pelos Usuários Credenciados (Requisito 29.3)";
    rows = terms.slice(start, start + OPERATIONAL_PAGE_SIZE).map((t) => ({
      id: t.id,
      label: `${t.credenciadoNome} · ${t.credenciadoCpfCnpj}`,
      values: {
        id: t.id,
        credenciado: `${t.credenciadoNome} (${t.credenciadoLogin})`,
        doc: `${t.credenciadoCpfCnpj} · ${t.inscricaoMunicipal}`,
        acceptedAt: new Date(t.acceptedAt).toLocaleString("pt-BR"),
        status: "Aceito e Vigente (Versão " + t.termVersion + ")",
      },
    }));
  } else {
    rows = equipments.slice(start, start + OPERATIONAL_PAGE_SIZE).map((eq) => ({
      id: eq.id,
      label: `${eq.terminalNumber} · ${eq.contribuinteNome}`,
      values: {
        terminal: eq.terminalNumber,
        model: `${eq.equipmentModel} · ${eq.ownershipType}`,
        contribuinte: `${eq.inscricaoMunicipal} · ${eq.contribuinteNome} (${eq.contribuinteCpfCnpj})`,
        administradora: `${eq.administradoraNome} (${eq.administradoraCnpj})`,
        status: eq.status,
      },
      actions: (
        <div className="flex items-center justify-end">
          <EquipmentUpsertDialog existing={eq} onSaved={applyState} />
        </div>
      ),
    }));
  }

  return (
    <OperationalListFrame
      label="Declaração das Informações das Administradoras de Cartões — DECRED (CF29)"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <EquipmentUpsertDialog onSaved={applyState} />
          <NewDeclarationDialog onSaved={applyState} />
          <WebServiceSpecDialog onSimulateBatch={handleSimulateWebServiceReception} busy={busyId === "WS"} />
          <button
            type="button"
            className={styles.dialogButton}
            disabled={busyId === "TERM"}
            onClick={() => void handleAcceptTerm()}
            title="Registrar aceite do Termo de Responsabilidade (Requisito 29.3)"
          >
            <ShieldCheck />
            Aceitar Termo (29.3)
          </button>
          <Link href="/tributacao/declaracao-cartoes" className={styles.dialogButton}>
            <FileText />
            Legislação & Conta Corrente (29.2 / 29.6)
          </Link>
        </div>
      }
      toolbar={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <nav aria-label="Visões do Módulo DECRED (CF29)" className="flex flex-wrap items-center gap-1.5">
            <Link
              href={tabHref("equipamentos")}
              scroll={false}
              aria-current={props.activeTab === "equipamentos" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeTab === "equipamentos" ? styles.primaryButton : ""}`}
            >
              Equipamentos POS/TEF — 29.1 ({equipments.length})
            </Link>
            <Link
              href={tabHref("declaracoes")}
              scroll={false}
              aria-current={props.activeTab === "declaracoes" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeTab === "declaracoes" ? styles.primaryButton : ""}`}
            >
              Declarações, DAM & WebService — 29.4 / 29.5 / 29.7 ({declarations.length})
            </Link>
            <Link
              href={tabHref("relatorio-natureza")}
              scroll={false}
              aria-current={props.activeTab === "relatorio-natureza" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeTab === "relatorio-natureza" ? styles.primaryButton : ""}`}
            >
              Relatório Fiscal por Natureza — 29.8
            </Link>
            <Link
              href={tabHref("relatorio-equipamentos")}
              scroll={false}
              aria-current={props.activeTab === "relatorio-equipamentos" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeTab === "relatorio-equipamentos" ? styles.primaryButton : ""}`}
            >
              Relatório Fiscal Equipamentos — 29.9 ({reportEquipments.length})
            </Link>
            <Link
              href={tabHref("termo")}
              scroll={false}
              aria-current={props.activeTab === "termo" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeTab === "termo" ? styles.primaryButton : ""}`}
            >
              Termos de Responsabilidade — 29.3 ({terms.length})
            </Link>
          </nav>
          {feedback && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
              {feedback}
            </span>
          )}
        </div>
      }
      pagination={
        <OperationalLinkPagination
          pathname={pathname}
          values={{
            aba: props.activeTab !== "equipamentos" ? props.activeTab : undefined,
          }}
          pageParam="page"
          page={props.page}
          total={total}
        />
      }
    >
      <OperationalTable
        columns={activeColumns}
        rows={rows}
        preferenceId={preferenceId}
        caption={caption}
        emptyMessage="Nenhum registro encontrado para a visão selecionada."
      />
    </OperationalListFrame>
  );
}

