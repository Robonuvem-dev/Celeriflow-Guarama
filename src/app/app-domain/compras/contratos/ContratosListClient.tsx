"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, FileDiff, FileText, Plus, Save, Trash2, Users } from "lucide-react";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ComprasOperationalList, comprasOptions } from "../_components/ComprasOperationalList";
import { comprasColumn as column } from "../_components/columns";
import ContratoRowActions from "./ContratoRowActions";
import { updateContractResponsibles } from "./actions";
import {
  deleteInstrumentParty,
  deleteInstrumentResponsibilityGroup,
  saveInstrumentParty,
  saveInstrumentResponsibilityGroup,
} from "./instrument-actions";

export type ContractSupplierModalDetails = {
  id: string;
  type: "PF" | "PJ" | "Não informado";
  name: string;
  tradeName: string;
  document: string;
  companyType: string;
  category: string;
  businessBranch: string;
  primaryCnae: string;
  secondaryCnaes: string;
  certificationsValidUntil: string | null;
  bankData: string;
  status: string;
  notes: string;
};

export type ContractAmendmentModalItem = {
  id: string;
  type: string;
  justification: string;
  previousValue: number | null;
  newValue: number | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  status: string;
  createdAt: string;
};

export type ContractGroupModalItem = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
};

export type ContractPartyModalItem = {
  id: string;
  role: string;
  identityLabel: string;
  partyValue: string;
  responsibilityGroupId: string | null;
  responsibilityGroupName: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type ContractQuickEditSelectors = {
  employees: { id: string; name: string; registration: string | null; roleName: string | null }[];
  people: { id: string; fullName: string }[];
  companies: { id: string; corporateName: string; tradeName: string | null }[];
  suppliers: { id: string; label: string }[];
};

export type ContractRow = {
  id: string;
  number: string;
  supplierId?: string;
  supplierName: string;
  supplierDetails?: ContractSupplierModalDetails;
  processNumber?: string;
  object: string;
  secretariatName: string;
  budgetUnitLabel: string;
  startDate: string;
  endDate: string;
  termDays: number;
  initialValue?: number;
  updatedValue: number;
  amendmentCount: number;
  status: string;
  managerId?: string | null;
  inspectorId?: string | null;
  managerName?: string | null;
  inspectorName?: string | null;
  amendments?: ContractAmendmentModalItem[];
  responsibilityGroups?: ContractGroupModalItem[];
  instrumentParties?: ContractPartyModalItem[];
};

const columns = [
  column("number", "Contrato", 96, 120, "identifier"),
  column("supplier", "Fornecedor", 140, 190),
  column("object", "Objeto", 150, 220),
  column("secretariat", "Secretaria", 110, 145),
  column("ug", "UG", 115, 155),
  column("term", "Vigência", 125, 165),
  column("value", "Valor atual", 100, 125, "text", "right"),
  column("amendments", "Aditivos", 86, 105),
  column("status", "Situação", 88, 105, "status"),
  column("actions", "Ações", 160, 185, "actions", "right"),
];

const ROLE_OPTIONS = [
  "Responsável",
  "Representante",
  "Representante Legal",
  "Signatário",
  "Gestor",
  "Fiscal Técnico",
  "Fiscal Administrativo",
  "Preposto",
];

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function datePt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function makeClientKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
  }
  return `key_${Date.now()}_${Math.random().toString(36).slice(2, 12)}00000000`;
}

export function ContratosListClient({
  contracts,
  selectors,
}: {
  contracts: ContractRow[];
  selectors?: ContractQuickEditSelectors;
}) {
  const router = useRouter();
  const { device } = useOperationalWorkspace();

  const contractTrigger = useRef<HTMLButtonElement | null>(null);
  const amendmentTrigger = useRef<HTMLButtonElement | null>(null);
  const supplierTrigger = useRef<HTMLButtonElement | null>(null);
  const quickEditTrigger = useRef<HTMLButtonElement | null>(null);

  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);
  const [amendmentsContract, setAmendmentsContract] = useState<ContractRow | null>(null);
  const [supplierContract, setSupplierContract] = useState<ContractRow | null>(null);
  const [quickEditContractId, setQuickEditContractId] = useState<string | null>(null);
  const [quickEditTab, setQuickEditTab] = useState<"responsaveis" | "grupos" | "partes">(
    "responsaveis",
  );
  const [quickError, setQuickError] = useState("");
  const [quickSuccess, setQuickSuccess] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  const [editingPartyId, setEditingPartyId] = useState("");
  const [partyRole, setPartyRole] = useState("Signatário");
  const [partyValue, setPartyValue] = useState("");
  const [partyGroupId, setPartyGroupId] = useState("");
  const [partyStartDate, setPartyStartDate] = useState("");
  const [partyEndDate, setPartyEndDate] = useState("");
  const [partyNotes, setPartyNotes] = useState("");

  const quickEditContract =
    contracts.find((item) => item.id === quickEditContractId) ?? null;

  function openQuickEdit(contract: ContractRow, trigger: HTMLButtonElement) {
    quickEditTrigger.current = trigger;
    setQuickEditContractId(contract.id);
    setQuickEditTab("responsaveis");
    setQuickError("");
    setQuickSuccess("");
    setEditingGroupId("");
    setGroupName("");
    setGroupDesc("");
    setEditingPartyId("");
    setPartyRole("Signatário");
    setPartyValue("");
    setPartyGroupId("");
    setPartyStartDate("");
    setPartyEndDate("");
    setPartyNotes("");
  }

  async function handleSaveResponsibles(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quickEditContract) return;
    setQuickBusy(true);
    setQuickError("");
    setQuickSuccess("");
    const formData = new FormData(e.currentTarget);
    formData.set("contractId", quickEditContract.id);
    formData.set("idempotencyKey", makeClientKey());
    const res = await updateContractResponsibles(formData);
    setQuickBusy(false);
    if (!res.success) {
      setQuickError(res.error);
      return;
    }
    setQuickSuccess("Responsáveis pelo contrato atualizados com sucesso.");
    router.refresh();
  }

  async function handleSaveGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quickEditContract) return;
    setQuickBusy(true);
    setQuickError("");
    setQuickSuccess("");
    const formData = new FormData();
    formData.set("instrumentType", "CONTRACT");
    formData.set("instrumentId", quickEditContract.id);
    if (editingGroupId) formData.set("groupId", editingGroupId);
    formData.set("name", groupName);
    formData.set("description", groupDesc);
    formData.set("idempotencyKey", makeClientKey());
    const res = await saveInstrumentResponsibilityGroup(formData);
    setQuickBusy(false);
    if (!res.success) {
      setQuickError(res.error);
      return;
    }
    setEditingGroupId("");
    setGroupName("");
    setGroupDesc("");
    setQuickSuccess("Agrupamento de responsáveis salvo com sucesso.");
    router.refresh();
  }

  async function handleDeleteGroup(groupId: string) {
    if (!quickEditContract) return;
    if (!confirm("Deseja remover este agrupamento de responsáveis?")) return;
    setQuickBusy(true);
    setQuickError("");
    setQuickSuccess("");
    const formData = new FormData();
    formData.set("instrumentType", "CONTRACT");
    formData.set("instrumentId", quickEditContract.id);
    formData.set("groupId", groupId);
    formData.set("idempotencyKey", makeClientKey());
    const res = await deleteInstrumentResponsibilityGroup(formData);
    setQuickBusy(false);
    if (!res.success) {
      setQuickError(res.error);
      return;
    }
    setQuickSuccess("Agrupamento removido.");
    router.refresh();
  }

  async function handleSaveParty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quickEditContract) return;
    setQuickBusy(true);
    setQuickError("");
    setQuickSuccess("");
    const formData = new FormData();
    formData.set("instrumentType", "CONTRACT");
    formData.set("instrumentId", quickEditContract.id);
    if (editingPartyId) formData.set("partyId", editingPartyId);
    formData.set("role", partyRole);
    formData.set("partyReference", partyValue);
    formData.set("responsibilityGroupId", partyGroupId);
    formData.set("activeFrom", partyStartDate);
    formData.set("activeTo", partyEndDate);
    formData.set("notes", partyNotes);
    formData.set("idempotencyKey", makeClientKey());
    const res = await saveInstrumentParty(formData);
    setQuickBusy(false);
    if (!res.success) {
      setQuickError(res.error);
      return;
    }
    setEditingPartyId("");
    setPartyValue("");
    setPartyNotes("");
    setQuickSuccess("Responsável / representante / signatário salvo com sucesso.");
    router.refresh();
  }

  async function handleDeleteParty(partyId: string) {
    if (!quickEditContract) return;
    if (!confirm("Deseja remover este vínculo do contrato?")) return;
    setQuickBusy(true);
    setQuickError("");
    setQuickSuccess("");
    const formData = new FormData();
    formData.set("instrumentType", "CONTRACT");
    formData.set("instrumentId", quickEditContract.id);
    formData.set("partyId", partyId);
    formData.set("idempotencyKey", makeClientKey());
    const res = await deleteInstrumentParty(formData);
    setQuickBusy(false);
    if (!res.success) {
      setQuickError(res.error);
      return;
    }
    setQuickSuccess("Vínculo removido.");
    router.refresh();
  }

  return (
    <>
      <ComprasOperationalList
        label="Gestão de Contratos"
        preferenceId="compras-contratos"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/compras/convenios"
              className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Convênios e Parcerias
            </Link>
            <Link
              href="/compras/contratos/novo"
              className="inline-flex h-8 items-center gap-1 rounded bg-[#0e4c7e] px-2.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
            >
              <Plus className="size-3.5" />
              Novo Contrato
            </Link>
          </div>
        }
        columns={columns}
        filters={[
          {
            key: "number",
            label: "Número do contrato",
            options: comprasOptions(contracts.map((row) => row.number)),
          },
          {
            key: "supplier",
            label: "Fornecedor",
            options: comprasOptions(contracts.map((row) => row.supplierName)),
          },
          {
            key: "status",
            label: "Situação",
            options: comprasOptions(contracts.map((row) => row.status)),
          },
        ]}
        rows={contracts.map((contract) => ({
          id: contract.id,
          label: `Contrato ${contract.number}`,
          search: `${contract.number} ${contract.supplierName} ${contract.object} ${contract.secretariatName} ${contract.budgetUnitLabel} ${contract.status}`,
          filters: {
            number: contract.number,
            supplier: contract.supplierName,
            status: contract.status,
          },
          values: {
            number: contract.number,
            supplier: contract.supplierName,
            object: contract.object,
            secretariat: contract.secretariatName,
            ug: contract.budgetUnitLabel,
            term: `${datePt(contract.startDate)} até ${datePt(contract.endDate)} (${contract.termDays} dia(s))`,
            value: money(contract.updatedValue),
            amendments: `${contract.amendmentCount} aditivo(s)`,
            status: contract.status,
          },
          cells: {
            number: (
              <button
                type="button"
                onClick={(event) => {
                  contractTrigger.current = event.currentTarget;
                  setSelectedContract(contract);
                }}
                className="text-left font-semibold text-[#0e4c7e] underline-offset-2 hover:underline"
                title={`Consultar dados do Contrato Nº ${contract.number}`}
              >
                {contract.number}
              </button>
            ),
            supplier: (
              <button
                type="button"
                onClick={(event) => {
                  supplierTrigger.current = event.currentTarget;
                  setSupplierContract(contract);
                }}
                className="text-left font-semibold text-[#0e4c7e] underline-offset-2 hover:underline"
                title={`Consultar dados cadastrais de ${contract.supplierName}`}
              >
                {contract.supplierName}
              </button>
            ),
            amendments: (
              <button
                type="button"
                onClick={(event) => {
                  amendmentTrigger.current = event.currentTarget;
                  setAmendmentsContract(contract);
                }}
                className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50/70 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                title={`Ver aditivos do Contrato Nº ${contract.number}`}
              >
                <FileDiff className="size-3.5" />
                {contract.amendmentCount} aditivo(s)
              </button>
            ),
          },
          actions: (
            <ContratoRowActions
              id={contract.id}
              number={contract.number}
              onQuickEdit={(trigger) => openQuickEdit(contract, trigger)}
            />
          ),
        }))}
      />

      {/* 1. Modal de Detalhes do Contrato */}
      <Dialog
        open={!!selectedContract}
        onOpenChange={(open) => {
          if (!open) setSelectedContract(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() =>
            contractTrigger.current?.isConnected ? contractTrigger.current : true
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4 text-indigo-600" />
              Contrato Nº {selectedContract?.number}
            </DialogTitle>
            <DialogDescription>
              Situação: {selectedContract?.status} • Processo:{" "}
              {selectedContract?.processNumber || "Vinculado"}
            </DialogDescription>
          </DialogHeader>
          {selectedContract ? (
            <div className="grid grid-cols-1 gap-2.5 text-[13px] text-slate-700 sm:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50/70 p-2.5 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Objeto do Contrato
                </span>
                <p className="mt-0.5 font-medium text-slate-900">{selectedContract.object}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Fornecedor Contratado
                </span>
                <span className="font-semibold text-slate-900">
                  {selectedContract.supplierName}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Secretaria / Unidade Gestora
                </span>
                <span className="text-slate-900">
                  {selectedContract.secretariatName} ({selectedContract.budgetUnitLabel})
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Vigência Contratual
                </span>
                <span className="text-slate-900">
                  {datePt(selectedContract.startDate)} até {datePt(selectedContract.endDate)} (
                  {selectedContract.termDays} dia(s))
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Valor Inicial / Valor Atualizado
                </span>
                <span className="font-semibold text-emerald-700">
                  {money(selectedContract.initialValue ?? selectedContract.updatedValue)} →{" "}
                  {money(selectedContract.updatedValue)}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Gestor / Fiscal Designados
                </span>
                <span className="text-slate-900">
                  Gestor: {selectedContract.managerName || "Não designado"} • Fiscal:{" "}
                  {selectedContract.inspectorName || "Não designado"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Aditivos e Partes Vinculadas
                </span>
                <span className="text-slate-900">
                  {selectedContract.amendmentCount} aditivo(s) •{" "}
                  {selectedContract.instrumentParties?.length ?? 0} parte(s)/signatário(s)
                </span>
              </div>
            </div>
          ) : null}
          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              {selectedContract ? (
                <Link
                  href={`/compras/contratos/${encodeURIComponent(selectedContract.id)}`}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0e4c7e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
                >
                  <ExternalLink className="size-3.5" />
                  Mais informações
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setSelectedContract(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Modal de Aditivos do Contrato */}
      <Dialog
        open={!!amendmentsContract}
        onOpenChange={(open) => {
          if (!open) setAmendmentsContract(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() =>
            amendmentTrigger.current?.isConnected ? amendmentTrigger.current : true
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDiff className="size-4 text-indigo-600" />
              Aditivos do Contrato Nº {amendmentsContract?.number}
            </DialogTitle>
            <DialogDescription>
              Fornecedor: {amendmentsContract?.supplierName} • Valor Atual:{" "}
              {amendmentsContract ? money(amendmentsContract.updatedValue) : ""}
            </DialogDescription>
          </DialogHeader>
          {amendmentsContract ? (
            <div className="max-h-80 space-y-2 overflow-y-auto text-[13px] text-slate-700">
              {!amendmentsContract.amendments || amendmentsContract.amendments.length === 0 ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Nenhum termo aditivo, apostilamento ou ato contratual registrado para o Contrato
                  Nº {amendmentsContract.number}.
                </div>
              ) : (
                amendmentsContract.amendments.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded border border-slate-200 bg-white p-2.5 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                      <span className="font-semibold text-indigo-900">
                        #{idx + 1} • {item.type}
                      </span>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {item.status} ({datePt(item.createdAt)})
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-700">
                      <span className="font-semibold">Justificativa:</span> {item.justification}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-600">
                      {item.newValue !== null ? (
                        <span>
                          <strong>Valor:</strong>{" "}
                          {item.previousValue !== null ? money(item.previousValue) : "—"} →{" "}
                          <strong className="text-emerald-700">{money(item.newValue)}</strong>
                        </span>
                      ) : null}
                      {item.newEndDate ? (
                        <span>
                          <strong>Vigência final:</strong> {datePt(item.previousEndDate)} →{" "}
                          <strong className="text-indigo-700">{datePt(item.newEndDate)}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              {amendmentsContract ? (
                <Link
                  href={`/compras/contratos/${encodeURIComponent(amendmentsContract.id)}`}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0e4c7e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
                >
                  <ExternalLink className="size-3.5" />
                  Gerenciar aditivos no contrato
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setAmendmentsContract(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Modal de Dados Cadastrais do Fornecedor */}
      <Dialog
        open={!!supplierContract}
        onOpenChange={(open) => {
          if (!open) setSupplierContract(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() =>
            supplierTrigger.current?.isConnected ? supplierTrigger.current : true
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-fuchsia-600" />
              Dados Cadastrais do Fornecedor
            </DialogTitle>
            <DialogDescription>
              {supplierContract?.supplierDetails?.name || supplierContract?.supplierName} (Contrato
              Nº {supplierContract?.number})
            </DialogDescription>
          </DialogHeader>
          {supplierContract ? (
            <div className="grid grid-cols-1 gap-2.5 text-[13px] text-slate-700 sm:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50/70 p-2.5 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Razão Social / Nome Completo
                </span>
                <span className="font-semibold text-slate-900">
                  {supplierContract.supplierDetails?.name || supplierContract.supplierName}
                </span>
                {supplierContract.supplierDetails?.type === "PJ" ? (
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Nome Fantasia: {supplierContract.supplierDetails.tradeName}
                  </span>
                ) : null}
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Natureza / Documento
                </span>
                <span className="font-mono font-medium text-slate-900">
                  {supplierContract.supplierDetails?.type || "PJ"} •{" "}
                  {supplierContract.supplierDetails?.document || "Não informado"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Situação / Enquadramento
                </span>
                <span className="text-slate-900">
                  {supplierContract.supplierDetails?.status || "Ativo"} •{" "}
                  {supplierContract.supplierDetails?.companyType || "Não informado"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Categoria / Ramo de Atividade
                </span>
                <span className="text-slate-900">
                  {supplierContract.supplierDetails?.category || "—"} /{" "}
                  {supplierContract.supplierDetails?.businessBranch || "—"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Validade das Certidões
                </span>
                <span className="text-slate-900">
                  {supplierContract.supplierDetails?.certificationsValidUntil
                    ? datePt(supplierContract.supplierDetails.certificationsValidUntil)
                    : "Não informada"}
                </span>
              </div>
              {supplierContract.supplierDetails?.type === "PJ" ? (
                <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase text-slate-500">
                    CNAE Principal e Secundários
                  </span>
                  <span className="block text-slate-900">
                    Principal: {supplierContract.supplierDetails.primaryCnae || "Não informado"}
                  </span>
                  <span className="block text-xs text-slate-600">
                    Secundários:{" "}
                    {supplierContract.supplierDetails.secondaryCnaes || "Não informados"}
                  </span>
                </div>
              ) : null}
              <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Dados Bancários e Observações
                </span>
                <span className="block text-slate-900">
                  Banco: {supplierContract.supplierDetails?.bankData || "Não informado"}
                </span>
                <span className="block text-xs text-slate-600">
                  Observações: {supplierContract.supplierDetails?.notes || "Sem observações"}
                </span>
              </div>
            </div>
          ) : null}
          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              {supplierContract?.supplierId ? (
                <Link
                  href={`/cadastros/fornecedores/${encodeURIComponent(supplierContract.supplierId)}`}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0e4c7e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
                >
                  <ExternalLink className="size-3.5" />
                  Mais detalhes
                </Link>
              ) : (
                <Link
                  href="/cadastros/fornecedores"
                  className="inline-flex items-center gap-1.5 rounded bg-[#0e4c7e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
                >
                  <ExternalLink className="size-3.5" />
                  Mais detalhes
                </Link>
              )}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setSupplierContract(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Modal de Edição Rápida: Responsáveis, Representantes, Signatários e Agrupamentos */}
      <Dialog
        open={!!quickEditContract}
        onOpenChange={(open) => {
          if (!open) setQuickEditContractId(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() =>
            quickEditTrigger.current?.isConnected ? quickEditTrigger.current : true
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-4 text-indigo-600" />
              Edição Rápida — Contrato Nº {quickEditContract?.number}
            </DialogTitle>
            <DialogDescription>
              Cadastro de responsáveis pelo contrato, representantes, signatários e agrupamento dos
              responsáveis.
            </DialogDescription>
          </DialogHeader>

          {quickError ? (
            <div
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"
            >
              {quickError}
            </div>
          ) : null}
          {quickSuccess ? (
            <div
              role="status"
              className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700"
            >
              {quickSuccess}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setQuickEditTab("responsaveis")}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                quickEditTab === "responsaveis"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              1. Responsáveis (Gestor/Fiscal)
            </button>
            <button
              type="button"
              onClick={() => setQuickEditTab("grupos")}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                quickEditTab === "grupos"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              2. Agrupamento dos Responsáveis (
              {quickEditContract?.responsibilityGroups?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setQuickEditTab("partes")}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                quickEditTab === "partes"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              3. Representantes e Signatários (
              {quickEditContract?.instrumentParties?.length ?? 0})
            </button>
          </div>

          {quickEditContract && quickEditTab === "responsaveis" ? (
            <form onSubmit={handleSaveResponsibles} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Gestor do Contrato
                  </label>
                  <select
                    name="managerId"
                    defaultValue={quickEditContract.managerId ?? ""}
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                  >
                    <option value="">Não designado</option>
                    {(selectors?.employees ?? []).map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                        {emp.registration ? ` • Mat. ${emp.registration}` : ""}
                        {emp.roleName ? ` (${emp.roleName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Fiscal do Contrato
                  </label>
                  <select
                    name="inspectorId"
                    defaultValue={quickEditContract.inspectorId ?? ""}
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                  >
                    <option value="">Não designado</option>
                    {(selectors?.employees ?? []).map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                        {emp.registration ? ` • Mat. ${emp.registration}` : ""}
                        {emp.roleName ? ` (${emp.roleName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={quickBusy}
                  className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  Salvar Responsáveis
                </button>
              </div>
            </form>
          ) : null}

          {quickEditContract && quickEditTab === "grupos" ? (
            <div className="space-y-3 text-xs">
              <form
                onSubmit={handleSaveGroup}
                className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-3"
              >
                <div>
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Nome do Agrupamento *
                  </label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ex: Comissão Fiscalizadora"
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Descrição / Atribuição
                  </label>
                  <input
                    type="text"
                    value={groupDesc}
                    onChange={(e) => setGroupDesc(e.target.value)}
                    placeholder="Ex: Signatários e Fiscais"
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  />
                </div>
                <div className="flex items-end gap-1.5">
                  <button
                    type="submit"
                    disabled={quickBusy}
                    className="inline-flex h-8 items-center gap-1 rounded bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    {editingGroupId ? "Atualizar" : "Criar Grupo"}
                  </button>
                  {editingGroupId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroupId("");
                        setGroupName("");
                        setGroupDesc("");
                      }}
                      className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {(quickEditContract.responsibilityGroups ?? []).length === 0 ? (
                  <p className="text-slate-500">
                    Nenhum agrupamento de responsáveis cadastrado para este contrato.
                  </p>
                ) : (
                  (quickEditContract.responsibilityGroups ?? []).map((grp) => (
                    <div
                      key={grp.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{grp.name}</span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          ({grp.memberCount} integrante(s))
                        </span>
                        {grp.description ? (
                          <p className="text-[11px] text-slate-600">{grp.description}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroupId(grp.id);
                            setGroupName(grp.name);
                            setGroupDesc(grp.description ?? "");
                          }}
                          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(grp.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Excluir grupo"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {quickEditContract && quickEditTab === "partes" ? (
            <div className="space-y-3 text-xs">
              <form
                onSubmit={handleSaveParty}
                className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-2"
              >
                <div>
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Papel (Responsável / Representante / Signatário) *
                  </label>
                  <select
                    value={partyRole}
                    onChange={(e) => setPartyRole(e.target.value)}
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Agrupamento de Responsáveis
                  </label>
                  <select
                    value={partyGroupId}
                    onChange={(e) => setPartyGroupId(e.target.value)}
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  >
                    <option value="">Sem agrupamento</option>
                    {(quickEditContract.responsibilityGroups ?? []).map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Identidade Cadastrada *
                  </label>
                  <select
                    required
                    value={partyValue}
                    onChange={(e) => setPartyValue(e.target.value)}
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  >
                    <option value="">Selecione servidor, pessoa física, empresa ou fornecedor...</option>
                    <optgroup label="Servidores">
                      {(selectors?.employees ?? []).map((emp) => (
                        <option key={`EMPLOYEE:${emp.id}`} value={`EMPLOYEE:${emp.id}`}>
                          Servidor: {emp.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Pessoas Físicas (Representantes / Signatários)">
                      {(selectors?.people ?? []).map((p) => (
                        <option key={`PERSON:${p.id}`} value={`PERSON:${p.id}`}>
                          Pessoa Física: {p.fullName}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Pessoas Jurídicas">
                      {(selectors?.companies ?? []).map((c) => (
                        <option key={`COMPANY:${c.id}`} value={`COMPANY:${c.id}`}>
                          PJ: {c.corporateName}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Fornecedores">
                      {(selectors?.suppliers ?? []).map((s) => (
                        <option key={`SUPPLIER:${s.id}`} value={`SUPPLIER:${s.id}`}>
                          Fornecedor: {s.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="mb-0.5 block font-semibold text-slate-700">
                    Observações / Portaria
                  </label>
                  <input
                    type="text"
                    value={partyNotes}
                    onChange={(e) => setPartyNotes(e.target.value)}
                    placeholder="Ato de designação ou procuração"
                    className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs"
                  />
                </div>

                <div className="flex items-end justify-end gap-1.5">
                  {editingPartyId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPartyId("");
                        setPartyValue("");
                        setPartyNotes("");
                      }}
                      className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
                    >
                      Cancelar
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={quickBusy}
                    className="inline-flex h-8 items-center gap-1 rounded bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    {editingPartyId ? "Atualizar Vínculo" : "Adicionar Vínculo"}
                  </button>
                </div>
              </form>

              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {(quickEditContract.instrumentParties ?? []).length === 0 ? (
                  <p className="text-slate-500">
                    Nenhum representante, signatário ou parte vinculada cadastrada.
                  </p>
                ) : (
                  (quickEditContract.instrumentParties ?? []).map((pty) => (
                    <div
                      key={pty.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <div>
                        <span className="font-semibold text-indigo-900">{pty.role}:</span>{" "}
                        <span className="font-medium text-slate-900">{pty.identityLabel}</span>
                        {pty.responsibilityGroupName ? (
                          <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                            {pty.responsibilityGroupName}
                          </span>
                        ) : null}
                        {pty.notes ? (
                          <p className="text-[11px] text-slate-500">{pty.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPartyId(pty.id);
                            setPartyRole(pty.role);
                            setPartyValue(pty.partyValue);
                            setPartyGroupId(pty.responsibilityGroupId ?? "");
                            setPartyNotes(pty.notes ?? "");
                          }}
                          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteParty(pty.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Excluir vínculo"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              {quickEditContract ? (
                <Link
                  href={`/compras/contratos/${encodeURIComponent(quickEditContract.id)}/editar`}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Abrir formulário completo de edição
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setQuickEditContractId(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
