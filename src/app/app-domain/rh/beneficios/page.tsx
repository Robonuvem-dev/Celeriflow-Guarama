import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { BeneficioRowActions } from "./BeneficioRowActions";
import { db } from "@/db/client";
import { readBenefitsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("name", "Nome", 230, 140), rhColumn("type", "Tipo", 130, 90), rhColumn("supplier", "Fornecedor", 240, 140), rhColumn("amount", "Valor base", 140, 115, "text", "right"), rhColumn("status", "Status", 90, 76, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function BeneficiosPage(props: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const searchParams = await props.searchParams;
  const q = searchParams?.q || "";
  const { total, pagination, benefits } = await readBenefitsPage(context.database ?? db, { q, page: searchParams?.page });
  return <OperationalListFrame label="Benefícios" actions={<RhNewLink href="/rh/beneficios/novo">Novo benefício</RhNewLink>}
    toolbar={<form action="/rh/beneficios" method="GET" className={styles.searchForm}><input name="q" aria-label="Buscar benefício" defaultValue={q} placeholder="Nome do benefício" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/rh/beneficios" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/beneficios" values={{ q }} />}>
    <OperationalTable preferenceId="rh-beneficios" columns={columns} caption="Benefícios" emptyMessage="Nenhum benefício master cadastrado." rows={benefits.map(ben => ({ id: ben.id, label: ben.name, values: { name: ben.name, type: ben.type, supplier: ben.supplier?.company?.corporateName || ben.supplier?.person?.fullName || "—", amount: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ben.baseValue), status: ben.isActive ? "Ativo" : "Inativo" }, actions: <BeneficioRowActions beneficio={ben} /> }))} />
  </OperationalListFrame>;
}
