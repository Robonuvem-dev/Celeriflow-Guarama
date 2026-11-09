"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Award, FileText, RefreshCw, ShieldCheck, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import type {
  DataCenterCertificateDescriptor,
  DataCenterRequirementItem,
  HostSecurityProbe,
} from "@/lib/platform/datacenter-governance";

type CategoryFilter = "ALL" | DataCenterRequirementItem["category"];

type UrlValidation = { valid: boolean; hasHttpsSsl: boolean; hasSubdomain: boolean; hasExplicitPortInUrl: boolean; normalizedOrigin: string };

type Props = {
  certifications: readonly DataCenterCertificateDescriptor[];
  requirements: DataCenterRequirementItem[];
  summary: { total: number; verifiedInSystem: number; dependsOnProvider: number; contractedMinimumAvailabilityPercent: number };
  activeCategory: CategoryFilter;
  page: number;
};

const pathname = "/configuracoes/datacenter";

const requirementColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Requisito", type: "identifier", initialWidth: 95, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "title", label: "Diretriz do Edital (CF32)", type: "text", initialWidth: 270, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "specification", label: "O que precisa ser comprovado", type: "text", initialWidth: 300, minWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "evidence", label: "Situação / Evidência atual", type: "text", initialWidth: 340, minWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Quem comprova", type: "status", initialWidth: 175, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Detalhe", type: "actions", initialWidth: 72, minWidth: 68, maxWidth: 84, resizable: false, sortable: false, details: "none", align: "right" },
];

const statusLabel = (status: DataCenterRequirementItem["status"]) =>
  status === "VERIFICADO_NO_SISTEMA" ? "Sistema (verificável)" : "Provedor (pendente)";

function RequirementDetailsDialog({ item }: { item: DataCenterRequirementItem }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button ref={trigger} type="button" className={styles.iconButton} aria-label={`Detalhes do item ${item.code} - ${item.title}`} title="Detalhes" onClick={() => setOpen(true)}>
        <FileText />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Item {item.code} — {item.title}</DialogTitle>
          <DialogDescription>Serviço Data Center (Requisito Obrigatório CF32)</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent device={device} label={`Detalhes do Requisito ${item.code}`} footer={<button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>}>
          <dl className="grid gap-3 text-xs">
            <div><dt className="font-semibold text-slate-700">Descrição no Edital</dt><dd className="mt-0.5">{item.description}</dd></div>
            <div><dt className="font-semibold text-slate-700">O que precisa ser comprovado</dt><dd className="mt-0.5">{item.specification}</dd></div>
            <div><dt className="font-semibold text-slate-700">Situação atual</dt><dd className="mt-0.5">{item.technicalEvidence}</dd></div>
            <div><dt className="font-semibold text-slate-700">Quem comprova</dt><dd className="mt-0.5 font-bold">{statusLabel(item.status)}</dd></div>
          </dl>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function CertificationsDialog({ certifications }: { certifications: readonly DataCenterCertificateDescriptor[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button ref={trigger} type="button" className={styles.dialogButton} onClick={() => setOpen(true)}>
        <Award />
        Certificações exigidas (32.2)
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Certificações exigidas do data center</DialogTitle>
          <DialogDescription>Ainda não comprovadas: dependem do provedor de hospedagem, que ainda não foi definido.</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent device={device} label="Certificações exigidas" footer={<button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>}>
          <div className="grid gap-3 text-xs">
            {certifications.map((cert) => (
              <div key={cert.normCode} className="rounded border border-amber-300 bg-amber-50 p-2.5">
                <p className="font-bold">{cert.normCode} — a comprovar pelo provedor</p>
                <p className="mt-0.5">{cert.scope}</p>
                <p className="mt-1"><b>Evidência necessária:</b> {cert.requiredEvidence}</p>
              </div>
            ))}
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

export function DataCenterClient(props: Props) {
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<HostSecurityProbe | null>(null);
  const [urlValidation, setUrlValidation] = useState<UrlValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRequirements = props.requirements.filter((item) => props.activeCategory === "ALL" ? true : item.category === props.activeCategory);

  async function runDiagnostic() {
    setProbing(true);
    setError(null);
    try {
      const res = await fetch("/api/sistema/datacenter/health");
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? "Falha no diagnóstico."); return; }
      setProbe(data.probe);
      setUrlValidation(data.urlValidation);
    } catch {
      setError("Não foi possível executar o diagnóstico.");
    } finally {
      setProbing(false);
    }
  }

  const diagnosticSummary = () => {
    if (error) return `Erro: ${error}`;
    if (!probe || !urlValidation) return null;
    if (!probe.verifiable) return `${probe.reason} URL atual: ${urlValidation.normalizedOrigin}.`;
    const dnsPart = probe.dns.resolved ? `DNS ok (${probe.dns.addresses.join(", ")})` : `DNS falhou${probe.dns.error ? `: ${probe.dns.error}` : ""}`;
    const tlsPart = probe.tls.reached
      ? `TLS ${probe.tls.protocol ?? ""} válido até ${probe.tls.validTo}; curinga: ${probe.tls.hasWildcard ? "sim" : "não"}; cobre o host: ${probe.tls.coversHost ? "sim" : "não"}`
      : `TLS não verificado${probe.tls.error ? `: ${probe.tls.error}` : ""}`;
    const urlPart = `URL ${urlValidation.normalizedOrigin}: ${urlValidation.valid ? "HTTPS, subdomínio e sem porta" : "fora do padrão do 32.21"}`;
    return `${dnsPart} | ${tlsPart} | ${urlPart}`;
  };

  const categoryHref = (cat: CategoryFilter) => `${pathname}${cat !== "ALL" ? `?${new URLSearchParams({ categoria: cat })}` : ""}`;
  const categoryLink = (cat: CategoryFilter, label: string) => (
    <Link key={cat} href={categoryHref(cat)} scroll={false} aria-current={props.activeCategory === cat ? "page" : undefined} className={`${styles.dialogButton} ${props.activeCategory === cat ? styles.primaryButton : ""}`}>{label}</Link>
  );

  const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
  const rows: OperationalRow[] = filteredRequirements.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({
    id: item.code,
    label: `${item.code} · ${item.title}`,
    values: { code: item.code, title: item.title, specification: item.specification, evidence: item.technicalEvidence, status: statusLabel(item.status) },
    actions: <div className="flex items-center justify-end"><RequirementDetailsDialog item={item} /></div>,
  }));

  const summaryText = diagnosticSummary();

  return (
    <OperationalListFrame
      label="Serviço Data Center (CF32 — 32.1 a 32.21)"
      actions={
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={probing} onClick={() => void runDiagnostic()}>
            <RefreshCw />
            {probing ? "Verificando..." : "Diagnóstico do host (DNS, TLS, URL)"}
          </button>
          <CertificationsDialog certifications={props.certifications} />
          <Link href="/configuracoes/backup" className={styles.dialogButton}><ShieldCheck />Backup (CF31)</Link>
        </div>
      }
      toolbar={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <nav aria-label="Categorias de Requisitos do Data Center" className="flex flex-wrap items-center gap-1.5">
            {categoryLink("ALL", `Todos (${props.summary.total})`)}
            {categoryLink("CERTIFICACAO_E_DISPONIBILIDADE", "Certificação e disponibilidade")}
            {categoryLink("REDE_DNS_SSL", "DNS, SSL e acesso")}
            {categoryLink("SEGURANCA_FISICA_E_VIRTUAL", "Segurança")}
            {categoryLink("OPERACAO_LICENCIAMENTO_E_SUPORTE", "Operação, licenças e suporte")}
          </nav>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span><b>Verificáveis no sistema:</b> {props.summary.verifiedInSystem} · <b>Dependem do provedor:</b> {props.summary.dependsOnProvider}</span>
            {summaryText && <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{summaryText}</span>}
          </div>
        </div>
      }
      pagination={<OperationalLinkPagination pathname={pathname} values={{ categoria: props.activeCategory !== "ALL" ? props.activeCategory : undefined }} pageParam="page" page={props.page} total={filteredRequirements.length} />}
    >
      <OperationalTable columns={requirementColumns} rows={rows} preferenceId="cf32-datacenter-requirements" caption="Requisitos do Data Center (32.1 a 32.21): o que o sistema verifica e o que depende do provedor" emptyMessage="Nenhum requisito encontrado para o filtro selecionado." />
    </OperationalListFrame>
  );
}
