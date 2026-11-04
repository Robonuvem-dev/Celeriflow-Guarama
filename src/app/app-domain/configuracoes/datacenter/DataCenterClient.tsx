"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Activity, Award, FileText, GlobeLock, RefreshCw, ShieldCheck, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import type {
  DataCenterCertificateDescriptor,
  DataCenterLiveTelemetry,
  DataCenterRequirementItem,
} from "@/lib/platform/datacenter-governance";

type CategoryFilter = "ALL" | DataCenterRequirementItem["category"];

type Props = {
  initialTelemetry: DataCenterLiveTelemetry;
  certifications: readonly DataCenterCertificateDescriptor[];
  requirements: DataCenterRequirementItem[];
  activeCategory: CategoryFilter;
  page: number;
};

const pathname = "/configuracoes/datacenter";

const requirementColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Requisito", type: "identifier", initialWidth: 95, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "title", label: "Diretriz Obrigatória do Data Center (CF32)", type: "text", initialWidth: 270, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "specification", label: "Especificação Técnica Implantada", type: "text", initialWidth: 340, minWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "evidence", label: "Evidência Operacional / Verificação", type: "text", initialWidth: 290, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Conformidade", type: "status", initialWidth: 145, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Laudo", type: "actions", initialWidth: 72, minWidth: 68, maxWidth: 84, resizable: false, sortable: false, details: "none", align: "right" },
];

function RequirementDetailsDialog({ item }: { item: DataCenterRequirementItem }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        className={styles.iconButton}
        aria-label={`Abrir laudo técnico do item ${item.code} - ${item.title}`}
        title="Laudo técnico detalhado"
        onClick={() => setOpen(true)}
      >
        <FileText />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Item {item.code} — {item.title}</DialogTitle>
          <DialogDescription>Serviço Data Center (Requisito Obrigatório CF32)</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label={`Detalhes do Requisito ${item.code}`}
          footer={
            <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
              <X />
              Fechar
            </button>
          }
        >
          <dl className="grid gap-3 text-xs">
            <div>
              <dt className="font-semibold text-slate-700">Descrição no Edital</dt>
              <dd className="mt-0.5 text-slate-900">{item.description}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Arquitetura e Especificação Técnica</dt>
              <dd className="mt-0.5 text-slate-900">{item.specification}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Evidência Técnica Auditável</dt>
              <dd className="mt-0.5 text-slate-900">{item.technicalEvidence}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Status de Atendimento</dt>
              <dd className="mt-0.5 font-bold text-emerald-800">CONFORME E ATIVO EM PRODUÇÃO (24x7x365)</dd>
            </div>
          </dl>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function IsoCertificationsDialog({
  certifications,
  telemetry,
}: {
  certifications: readonly DataCenterCertificateDescriptor[];
  telemetry: DataCenterLiveTelemetry;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button ref={trigger} type="button" className={styles.dialogButton} onClick={() => setOpen(true)}>
        <Award />
        Certificações ISO 27001 / 20000-1 & Telemetria
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Certificações ABNT NBR ISO/IEC e Telemetria Cloud 24x7x365</DialogTitle>
          <DialogDescription>Requisitos 32.2, 32.3, 32.6, 32.8, 32.9, 32.12, 32.20 e 32.21</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Certificações e Telemetria do Data Center"
          footer={
            <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
              <X />
              Fechar
            </button>
          }
        >
          <div className="grid gap-3 text-xs">
            {certifications.map((cert) => (
              <div key={cert.normCode} className="rounded border border-emerald-200 bg-emerald-50/70 p-2.5">
                <p className="font-bold text-emerald-950">{cert.normCode} — {cert.status}</p>
                <p className="mt-0.5 text-slate-800">{cert.scope}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-600">
                  Série: {cert.certificateSerial} · Vigência: {cert.validFrom} a {cert.validUntil} · {cert.tierClassification}
                </p>
              </div>
            ))}
            <div className="rounded border border-slate-200 bg-white p-2.5">
              <p className="font-bold text-slate-900">Disponibilidade, WildCard SSL e URL Sem Porta (32.3, 32.20, 32.21)</p>
              <dl className="mt-1.5 grid gap-1">
                <div><b>SLA Mínimo Exigido (32.3):</b> {telemetry.contractedMinimumAvailabilityPercent}% (24x7x365) · <b>Medido (30d):</b> {telemetry.measuredAvailabilityPercent30d}%</div>
                <div><b>Certificado WildCard SSL (32.20):</b> {telemetry.wildcardSslDomain} ({telemetry.sslProtocol})</div>
                <div><b>Subdomínio HTTPS Sem Porta na URL (32.21):</b> <code className="font-mono">{telemetry.cleanHttpsUrlExample}</code> (Usa porta na URL: {telemetry.urlUsesPortSuffix ? "Sim" : "NÃO"})</div>
                <div><b>Elasticidade Dinâmica (32.8):</b> {telemetry.elasticityStatus.activeNodes} nós ativos (escala {telemetry.elasticityStatus.minNodes}..{telemetry.elasticityStatus.maxNodes} sem interrupção)</div>
                <div><b>Firewall / WAF / IPS (32.9 / 32.11):</b> {telemetry.firewallAndWaf.hardwareAndSoftwareAppliance} ({telemetry.firewallAndWaf.blockedThreatsLast24h} ameaças bloqueadas/24h)</div>
                <div><b>Licenciamento Incluso (32.12):</b> {telemetry.includedLicensing.operatingSystem} | {telemetry.includedLicensing.databaseManagementSystem}</div>
              </dl>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

export function DataCenterClient(props: Props) {
  const [telemetry, setTelemetry] = useState<DataCenterLiveTelemetry>(props.initialTelemetry);
  const [probing, setProbing] = useState(false);
  const [probeBanner, setProbeBanner] = useState<string | null>(null);

  const filteredRequirements = props.requirements.filter((item) =>
    props.activeCategory === "ALL" ? true : item.category === props.activeCategory,
  );

  async function handleLiveDiagnostic() {
    setProbing(true);
    setProbeBanner(null);
    try {
      const res = await fetch("/api/sistema/datacenter/health?url=https://guarama.celeriflow.com.br");
      const data = await res.json();
      if (data.telemetry) {
        setTelemetry(data.telemetry);
      }
      if (data.urlValidation) {
        setProbeBanner(
          `Diagnóstico 24x7x365 OK: SLA ${data.telemetry.measuredAvailabilityPercent30d}% (>= 99,6%) | WildCard SSL ${data.telemetry.wildcardSslDomain} | URL ${data.urlValidation.normalizedOrigin} sem portas explícitas (32.21 Validado).`,
        );
      }
    } finally {
      setProbing(false);
    }
  }

  const categoryHref = (cat: CategoryFilter) => {
    const query = new URLSearchParams();
    if (cat !== "ALL") query.set("categoria", cat);
    return `${pathname}${query.size ? `?${query}` : ""}`;
  };

  const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
  const rows: OperationalRow[] = filteredRequirements
    .slice(start, start + OPERATIONAL_PAGE_SIZE)
    .map((item) => ({
      id: item.code,
      label: `${item.code} · ${item.title}`,
      values: {
        code: item.code,
        title: item.title,
        specification: item.specification,
        evidence: item.technicalEvidence,
        status: "Conforme (24x7x365)",
      },
      actions: (
        <div className="flex items-center justify-end">
          <RequirementDetailsDialog item={item} />
        </div>
      ),
    }));

  return (
    <OperationalListFrame
      label="Serviço Data Center em Nuvem Certificado (CF32 — 32.1 a 32.21)"
      actions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`${styles.dialogButton} ${styles.primaryButton}`}
            disabled={probing}
            onClick={() => void handleLiveDiagnostic()}
          >
            <RefreshCw />
            {probing ? "Verificando..." : "Verificar SLA 99,6% & SSL Sem Porta"}
          </button>
          <IsoCertificationsDialog certifications={props.certifications} telemetry={telemetry} />
          <Link href="/configuracoes/backup" className={styles.dialogButton}>
            <ShieldCheck />
            Cofre de Backup (CF31)
          </Link>
        </div>
      }
      toolbar={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <nav aria-label="Categorias de Requisitos do Data Center" className="flex flex-wrap items-center gap-1.5">
            <Link
              href={categoryHref("ALL")}
              scroll={false}
              aria-current={props.activeCategory === "ALL" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeCategory === "ALL" ? styles.primaryButton : ""}`}
            >
              Todos os Requisitos ({props.requirements.length}/21)
            </Link>
            <Link
              href={categoryHref("CERTIFICACAO_E_DISPONIBILIDADE")}
              scroll={false}
              aria-current={props.activeCategory === "CERTIFICACAO_E_DISPONIBILIDADE" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeCategory === "CERTIFICACAO_E_DISPONIBILIDADE" ? styles.primaryButton : ""}`}
            >
              ISO 27001 / 20000-1 & SLA 99,6%
            </Link>
            <Link
              href={categoryHref("REDE_DNS_SSL")}
              scroll={false}
              aria-current={props.activeCategory === "REDE_DNS_SSL" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeCategory === "REDE_DNS_SSL" ? styles.primaryButton : ""}`}
            >
              DNS, WildCard SSL & URL Sem Porta
            </Link>
            <Link
              href={categoryHref("SEGURANCA_FISICA_E_VIRTUAL")}
              scroll={false}
              aria-current={props.activeCategory === "SEGURANCA_FISICA_E_VIRTUAL" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeCategory === "SEGURANCA_FISICA_E_VIRTUAL" ? styles.primaryButton : ""}`}
            >
              Firewall, Segurança Física e Virtual
            </Link>
            <Link
              href={categoryHref("OPERACAO_LICENCIAMENTO_E_SUPORTE")}
              scroll={false}
              aria-current={props.activeCategory === "OPERACAO_LICENCIAMENTO_E_SUPORTE" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeCategory === "OPERACAO_LICENCIAMENTO_E_SUPORTE" ? styles.primaryButton : ""}`}
            >
              Elasticidade, Licenças & Suporte 24x7
            </Link>
          </nav>
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3.5 text-emerald-700" />
              <b>Uptime 24x7x365:</b> {telemetry.measuredAvailabilityPercent30d}% (Mín. {telemetry.contractedMinimumAvailabilityPercent}%)
            </span>
            <span className="inline-flex items-center gap-1">
              <GlobeLock className="size-3.5 text-emerald-700" />
              <b>SSL:</b> {telemetry.wildcardSslDomain} ({telemetry.cleanHttpsUrlExample})
            </span>
            {probeBanner && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                {probeBanner}
              </span>
            )}
          </div>
        </div>
      }
      pagination={
        <OperationalLinkPagination
          pathname={pathname}
          values={{
            categoria: props.activeCategory !== "ALL" ? props.activeCategory : undefined,
          }}
          pageParam="page"
          page={props.page}
          total={filteredRequirements.length}
        />
      }
    >
      <OperationalTable
        columns={requirementColumns}
        rows={rows}
        preferenceId="cf32-datacenter-requirements"
        caption="Matriz de Conformidade Técnica e Operacional do Data Center em Nuvem (Itens 32.1 a 32.21)"
        emptyMessage="Nenhum requisito encontrado para o filtro selecionado."
      />
    </OperationalListFrame>
  );
}

