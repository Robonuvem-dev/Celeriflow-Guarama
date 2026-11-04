import Link from "next/link";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema/administration";
import { hrEmploymentContracts } from "@/db/schema/personnel-workforce";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { getTenantContextForModule, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { functionalDefinition, functionalKinds, type FunctionalKind } from "@/lib/rh/functional-records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { FunctionalRecordForm } from "./FunctionalRecordForm";
import { canAccessPersonnelClinicalData } from "@/lib/rh/clinical-access";
import { personnelEmployeeWhere, personnelRubricWhere } from "@/lib/rh/personnel-scope";

export const dynamic = "force-dynamic";
export default async function FunctionalRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const params = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const kind = functionalKinds.includes(params.kind as FunctionalKind) ? params.kind as FunctionalKind : "CESSAO";
  const definition = functionalDefinition(kind), admin = isSystemAdministrator(context.user);
  if (kind === "READAPTACAO" && !canAccessPersonnelClinicalData(context.user)) throw new Error("Seu perfil não possui autorização clínica de RH.");
  const scope = admin ? undefined : personnelEmployeeWhere(context.user, employees.departmentId, employees.id);
  const where = and(eq(hrFunctionalRecords.kind, kind), scope, kind === "RECOLHIMENTO_SINDICAL" ? personnelRubricWhere(context.user, sql`${hrFunctionalRecords.data}->>'rubricCode'`) : undefined, params.q ? or(sql`strpos(lower(${hrFunctionalRecords.name}),lower(${params.q}))>0`, sql`strpos(lower(${employees.name}),lower(${params.q}))>0`) : undefined);
  const base = () => database.select().from(hrFunctionalRecords).leftJoin(employees, eq(employees.id, hrFunctionalRecords.employeeId)).leftJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrFunctionalRecords.contractId));
  if (params.view === "manage") {
    const selected = params.edit ? (await base().where(and(where, eq(hrFunctionalRecords.id, params.edit))).limit(1))[0]?.HrFunctionalRecord : undefined;
    const allowed = canPerformModuleOperation(context.user, "RH", selected ? "update" : "create");
    if (!allowed || params.edit && !selected || !definition.holder && !admin) throw new Error("Registro indisponível no seu escopo de acesso.");
    return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><h1 className="text-lg font-semibold">{definition.title}</h1><Link href={`/rh/registros-funcionais?kind=${kind}`}>Voltar à listagem</Link><FunctionalRecordForm key={selected?.id ?? kind} kind={kind} values={selected ? { ...selected, startsAt: selected.startsAt.toISOString().slice(0, 10), endsAt: selected.endsAt?.toISOString().slice(0, 10) ?? "" } : undefined} /></div>;
  }
  const total = (await database.select({ total: count() }).from(hrFunctionalRecords).leftJoin(employees, eq(employees.id, hrFunctionalRecords.employeeId)).where(where))[0].total;
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const selected = await base().where(where).orderBy(asc(hrFunctionalRecords.startsAt), asc(hrFunctionalRecords.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  return <OperationalListFrame label={definition.title} actions={canPerformModuleOperation(context.user, "RH", "create") && (definition.holder || admin) ? <Link href={`/rh/registros-funcionais?kind=${kind}&view=manage`}>Novo registro</Link> : undefined}
    toolbar={<form action="/rh/registros-funcionais" className={styles.searchForm}><select name="kind" aria-label="Modalidade" defaultValue={kind} className={styles.searchInput}>{functionalKinds.map(value => <option key={value} value={value}>{functionalDefinition(value).title}</option>)}</select><input name="q" defaultValue={params.q} aria-label="Buscar registro ou servidor" className={styles.searchInput} /><button className={styles.filterButton}>Consultar</button></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/registros-funcionais" values={{ kind, q: params.q ?? "" }} />}>
    <OperationalTable preferenceId={`rh-registros-funcionais-${kind}`} caption={definition.title} columns={[rhColumn("name", "Registro", 220, 120), rhColumn("holder", "Servidor / vínculo", 230, 130), rhColumn("period", "Vigência", 190, 120), rhColumn("status", "Situação", 100, 80), rhColumn("contents", "Dados integrais", 400, 180), rhColumn("actions", "Ações", 80, 70, "actions")]} rows={selected.map(row => {
      const record = row.HrFunctionalRecord;
      return { id: record.id, label: record.name, values: { name: record.name, holder: [row.Employee?.name, row.HrEmploymentContract?.registration].filter(Boolean).join(" · ") || "Regra geral", period: `${record.startsAt.toISOString().slice(0, 10)} a ${record.endsAt?.toISOString().slice(0, 10) ?? "sem término"}`, status: record.status, contents: definition.fields.map(field => `${field.label}: ${record.data[field.name] ?? ""}`).join(" · ") }, actions: canPerformModuleOperation(context.user, "RH", "update") ? <Link href={`/rh/registros-funcionais?kind=${kind}&view=manage&edit=${record.id}`}>Editar</Link> : undefined };
    })} />
  </OperationalListFrame>;
}
