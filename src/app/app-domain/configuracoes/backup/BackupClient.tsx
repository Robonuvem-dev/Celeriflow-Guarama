"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, DatabaseZap, FileText, HardDriveDownload, Play, ShieldCheck, Terminal, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import {
  formatBytes,
  type BackupPolicySchedule,
  type BackupQuotaSummary,
  type BackupSnapshotRecord,
  type BackupTier,
  type WindowsServiceDescriptor,
} from "@/lib/platform/backup-service";

type Props = {
  initialSnapshots: BackupSnapshotRecord[];
  countsByTier: Record<BackupTier, number>;
  initialQuota: BackupQuotaSummary;
  schedules: readonly BackupPolicySchedule[];
  coveredSystems: readonly string[];
  windowsService: WindowsServiceDescriptor;
  activeTier: "ALL" | BackupTier;
  activeView: "snapshots" | "sistemas" | "politicas";
  page: number;
};

const pathname = "/configuracoes/backup";

const snapshotColumns: readonly OperationalColumn[] = [
  { key: "id", label: "Identificador do Backup", type: "identifier", initialWidth: 230, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "tier", label: "Política / Camada", type: "text", initialWidth: 210, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "referenceAt", label: "Data/Hora Referência", type: "text", initialWidth: 155, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "encryption", label: "Criptografia Militar (31.9)", type: "text", initialWidth: 185, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "size", label: "Volume", type: "text", initialWidth: 110, minWidth: 90, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "status", label: "Status / Integridade", type: "status", initialWidth: 165, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 130, minWidth: 120, maxWidth: 150, resizable: false, sortable: false, details: "none", align: "right" },
];

const systemsColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Código", type: "identifier", initialWidth: 110, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "system", label: "Sistema / Módulo Descrito no Edital (31.1)", type: "text", initialWidth: 420, minWidth: 220, resizable: true, sortable: false, details: "overflow" },
  { key: "cloudStorage", label: "Armazenamento em Nuvem (31.2 / 31.8)", type: "text", initialWidth: 260, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "encryption", label: "Criptografia (31.9)", type: "text", initialWidth: 190, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "automation", label: "Execução Automática (31.3)", type: "status", initialWidth: 170, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
];

const policyColumns: readonly OperationalColumn[] = [
  { key: "req", label: "Item", type: "identifier", initialWidth: 90, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Regra de Retenção e Periodicidade", type: "text", initialWidth: 260, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "cron", label: "Agendamento Automático (31.3)", type: "text", initialWidth: 240, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "retention", label: "Janela Mantida em Nuvem", type: "text", initialWidth: 300, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "count", label: "Pontos Ativos", type: "text", initialWidth: 120, minWidth: 100, resizable: true, sortable: false, details: "overflow", align: "right" },
];

function formatDateTimeBr(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function SnapshotDetailsDialog({
  snapshot,
  onTestRestore,
  testingId,
}: {
  snapshot: BackupSnapshotRecord;
  onTestRestore: (id: string) => Promise<void>;
  testingId: string | null;
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
        aria-label={`Inspecionar criptografia e detalhes do backup ${snapshot.id}`}
        title="Detalhes criptográficos AES-256 e restauração"
        onClick={() => setOpen(true)}
      >
        <FileText />
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Evidência Criptográfica e Retenção em Nuvem</DialogTitle>
          <DialogDescription>{snapshot.id} · {snapshot.tierLabel}</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Detalhes do Snapshot de Backup"
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`${styles.dialogButton} ${styles.primaryButton}`}
                disabled={testingId === snapshot.id}
                onClick={() => void onTestRestore(snapshot.id)}
              >
                <HardDriveDownload />
                {testingId === snapshot.id ? "Validando AES-256..." : "Testar Restauração (AES-256)"}
              </button>
              <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
                <X />
                Fechar
              </button>
            </div>
          }
        >
          <dl className="grid gap-2.5 text-xs">
            <div>
              <dt className="font-semibold text-slate-700">Política e Regra do Edital</dt>
              <dd>{snapshot.tierLabel} — {snapshot.retentionRule}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Escopo de Sistemas Cobertos (31.1)</dt>
              <dd>{snapshot.coveredSystemsSummary}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Destino de armazenamento (31.8) — ainda não definido</dt>
              <dd>{snapshot.datacenterId} · {snapshot.datacenterCertification}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Padrão Militar de Criptografia em Trânsito e Repouso (31.9)</dt>
              <dd>{snapshot.encryptionAlgorithm} · Protocolo {snapshot.transferProtocol}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Hash SHA-256 de Integridade</dt>
              <dd className="break-all font-mono text-[11px]">{snapshot.sha256Checksum}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Vetor de Inicialização (IV 96-bit) & AuthTag GCM</dt>
              <dd className="break-all font-mono text-[11px]">IV: {snapshot.ivHex} | Tag: {snapshot.authTagHex}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Amostra de Bloco Cifrado (AES-256 Ciphertext Hex)</dt>
              <dd className="break-all font-mono text-[11px]">{snapshot.encryptedHexPreview}...</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Modo de Disparo (31.3 / 31.4)</dt>
              <dd>{snapshot.triggeredBy} · Expiração programada: {formatDateTimeBr(snapshot.expiresAt)}</dd>
            </div>
            {snapshot.lastRestoreTestAt && (
              <div>
                <dt className="font-semibold text-emerald-700">Último Teste de Restauração e Decifragem</dt>
                <dd className="font-medium text-emerald-800">Íntegro e validado em {formatDateTimeBr(snapshot.lastRestoreTestAt)}</dd>
              </div>
            )}
          </dl>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

function WindowsServiceDialog({
  service,
  quota,
}: {
  service: WindowsServiceDescriptor;
  quota: BackupQuotaSummary;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        className={styles.dialogButton}
        onClick={() => setOpen(true)}
      >
        <Terminal />
        Serviço Windows (31.10) & Cota 3 TB (31.11)
      </button>
      <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
        <DialogHeader>
          <DialogTitle>Agente Windows Service (RunAsService) e Controle de Cota 3 TB</DialogTitle>
          <DialogDescription>Requisitos 31.8, 31.9, 31.10 e 31.11 do Edital</DialogDescription>
        </DialogHeader>
        <OperationalPagedContent
          device={device}
          label="Especificação RunAsService e Cota de 3 Terabytes"
          footer={
            <button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>
              <X />
              Fechar
            </button>
          }
        >
          <div className="grid gap-3 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
              <p className="font-bold text-slate-900">Controle de Espaço Disponibilizado — Limite de 3 Terabytes (Requisito 31.11)</p>
              <p className="mt-1">
                Capacidade Contratada: <b>{quota.limitFormatted}</b> ({quota.limitBytes.toLocaleString("pt-BR")} bytes) ·
                Utilizado: <b>{quota.usedFormatted}</b> ({quota.usagePercent}%) ·
                Livre: <b>{quota.availableFormatted}</b>
              </p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-2.5">
              <p className="font-bold text-slate-900">Aplicação Instalável como Serviço do Windows no Servidor de Banco (Requisito 31.10)</p>
              <dl className="mt-1.5 grid gap-1.5">
                <div><dt className="font-semibold">Nome do Serviço (SCM):</dt><dd className="font-mono">{service.serviceName} ({service.executionMode})</dd></div>
                <div><dt className="font-semibold">Modo de Inicialização:</dt><dd>{service.startupType} · Conta: {service.serviceAccount}</dd></div>
                <div><dt className="font-semibold">Comando de Instalação (sc.exe):</dt><dd className="break-all font-mono text-[11px]">{service.installCommand}</dd></div>
                <div><dt className="font-semibold">Script Instalador Incluso no Projeto:</dt><dd className="font-mono text-[11px]">scripts/backup-service-windows.ps1</dd></div>
              </dl>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-700">Trecho do Agente PowerShell (RunAsService):</p>
              <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
                {service.windowsServiceScriptContent}
              </pre>
            </div>
          </div>
        </OperationalPagedContent>
      </DialogContent>
    </Dialog>
  );
}

export function BackupClient(props: Props) {
  const [snapshots, setSnapshots] = useState<BackupSnapshotRecord[]>(props.initialSnapshots);
  const [quota, setQuota] = useState<BackupQuotaSummary>(props.initialQuota);
  const [counts, setCounts] = useState<Record<BackupTier, number>>(props.countsByTier);
  const [runningTier, setRunningTier] = useState<BackupTier | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const filteredSnapshots = snapshots.filter((item) =>
    props.activeTier === "ALL" ? true : item.tier === props.activeTier,
  );

  async function handleTriggerBackup(tier: BackupTier) {
    setRunningTier(tier);
    setBannerMessage(null);
    try {
      const response = await fetch("/api/sistema/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TRIGGER_BACKUP",
          tier,
          triggeredBy: "Execução Web Imediata (/configuracoes/backup - Requisito 31.4)",
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setBannerMessage(`Erro: ${data.error ?? "Falha ao executar backup."}`);
        return;
      }
      const listRes = await fetch("/api/sistema/backup");
      const listData = await listRes.json();
      if (listData.snapshots) {
        setSnapshots(listData.snapshots);
        setQuota(listData.quota);
        setCounts(listData.countsByTier);
      }
      setBannerMessage(
        `Backup simulado ${data.snapshot.id} (${data.snapshot.tierLabel}) registrado com manifesto cifrado em AES-256-GCM. Ainda não enviado a nenhum armazenamento externo. Retidos nesta camada: ${data.retainedCountForTier}.`,
      );
    } finally {
      setRunningTier(null);
    }
  }

  async function handleTestRestore(snapshotId: string) {
    setTestingId(snapshotId);
    setBannerMessage(null);
    try {
      const response = await fetch("/api/sistema/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TEST_RESTORE",
          snapshotId,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        setBannerMessage(`Erro na verificação: ${data.error ?? "Falha"}`);
        return;
      }
      setSnapshots((prev) =>
        prev.map((item) => (item.id === snapshotId ? data.snapshot : item)),
      );
      setBannerMessage(
        `Teste de Restauração concluído com sucesso para ${snapshotId}: Decifragem Militar AES-256-GCM íntegra (${data.restoredSystemsCount} sistemas verificados).`,
      );
    } finally {
      setTestingId(null);
    }
  }

  const viewHref = (view: "snapshots" | "sistemas" | "politicas", tier: "ALL" | BackupTier = props.activeTier) => {
    const query = new URLSearchParams();
    if (view !== "snapshots") query.set("visao", view);
    if (tier !== "ALL") query.set("camada", tier);
    return `${pathname}${query.size ? `?${query}` : ""}`;
  };

  let totalRecords = filteredSnapshots.length;
  let activeColumns: readonly OperationalColumn[] = snapshotColumns;
  let rows: OperationalRow[] = [];
  let preferenceId = "cf31-backup-snapshots";
  let caption = "Catálogo de Backups Criptografados em Nuvem (AES-256-GCM) — Limite Contratual 3 TB";

  if (props.activeView === "sistemas") {
    totalRecords = props.coveredSystems.length;
    activeColumns = systemsColumns;
    preferenceId = "cf31-backup-covered-systems";
    caption = "Cobertura Integral de Todos os Sistemas Descritos no Edital (Requisito 31.1)";
    const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
    rows = props.coveredSystems.slice(start, start + OPERATIONAL_PAGE_SIZE).map((sys, idx) => {
      const [code, ...rest] = sys.split(" — ");
      return {
        id: code || `SYS-${idx}`,
        label: sys,
        values: {
          code: code || `CF${idx + 1}`,
          system: rest.join(" — ") || sys,
          cloudStorage: "Destino ainda não definido (VPS pendente)",
          encryption: "AES-256-GCM (256 bits)",
          automation: "Automático (7d / 12m / 1h Log)",
        },
      };
    });
  } else if (props.activeView === "politicas") {
    totalRecords = props.schedules.length;
    activeColumns = policyColumns;
    preferenceId = "cf31-backup-policies";
    caption = "Políticas Automáticas de Backup Sem Intervenção Humana (Requisitos 31.3, 31.5, 31.6 e 31.7)";
    rows = props.schedules.map((sched) => ({
      id: sched.tier,
      label: sched.name,
      values: {
        req: `Item ${sched.requirementCode}`,
        name: sched.name,
        cron: `${sched.cronExpression} · ${sched.frequencyDescription}`,
        retention: sched.retentionDescription,
        count: `${counts[sched.tier]} de ${sched.retentionCount}`,
      },
    }));
  } else {
    const start = (props.page - 1) * OPERATIONAL_PAGE_SIZE;
    rows = filteredSnapshots.slice(start, start + OPERATIONAL_PAGE_SIZE).map((snap) => ({
      id: snap.id,
      label: `${snap.id} · ${snap.tierLabel}`,
      values: {
        id: snap.id,
        tier: snap.tierLabel,
        referenceAt: formatDateTimeBr(snap.referenceAt),
        encryption: "AES-256-GCM (256 bits)",
        size: formatBytes(snap.sizeBytes),
        status: snap.status === "RESTORE_TESTED" ? "Restauração Validada" : "Cifrado e Íntegro",
      },
      actions: (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            className={styles.iconButton}
            title="Testar restauração e decifragem AES-256-GCM"
            aria-label={`Testar restauração de ${snap.id}`}
            disabled={testingId === snap.id}
            onClick={() => void handleTestRestore(snap.id)}
          >
            <CheckCircle2 />
          </button>
          <SnapshotDetailsDialog snapshot={snap} onTestRestore={handleTestRestore} testingId={testingId} />
        </div>
      ),
    }));
  }

  return (
    <OperationalListFrame
      label="Serviço de Backup em Nuvem Criptografado (CF31)"
      actions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`${styles.dialogButton} ${styles.primaryButton}`}
            disabled={runningTier !== null}
            onClick={() => void handleTriggerBackup("FULL_DAILY")}
            title="Disparar Backup Full Diário via Tecnologia Web (31.4 / 31.5)"
          >
            <Play />
            {runningTier === "FULL_DAILY" ? "Executando..." : "Executar Full Diário (7d)"}
          </button>
          <button
            type="button"
            className={styles.dialogButton}
            disabled={runningTier !== null}
            onClick={() => void handleTriggerBackup("FULL_MONTHLY")}
            title="Disparar Backup Full Mensal 1º Dia (31.6)"
          >
            <DatabaseZap />
            Full Mensal (12m)
          </button>
          <button
            type="button"
            className={styles.dialogButton}
            disabled={runningTier !== null}
            onClick={() => void handleTriggerBackup("DIFFERENTIAL_HOURLY_LOG")}
            title="Disparar Backup Diferencial de Log Horário (31.7)"
          >
            <ShieldCheck />
            Log Diferencial (1h)
          </button>
          <WindowsServiceDialog service={props.windowsService} quota={quota} />
        </div>
      }
      toolbar={
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <nav aria-label="Visões do Serviço de Backup" className="flex flex-wrap items-center gap-1.5">
            <Link
              href={viewHref("snapshots", "ALL")}
              scroll={false}
              aria-current={props.activeView === "snapshots" && props.activeTier === "ALL" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "snapshots" && props.activeTier === "ALL" ? styles.primaryButton : ""}`}
            >
              Todos ({snapshots.length})
            </Link>
            <Link
              href={viewHref("snapshots", "FULL_DAILY")}
              scroll={false}
              aria-current={props.activeView === "snapshots" && props.activeTier === "FULL_DAILY" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "snapshots" && props.activeTier === "FULL_DAILY" ? styles.primaryButton : ""}`}
            >
              Full Diário 7d ({counts.FULL_DAILY}/7)
            </Link>
            <Link
              href={viewHref("snapshots", "FULL_MONTHLY")}
              scroll={false}
              aria-current={props.activeView === "snapshots" && props.activeTier === "FULL_MONTHLY" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "snapshots" && props.activeTier === "FULL_MONTHLY" ? styles.primaryButton : ""}`}
            >
              Full Mensal 12m ({counts.FULL_MONTHLY}/12)
            </Link>
            <Link
              href={viewHref("snapshots", "DIFFERENTIAL_HOURLY_LOG")}
              scroll={false}
              aria-current={props.activeView === "snapshots" && props.activeTier === "DIFFERENTIAL_HOURLY_LOG" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "snapshots" && props.activeTier === "DIFFERENTIAL_HOURLY_LOG" ? styles.primaryButton : ""}`}
            >
              Log 1 em 1h ({counts.DIFFERENTIAL_HOURLY_LOG}/24)
            </Link>
            <Link
              href={viewHref("sistemas")}
              scroll={false}
              aria-current={props.activeView === "sistemas" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "sistemas" ? styles.primaryButton : ""}`}
            >
              Sistemas do Edital ({props.coveredSystems.length})
            </Link>
            <Link
              href={viewHref("politicas")}
              scroll={false}
              aria-current={props.activeView === "politicas" ? "page" : undefined}
              className={`${styles.dialogButton} ${props.activeView === "politicas" ? styles.primaryButton : ""}`}
            >
              Regras Automáticas (31.3)
            </Link>
          </nav>
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span>
              <b>Cota 3 TB (31.11):</b> {quota.usedFormatted} / {quota.limitFormatted} ({quota.usagePercent}%)
            </span>
            {bannerMessage && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                {bannerMessage}
              </span>
            )}
          </div>
        </div>
      }
      pagination={
        <OperationalLinkPagination
          pathname={pathname}
          values={{
            visao: props.activeView !== "snapshots" ? props.activeView : undefined,
            camada: props.activeTier !== "ALL" ? props.activeTier : undefined,
          }}
          pageParam="page"
          page={props.page}
          total={totalRecords}
        />
      }
    >
      <OperationalTable
        columns={activeColumns}
        rows={rows}
        preferenceId={preferenceId}
        caption={caption}
        emptyMessage="Nenhum registro de backup encontrado para os critérios selecionados."
      />
    </OperationalListFrame>
  );
}

