import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import ConstructionCompaniesClient from "./ConstructionCompaniesClient";
import { db } from "@/db/client";
import { loadPageCompanies } from "@/db/repositories/works-pages/professionals";

export default async function ConstructionCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const query = await searchParams; const q = (query.q || "").trim().slice(0,160); const status = query.status === "inactive" ? "inactive" : query.status === "all" ? "all" : "active";
  const { total, page, rows, companies } = await loadPageCompanies(context.database ?? db, { q, status, page: query.page });
  const today = new Date(new Date().toISOString().slice(0,10) + "T00:00:00Z");
  return <OperationalListFrame actions={<OperationalFilters label="Habilitar / atualizar construtora"><ConstructionCompaniesClient canManage={access.administrator || access.roles.includes("MANAGER")} companies={companies.map(company => ({ id: company.id, name: company.corporateName }))} profiles={rows.map(row => ({ companyId: row.companyId, startsAt: row.startsAt.toISOString().slice(0,10), endsAt: row.endsAt.toISOString().slice(0,10), isActive: row.isActive, legalReference: row.legalReference }))} /></OperationalFilters>}
    toolbar={<form role="search" className={styles.searchForm}><input name="q" aria-label="Buscar construtora" defaultValue={q} placeholder="Buscar construtora" className={styles.searchInput} /><select aria-label="Situação" name="status" defaultValue={status} className="h-7 rounded border"><option value="active">Ativas</option><option value="inactive">Inativas</option><option value="all">Todas</option></select><button className={styles.dialogButton}>Filtrar</button></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/construtoras" values={{ q, status }} />}>
    <OperationalTable preferenceId="obras-construtoras" caption="Habilitação e validade de construtoras" columns={operationalColumns([["company", "Empresa", 400, 180, "identifier"], ["start", "Início", 140, 100], ["end", "Validade", 140, 100], ["status", "Situação", 140, 100, "status"]])} rows={rows.map(row => ({ id: row.id, label: row.company.corporateName, values: { company: row.company.corporateName, start: row.startsAt.toLocaleDateString("pt-BR"), end: row.endsAt.toLocaleDateString("pt-BR"), status: row.isActive ? row.endsAt < today ? "Vencida" : row.startsAt > today ? "Futura" : "Ativa" : "Inativa" } }))} />
  </OperationalListFrame>;
}
