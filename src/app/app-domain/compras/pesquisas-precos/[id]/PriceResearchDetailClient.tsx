"use client";

import { useState, useTransition, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  closePriceResearchAction,
  deletePriceResearchAction,
  getSupplierInvitationLinkAction,
  inviteSupplierToPriceResearchAction,
  updatePriceResearchDeadlineAction,
} from "../actions";
import { CompactItemsTable, type PriceResearchItemRow } from "../CompactItemsTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { ComprasOperationalList, comprasColumn as column } from "../../_components/ComprasOperationalList";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

type SupplierOption = { id: string; name: string };

type Invitation = {
  id: string;
  supplierId: string;
  supplierName: string;
  status: string;
  value: number;
  createdAt: string;
  presentedAt: string | null;
};

type ResearchDetail = {
  id: string;
  status: string;
  deadlineAt: string;
  process: { number: string; object: string; purchaseRequestNumber: string | null; items: PriceResearchItemRow[] };
  comparison: { referenceValue: number | null; minimumValue: number | null; quoteIdsAtMinimum: string[] };
  invitations: Invitation[];
};

type AccessLink = { supplierName: string; accessKey: string; accessUrl: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dateTimeLocal(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function quoteStatusLabel(status: string) {
  if (status === "CONVITE_PENDENTE") return "Convite pendente";
  if (status === "CONVITE_RASCUNHO") return "Rascunho";
  if (status === "CONVITE_APRESENTADA" || status === "Ativa") return "Apresentada";
  if (status === "CONVITE_CANCELADO") return "Cancelada";
  return status;
}

export function PriceResearchDetailClient({ research, suppliers }: { research: ResearchDetail; suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [deadlineAt, setDeadlineAt] = useState(() => dateTimeLocal(research.deadlineAt));
  const [supplierId, setSupplierId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [accessLink, setAccessLink] = useState<AccessLink | null>(null);
  const [accessFeedbackOpen, setAccessFeedbackOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isInProgress = research.status === "Em Andamento";

  function run(operation: () => Promise<{ error?: string }>, success: string, after?: () => void) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await operation();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(success);
      after?.();
    });
  }

  function updateDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadline = new Date(deadlineAt);
    if (!deadlineAt || !Number.isFinite(deadline.getTime())) {
      setError("Informe um prazo de encerramento válido.");
      return;
    }
    run(
      () => updatePriceResearchDeadlineAction({ researchId: research.id, deadlineAt: deadline.toISOString() }),
      "Prazo da pesquisa atualizado.",
      () => router.refresh(),
    );
  }

  function inviteSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) {
      setError("Selecione um fornecedor ativo.");
      return;
    }
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await inviteSupplierToPriceResearchAction({ researchId: research.id, supplierId });
      if (result.error || !result.accessKey || !result.accessUrl) {
        setError(result.error ?? "Não foi possível gerar o acesso do fornecedor.");
        return;
      }
      const supplier = suppliers.find((item) => item.id === supplierId);
      setAccessLink({ supplierName: supplier?.name ?? "Fornecedor", accessKey: result.accessKey, accessUrl: result.accessUrl });
      setNotice(result.created ? "Convite registrado como pendente de entrega manual." : "O convite pendente existente foi recuperado.");
      router.refresh();
    });
  }

  function recoverAccess(invitation: Invitation) {
    setError("");
    setNotice("");
    setAccessLink(null);
    setAccessFeedbackOpen(true);
    startTransition(async () => {
      const result = await getSupplierInvitationLinkAction({ researchId: research.id, invitationId: invitation.id });
      if (result.error || !result.accessKey || !result.accessUrl) {
        setError(result.error ?? "Não foi possível gerar o acesso do fornecedor.");
        return;
      }
      setAccessLink({ supplierName: invitation.supplierName, accessKey: result.accessKey, accessUrl: result.accessUrl });
      setNotice("Acesso do fornecedor gerado para entrega manual.");
    });
  }

  function closeResearch() {
    if (!confirm("Encerrar esta pesquisa? O portal deixará de aceitar respostas imediatamente.")) return;
    run(() => closePriceResearchAction(research.id), "Pesquisa encerrada.", () => router.refresh());
  }

  function removeResearch() {
    if (!confirm("Excluir esta pesquisa sem convites ou cotações?")) return;
    run(() => deletePriceResearchAction(research.id), "Pesquisa excluída.", () => router.push("/compras/pesquisas-precos"));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      {error ? <p role="alert" className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}

      {accessLink ? (
        <section className="shrink-0 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3" aria-label="Entrega manual do convite">
          <div><h2 className="text-sm font-semibold text-amber-950">Acesso de {accessLink.supplierName}</h2><p className="mt-1 text-xs leading-5 text-amber-900">Não houve envio de e-mail: o convite pendente está registrado no histórico interno. Registre a entrega manual do link e da chave em canal autorizado.</p></div>
          <div className="grid gap-2 lg:grid-cols-2"><label className="block text-[11px] font-semibold text-amber-950">Link do portal<input readOnly value={accessLink.accessUrl} className="mt-1 h-8 w-full rounded-md border border-amber-300 bg-white px-2 font-mono text-[10px] font-normal text-slate-800" /></label><label className="block text-[11px] font-semibold text-amber-950">Chave de acesso<input readOnly value={accessLink.accessKey} className="mt-1 h-8 w-full rounded-md border border-amber-300 bg-white px-2 font-mono text-[10px] font-normal text-slate-800" /></label></div>
        </section>
      ) : null}

      <section className="grid shrink-0 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.6fr)_auto]">
        <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Processo / solicitação</p><p className="mt-1 text-sm font-semibold text-slate-900">{research.process.number}</p><p className="text-[11px] text-slate-500">Solicitação {research.process.purchaseRequestNumber ?? "não vinculada"}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Objeto</p><p className="mt-1 text-sm leading-5 text-slate-800">{research.process.object}</p></div>
        <span className={`h-fit w-fit rounded border px-2 py-0.5 text-[10px] font-semibold ${isInProgress ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-700"}`}>{isInProgress ? "Em andamento" : research.status}</span>
      </section>

      <section className="shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5"><div><h2 className="text-sm font-semibold text-slate-900">Janela e referência</h2><p className="mt-0.5 text-[11px] text-slate-500">Média aritmética dos valores globais apresentados. Não representa reserva ou disponibilidade orçamentária.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={closeResearch} disabled={!isInProgress || pending} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60">Encerrar</button><button type="button" onClick={removeResearch} disabled={research.invitations.length > 0 || pending} className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">Excluir sem histórico</button></div></div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Menor cotação</p><p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{research.comparison.minimumValue === null ? "Sem proposta" : money.format(research.comparison.minimumValue)}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Preço de referência</p><p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{research.comparison.referenceValue === null ? "Sem proposta" : money.format(research.comparison.referenceValue)}</p></div><form onSubmit={updateDeadline} className="sm:col-span-2"><label className="block text-[11px] font-semibold text-slate-700">Encerramento<div className="mt-1 flex flex-col gap-2 sm:flex-row"><input type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} disabled={!isInProgress || pending} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-normal outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 disabled:bg-slate-100" /><button type="submit" disabled={!isInProgress || pending} className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Atualizar prazo</button></div></label></form></div>
      </section>

      <div className="grid shrink-0 gap-2 xl:grid-cols-[minmax(19rem,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-3 py-2.5"><h2 className="text-sm font-semibold text-slate-900">Convidar fornecedor</h2><p className="mt-0.5 text-[11px] leading-4 text-slate-500">Fornecedores ativos com e-mail cadastrado recebem acesso autenticado ao próprio convite.</p></div><form onSubmit={inviteSupplier} className="flex gap-2 p-3"><label className="sr-only" htmlFor="supplier">Fornecedor</label><select id="supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={!isInProgress || pending} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 disabled:bg-slate-100"><option value="">Selecione um fornecedor ativo</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><button type="submit" disabled={!isInProgress || !supplierId || pending} className="h-8 shrink-0 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">Registrar convite</button></form></section>
        <CompactItemsTable items={research.process.items} title="Itens abrangidos" description="Itens e quantidades herdados do processo; não podem ser alterados pelo fornecedor." className="h-[19rem]" />
      </div>

      <OperationalTablePanel title="Convites e quadro comparativo" triggerLabel={`Abrir convites e quadro comparativo (${research.invitations.length})`} description="Todos os menores valores empatados são destacados. Convites pendentes não entram no cálculo.">
        <ComprasOperationalList label="Convites e quadro comparativo" preferenceId="compras-pesquisa-convites"
          columns={[column("supplier", "Fornecedor", 150, 300, "identifier"), column("invitedAt", "Convite", 130, 170), column("status", "Situação", 110, 150, "status"), column("value", "Valor global", 100, 140, "text", "right"), column("presentedAt", "Apresentada em", 130, 170), column("minimum", "Comparativo", 100, 130, "status"), column("actions", "Ações", 48, 60, "actions")]}
          filters={[{ key: "status", label: "Situação", options: ["CONVITE_PENDENTE", "CONVITE_RASCUNHO", "CONVITE_APRESENTADA", "CONVITE_CANCELADO"].map((value) => ({ value, label: quoteStatusLabel(value) })) }]}
          rows={research.invitations.map((invitation) => {
            const minimum = research.comparison.quoteIdsAtMinimum.includes(invitation.id);
            return { id: invitation.id, label: invitation.supplierName, search: `${invitation.supplierName} ${quoteStatusLabel(invitation.status)}`, filters: { status: invitation.status }, values: { supplier: invitation.supplierName, invitedAt: new Date(invitation.createdAt).toLocaleString("pt-BR"), status: quoteStatusLabel(invitation.status), value: invitation.presentedAt ? money.format(invitation.value) : "-", presentedAt: invitation.presentedAt ? new Date(invitation.presentedAt).toLocaleString("pt-BR") : "-", minimum: minimum ? "Menor valor" : "-" }, cells: { minimum: minimum ? <span className="font-semibold text-emerald-700">Menor valor</span> : "-" }, actions: <button type="button" className={styles.iconButton} aria-label={`Gerar acesso de ${invitation.supplierName}`} title="Gerar acesso" disabled={pending} onClick={() => recoverAccess(invitation)}><KeyRound /></button> };
          })} />
      </OperationalTablePanel>
      <Dialog open={accessFeedbackOpen} onOpenChange={setAccessFeedbackOpen}><DialogContent><DialogHeader><DialogTitle>Acesso do fornecedor</DialogTitle><DialogDescription>Entrega manual do link e da chave de acesso.</DialogDescription></DialogHeader>
        {pending && <p role="status">Gerando acesso…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        {accessLink && <div className="grid gap-3"><p>{accessLink.supplierName}</p><label>Link do portal<input className="w-full rounded border p-2" readOnly value={accessLink.accessUrl} /></label><label>Chave de acesso<input className="w-full rounded border p-2" readOnly value={accessLink.accessKey} /></label></div>}
      </DialogContent></Dialog>
    </div>
  );
}
