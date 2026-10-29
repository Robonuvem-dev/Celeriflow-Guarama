import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import Link from "next/link";
import { Download, Plus, Truck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalFilters, OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import FornecedoresClient from "./FornecedoresClient";
import { getSupplierList, hasActiveSupplierFilters, parseSupplierFilters, supplierFilterSearchParams } from "./supplier-query";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("CADASTROS");
  const filters = parseSupplierFilters(await searchParams);
  const referenceDate = new Date();
  const list = await getSupplierList(context.database ?? db, filters, referenceDate);
  const canCreate = canPerformModuleOperation(context.user, "CADASTROS", "create");
  const canUpdate = canPerformModuleOperation(context.user, "CADASTROS", "update");
  const canIssueReports = canPerformModuleOperation(context.user, "CADASTROS", "issueReports");
  const activeFilters = hasActiveSupplierFilters(filters);
  const queryValues = Object.fromEntries(supplierFilterSearchParams(filters, false));
  const reportParams = supplierFilterSearchParams(filters, false).toString();
  const reportHref = `/cadastros/fornecedores/relatorio${reportParams ? `?${reportParams}` : ""}`;
  return <PageFrame className="flex h-full min-h-0 flex-col">
    <PageHeader title="Fornecedores" icon={<Truck className="size-4" />} />
    <OperationalListFrame actions={<>
      {canIssueReports && <Link href={reportHref} prefetch={false} aria-label="Baixar relatório CSV de fornecedores" className={styles.dialogButton}><Download />Relatório CSV</Link>}
      {canCreate && <Link href="/cadastros/fornecedores/novo" aria-label="Adicionar fornecedor" className={styles.newButton}><Plus /><span className={styles.newLabel}>Adicionar fornecedor</span></Link>}
    </>} toolbar={<>
      <form method="get" className={styles.searchForm}>{Object.entries(queryValues).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} name={key} value={value} type="hidden" />)}<input name="q" type="search" defaultValue={filters.query} aria-label="Buscar fornecedor" placeholder="Nome, CPF, CNPJ, ME/EPP ou situação" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form>
      <OperationalFilters activeCount={[filters.classification !== "ALL", filters.status !== "ALL", filters.certification !== "ALL", !!filters.validFrom, !!filters.validUntil].filter(Boolean).length}>
        <form method="get" className={styles.filterFields}>
          <input name="q" type="hidden" value={filters.query} />
          <label>Enquadramento empresarial<select name="classification" defaultValue={filters.classification}><option value="ALL">Todos</option><option value="ME">ME</option><option value="EPP">EPP</option><option value="ME_EPP">ME ou EPP</option></select></label>
          <label>Situação cadastral<select name="status" defaultValue={filters.status}><option value="ALL">Todas</option>{["Ativo", "Inativo", "Suspenso"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Situação das certidões<select name="certification" defaultValue={filters.certification}><option value="ALL">Todas</option><option value="VENCIDA">Vencidas</option><option value="VENCE_EM_BREVE">Vencem em 30 dias</option><option value="VIGENTE">Vigentes acima de 30 dias</option><option value="SEM_VALIDADE">Sem validade</option></select></label>
          <label>Vencimento a partir de<input name="validFrom" type="date" defaultValue={filters.validFrom} /></label><label>Vencimento até<input name="validUntil" type="date" defaultValue={filters.validUntil} /></label>
          <div className={styles.dialogButtons}><button className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button><Link href="/cadastros/fornecedores" className={styles.dialogButton}>Limpar</Link></div>
        </form>
      </OperationalFilters>
      {activeFilters && <Link href="/cadastros/fornecedores" className={styles.filterButton}>Limpar</Link>}
    </>} pagination={<OperationalLinkPagination pathname="/cadastros/fornecedores" page={list.page} total={list.total} values={queryValues} />}>
      <FornecedoresClient suppliers={list.suppliers} canUpdate={canUpdate} hasFilters={activeFilters} referenceDate={referenceDate.toISOString()} />
    </OperationalListFrame>
  </PageFrame>;
}
