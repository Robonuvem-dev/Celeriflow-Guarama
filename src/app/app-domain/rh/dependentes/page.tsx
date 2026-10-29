import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { DependenteRowActions } from "./DependenteRowActions";
import { db } from "@/db/client";
import { readDependentsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";

const columns = [rhColumn("employee", "Servidor responsável", 260, 160), rhColumn("name", "Dependente", 260, 150), rhColumn("relationship", "Parentesco", 160, 100), rhColumn("birth", "Nascimento", 130, 110), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function DependentesPage(props: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const searchParams = await props.searchParams;
  const q = searchParams?.q || "";
  const { total, pagination, dependents } = await readDependentsPage(context.database ?? db, { q, page: searchParams?.page });
  return <OperationalListFrame label="Dependentes"
    toolbar={<form action="/rh/dependentes" method="GET" className={styles.searchForm}><input name="q" aria-label="Buscar por dependente ou servidor" defaultValue={q} placeholder="Dependente ou servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/rh/dependentes" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/dependentes" values={{ q }} />}>
    <OperationalTable preferenceId="rh-dependentes" columns={columns} caption="Dependentes — cadastro na ficha do servidor" emptyMessage="Nenhum dependente encontrado." rows={dependents.map(dep => ({ id: dep.id, label: dep.name, values: { employee: dep.employee?.name || "—", name: dep.name, relationship: dep.relationship, birth: dep.birthDate ? format(new Date(dep.birthDate), "dd/MM/yyyy") : "—" }, actions: <DependenteRowActions dependent={dep} /> }))} />
  </OperationalListFrame>;
}
