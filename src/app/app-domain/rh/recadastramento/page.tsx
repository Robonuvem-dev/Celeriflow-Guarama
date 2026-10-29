import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listRecertificationProgress } from "@/lib/rh/recertification";
import { db } from "@/db/client";
import { readRecertificationAudience } from "@/db/repositories/personnel-pages/catalog";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

export const dynamic = "force-dynamic";
const columns = [rhColumn("name", "Servidor", 300, 160), rhColumn("active", "Cadastro ativo", 160, 120, "status"), rhColumn("status", "Situação", 190, 130, "status"), rhColumn("actions", "Análise", 180, 160, "actions")];

export default async function CampaignProgress({ searchParams }: { searchParams: Promise<{ campaignId?: string; page?: string; status?: string }> }) {
  const context = await getTenantContextForModule("RH"), executor = context.database ?? db;
  const params = await searchParams;
  const audience = await readRecertificationAudience(executor, context.user);
  const campaigns = await listRecertificationProgress(executor, audience);
  const selected = campaigns.find(campaign => campaign.id === params.campaignId) || campaigns[0];
  const status = ["PENDENTE", "EM_ANALISE", "PENDENTE_CORRECAO", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status : undefined;
  const rows = selected?.recipients.filter(recipient => !status || recipient.status === status) || [];
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Campanhas de recadastramento" actions={<RhNewLink href="/rh/recadastramento/configurar">Configurar campanha assistida</RhNewLink>}
    toolbar={<><OperationalFilters label="Campanha e situação" activeCount={Number(!!status)}><form method="GET" className={styles.filterFields}><label>Campanha<select name="campaignId" defaultValue={selected?.id}>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label><label>Situação<select name="status" defaultValue={status || ""}><option value="">Todas as situações</option>{["PENDENTE", "EM_ANALISE", "PENDENTE_CORRECAO", "DEFERIDA", "INDEFERIDA"].map(value => <option key={value}>{value}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/rh/recadastramento">Limpar</Link></form></OperationalFilters><OperationalFilters label="Resumo da campanha">{selected ? <p>{selected.name} · {selected.startsAt} até {selected.endsAt} · {selected.recipients.length} convocados · {selected.recipients.filter(recipient => recipient.status !== "PENDENTE").length} responderam · {selected.recipients.filter(recipient => recipient.status === "DEFERIDA").length} aprovados · {rows.length} registros no filtro</p> : <p>Cadastre uma regra JSON de campanha na categoria PORTAL em Parametrizações. O formato está documentado no registro de execução de RH.</p>}</OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={rows.length} pathname="/rh/recadastramento" values={{ campaignId: selected?.id, status }} />}>
    <OperationalTable columns={columns} preferenceId="rh-recadastramento" caption="Convocados para recadastramento" emptyMessage="Nenhum convocado neste filtro." rows={rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.employeeId, label: row.name, values: { name: row.name, active: row.employeeActive ? "Sim" : "Não", status: row.status }, actions: row.requestId ? <Link href={`/rh/solicitacoes?status=${row.status}`}>Abrir fila de análise</Link> : undefined }))} />
  </OperationalListFrame>;
}
