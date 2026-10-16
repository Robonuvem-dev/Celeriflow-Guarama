"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Gift, Plus } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { assessSocialBenefitItem, cancelSocialBenefitRequest, configureSocialBenefit, deliverSocialBenefitItem, registerSocialBenefitQuota, registerSocialBenefitReceipt, registerSocialBenefitRequest } from "./actions";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";

type Option = { id: string; name: string };
type Benefit = Option & { dispensingMode: string; requiresApproval: boolean; quotaControlled: boolean; maxPerRequest: number; authorizerEmployeeId: string | null };
type Row = { id: string; requestId: string; family: string; unit: string; date: string; benefit: string; quantity: number; value: string; status: string; awaitingStock: boolean; reason: string; assessment: string; deliveryReason: string; deliveredAt: string; canAssess: boolean; canCancel: boolean };
type Stock = { id: string; benefit: string; unit: string; quantity: number };
type Quota = { id: string; benefit: string; unit: string; startsAt: string; endsAt: string; total: number; consumed: number };
type Props = { rows: Row[]; benefits: Benefit[]; units: Option[]; families: Option[]; employees: Option[]; administrator: boolean; stock: Stock[]; quotas: Quota[] };
const field = "h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const statuses: Record<string, string> = { PENDING: "Pendente", APPROVED: "Autorizado", DENIED: "Negado", DELIVERED: "Entregue", CANCELLED: "Cancelado", WAITING_STOCK: "Aguardando estoque" };
const blankItem = { benefitId: "", quantity: 1, value: "" };

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
  const [items, setItems] = useState([blankItem]);
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
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
  const start = (activePage - 1) * 20;
  function fillConfig(id: string) {
    const benefit = benefits.find((item) => item.id === id);
    if (!benefit) return;
    setBenefitId(id); setMode(benefit.dispensingMode); setApprovalRequired(benefit.requiresApproval); setQuotaControlled(benefit.quotaControlled); setQuantity(benefit.maxPerRequest); setAuthorizer(benefit.authorizerEmployeeId || "");
  }
  function open(type: typeof modal, row?: Row) {
    setModal(type); setSelected(row || null); setError(""); setReason(""); setApprove(true); setItems([{ ...blankItem }]);
    if (type === "config") fillConfig(benefitId);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = modal === "request" ? await registerSocialBenefitRequest({ familyId, unitId, reason, items })
        : modal === "receipt" ? await registerSocialBenefitReceipt({ unitId, benefitId, quantity, supplierName, invoiceNumber, invoiceDate, invoiceValue })
          : modal === "quota" ? await registerSocialBenefitQuota({ unitId, benefitId, total: quantity, startsAt, endsAt })
            : modal === "config" ? await configureSocialBenefit({ id: benefitId, dispensingMode: mode, requiresApproval: approvalRequired, quotaControlled, maxPerRequest: quantity, authorizerEmployeeId: authorizer })
              : modal === "assess" ? await assessSocialBenefitItem({ id: selected?.id, approve, assessment: reason })
                : modal === "deliver" ? await deliverSocialBenefitItem({ id: selected?.id, reason })
                  : await cancelSocialBenefitRequest({ id: selected?.requestId, reason });
      if (result.error) { setError(result.error); return; }
      setModal(null); router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <PageFrame className="space-y-2 p-3"><PageHeader title="Requisições, estoque e dispensação" icon={<Gift className="size-4" />} action={<button onClick={() => open("request")} className="inline-flex h-8 items-center gap-1 rounded bg-blue-600 px-3 text-xs text-white"><Plus className="size-3" />Nova requisição</button>} />
    <div className="flex flex-wrap gap-2">{[['requests','Requisições'],['stock','Estoque'],['quotas','Cotas']] .map(([key,label]) => <button key={key} onClick={() => { setTab(key); setSearch(""); setPage(1); }} className={`rounded border px-3 py-2 text-xs ${tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>)}{administrator && <button onClick={() => open("config")} className="rounded border px-3 py-2 text-xs">Regras de benefício</button>}</div>
    <section className="min-w-0 rounded-lg border"><div className="flex flex-wrap gap-2 border-b p-2"><input aria-label="Buscar família, benefício ou equipamento" type="search" placeholder="Buscar família, benefício ou equipamento..." className={`${field} min-w-0 flex-1`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />{tab === "requests" && <select aria-label="Situação" className="h-8 rounded border px-2 text-xs" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>}{tab === "stock" && <button onClick={() => open("receipt")} className="rounded bg-blue-600 px-3 text-xs text-white">Entrada de estoque</button>}{tab === "quotas" && administrator && <button onClick={() => open("quota")} className="rounded bg-blue-600 px-3 text-xs text-white">Cadastrar cota</button>}</div>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">{tab === "requests" ? "Família / benefício" : "Benefício"}</th><th className="hidden p-2 md:table-cell">Equipamento</th><th className="w-24 p-2">{tab === "requests" ? "Situação" : "Saldo"}</th><th className="w-24 p-2">{tab === "quotas" ? "Vigência" : "Quantidade"}</th>{tab === "requests" && <th className="w-32 p-2 text-right">Ações</th>}</tr></thead><tbody>
        {tab === "requests" && filteredRows.slice(start, start + 20).map((row) => <tr key={row.id} className="h-9 border-t"><td className="truncate p-2" title={`${row.family} / ${row.benefit}`}>{row.family} / {row.benefit}</td><td className="hidden truncate p-2 md:table-cell" title={row.unit}>{row.unit}</td><td className="p-2 text-[10px]">{statuses[row.awaitingStock ? "WAITING_STOCK" : row.status]}</td><td className="truncate p-2">{row.value ? socialCentsDisplay(socialAmountCents(row.value)) : row.quantity}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => open("detail", row)}>Detalhes</button>{row.canAssess && <button className="ml-2 text-blue-700 underline" onClick={() => open("assess", row)}>Avaliar</button>}{row.status === "APPROVED" && <button className="ml-2 text-blue-700 underline" onClick={() => open("deliver", row)}>Entregar</button>}</td></tr>)}
        {tab === "stock" && filteredStock.slice(start, start + 20).map((row) => <tr key={row.id} className="h-9 border-t"><td className="truncate p-2">{row.benefit}</td><td className="hidden truncate p-2 md:table-cell">{row.unit}</td><td className="p-2">{row.quantity}</td><td className="p-2">unidades</td></tr>)}
        {tab === "quotas" && filteredQuotas.slice(start, start + 20).map((row) => <tr key={row.id} className="h-9 border-t"><td className="truncate p-2">{row.benefit}</td><td className="hidden truncate p-2 md:table-cell">{row.unit}</td><td className="p-2" title={`Total: ${row.total}; utilizado: ${row.consumed}`}>{row.total - row.consumed}</td><td className="p-2 text-[10px]">{row.startsAt.split("-").reverse().join("/")}<br />{row.endsAt.split("-").reverse().join("/")}</td></tr>)}
      </tbody></table>{!total && <p className="p-6 text-center text-xs text-slate-500">Nenhum registro encontrado.</p>}<div className="border-t px-3 py-2"><ErpPagination page={activePage} total={total} pageSize={20} previousHref="#" nextHref="#" label="registros" onPageChange={setPage} /></div>
    </section>
    <Dialog open={Boolean(modal)} onOpenChange={(isOpen) => { if (!isOpen && !pending) setModal(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{({ request: "Nova requisição", receipt: "Entrada de estoque", quota: "Nova cota", config: "Regras do benefício", assess: "Avaliar benefício", deliver: "Registrar entrega", cancel: "Cancelar requisição", detail: "Detalhes da requisição" })[modal || "detail"]}</DialogTitle><DialogDescription>Avaliação individual, entrega e movimentações são auditadas. As operações respeitam vínculo com equipamento.</DialogDescription></DialogHeader>
      {modal === "detail" && selected ? <div className="space-y-3 text-sm"><p><strong>Protocolo:</strong> {selected.requestId}</p><p><strong>Família:</strong> {selected.family}</p><p><strong>Equipamento:</strong> {selected.unit}</p><p><strong>Benefício:</strong> {selected.benefit}</p><p className="whitespace-pre-wrap"><strong>Solicitação:</strong> {selected.reason}</p><p className="whitespace-pre-wrap"><strong>Avaliação:</strong> {selected.assessment || "Não exigida / não registrada"}</p><p className="whitespace-pre-wrap"><strong>Entrega:</strong> {selected.deliveredAt ? `${new Date(selected.deliveredAt).toLocaleString("pt-BR")} — ${selected.deliveryReason}` : "Não registrada"}</p><div className="flex gap-3"><Link className="text-blue-700 underline" href={`/social/requisicoes/${selected.requestId}/comprovante`} target="_blank">Comprovante</Link>{selected.canCancel && <button className="text-red-700 underline" onClick={() => open("cancel", selected)}>Cancelar requisição</button>}</div></div> : <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {(["request", "receipt", "quota"].includes(modal || "")) && <label className="text-xs">Equipamento<select required disabled={pending} className={field} value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {modal === "request" && <><label className="text-xs">Família<select required disabled={pending} className={field} value={familyId} onChange={(event) => setFamilyId(event.target.value)}><option value="">Selecione</option>{families.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset className="space-y-2 sm:col-span-2"><legend className="mb-1 text-xs font-semibold">Benefícios solicitados</legend>{items.map((item,index) => <div key={index} className="grid grid-cols-[1fr_4rem_6rem_2rem] gap-2"><select aria-label={`Benefício ${index + 1}`} required disabled={pending} className={field} value={item.benefitId} onChange={(event) => setItems(items.map((row,i) => i === index ? { ...row, benefitId: event.target.value } : row))}><option value="">Benefício</option>{benefits.map((benefit) => <option key={benefit.id} value={benefit.id}>{benefit.name}</option>)}</select><input aria-label="Quantidade" required disabled={pending} type="number" min="1" step="1" className={field} value={item.quantity} onChange={(event) => setItems(items.map((row,i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} /><input aria-label="Valor financeiro" disabled={pending || benefits.find((benefit) => benefit.id === item.benefitId)?.dispensingMode !== "VALUE"} required={benefits.find((benefit) => benefit.id === item.benefitId)?.dispensingMode === "VALUE"} type="number" min="0.01" step="0.01" placeholder="R$" className={field} value={item.value} onChange={(event) => setItems(items.map((row,i) => i === index ? { ...row, value: event.target.value } : row))} /><button aria-label="Remover benefício" type="button" disabled={pending || items.length === 1} onClick={() => setItems(items.filter((_,i) => i !== index))}>×</button></div>)}<button disabled={pending || items.length >= 30} type="button" onClick={() => setItems([...items, { ...blankItem }])} className="text-xs text-blue-700 underline">Adicionar benefício</button></fieldset></>}
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
