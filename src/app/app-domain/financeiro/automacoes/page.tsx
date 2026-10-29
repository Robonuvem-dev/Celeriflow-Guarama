import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { pocVirtualBank } from "@/lib/poc/poc-config";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import AutomationRuns from "./AutomationRuns";
import { db } from "@/db/client";
import { readFinancePageAutomations } from "@/db/repositories/finance-pages/banking";

function displayDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(value);
}

type DownloadSummary = {
  id: string;
  banco: string;
  agencia: string;
  contaNumero: string;
  hashSHA256: string;
  status: string;
  createdAt: Date;
};

type RunSummary = {
  id: string;
  operation: string;
  environment: string;
  status: string;
  message: string;
  createdAt: Date;
  connection: { name: string; code: string };
};

export default async function AutomacoesFinanceirasPage() {
  let downloads: DownloadSummary[] = [];
  let runs: RunSummary[] = [];
  let loadError: string | null = null;

  try {
    const context = await getTenantContextForModule("FINANCEIRO");
    ({ downloads, runs } = await readFinancePageAutomations(context.database ?? db, pocVirtualBank.name));
  } catch (error) {
    console.error("Erro ao carregar automações financeiras:", error);
    loadError = "Não foi possível carregar o histórico agora. Tente novamente em instantes.";
  }
  const failures = runs.filter((run) => run.status === "FALHA").length;

  return <FinanceOperationalList label="Extratos e evidências" preferenceId="financeiro-automacoes" state={loadError ? "error" : "ready"} errorMessage={loadError ?? undefined}
    columns={[financeColumn("date", "Execução", 150), financeColumn("bank", "Banco", 110, 180), financeColumn("agency", "Agência", 75), financeColumn("account", "Conta", 90), financeColumn("hash", "Integridade SHA-256", 150, 260, "identifier"), financeColumn("status", "Status", 100, 130, "status"), financeColumn("actions", "Abrir", 48, 48, "actions")]}
    actions={<Link className={styles.newButton} href="/financeiro/download-extratos">Nova automação</Link>}
    toolbar={<><span>{downloads.length} extratos · {runs.length} execuções · {failures} falhas</span><OperationalFilters label="Execuções da integração bancária"><AutomationRuns runs={runs.map(run => ({ id: run.id, date: displayDate(run.createdAt), connection: run.connection.name, operation: run.operation, status: run.status, message: run.message, environment: run.environment }))} /></OperationalFilters></>}
    rows={downloads.map(download => ({ id: download.id, label: download.contaNumero, values: { date: displayDate(download.createdAt), bank: download.banco, agency: download.agencia, account: download.contaNumero, hash: download.hashSHA256, status: download.status }, actions: <a className={styles.iconButton} aria-label={`Abrir extrato ${download.contaNumero}`} href={`/api/financeiro/extratos/${download.id}`}><ExternalLink /></a> }))} />;
}
