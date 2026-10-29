import Link from "next/link";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LaboratoryClient, type LaboratoryRow } from "./LaboratoryClient";
import { db } from "@/db/client";
import { healthLaboratoryConfigurationPage } from "@/db/repositories/health-pages/catalogs";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function LaboratoryPage({ searchParams }: { searchParams: Promise<{ unidade?: string | string[]; page?: string | string[] }> }) {
  const context = await getTenantContextForModule("SAUDE");
  const params = await searchParams;
  const unitId = (first(params.unidade) || "").slice(0, 64);
  const requestedPage = Number(first(params.page)) || 1;
  const { total, page, configurations, units } = await healthLaboratoryConfigurationPage(context.database ?? db, unitId, requestedPage);
  const rows: LaboratoryRow[] = configurations.map(row => ({ ...row, unitName: row.unit.name, createdBy: row.createdByUsuario.nome, createdAt: row.createdAt.toISOString() }));
  return <OperationalListFrame label="Configuração laboratorial" actions={<Link href="/saude/administracao">Administração</Link>} toolbar={<form className={styles.searchForm}><select aria-label="Unidade" name="unidade" defaultValue={unitId}><option value="">Todas as unidades</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button className={styles.filterButton}>Filtrar</button></form>} pagination={<OperationalLinkPagination page={page} total={total} values={{ unidade: unitId }} />}><LaboratoryClient rows={rows} units={units} canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")} /></OperationalListFrame>;
}
