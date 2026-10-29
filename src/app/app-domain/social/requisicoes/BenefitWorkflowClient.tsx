"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Gift, Plus } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList, type SocialColumn } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { assessSocialBenefitItem, cancelSocialBenefitRequest, configureSocialBenefit, deliverSocialBenefitItem, registerSocialBenefitQuota, registerSocialBenefitReceipt, registerSocialBenefitRequest } from "./actions";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";
import { BenefitRequestItemsEditor } from "./BenefitRequestItemsEditor";
import { benefitRequestItemsPayload, benefitRequestItemsError, type BenefitRequestItemDraft } from "./benefit-item-drafts";

type Option = { id: string; name: string };
type Benefit = Option & { dispensingMode: string; requiresApproval: boolean; quotaControlled: boolean; maxPerRequest: number; authorizerEmployeeId: string | null };
type Row = { id: string; requestId: string; family: string; unit: string; date: string; benefit: string; quantity: number; value: string; status: string; awaitingStock: boolean; reason: string; assessment: string; deliveryReason: string; deliveredAt: string; canAssess: boolean; canCancel: boolean };
type Stock = { id: string; benefit: string; unit: string; quantity: number };
type Quota = { id: string; benefit: string; unit: string; startsAt: string; endsAt: string; total: number; consumed: number };
type Props = { rows: Row[]; benefits: Benefit[]; units: Option[]; families: Option[]; employees: Option[]; administrator: boolean; stock: Stock[]; quotas: Quota[] };
const field = "h-7 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const statuses: Record<string, string> = { PENDING: "Pendente", APPROVED: "Autorizado", DENIED: "Negado", DELIVERED: "Entregue", CANCELLED: "Cancelado", WAITING_STOCK: "Aguardando estoque" };
const blankItem = { draftId: "initial", benefitId: "", quantity: 1, value: "" };

export default function BenefitWorkflowClient({ rows, benefits, units, families, employees, administrator, stock, quotas }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"request" | "receipt" | "quota" | "config" | "assess" | "deliver" | "cancel" | "detail" | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [unitId, setUnitId] = useState(units[0]?.id || "");
  const [familyId, setFamilyId] = useState("");
  const [benefitId, setBenefitId] = useState(benefits[0]?.id || "");
  const [items, setItems] = useState<BenefitRequestItemDraft[]>([{ ...blankItem }]);
  const [reason, setReason] = useState("");
  const [approve, setApprove] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceValue, setInvoiceValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [mode, setMode] = useState("QUANTITY");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [quotaControlled, setQuotaControlled] = useState(false);
  const [authorizer, setAuthorizer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filteredRows = rows.filter((row) => `${row.family} ${row.unit} ${row.benefit}`.toLocaleLowerCase("pt-BR").includes(term) && (!status || (status === "WAITING_STOCK" ? row.awaitingStock : row.status === status)));
  const filteredStock = stock.filter((row) => `${row.benefit} ${row.unit}`.toLocaleLowerCase("pt-BR").includes(term));
  const filteredQuotas = quotas.filter((row) => `${row.benefit} ${row.unit}`.toLocaleLowerCase("pt-BR").includes(term));
  const total = tab === "requests" ? filteredRows.length : tab === "stock" ? filteredStock.length : filteredQuotas.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const start = (activePage - 1) * OPERATIONAL_PAGE_SIZE;
  function fillConfig(id: string) {
    const benefit = benefits.find((item) => item.id === id);
    if (!benefit) return;
    setBenefitId(id); setMode(benefit.dispensingMode); setApprovalRequired(benefit.requiresApproval); setQuotaControlled(benefit.quotaControlled); setQuantity(benefit.maxPerRequest); setAuthorizer(benefit.authorizerEmployeeId || "");
  }
  function open(type: typeof modal, row?: Row) {
    setModal(type); setSelected(row || null); setError(""); setReason(""); setApprove(true);
    if (type === "config") fillConfig(benefitId);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (modal === "request") {
      const itemError = benefitRequestItemsError(items, benefits);
      if (itemError) { setError(itemError); return; }
    }
    setPending(true);
    try {
      const result = modal === "request" ? await registerSocialBenefitRequest({ familyId, unitId, reason, items: benefitRequestItemsPayload(items) })
        : modal === "receipt" ? await registerSocialBenefitReceipt({ unitId, benefitId, quantity, supplierName, invoiceNumber, invoiceDate, invoiceValue })
          : modal === "quota" ? await registerSocialBenefitQuota({ unitId, benefitId, total: quantity, startsAt, endsAt })
            : modal === "config" ? await configureSocialBenefit({ id: benefitId, dispensingMode: mode, requiresApproval: approvalRequired, quotaControlled, maxPerRequest: quantity, authorizerEmployeeId: authorizer })
              : modal === "assess" ? await assessSocialBenefitItem({ id: selected?.id, approve, assessment: reason })
                : modal === "deliver" ? await deliverSocialBenefitItem({ id: selected?.id, reason })
                  : await cancelSocialBenefitRequest({ id: selected?.requestId, reason });
      if (result.error) { setError(result.error); return; }
      if (modal === "request") setItems([{ ...blankItem }]);
      setModal(null); router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1"><PageHeader title="Requisições, estoque e dispensação" icon={<Gift className="size-4" />} action={<button onClick={() => open("request")} className="inline-flex h-8 items-center gap-1 rounded bg-blue-600 px-3 text-xs text-white"><Plus className="size-3" />Nova requisição</button>} />
    <SocialOperationalList id={`requisicoes-${tab}`} page={activePage} total={total} onPageChange={setPage}
      actions={<>{administrator && <button onClick={() => open("config")}>Regras de benefício</button>}{tab === "stock" && <button onClick={() => open("receipt")}>Entrada de estoque</button>}{tab === "quotas" && administrator && <button onClick={() => open("quota")}>Cadastrar cota</button>}</>}
      toolbar={<div className="flex w-full gap-2"><select aria-label="Visão" className="h-8 rounded border" value={tab} onChange={(event) => { setTab(event.target.value); setSearch(""); setPage(1); }}><option value="requests">Requisições</option><option value="stock">Estoque</option><option value="quotas">Cotas</option></select><input aria-label="Buscar família, benefício ou equipamento" type="search" placeholder="Buscar família, benefício ou equipamento..." className={`${field} min-w-0 flex-1`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />{tab === "requests" && <select aria-label="Situação" className="h-8 rounded border px-2 text-xs" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>}</div>}
      columns={tab === "requests" ? [["family", "Família", 180, 100, "identifier"], ["benefit", "Benefício", 180, 100], ["unit", "Equipamento", 180, 100], ["status", "Situação", 150, 100, "status"], ["quantity", "Quantidade", 100, 80, "text", "right"], ["value", "Valor", 120, 90, "text", "right"], ["actions", "Ações", 220, 220, "actions"]] : tab === "stock" ? [["benefit", "Benefício", 250, 120, "identifier"], ["unit", "Equipamento", 250, 120], ["quantity", "Saldo (unidades)", 150, 110, "text", "right"]] : [["benefit", "Benefício", 200, 100, "identifier"], ["unit", "Equipamento", 200, 100], ["total", "Total", 100, 70, "text", "right"], ["consumed", "Utilizado", 100, 80, "text", "right"], ["balance", "Saldo", 100, 70, "text", "right"], ["from", "Início", 110, 90], ["until", "Fim", 110, 90]] as SocialColumn[]}
      rows={tab === "requests" ? filteredRows.slice(start, start + OPERATIONAL_PAGE_SIZE).map((row) => ({ id: row.id, label: row.family, values: { family: row.family, benefit: row.benefit, unit: row.unit, status: statuses[row.awaitingStock ? "WAITING_STOCK" : row.status], quantity: String(row.quantity), value: row.value ? socialCentsDisplay(socialAmountCents(row.value)) : "—" }, actions: <div className="flex gap-2"><button onClick={() => open("detail", row)}>Detalhes</button>{row.canAssess && <button onClick={() => open("assess", row)}>Avaliar</button>}{row.status === "APPROVED" && <button onClick={() => open("deliver", row)}>Entregar</button>}</div> })) : tab === "stock" ? filteredStock.slice(start, start + OPERATIONAL_PAGE_SIZE).map((row) => ({ id: row.id, label: row.benefit, values: { benefit: row.benefit, unit: row.unit, quantity: String(row.quantity) } })) : filteredQuotas.slice(start, start + OPERATIONAL_PAGE_SIZE).map((row) => ({ id: row.id, label: row.benefit, values: { benefit: row.benefit, unit: row.unit, total: String(row.total), consumed: String(row.consumed), balance: String(row.total - row.consumed), from: row.startsAt.split("-").reverse().join("/"), until: row.endsAt.split("-").reverse().join("/") } }))} />
    <Dialog open={Boolean(modal)} onOpenChange={(isOpen) => { if (!isOpen && !pending) setModal(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{({ request: "Nova requisição", receipt: "Entrada de estoque", quota: "Nova cota", config: "Regras do benefício", assess: "Avaliar benefício", deliver: "Registrar entrega", cancel: "Cancelar requisição", detail: "Detalhes da requisição" })[modal || "detail"]}</DialogTitle><DialogDescription>Avaliação individual, entrega e movimentações são auditadas. As operações respeitam vínculo com equipamento.</DialogDescription></DialogHeader>
      {modal === "detail" && selected ? <div className="space-y-3 text-sm"><p><strong>Protocolo:</strong> {selected.requestId}</p><p><strong>Família:</strong> {selected.family}</p><p><strong>Equipamento:</strong> {selected.unit}</p><p><strong>Benefício:</strong> {selected.benefit}</p><p className="whitespace-pre-wrap"><strong>Solicitação:</strong> {selected.reason}</p><p className="whitespace-pre-wrap"><strong>Avaliação:</strong> {selected.assessment || "Não exigida / não registrada"}</p><p className="whitespace-pre-wrap"><strong>Entrega:</strong> {selected.deliveredAt ? `${new Date(selected.deliveredAt).toLocaleString("pt-BR")} — ${selected.deliveryReason}` : "Não registrada"}</p><div className="flex gap-3"><Link className="text-blue-700 underline" href={`/social/requisicoes/${selected.requestId}/comprovante`} target="_blank">Comprovante</Link>{selected.canCancel && <button className="text-red-700 underline" onClick={() => open("cancel", selected)}>Cancelar requisição</button>}</div></div> : <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {(["request", "receipt", "quota"].includes(modal || "")) && <label className="text-xs">Equipamento<select required disabled={pending} className={field} value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {modal === "request" && <><label className="text-xs">Família<select required disabled={pending} className={field} value={familyId} onChange={(event) => setFamilyId(event.target.value)}><option value="">Selecione</option>{families.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="sm:col-span-2"><input type="hidden" name="items" value={JSON.stringify(benefitRequestItemsPayload(items))} /><BenefitRequestItemsEditor items={items} setItems={setItems} benefits={benefits} pending={pending} /></div></>}
        {(["receipt", "quota", "config"].includes(modal || "")) && <label className="text-xs">Benefício<select required disabled={pending} className={field} value={benefitId} onChange={(event) => modal === "config" ? fillConfig(event.target.value) : setBenefitId(event.target.value)}><option value="">Selecione</option>{benefits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {(["receipt", "quota", "config"].includes(modal || "")) && <label className="text-xs">{modal === "config" ? "Máximo por requisição" : modal === "quota" ? "Total da cota" : "Quantidade recebida"}<input required disabled={pending} type="number" min="1" step="1" className={field} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>}
        {modal === "config" && <><label className="text-xs">Dispensação<select disabled={pending} className={field} value={mode} onChange={(event) => setMode(event.target.value)}><option value="QUANTITY">Quantidade / estoque</option><option value="VALUE">Valor financeiro</option></select></label><label className="text-xs">Autorizador<select required={approvalRequired} disabled={pending} className={field} value={authorizer} onChange={(event) => setAuthorizer(event.target.value)}><option value="">Nenhum</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />Exige avaliação/autorização</label><label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={quotaControlled} onChange={(event) => setQuotaControlled(event.target.checked)} />Controlar por cota vigente</label></>}
        {modal === "receipt" && <><label className="text-xs">Fornecedor<input required disabled={pending} className={field} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label><label className="text-xs">Nota fiscal<input required disabled={pending} className={field} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label><label className="text-xs">Emissão<input required disabled={pending} type="date" className={field} value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label><label className="text-xs">Valor total da nota (R$)<input required disabled={pending} type="number" min="0.01" step="0.01" className={field} value={invoiceValue} onChange={(event) => setInvoiceValue(event.target.value)} /></label></>}
        {modal === "quota" && <><label className="text-xs">Início da vigência<input required disabled={pending} type="date" className={field} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="text-xs">Fim da vigência<input required disabled={pending} type="date" className={field} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></>}
        {modal === "assess" && <label className="text-xs">Decisão<select disabled={pending} className={field} value={approve ? "yes" : "no"} onChange={(event) => setApprove(event.target.value === "yes")}><option value="yes">Autorizar</option><option value="no">Negar</option></select></label>}
        {(["request", "assess", "deliver", "cancel"].includes(modal || "")) && <label className="text-xs sm:col-span-2">{modal === "assess" ? "Parecer técnico" : modal === "deliver" ? "Motivo / observações da entrega" : "Motivo"}<textarea required minLength={3} maxLength={4000} disabled={pending} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded border p-2 text-sm" /></label>}
        {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button type="button" disabled={pending} onClick={() => setModal(null)} className="rounded border px-3 py-2 text-xs">Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : "Confirmar"}</button></div>
      </form>}
    </DialogContent></Dialog>
  </PageFrame>;
}
