import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ServidorRowActions } from "./ServidorRowActions";
import { db } from "@/db/client";
import { readEmployeesPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("name", "Nome", 240, 140), rhColumn("cpf", "CPF", 140, 112, "identifier"), rhColumn("registration", "Matrícula", 110, 90, "identifier"), rhColumn("role", "Cargo", 180, 100), rhColumn("department", "Setor", 160, 100), rhColumn("status", "Status", 90, 76, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function ServidoresPage(props: { searchParams?: Promise<{ q?: string; status?: string; departmentId?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const searchParams = await props.searchParams;
  const q = searchParams?.q || "", status = searchParams?.status || "", departmentId = searchParams?.departmentId || "";
  const { total, pagination, employees, departments } = await readEmployeesPage(context.database ?? db, { q, status, departmentId, page: searchParams?.page });
  return <OperationalListFrame label="Servidores"
    actions={<RhNewLink href="/rh/servidores/novo">Novo servidor</RhNewLink>}
    toolbar={<>
      <form action="/rh/servidores" method="GET" className={styles.searchForm}>
        <input type="hidden" name="status" value={status} /><input type="hidden" name="departmentId" value={departmentId} />
        <input name="q" aria-label="Buscar servidor por nome, CPF ou matrícula" defaultValue={q} placeholder="Nome, CPF ou matrícula" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button>
      </form>
      <OperationalFilters activeCount={Number(!!status) + Number(!!departmentId)}>
        <form action="/rh/servidores" method="GET" className={styles.filterFields}>
          <input type="hidden" name="q" value={q} />
          <label>Status<select name="status" defaultValue={status}><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
          <label>Setor<select name="departmentId" defaultValue={departmentId}><option value="">Todos</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <button className={styles.primaryButton}>Aplicar</button><Link href="/rh/servidores">Limpar</Link>
        </form>
      </OperationalFilters>
    </>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/servidores" values={{ q, status, departmentId }} />}>
    <OperationalTable preferenceId="rh-servidores" columns={columns} caption="Servidores" emptyMessage="Nenhum servidor encontrado." rows={employees.map(emp => ({ id: emp.id, label: emp.name, values: { name: emp.name, cpf: emp.cpf || "Sem CPF", registration: emp.registration || "Sem Matrícula", role: emp.role?.name || "—", department: emp.department?.name || "—", status: emp.isActive ? "Ativo" : "Inativo" }, actions: <ServidorRowActions employee={emp} /> }))} />
  </OperationalListFrame>;
}
