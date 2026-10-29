"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { activateSupplier, deactivateSupplier, updateSupplier } from "../actions";
import { supplierRegularityLinks, unconfiguredSupplierRegularityLinks } from "./supplier-regularity";
import type { SupplierListItem } from "./supplier-types";
import { certificationStatus, dateInputValue, formatCnpj, formatCpf } from "./supplier-utils";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegistryEditDialog, registryColumns } from "../operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";

type SupplierEditForm = { category: string; businessBranch: string; certificationsValidUntil: string; bankData: string; notes: string; primaryCnae: string; secondaryCnaes: string };
const columns = registryColumns([
  ["name", "Fornecedor", 190, 110, "identifier"], ["identity", "PF/PJ", 55, 45], ["document", "CPF/CNPJ", 150, 105],
  ["category", "Categoria", 100, 70], ["branch", "Ramo de atividade", 125, 80], ["size", "ME/EPP", 70, 55],
  ["cnae", "CNAE principal", 105, 75], ["secondaryCnaes", "CNAEs secundários", 115, 80],
  ["status", "Situação", 80, 65, "status"], ["certification", "Certidões", 110, 80],
  ["evidence", "Evidências", 125, 80], ["actions", "Ações", 96, 96, "actions"],
]);
function identityFor(supplier: SupplierListItem) {
  if (supplier.person) return { type: "PF", name: supplier.person.fullName, document: supplier.person.cpf ? formatCpf(supplier.person.cpf) : "Não informado", documents: supplier.person.documents };
  if (supplier.company) return { type: "PJ", name: supplier.company.corporateName, document: formatCnpj(supplier.company.cnpj), documents: supplier.company.documents };
  return { type: "Não informado", name: "Identidade não informada", document: "—", documents: [] };
}

export default function FornecedoresClient({ suppliers, canUpdate, hasFilters, referenceDate }: { suppliers: SupplierListItem[]; canUpdate: boolean; hasFilters: boolean; referenceDate: string }) {
  const { device } = useOperationalWorkspace();
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<SupplierListItem | null>(null);
  const [details, setDetails] = useState<SupplierListItem | null>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [editPage, setEditPage] = useState(0);
  const [form, setForm] = useState<SupplierEditForm | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function edit(supplier: SupplierListItem) {
    setEditing(supplier); setError(""); setEditPage(0);
    setForm({ category: supplier.category || "", businessBranch: supplier.businessBranch || "", certificationsValidUntil: dateInputValue(supplier.certificationsValidUntil), bankData: supplier.bankData || "", notes: supplier.notes || "", primaryCnae: supplier.company?.primaryCnae || "", secondaryCnaes: supplier.company?.secondaryCnaes || "" });
  }
  function save() {
    if (!editing || !form || pending) return;
    startTransition(async () => {
      try {
        const result = await updateSupplier(editing.id, { category: form.category, businessBranch: form.businessBranch, certificationsValidUntil: form.certificationsValidUntil, bankData: form.bankData, notes: form.notes, ...(editing.company ? { primaryCnae: form.primaryCnae, secondaryCnaes: form.secondaryCnaes } : {}) });
        if (result.error) setError(result.error); else { setEditing(null); setForm(null); }
      } catch { setError("Não foi possível atualizar o fornecedor."); }
    });
  }
  function toggle(supplier: SupplierListItem) {
    if (!confirm(`Deseja realmente ${supplier.status === "Ativo" ? "inativar" : "reativar"} este registro?`)) return;
    setError(""); startTransition(async () => {
      try { const result = supplier.status === "Ativo" ? await deactivateSupplier(supplier.id) : await activateSupplier(supplier.id); if (result.error) setError(result.error); }
      catch { setError("Não foi possível alterar a situação do fornecedor."); }
    });
  }
  const queryLinks = [...supplierRegularityLinks.map(link => ({ label: link.label, href: link.href, description: link.description })), ...unconfiguredSupplierRegularityLinks.map(label => ({ label: `${label}: não configurado`, href: "", description: "O destino depende da jurisdição e não está configurado nesta base." }))];
  const queryPages = Math.max(1, Math.ceil(queryLinks.length / 4));
  const detailPages = 1 + queryPages;

  return <>
    {error && !editing && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
    <OperationalTable columns={columns} preferenceId="cadastros-fornecedores" caption="Fornecedores" emptyMessage={hasFilters ? "Nenhum fornecedor atende aos filtros informados." : "Nenhum fornecedor cadastrado."}
      rows={suppliers.map(supplier => { const identity = identityFor(supplier); return { id: supplier.id, label: identity.name, values: { name: identity.name, identity: identity.type, document: identity.document, category: supplier.category || "—", branch: supplier.businessBranch || "—", size: supplier.company ? supplier.company.companyType || "Não informado" : "Não se aplica a PF", cnae: supplier.company?.primaryCnae || "Não informado", secondaryCnaes: supplier.company?.secondaryCnaes || "Não informados", status: supplier.status, certification: certificationStatus(supplier.certificationsValidUntil, referenceDate).label, evidence: identity.documents.length ? `${identity.documents.length} evidência(s)\n${identity.documents.map(document => `Título: ${document.title}; Tipo: ${document.documentType}; Situação: ${document.status}; Validade: ${certificationStatus(document.validUntil, referenceDate).label}`).join("\n")}` : "Nenhum documento da identidade vinculada foi encontrado." }, actions: <div className={styles.rowActions}>
        <button type="button" className={styles.iconButton} aria-label={`Consultas de regularidade de ${identity.name}`} onClick={event => { detailTrigger.current = event.currentTarget; setDetails(supplier); setDetailPage(0); }}><FileText /></button>
        {canUpdate ? <><button type="button" className={styles.iconButton} disabled={pending} aria-label={`Editar ${identity.name}`} onClick={event => { editTrigger.current = event.currentTarget; edit(supplier); }}><Pencil /></button><button type="button" className={styles.iconButton} disabled={pending} aria-label={`${supplier.status === "Ativo" ? "Inativar" : "Reativar"} ${identity.name}`} onClick={() => toggle(supplier)}>{supplier.status === "Ativo" ? <Trash2 /> : <RefreshCw />}</button></> : <span>Leitura</span>}
      </div> }; })} />
    <RegistryEditDialog open={!!editing} returnFocus={() => editTrigger.current} onClose={() => { setEditing(null); setForm(null); }} title={`Editar ${editing ? identityFor(editing).name : "fornecedor"}`} onSave={save} pending={pending} error={error}>
      {form && <><div className={styles.filterFields}>{editPage === 0 ? <>
        <label>Categoria<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option value="">Selecione…</option><option value="Materiais">Materiais Diversos</option><option value="Serviços">Prestação de Serviços</option><option value="Obras">Obras e Engenharia</option><option value="Equipamentos">Equipamentos</option><option value="Tecnologia">Tecnologia da Informação</option></select></label>
        <label>Ramo de atividade<input className={styles.searchInput} value={form.businessBranch} onChange={event => setForm({ ...form, businessBranch: event.target.value })} /></label>
        {editing?.company && <><label>CNAE principal<input className={styles.searchInput} value={form.primaryCnae} onChange={event => setForm({ ...form, primaryCnae: event.target.value })} /></label><label>CNAEs secundários<input className={styles.searchInput} value={form.secondaryCnaes} onChange={event => setForm({ ...form, secondaryCnaes: event.target.value })} /></label></>}
      </> : <><label>Validade das certidões<input className={styles.searchInput} type="date" value={form.certificationsValidUntil} onChange={event => setForm({ ...form, certificationsValidUntil: event.target.value })} /></label><label>Dados bancários<input className={styles.searchInput} value={form.bankData} onChange={event => setForm({ ...form, bankData: event.target.value })} /></label><label>Observações<textarea className="w-full rounded border border-slate-300 p-2" rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></>}</div>
        <button type="button" className={styles.dialogButton} onClick={() => setEditPage(editPage ? 0 : 1)}>{editPage ? "Identificação e CNAEs (1/2)" : "Certidões, banco e observações (2/2)"}</button></>}
    </RegistryEditDialog>
    <Dialog open={!!details} onOpenChange={open => { if (!open) setDetails(null); }}><DialogContent className={styles.dialog} data-device={device} showCloseButton={false} finalFocus={() => detailTrigger.current?.isConnected ? detailTrigger.current : true}>
      <DialogHeader><DialogTitle>Consultas de regularidade</DialogTitle><DialogDescription>{details ? identityFor(details).name : "Fornecedor"}</DialogDescription></DialogHeader>
      {detailPage === 0 ? <div className="text-[13px]"><h3>Situação da habilitação</h3><p>A validade é a informada no cadastro do fornecedor. Ela não declara regularidade fiscal.</p><p>As evidências cadastradas estão disponíveis integralmente na coluna Evidências, com leitura paginada e cópia completa quando excedem a célula.</p></div> : <div><p>Consultas externas: nenhum documento é emitido pelo CeleriFlow.</p>{queryLinks.slice((detailPage - 1) * 4, detailPage * 4).map(link => link.href ? <p key={link.label}><a href={link.href} target="_blank" rel="noopener noreferrer" title={link.description} className="text-indigo-700 underline">{link.label}</a></p> : <p key={link.label} title={link.description}>{link.label}</p>)}</div>}
      <div className={styles.dialogFooter}><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={!detailPage} onClick={() => setDetailPage(detailPage - 1)}>Anterior</button><span>{detailPage + 1}/{detailPages}</span><button type="button" className={styles.dialogButton} disabled={detailPage >= detailPages - 1} onClick={() => setDetailPage(detailPage + 1)}>Próximo</button></div><button type="button" className={styles.dialogButton} onClick={() => setDetails(null)}>Fechar</button></div>
    </DialogContent></Dialog>
  </>;
}
