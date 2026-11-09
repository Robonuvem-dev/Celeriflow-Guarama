"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, Code2, FileText, Play, RotateCcw, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import type {
  FebrabanDebtNature,
  FebrabanOnlineDebtItem,
  FebrabanOperationName,
  FebrabanWebServiceAuditLog,
} from "@/lib/tributacao/febraban-arrecadacao-service";

type Props = {
  pathname: string;
  initialDebts: FebrabanOnlineDebtItem[];
  initialLogs: FebrabanWebServiceAuditLog[];
  activeView: "guias" | "logs";
  activeNature: "ALL" | FebrabanDebtNature;
  page: number;
};

const debtColumns: readonly OperationalColumn[] = [
  { key: "guia", label: "Nosso Número / Guia", type: "identifier", initialWidth: 145, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "natureza", label: "Método / Natureza FEBRABAN", type: "text", initialWidth: 215, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "contribuinte", label: "Inscrição / Contribuinte", type: "text", initialWidth: 255, minWidth: 170, resizable: true, sortable: false, details: "overflow" },
  { key: "referencia", label: "Comp. / CDA / Acordo", type: "text", initialWidth: 185, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
  { key: "valor", label: "Valor Cobrado", type: "text", initialWidth: 125, minWidth: 105, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "status", label: "Situação Online", type: "status", initialWidth: 165, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "WebService Bancário", type: "actions", initialWidth: 165, minWidth: 150, maxWidth: 185, resizable: false, sortable: false, details: "none", align: "right" },
];

const logColumns: readonly OperationalColumn[] = [
  { key: "id", label: "Log ID", type: "identifier", initialWidth: 145, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "operation", label: "Método FEBRABAN Invocado", type: "identifier", initialWidth: 220, minWidth: 165, resizable: true, sortable: false, details: "overflow" },
  { key: "req", label: "Item", type: "text", initialWidth: 75, minWidth: 65, resizable: true, sortable: false, details: "overflow" },
  { key: "bank", label: "Instituição Financeira (26.1)", type: "text", initialWidth: 220, minWidth: 155, resizable: true, sortable: false, details: "overflow" },
  { key: "target", label: "Identificador / Guia", type: "text", initialWidth: 170, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  { key: "message", label: "Retorno WebService", type: "text", initialWidth: 280, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "SOAP XML", type: "actions", initialWidth: 80, minWidth: 72, maxWidth: 90, resizable: false, sortable: false, details: "none", align: "right" },
];

function formatMoneyBr(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function GuideDetailsDialog({
  item,
  onConfirm,
  onCancel,
  busyGuia,
}: {
  item: FebrabanOnlineDebtItem;
  onConfirm: (guia: string) => Promise<void>;
  onCancel: (guia: string) => Promise<void>;
  busyGuia: string | null;
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
        aria-label={`Inspecionar código de barras FEBRABAN da guia ${item.nossoNumeroGuia}`}
        title="Código de barras FEBRABAN e detalhes da guia"
        onClick={() => setOpen(true)}
      >
        <FileText />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Guia FEBRABAN Segmento 6 — {item.nossoNumeroGuia}</DialogTitle>
          <DialogDescription>{item.natureza} · {item.nomeContribuinte}</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Detalhes da Guia FEBRABAN"
          footer={
            <div className="flex items-center gap-2">
              {item.status !== "PAGO_ONLINE" && (
                <button
                  type="button"
                  className={`${styles.dialogButton} ${styles.primaryButton}`}
                  disabled={busyGuia === item.nossoNumeroGuia}
                  onClick={() => void onConfirm(item.nossoNumeroGuia)}
                >
                  <CheckCircle2 />
                  Executar confirmacaoOp (26.7)
                </button>
              )}
              {item.status === "PAGO_ONLINE" && (
                <button
                  type="button"
                  className={styles.dialogButton}
                  disabled={busyGuia === item.nossoNumeroGuia}
                  onClick={() => void onCancel(item.nossoNumeroGuia)}
                >
                  <RotateCcw />
                  Executar cancelamentoOp (26.6)
                </button>
              )}
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Fechar
              </button>
            </div>
          }
        >
          <dl className="grid gap-2.5 text-xs">
            <div>
              <dt className="font-semibold text-slate-700">Inscrição e Contribuinte</dt>
              <dd>{item.inscricaoMunicipalOuImobiliaria} · {item.nomeContribuinte} ({item.documentoContribuinte})</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Linha Digitável Padrão FEBRABAN (48 posições com DV Módulo 10)</dt>
              <dd className="break-all font-mono text-[11px] font-bold text-slate-900">{item.linhaDigitavel48}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Código de Barras (44 posições — Segmento 6 Prefeituras)</dt>
              <dd className="break-all font-mono text-[11px]">{item.codigoBarras44}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Composição Financeira</dt>
              <dd>
                Principal: {formatMoneyBr(item.valorPrincipal)} · Juros: {formatMoneyBr(item.valorJuros)} · Multa: {formatMoneyBr(item.valorMulta)} · Desconto: {formatMoneyBr(item.valorDesconto)} · <b>Total: {formatMoneyBr(item.valorTotalCobrado)}</b>
              </dd>
            </div>
            {item.codigoAutenticacaoFebraban && (
              <div>
                <dt className="font-semibold text-emerald-700">Autenticação Eletrônica Bancária (confirmacaoOp - 26.7)</dt>
                <dd className="font-mono font-bold text-emerald-900">
                  {item.codigoAutenticacaoFebraban} · Banco {item.codigoBancoArrecadador} ({item.nomeBancoArrecadador}) · NSU {item.nsuTransacaoBancaria}
                </dd>
              </div>
            )}
            {item.dataHoraCancelamento && (
              <div>
                <dt className="font-semibold text-rose-700">Registro de Estorno / Cancelamento (cancelamentoOp - 26.6)</dt>
                <dd className="text-rose-900">
                  Cancelado em {new Date(item.dataHoraCancelamento).toLocaleString("pt-BR")} — {item.motivoCancelamento}
                </dd>
              </div>
            )}
          </dl>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function SoapLogDialog({ log }: { log: FebrabanWebServiceAuditLog }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        className={styles.iconButton}
        aria-label={`Ver envelope SOAP XML da operação ${log.operation}`}
        title="Ver envelope SOAP/XML FEBRABAN"
        onClick={() => setOpen(true)}
      >
        <Code2 />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>{log.operation} — Item {log.requirementCode}</DialogTitle>
          <DialogDescription>{log.bankCode} · {log.bankName} ({log.channel})</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Envelope SOAP/XML FEBRABAN"
          footer={
            <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
              <X />
              Fechar
            </button>
          }
        >
          <div className="grid gap-3 text-xs">
            <div>
              <p className="mb-1 font-semibold text-slate-700">Requisição SOAP Recebida da Instituição Financeira:</p>
              <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
                {log.soapRequestSnippet}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-700">Resposta SOAP Emitida pelo WebService Municipal:</p>
              <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-300">
                {log.soapResponseSnippet}
              </pre>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

export function ArrecadacaoOnlineClient(props: Props) {
  const [debts, setDebts] = useState<FebrabanOnlineDebtItem[]>(props.initialDebts);
  const [logs, setLogs] = useState<FebrabanWebServiceAuditLog[]>(props.initialLogs);
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredDebts = debts.filter((item) =>
    props.activeNature === "ALL" ? true : item.natureza === props.activeNature,
  );

  async function invokeOperation(operation: FebrabanOperationName, extra: Record<string, unknown> = {}) {
    setBusyOp(String(extra.nossoNumeroGuia ?? operation));
    setFeedback(null);
    try {
      const res = await fetch("/api/tributacao/arrecadacao-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          codigoBanco: "001",
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setFeedback(`Erro: ${data.error ?? "Falha ao executar método FEBRABAN."}`);
        return;
      }
      if (data.state) {
        setDebts(data.state.debts);
        setLogs(data.state.auditLogs);
      }
      setFeedback(data.audit?.returnMessage ?? `Método ${operation} executado com sucesso.`);
    } finally {
      setBusyOp(null);
    }
  }

  const buildHref = (view: "guias" | "logs", nature: "ALL" | FebrabanDebtNature = props.activeNature) => {
    const query = new URLSearchParams();
    if (view !== "guias") query.set("visao", view);
    if (nature !== "ALL") query.set("natureza", nature);
    return `${props.pathname}${query.size ? `?${query}` : ""}`;
  };

  const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
  const isLogs = props.activeView === "logs";
  const total = isLogs ? logs.length : filteredDebts.length;

  const rows: OperationalRow[] = isLogs
    ? logs.slice(start, start + OPERATIONAL_PAGE_SIZE).map((log) => ({
        id: log.id,
        label: `${log.operation} · ${log.targetIdentifier}`,
        values: {
          id: log.id,
          operation: log.operation,
          req: log.requirementCode,
          bank: `${log.bankCode} · ${log.bankName}`,
          target: log.targetIdentifier,
          message: log.returnMessage,
        },
        actions: (
          <div className="flex items-center justify-end">
            <SoapLogDialog log={log} />
          </div>
        ),
      }))
    : filteredDebts.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => {
        const methodByNature: Record<FebrabanDebtNature, string> = {
          IPTU: "consultarDebitoIPTUOp (26.2)",
          ISS: "consultarDebitoISSOp (26.3)",
          DIVIDA_ATIVA: "consultarDebitoDividaAtivaOp (26.4)",
          PARCELAMENTO: "consultarDebitoParcelamentoOp (26.5)",
        };
        const refLabel = item.numeroCda
          ? `${item.numeroCda} (${item.parcela})`
          : item.numeroAcordoParcelamento
            ? `${item.numeroAcordoParcelamento} (${item.parcela})`
            : `${item.competencia} · ${item.parcela}`;
        const statusLabel =
          item.status === "PAGO_ONLINE"
            ? `Pago (${item.codigoAutenticacaoFebraban ?? "Online"})`
            : item.status === "ESTORNADO_CANCELADO"
              ? "Cancelado (cancelamentoOp)"
              : "Em Aberto (Disponível)";

        return {
          id: item.nossoNumeroGuia,
          label: `${item.nossoNumeroGuia} · ${item.nomeContribuinte}`,
          values: {
            guia: item.nossoNumeroGuia,
            natureza: methodByNature[item.natureza],
            contribuinte: `${item.inscricaoMunicipalOuImobiliaria} · ${item.nomeContribuinte}`,
            referencia: refLabel,
            valor: formatMoneyBr(item.valorTotalCobrado),
            status: statusLabel,
          },
          actions: (
            <div className="flex items-center justify-end gap-1">
              {item.status !== "PAGO_ONLINE" ? (
                <button
                  type="button"
                  className={`${styles.dialogButton} ${styles.primaryButton}`}
                  disabled={busyOp === item.nossoNumeroGuia}
                  onClick={() => void invokeOperation("confirmacaoOp", { nossoNumeroGuia: item.nossoNumeroGuia })}
                  title="Confirmar pagamento em tempo real via confirmacaoOp (Requisito 26.7)"
                >
                  <CheckCircle2 />
                  confirmacaoOp
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.dialogButton}
                  disabled={busyOp === item.nossoNumeroGuia}
                  onClick={() => void invokeOperation("cancelamentoOp", { nossoNumeroGuia: item.nossoNumeroGuia })}
                  title="Cancelar pagamento via cancelamentoOp (Requisito 26.6)"
                >
                  <RotateCcw />
                  cancelamentoOp
                </button>
              )}
              <GuideDetailsDialog
                item={item}
                onConfirm={(guia) => invokeOperation("confirmacaoOp", { nossoNumeroGuia: guia })}
                onCancel={(guia) => invokeOperation("cancelamentoOp", { nossoNumeroGuia: guia })}
                busyGuia={busyOp}
              />
            </div>
          ),
        };
      });

  return (
    <OperationalListFrame
      label="Arrecadação Online Service — Padrão FEBRABAN via WebService (CF26)"
      actions={
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={styles.dialogButton}
            disabled={busyOp !== null}
            onClick={() => void invokeOperation("consultarDebitoIPTUOp", { exercicio: 2026 })}
            title="Invocar método consultarDebitoIPTUOp (Requisito 26.2)"
          >
            <Play />
            consultarDebitoIPTUOp (26.2)
          </button>
          <button
            type="button"
            className={styles.dialogButton}
            disabled={busyOp !== null}
            onClick={() => void invokeOperation("consultarDebitoISSOp", { competencia: "10/2026" })}
            title="Invocar método consultarDebitoISSOp (Requisito 26.3)"
          >
            <Play />
            consultarDebitoISSOp (26.3)
          </button>
          <button
            type="button"
            className={styles.dialogButton}
            disabled={busyOp !== null}
            onClick={() => void invokeOperation("consultarDebitoDividaAtivaOp", {})}
            title="Invocar método consultarDebitoDividaAtivaOp (Requisito 26.4)"
          >
            <Play />
            consultarDebitoDividaAtivaOp (26.4)
          </button>
          <button
            type="button"
            className={styles.dialogButton}
            disabled={busyOp !== null}
            onClick={() => void invokeOperation("consultarDebitoParcelamentoOp", {})}
            title="Invocar método consultarDebitoParcelamentoOp (Requisito 26.5)"
          >
            <Play />
            consultarDebitoParcelamentoOp (26.5)
          </button>
          <a
            href="/api/tributacao/arrecadacao-online?wsdl"
            target="_blank"
            rel="noreferrer"
            className={styles.dialogButton}
            title="Abrir contrato WSDL 1.1 do WebService FEBRABAN"
          >
            <Code2 />
            WSDL FEBRABAN
          </a>
        </div>
      }
      toolbar={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <nav aria-label="Filtros do WebService FEBRABAN" className="flex flex-wrap items-center gap-1.5">
            <Link
              href={buildHref("guias", "ALL")}
              scroll={false}
              aria-current={!isLogs && props.activeNature === "ALL" ? "page" : undefined}
              className={`${styles.dialogButton} ${!isLogs && props.activeNature === "ALL" ? styles.primaryButton : ""}`}
            >
              Todas as Guias ({debts.length})
            </Link>
            <Link
              href={buildHref("guias", "IPTU")}
              scroll={false}
              aria-current={!isLogs && props.activeNature === "IPTU" ? "page" : undefined}
              className={`${styles.dialogButton} ${!isLogs && props.activeNature === "IPTU" ? styles.primaryButton : ""}`}
            >
              IPTU — 26.2
            </Link>
            <Link
              href={buildHref("guias", "ISS")}
              scroll={false}
              aria-current={!isLogs && props.activeNature === "ISS" ? "page" : undefined}
              className={`${styles.dialogButton} ${!isLogs && props.activeNature === "ISS" ? styles.primaryButton : ""}`}
            >
              ISS — 26.3
            </Link>
            <Link
              href={buildHref("guias", "DIVIDA_ATIVA")}
              scroll={false}
              aria-current={!isLogs && props.activeNature === "DIVIDA_ATIVA" ? "page" : undefined}
              className={`${styles.dialogButton} ${!isLogs && props.activeNature === "DIVIDA_ATIVA" ? styles.primaryButton : ""}`}
            >
              Dívida Ativa — 26.4
            </Link>
            <Link
              href={buildHref("guias", "PARCELAMENTO")}
              scroll={false}
              aria-current={!isLogs && props.activeNature === "PARCELAMENTO" ? "page" : undefined}
              className={`${styles.dialogButton} ${!isLogs && props.activeNature === "PARCELAMENTO" ? styles.primaryButton : ""}`}
            >
              Parcelamento — 26.5
            </Link>
            <Link
              href={buildHref("logs", "ALL")}
              scroll={false}
              aria-current={isLogs ? "page" : undefined}
              className={`${styles.dialogButton} ${isLogs ? styles.primaryButton : ""}`}
            >
              Auditoria SOAP/WebService ({logs.length})
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
          pathname={props.pathname}
          values={{
            visao: props.activeView !== "guias" ? props.activeView : undefined,
            natureza: props.activeNature !== "ALL" ? props.activeNature : undefined,
          }}
          pageParam="page"
          page={props.page}
          total={total}
        />
      }
    >
      <OperationalTable
        columns={isLogs ? logColumns : debtColumns}
        rows={rows}
        preferenceId={isLogs ? "cf26-febraban-logs" : "cf26-febraban-debts"}
        caption={
          isLogs
            ? "Trilha de Auditoria das Operações WebService FEBRABAN (consultarDebito*, confirmacaoOp e cancelamentoOp)"
            : "Guias Integradas ao Barramento FEBRABAN de Arrecadação Online via WebService (26.1 a 26.7)"
        }
        emptyMessage="Nenhum registro encontrado para o filtro selecionado."
      />
    </OperationalListFrame>
  );
}

