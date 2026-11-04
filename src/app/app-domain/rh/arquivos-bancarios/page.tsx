import Link from "next/link";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { hrIntegrationEvents, payrolls } from "@/db/schema/personnel-workforce";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { rhColumn } from "../_components/operational-columns";
import { BankFileForm } from "./BankFileForm";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
export default async function BankFilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports"), database = context.database ?? db, params = await searchParams;
  if (params.view === "manage") return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><h1 className="text-lg font-semibold">Gerar arquivo bancário de RH</h1><Link href="/rh/arquivos-bancarios">Voltar aos arquivos</Link><BankFileForm today={new Date().toISOString().slice(0, 10)} /></div>;
  const where = and(eq(hrIntegrationEvents.eventType, "ARQUIVO_BANCARIO_RH_GERADO"), accessiblePayrollWhere(context.user), params.q ? sql`strpos(lower(concat_ws(' ',${hrIntegrationEvents.payload}#>>'{input,layout}',${hrIntegrationEvents.payload}->>'competence',${hrIntegrationEvents.payload}#>>'{input,sequence}',${hrIntegrationEvents.payload}->>'fileSha256')),lower(${params.q}))>0` : undefined);
  const join = sql`${payrolls.id}=${hrIntegrationEvents.payload}->>'payrollId'`;
  const total = (await database.select({ total: count() }).from(hrIntegrationEvents).innerJoin(payrolls, join).where(where))[0].total;
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? '1') || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const selected = await database.select({ event: hrIntegrationEvents }).from(hrIntegrationEvents).innerJoin(payrolls, join).where(where).orderBy(desc(hrIntegrationEvents.createdAt), desc(hrIntegrationEvents.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  return <OperationalListFrame label="Arquivos bancários de RH" actions={<Link href="/rh/arquivos-bancarios?view=manage">Novo arquivo</Link>} toolbar={<form action="/rh/arquivos-bancarios" className={styles.searchForm}><input name="q" defaultValue={params.q} aria-label="Buscar leiaute, competência, sequência ou SHA-256" className={styles.searchInput} /><button className={styles.filterButton}>Consultar</button></form>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/arquivos-bancarios" values={{ q: params.q }} />}>
    <OperationalTable preferenceId="rh-arquivos-bancarios" caption="Arquivos gerados e relações de crédito" columns={[rhColumn('layout','Leiaute / competência',230,120),rhColumn('parameters','Remessa / data',220,120),rhColumn('total','Quantidade / total BRL',200,110),rhColumn('hash','SHA-256',400,140),rhColumn('actions','Emissões',240,160,'actions')]} rows={selected.map(({ event }) => {
      const data = event.payload as { input: { layout: string; sequence: number; paymentDate: string }; competence: string; total: string; statementIds: string[]; fileSha256: string };
      return { id: event.id, label: `${data.input.layout} ${data.competence}`, values: { layout: `${data.input.layout} · ${data.competence}`, parameters: `${data.input.sequence} · ${data.input.paymentDate}`, total: `${data.statementIds.length} · ${data.total}`, hash: data.fileSha256 }, actions: <><a href={`/api/rh/arquivos-bancarios/${event.id}`}>Arquivo TXT</a><a href={`/api/rh/arquivos-bancarios/${event.id}?format=PDF`}>Relação PDF</a><a href={`/api/rh/arquivos-bancarios/${event.id}?format=CSV`}>Relação CSV</a><a href={`/api/rh/arquivos-bancarios/${event.id}?format=XLSX`}>Relação XLSX</a></> };
    })} />
  </OperationalListFrame>;
}
