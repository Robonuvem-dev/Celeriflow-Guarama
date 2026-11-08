"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { activateSupplier, deactivateSupplier, updateSupplier } from "../actions";
import { supplierRegularityLinks, unconfiguredSupplierRegularityLinks } from "./supplier-regularity";
import type { SupplierListItem } from "./supplier-types";
import { certificationStatus, dateInputValue, formatCnpj, formatCpf } from "./supplier-utils";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegistryEditDialog, registryColumns } from "../operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";

type SupplierEditForm = {
  category: string;
  businessBranch: string;
  certificationsValidUntil: string;
  bankData: string;
  notes: string;
  primaryCnae: string;
  secondaryCnaes: string;
};

const columns = registryColumns([
  ["name", "Fornecedor", 190, 110, "identifier"],
  ["identity", "PF/PJ", 55, 45],
  ["document", "CPF/CNPJ", 150, 105],
  ["representatives", "Representantes", 120, 90],
  ["biddings", "Licitações", 90, 70],
  ["category", "Categoria", 100, 70],
  ["branch", "Ramo de atividade", 125, 80],
  ["size", "ME/EPP", 70, 55],
  ["cnae", "CNAE principal", 105, 75],
  ["secondaryCnaes", "CNAEs secundários", 115, 80],
  ["bankData", "Dados Bancários", 140, 95],
  ["status", "Situação", 80, 65, "status"],
  ["certification", "Certidões", 110, 80],
  ["evidence", "Evidências", 125, 80],
  ["actions", "Ações", 96, 96, "actions"],
]);

function identityFor(supplier: SupplierListItem) {
  if (supplier.person) {
    return {
      type: "PF",
      name: supplier.person.fullName,
      tradeName: "—",
      document: supplier.person.cpf ? formatCpf(supplier.person.cpf) : "Não informado",
      documents: supplier.person.documents,
    };
  }
  if (supplier.company) {
    return {
      type: "PJ",
      name: supplier.company.corporateName,
      tradeName: supplier.company.tradeName || "—",
      document: formatCnpj(supplier.company.cnpj),
      documents: supplier.company.documents,
    };
  }
  return {
    type: "Não informado",
    name: "Identidade não informada",
    tradeName: "—",
    document: "—",
    documents: [],
  };
}

export default function FornecedoresClient({
  suppliers,
  canUpdate,
  hasFilters,
  referenceDate,
}: {
  suppliers: SupplierListItem[];
  canUpdate: boolean;
  hasFilters: boolean;
  referenceDate: string;
}) {
  const { device } = useOperationalWorkspace();
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const cadastralTrigger = useRef<HTMLButtonElement | null>(null);
  const repTrigger = useRef<HTMLButtonElement | null>(null);
  const biddingTrigger = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<SupplierListItem | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "numeric" | "bank" | "none">("none");
  const [details, setDetails] = useState<SupplierListItem | null>(null);
  const [cadastralSupplier, setCadastralSupplier] = useState<SupplierListItem | null>(null);
  const [repSupplier, setRepSupplier] = useState<SupplierListItem | null>(null);
  const [biddingSupplier, setBiddingSupplier] = useState<SupplierListItem | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [editPage, setEditPage] = useState(0);
  const [form, setForm] = useState<SupplierEditForm | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function edit(supplier: SupplierListItem) {
    setEditing(supplier);
    setError("");
    setEditPage(0);
    setForm({
      category: supplier.category || "",
      businessBranch: supplier.businessBranch || "",
      certificationsValidUntil: dateInputValue(supplier.certificationsValidUntil),
      bankData: supplier.bankData || "",
      notes: supplier.notes || "",
      primaryCnae: supplier.company?.primaryCnae || "",
      secondaryCnaes: supplier.company?.secondaryCnaes || "",
    });
  }

  function save() {
    if (!editing || !form || pending) return;
    startTransition(async () => {
      try {
        const result = await updateSupplier(editing.id, {
          category: form.category,
          businessBranch: form.businessBranch,
          certificationsValidUntil: form.certificationsValidUntil,
          bankData: form.bankData,
          notes: form.notes,
          ...(editing.company
            ? { primaryCnae: form.primaryCnae, secondaryCnaes: form.secondaryCnaes }
            : {}),
        });
        if (result.error) setError(result.error);
        else {
          setEditing(null);
          setForm(null);
        }
      } catch {
        setError("Não foi possível atualizar o fornecedor.");
      }
    });
  }

  function toggle(supplier: SupplierListItem) {
    if (
      !confirm(
        `Deseja realmente ${supplier.status === "Ativo" ? "inativar" : "reativar"} este registro?`,
      )
    )
      return;
    setError("");
    startTransition(async () => {
      try {
        const result =
          supplier.status === "Ativo"
            ? await deactivateSupplier(supplier.id)
            : await activateSupplier(supplier.id);
        if (result.error) setError(result.error);
      } catch {
        setError("Não foi possível alterar a situação do fornecedor.");
      }
    });
  }

  const queryLinks = [
    ...supplierRegularityLinks.map((link) => ({
      label: link.label,
      href: link.href,
      description: link.description,
    })),
    ...unconfiguredSupplierRegularityLinks.map((label) => ({
      label: `${label}: não configurado`,
      href: "",
      description: "O destino depende da jurisdição e não está configurado nesta base.",
    })),
  ];
  const queryPages = Math.max(1, Math.ceil(queryLinks.length / 4));
  const detailPages = 1 + queryPages;

  const sortedSuppliers = [...suppliers].sort((a, b) => {
    if (sortBy === "name") {
      return identityFor(a).name.localeCompare(identityFor(b).name);
    }
    if (sortBy === "numeric") {
      const docA = (a.company?.cnpj || a.person?.cpf || "").replace(/\D/g, "");
      const docB = (b.company?.cnpj || b.person?.cpf || "").replace(/\D/g, "");
      return docA.localeCompare(docB, undefined, { numeric: true });
    }
    if (sortBy === "bank") {
      return (a.bankData || "").localeCompare(b.bankData || "");
    }
    return 0;
  });
  const cadastralIdentity = cadastralSupplier ? identityFor(cadastralSupplier) : null;

  return (
    <>
      {error && !editing && (
        <p role="alert" className="text-[13px] text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md text-xs mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-slate-700">Ordenar listagem:</span>
          <button
            type="button"
            onClick={() => setSortBy(sortBy === "name" ? "none" : "name")}
            className={`px-2 py-0.5 rounded border transition-colors ${sortBy === "name" ? "bg-indigo-600 text-white border-indigo-600 font-bold" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`}
          >
            Alfabética (A-Z)
          </button>
          <button
            type="button"
            onClick={() => setSortBy(sortBy === "numeric" ? "none" : "numeric")}
            className={`px-2 py-0.5 rounded border transition-colors ${sortBy === "numeric" ? "bg-indigo-600 text-white border-indigo-600 font-bold" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`}
          >
            Numérica (CPF/CNPJ)
          </button>
          <button
            type="button"
            onClick={() => setSortBy(sortBy === "bank" ? "none" : "bank")}
            className={`px-2 py-0.5 rounded border transition-colors ${sortBy === "bank" ? "bg-indigo-600 text-white border-indigo-600 font-bold" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`}
          >
            Dados Bancários
          </button>
        </div>
        {sortBy !== "none" && (
          <button type="button" onClick={() => setSortBy("none")} className="text-slate-500 hover:text-slate-800 underline">
            Limpar ordenação
          </button>
        )}
      </div>
      <OperationalTable
        columns={columns}
        preferenceId="cadastros-fornecedores"
        caption="Fornecedores"
        emptyMessage={
          hasFilters
            ? "Nenhum fornecedor atende aos filtros informados."
            : "Nenhum fornecedor cadastrado."
        }
        rows={sortedSuppliers.map((supplier) => {
          const identity = identityFor(supplier);
          return {
            id: supplier.id,
            label: identity.name,
            values: {
              name: identity.name,
              identity: identity.type,
              document: identity.document,
              representatives: supplier.representatives.length ? `${supplier.representatives.length} representante(s)` : "Nenhum",
              biddings: supplier.activeBiddings.length ? `${supplier.activeBiddings.length} processo(s)` : "Nenhuma",
              category: supplier.category || "—",
              branch: supplier.businessBranch || "—",
              size: supplier.company
                ? supplier.company.companyType || "Não informado"
                : "Não se aplica a PF",
              cnae: supplier.company?.primaryCnae || "Não informado",
              secondaryCnaes: supplier.company?.secondaryCnaes || "Não informados",
              bankData: supplier.bankData || "Não informado",
              status: supplier.status,
              certification: certificationStatus(supplier.certificationsValidUntil, referenceDate)
                .label,
              evidence: identity.documents.length
                ? `${identity.documents.length} evidência(s)\n${identity.documents
                    .map(
                      (document) =>
                        `Título: ${document.title}; Tipo: ${document.documentType}; Situação: ${document.status}; Validade: ${certificationStatus(document.validUntil, referenceDate).label}`,
                    )
                    .join("\n")}`
                : "Nenhum documento da identidade vinculada foi encontrado.",
            },
            cells: {
              name: (
                <button
                  type="button"
                  onClick={(event) => {
                    cadastralTrigger.current = event.currentTarget;
                    setCadastralSupplier(supplier);
                  }}
                  className="text-left font-semibold text-[#0e4c7e] underline-offset-2 hover:underline"
                  title={`Ver dados cadastrais de ${identity.name}`}
                >
                  {identity.name}
                </button>
              ),
              representatives: (
                <button
                  type="button"
                  onClick={(event) => {
                    repTrigger.current = event.currentTarget;
                    setRepSupplier(supplier);
                  }}
                  className="text-left font-medium text-fuchsia-700 underline-offset-2 hover:underline"
                  title={`Ver representantes de ${identity.name}`}
                >
                  {supplier.representatives.length ? `${supplier.representatives.length} rep.` : "Ver (0)"}
                </button>
              ),
              biddings: (
                <button
                  type="button"
                  onClick={(event) => {
                    biddingTrigger.current = event.currentTarget;
                    setBiddingSupplier(supplier);
                  }}
                  className="text-left font-medium text-blue-700 underline-offset-2 hover:underline"
                  title={`Ver licitações atuando de ${identity.name}`}
                >
                  {supplier.activeBiddings.length ? `${supplier.activeBiddings.length} certame(s)` : "Nenhuma (0)"}
                </button>
              ),
            },
            actions: (
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Consultas de regularidade de ${identity.name}`}
                  onClick={(event) => {
                    detailTrigger.current = event.currentTarget;
                    setDetails(supplier);
                    setDetailPage(0);
                  }}
                >
                  <FileText />
                </button>
                {canUpdate ? (
                  <>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={pending}
                      aria-label={`Editar ${identity.name}`}
                      onClick={(event) => {
                        editTrigger.current = event.currentTarget;
                        edit(supplier);
                      }}
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={pending}
                      aria-label={`${supplier.status === "Ativo" ? "Inativar" : "Reativar"} ${identity.name}`}
                      onClick={() => toggle(supplier)}
                    >
                      {supplier.status === "Ativo" ? <Trash2 /> : <RefreshCw />}
                    </button>
                  </>
                ) : (
                  <span>Leitura</span>
                )}
              </div>
            ),
          };
        })}
      />

      <Dialog
        open={!!cadastralSupplier}
        onOpenChange={(open) => {
          if (!open) setCadastralSupplier(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() =>
            cadastralTrigger.current?.isConnected ? cadastralTrigger.current : true
          }
        >
          <DialogHeader>
            <DialogTitle>Dados Cadastrais do Fornecedor</DialogTitle>
            <DialogDescription>
              {cadastralIdentity?.name || "Fornecedor"} ({cadastralIdentity?.type} •{" "}
              {cadastralIdentity?.document})
            </DialogDescription>
          </DialogHeader>
          {cadastralSupplier && cadastralIdentity ? (
            <div className="grid grid-cols-1 gap-2.5 text-[13px] text-slate-700 sm:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50/70 p-2.5 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  {cadastralIdentity.type === "PJ" ? "Razão Social" : "Nome Completo"}
                </span>
                <span className="font-semibold text-slate-900">{cadastralIdentity.name}</span>
                {cadastralIdentity.type === "PJ" ? (
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Nome Fantasia: {cadastralIdentity.tradeName}
                  </span>
                ) : null}
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Documento ({cadastralIdentity.type === "PJ" ? "CNPJ" : "CPF"})
                </span>
                <span className="font-mono font-medium text-slate-900">
                  {cadastralIdentity.document}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Situação Cadastral / Porte
                </span>
                <span className="font-medium text-slate-900">
                  {cadastralSupplier.status} •{" "}
                  {cadastralSupplier.company
                    ? cadastralSupplier.company.companyType || "Porte não informado"
                    : "Pessoa Física"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Categoria / Ramo de Atividade
                </span>
                <span className="text-slate-900">
                  {cadastralSupplier.category || "—"} / {cadastralSupplier.businessBranch || "—"}
                </span>
              </div>
              <div className="rounded border border-slate-200 bg-white p-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Validade das Certidões
                </span>
                <span className="text-slate-900">
                  {
                    certificationStatus(
                      cadastralSupplier.certificationsValidUntil,
                      referenceDate,
                    ).label
                  }
                </span>
              </div>
              {cadastralSupplier.company ? (
                <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase text-slate-500">
                    CNAE Principal / Secundários
                  </span>
                  <span className="block text-slate-900">
                    Principal: {cadastralSupplier.company.primaryCnae || "Não informado"}
                  </span>
                  <span className="block text-xs text-slate-600">
                    Secundários: {cadastralSupplier.company.secondaryCnaes || "Não informados"}
                  </span>
                </div>
              ) : null}
              {cadastralSupplier?.taxInfo ? (
                <div className="rounded border border-slate-200 bg-slate-50/70 p-2 sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase text-slate-500">
                    Dados Tributários
                  </span>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-xs text-slate-700">
                    <div>Inscrição Municipal: <span className="font-mono font-medium">{cadastralSupplier.taxInfo.municipalInsc || "Não informada"}</span></div>
                    <div>Inscrição Estadual: <span className="font-mono font-medium">{cadastralSupplier.taxInfo.stateInsc || "Não informada"}</span></div>
                    <div>Regime Tributário: <span className="font-medium">{cadastralSupplier.taxInfo.taxRegime || "Não informado"}</span></div>
                    <div>Tipo: <span className="font-medium">{cadastralSupplier.taxInfo.taxpayerType || "Geral"}</span></div>
                    {cadastralSupplier.taxInfo.economicActivities && (
                      <div className="col-span-2">Atividades Tributárias: {cadastralSupplier.taxInfo.economicActivities}</div>
                    )}
                  </div>
                </div>
              ) : null}
              {cadastralSupplier && cadastralSupplier.representatives.length > 0 ? (
                <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase text-slate-500">
                    Representantes Legais ({cadastralSupplier.representatives.length})
                  </span>
                  <ul className="mt-1 space-y-1 text-xs">
                    {cadastralSupplier.representatives.map(rep => (
                      <li key={rep.id} className="flex justify-between border-b pb-0.5">
                        <span>{rep.name} {rep.cpf ? `(${formatCpf(rep.cpf)})` : ""}</span>
                        <span className="font-medium text-slate-600">{rep.representationType} · {rep.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {cadastralSupplier && cadastralSupplier.activeBiddings.length > 0 ? (
                <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                  <span className="block text-[11px] font-semibold uppercase text-slate-500">
                    Licitações Atuando ({cadastralSupplier.activeBiddings.length})
                  </span>
                  <ul className="mt-1 space-y-1 text-xs">
                    {cadastralSupplier.activeBiddings.map(b => (
                      <li key={b.id} className="flex justify-between border-b pb-0.5">
                        <Link href={`/compras/licitacoes/${b.id}`} className="text-blue-700 underline font-medium">
                          {b.number} ({b.modality})
                        </Link>
                        <span className="text-slate-600">{b.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded border border-slate-200 bg-white p-2 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Dados Bancários e Observações
                </span>
                <span className="block text-slate-900">
                  Banco: {cadastralSupplier.bankData || "Não informado"}
                </span>
                <span className="block text-xs text-slate-600">
                  Observações: {cadastralSupplier.notes || "Nenhuma observação registrada."}
                </span>
              </div>
            </div>
          ) : null}
          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              {cadastralSupplier ? (
                <Link
                  href={`/cadastros/fornecedores/${encodeURIComponent(cadastralSupplier.id)}`}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0e4c7e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b3d66]"
                >
                  <ExternalLink className="size-3.5" />
                  Mais detalhes
                </Link>
              ) : null}
              {canUpdate && cadastralSupplier ? (
                <button
                  type="button"
                  className={styles.dialogButton}
                  onClick={() => {
                    const target = cadastralSupplier;
                    setCadastralSupplier(null);
                    edit(target);
                  }}
                >
                  Edição rápida
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setCadastralSupplier(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!repSupplier}
        onOpenChange={(open) => {
          if (!open) setRepSupplier(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() => (repTrigger.current?.isConnected ? repTrigger.current : true)}
        >
          <DialogHeader>
            <DialogTitle>Representantes do Fornecedor</DialogTitle>
            <DialogDescription>
              {repSupplier ? identityFor(repSupplier).name : "Fornecedor"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {!repSupplier?.representatives.length ? (
              <p className="text-xs text-slate-500">Nenhum representante legal ativo cadastrado para este fornecedor.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {repSupplier.representatives.map((rep) => (
                  <li key={rep.id} className="rounded border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">{rep.name}</span>
                      <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[11px] font-semibold border border-emerald-200">{rep.status}</span>
                    </div>
                    <div className="mt-1 flex gap-4 text-slate-600">
                      <span>Tipo: <strong>{rep.representationType}</strong></span>
                      {rep.cpf && <span>CPF: <strong>{formatCpf(rep.cpf)}</strong></span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.dialogFooter}>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setRepSupplier(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!biddingSupplier}
        onOpenChange={(open) => {
          if (!open) setBiddingSupplier(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() => (biddingTrigger.current?.isConnected ? biddingTrigger.current : true)}
        >
          <DialogHeader>
            <DialogTitle>Licitações do Fornecedor</DialogTitle>
            <DialogDescription>
              Processos licitatórios em que {biddingSupplier ? identityFor(biddingSupplier).name : "o fornecedor"} está participando ou atuando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {!biddingSupplier?.activeBiddings.length ? (
              <p className="text-xs text-slate-500">O fornecedor não possui participações registradas em licitações.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {biddingSupplier.activeBiddings.map((b) => (
                  <li key={b.id} className="flex justify-between items-center rounded border border-slate-200 bg-slate-50/70 p-2.5">
                    <div>
                      <Link
                        href={`/compras/licitacoes/${b.id}`}
                        className="font-semibold text-blue-700 hover:underline"
                        title="Ver certame"
                      >
                        {b.number}
                      </Link>
                      <p className="text-slate-500">{b.modality}</p>
                    </div>
                    <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.dialogFooter}>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setBiddingSupplier(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <RegistryEditDialog
        open={!!editing}
        returnFocus={() => editTrigger.current}
        onClose={() => {
          setEditing(null);
          setForm(null);
        }}
        title={`Editar ${editing ? identityFor(editing).name : "fornecedor"}`}
        onSave={save}
        pending={pending}
        error={error}
      >
        {form && (
          <>
            <div className={styles.filterFields}>
              {editPage === 0 ? (
                <>
                  <label>
                    Categoria
                    <select
                      value={form.category}
                      onChange={(event) => setForm({ ...form, category: event.target.value })}
                    >
                      <option value="">Selecione…</option>
                      <option value="Materiais">Materiais Diversos</option>
                      <option value="Serviços">Prestação de Serviços</option>
                      <option value="Obras">Obras e Engenharia</option>
                      <option value="Equipamentos">Equipamentos</option>
                      <option value="Tecnologia">Tecnologia da Informação</option>
                    </select>
                  </label>
                  <label>
                    Ramo de atividade
                    <input
                      className={styles.searchInput}
                      value={form.businessBranch}
                      onChange={(event) =>
                        setForm({ ...form, businessBranch: event.target.value })
                      }
                    />
                  </label>
                  {editing?.company && (
                    <>
                      <label>
                        CNAE principal
                        <input
                          className={styles.searchInput}
                          value={form.primaryCnae}
                          onChange={(event) =>
                            setForm({ ...form, primaryCnae: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        CNAEs secundários
                        <input
                          className={styles.searchInput}
                          value={form.secondaryCnaes}
                          onChange={(event) =>
                            setForm({ ...form, secondaryCnaes: event.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Validade das certidões
                    <input
                      className={styles.searchInput}
                      type="date"
                      value={form.certificationsValidUntil}
                      onChange={(event) =>
                        setForm({ ...form, certificationsValidUntil: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Dados bancários
                    <input
                      className={styles.searchInput}
                      value={form.bankData}
                      onChange={(event) => setForm({ ...form, bankData: event.target.value })}
                    />
                  </label>
                  <label>
                    Observações
                    <textarea
                      className="w-full rounded border border-slate-300 p-2"
                      rows={2}
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setEditPage(editPage ? 0 : 1)}
            >
              {editPage
                ? "Identificação e CNAEs (1/2)"
                : "Certidões, banco e observações (2/2)"}
            </button>
          </>
        )}
      </RegistryEditDialog>

      <Dialog
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent
          className={styles.dialog}
          data-device={device}
          showCloseButton={false}
          finalFocus={() => (detailTrigger.current?.isConnected ? detailTrigger.current : true)}
        >
          <DialogHeader>
            <DialogTitle>Consultas de regularidade</DialogTitle>
            <DialogDescription>
              {details ? identityFor(details).name : "Fornecedor"}
            </DialogDescription>
          </DialogHeader>
          {detailPage === 0 ? (
            <div className="text-[13px]">
              <h3>Situação da habilitação</h3>
              <p>
                A validade é a informada no cadastro do fornecedor. Ela não declara regularidade
                fiscal.
              </p>
              <p>
                As evidências cadastradas estão disponíveis integralmente na coluna Evidências, com
                leitura paginada e cópia completa quando excedem a célula.
              </p>
            </div>
          ) : (
            <div>
              <p>Consultas externas: nenhum documento é emitido pelo CeleriFlow.</p>
              {queryLinks.slice((detailPage - 1) * 4, detailPage * 4).map((link) =>
                link.href ? (
                  <p key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.description}
                      className="text-indigo-700 underline"
                    >
                      {link.label}
                    </a>
                  </p>
                ) : (
                  <p key={link.label} title={link.description}>
                    {link.label}
                  </p>
                ),
              )}
            </div>
          )}
          <div className={styles.dialogFooter}>
            <div className={styles.dialogButtons}>
              <button
                type="button"
                className={styles.dialogButton}
                disabled={!detailPage}
                onClick={() => setDetailPage(detailPage - 1)}
              >
                Anterior
              </button>
              <span>
                {detailPage + 1}/{detailPages}
              </span>
              <button
                type="button"
                className={styles.dialogButton}
                disabled={detailPage >= detailPages - 1}
                onClick={() => setDetailPage(detailPage + 1)}
              >
                Próximo
              </button>
            </div>
            <button
              type="button"
              className={styles.dialogButton}
              onClick={() => setDetails(null)}
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
