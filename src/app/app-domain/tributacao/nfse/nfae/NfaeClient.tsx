"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Printer,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Eye,
  ArrowLeft,
  X,
  WalletCards,
} from "lucide-react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import {
  approveOccasionalAction,
  createOccasionalAction,
  releaseOccasionalAction,
} from "../actions";

type NfaeItem = {
  id: string;
  requestNumber: string;
  providerId: string;
  providerName: string;
  providerDocument: string;
  takerId: string | null;
  takerName: string;
  takerDocument: string;
  serviceDescription: string;
  serviceValue: number;
  deductions: number;
  taxAmount: number;
  status: string;
  paymentRequired: boolean;
  guideId: string | null;
  invoiceId: string | null;
  invoiceNumber?: number;
  verificationCode?: string;
  createdAt: string;
};

type Taxpayer = {
  id: string;
  name: string;
  document: string;
};

const inputClass =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

const money = (val: number) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function NfaeClient({
  nfaeList,
  taxpayers,
  activity,
  registrations,
}: {
  nfaeList: NfaeItem[];
  taxpayers: Taxpayer[];
  activity: { id: string; name: string; rate: number };
  registrations: { id: string; taxpayerId: string; municipalInsc: string }[];
}) {
  const [filterTaker, setFilterTaker] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterNumber, setFilterNumber] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<NfaeItem | null>(null);

  const run = (job: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await job();
      setMessage(res.error ?? "Operação realizada com sucesso.");
    });

  // Filtros aplicados
  const filtered = useMemo(() => {
    return nfaeList.filter((row) => {
      if (filterProvider && !row.providerName.toLowerCase().includes(filterProvider.toLowerCase()) && !row.providerDocument.includes(filterProvider))
        return false;
      if (filterTaker && !row.takerName.toLowerCase().includes(filterTaker.toLowerCase()) && !row.takerDocument.includes(filterTaker))
        return false;
      if (filterNumber) {
        const term = filterNumber.toLowerCase();
        const numMatch = row.requestNumber.toLowerCase().includes(term) || (row.invoiceNumber && row.invoiceNumber.toString().includes(term));
        if (!numMatch) return false;
      }
      if (filterStatus && row.status !== filterStatus) return false;
      if (filterStartDate) {
        const itemDate = row.createdAt.slice(0, 10);
        if (itemDate < filterStartDate) return false;
      }
      if (filterEndDate) {
        const itemDate = row.createdAt.slice(0, 10);
        if (itemDate > filterEndDate) return false;
      }
      return true;
    });
  }, [nfaeList, filterProvider, filterTaker, filterNumber, filterStatus, filterStartDate, filterEndDate]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Filtro por Prestador"
        placeholder="Prestador / CPF / CNPJ..."
        value={filterProvider}
        onChange={(e) => setFilterProvider(e.target.value)}
        className="h-7 w-36 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Tomador"
        placeholder="Tomador..."
        value={filterTaker}
        onChange={(e) => setFilterTaker(e.target.value)}
        className="h-7 w-32 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Número"
        placeholder="Nº solicitação ou nota..."
        value={filterNumber}
        onChange={(e) => setFilterNumber(e.target.value)}
        className="h-7 w-32 rounded border px-2 text-[12px]"
      />
      <select
        aria-label="Filtro por Situação"
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        className="h-7 rounded border px-2 text-[12px]"
      >
        <option value="">Todas as situações</option>
        <option value="SOLICITADA">Solicitada</option>
        <option value="AGUARDANDO_PAGAMENTO">Aguardando Pagamento</option>
        <option value="APROVADA">Aprovada</option>
        <option value="EMITIDA">Emitida</option>
        <option value="CANCELADA">Cancelada</option>
      </select>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-slate-500">De:</span>
        <input
          type="date"
          aria-label="Data inicial"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
          className="h-7 rounded border px-1 text-[12px]"
        />
        <span className="text-slate-500">Até:</span>
        <input
          type="date"
          aria-label="Data final"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          className="h-7 rounded border px-1 text-[12px]"
        />
      </div>
      {message && (
        <OperationalFilters label="Aviso">
          <p role="status">{message}</p>
        </OperationalFilters>
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
      >
        <Plus className="size-3.5" />
        Emitir NFA-e
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-7 items-center gap-1 rounded border bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Printer className="size-3.5" />
        Imprimir Relatório
      </button>
      <Link
        href="/tributacao/nfse"
        className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="size-3.5" />
        Voltar à NFS-e Geral
      </Link>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <WalletCards className="size-5 text-emerald-700" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Consulta e Emissão de NFA-e (Nota Fiscal Avulsa Eletrônica)
            </h1>
            <p className="text-xs text-slate-500">
              Gestão de Notas Fiscais Avulsas Eletrônicas para prestadores sem inscrição contínua ou serviços eventuais. Filtros por prestador, tomador, período, número e situação.
            </p>
          </div>
        </div>
      </div>

      <TaxOperationalTable
        id="consulta-nfae"
        resetKey={`${filterProvider}:${filterTaker}:${filterNumber}:${filterStatus}:${filterStartDate}:${filterEndDate}`}
        toolbar={toolbar}
        actions={actions}
        emptyMessage="Nenhuma Nota Fiscal Avulsa Eletrônica localizada com os filtros informados."
        columns={[
          ["number", "Solicitação / Nº NFA-e", 100, 140, "identifier"],
          ["date", "Data / Período", 75, 100],
          ["provider", "Prestador de Serviço", 130, 220],
          ["taker", "Tomador do Serviço", 120, 200],
          ["service", "Discriminação do Serviço", 130, 240],
          ["value", "Valor do Serviço", 75, 110, "text", "right"],
          ["tax", "ISS Calculado", 70, 105, "text", "right"],
          ["status", "Situação", 75, 115, "status"],
          ["actions", "Ações", 75, 75, "actions"],
        ]}
        rows={filtered.map((row) => ({
          id: row.id,
          label: `NFA-e ${row.requestNumber}`,
          values: {
            number: row.invoiceNumber ? `NFS-e #${row.invoiceNumber} (${row.requestNumber})` : row.requestNumber,
            date: new Date(row.createdAt).toLocaleDateString("pt-BR"),
            provider: `${row.providerName} (${row.providerDocument})`,
            taker: `${row.takerName} ${row.takerDocument ? `(${row.takerDocument})` : ""}`,
            service: row.serviceDescription,
            value: money(row.serviceValue),
            tax: money(row.taxAmount),
            status: row.status,
          },
          actions: (
            <TaxRowActions label={`NFA-e ${row.requestNumber}`}>
              <TaxRowAction onClick={() => setViewingItem(row)}>
                Visualizar detalhes da NFA-e
              </TaxRowAction>
              {row.invoiceId && (
                <>
                  <TaxRowAction href={`/tributacao/nfse/${row.invoiceId}/pdf`} target="_blank">
                    Reimpressão oficial (PDF)
                  </TaxRowAction>
                  <TaxRowAction href={`/tributacao/nfse/${row.invoiceId}/documento`} target="_blank">
                    Abrir documento eletrônico
                  </TaxRowAction>
                  {row.verificationCode && (
                    <TaxRowAction href={`/portal/nfse/${row.verificationCode}`} target="_blank">
                      Verificar autenticidade / QR Code
                    </TaxRowAction>
                  )}
                </>
              )}
              {row.status === "SOLICITADA" && (
                <TaxRowAction disabled={pending} onClick={() => run(() => approveOccasionalAction(row.id))}>
                  Aprovar e gerar DAM
                </TaxRowAction>
              )}
              {["APROVADA", "AGUARDANDO_PAGAMENTO"].includes(row.status) && (
                <TaxRowAction
                  disabled={pending}
                  onClick={() => {
                    const reg = registrations.find((r) => r.taxpayerId === row.providerId) || registrations[0];
                    if (!reg) {
                      setMessage("Prestador sem cadastro de atividade associado.");
                      return;
                    }
                    run(() => releaseOccasionalAction(row.id, reg.id));
                  }}
                >
                  Liberar e emitir NFA-e
                </TaxRowAction>
              )}
            </TaxRowActions>
          ),
        }))}
      />

      {/* Modal Nova Solicitação / Emissão de NFA-e */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              run(async () => {
                const res = await createOccasionalAction({
                  providerTaxpayerId: String(form.get("providerId")),
                  takerTaxpayerId: String(form.get("takerId")) || undefined,
                  serviceActivityId: activity.id,
                  serviceDescription: String(form.get("description")),
                  serviceValue: Number(form.get("serviceValue")),
                  deductions: Number(form.get("deductions") || 0),
                  paymentRequired: form.get("paymentRequired") === "on",
                });
                if (!res.error) setIsModalOpen(false);
                return res;
              });
            }}
            className="w-full max-w-lg rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <WalletCards className="size-4 text-emerald-700" />
                Emissão de Nota Fiscal Avulsa Eletrônica (NFA-e)
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Prestador do Serviço</label>
                <select className={inputClass} name="providerId" required>
                  <option value="">Selecione o prestador...</option>
                  {taxpayers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.document})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Tomador do Serviço (Opcional)</label>
                <select className={inputClass} name="takerId">
                  <option value="">Consumidor Final / Não identificado</option>
                  {taxpayers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.document})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Discriminação do Serviço</label>
                <textarea
                  className="w-full rounded border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  name="description"
                  rows={3}
                  placeholder="Descreva detalhadamente o serviço prestado..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Valor do Serviço (R$)</label>
                  <input
                    className={inputClass}
                    name="serviceValue"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Deduções Permitidas (R$)</label>
                  <input
                    className={inputClass}
                    name="deductions"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </div>
              </div>

              <div className="rounded border bg-slate-50 p-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Atividade Tributada:</span> {activity.name} (Alíquota ISS: {activity.rate}%)
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input name="paymentRequired" type="checkbox" defaultChecked />
                Exigir quitação prévia do DAM antes da liberação da NFA-e
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button disabled={pending} className={buttonClass}>
                {pending ? "Emitindo..." : "Solicitar / Emitir NFA-e"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Visualização de Detalhes da NFA-e */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Eye className="size-4 text-emerald-700" />
                Detalhes da Nota Fiscal Avulsa Eletrônica
              </h2>
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-2 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Solicitação / Protocolo:</span>
                  <p className="font-mono font-bold">{viewingItem.requestNumber}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Situação Atual:</span>
                  <p className="font-bold text-emerald-700">{viewingItem.status}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Prestador do Serviço:</span>
                  <p className="font-medium">{viewingItem.providerName}</p>
                  <p className="font-mono text-slate-500 text-[11px]">{viewingItem.providerDocument}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Tomador do Serviço:</span>
                  <p className="font-medium">{viewingItem.takerName}</p>
                  <p className="font-mono text-slate-500 text-[11px]">{viewingItem.takerDocument || "Consumidor Final"}</p>
                </div>
              </div>

              <div className="border-b pb-2">
                <span className="font-semibold text-slate-500">Discriminação dos Serviços:</span>
                <p className="mt-1 rounded bg-slate-50 p-2 text-slate-800 border">
                  {viewingItem.serviceDescription}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Valor dos Serviços:</span>
                  <p className="font-bold">{money(viewingItem.serviceValue)}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Deduções:</span>
                  <p>{money(viewingItem.deductions)}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">ISS Devido:</span>
                  <p className="font-bold text-emerald-700">{money(viewingItem.taxAmount)}</p>
                </div>
              </div>

              {viewingItem.invoiceNumber && (
                <div className="rounded bg-emerald-50 border border-emerald-200 p-2 text-emerald-950">
                  <p className="font-bold">NFS-e Emitida: #{viewingItem.invoiceNumber}</p>
                  <p className="font-mono text-[10px]">Código de Verificação: {viewingItem.verificationCode}</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between items-center border-t pt-3">
              <span className="text-[10px] text-slate-400">
                Data do Registro: {new Date(viewingItem.createdAt).toLocaleString("pt-BR")}
              </span>
              <div className="flex gap-2">
                {viewingItem.invoiceId && (
                  <Link
                    href={`/tributacao/nfse/${viewingItem.invoiceId}/pdf`}
                    target="_blank"
                    className="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    <Printer className="size-3.5" />
                    Reimprimir PDF Oficial
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
