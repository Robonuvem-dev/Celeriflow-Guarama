import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { budgetAppropriations } from "@/db/schema/finance-budget";
import { employees } from "@/db/schema/administration";
import { departments, roles } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { banks, currencies } from "@/db/schema/master-data";
import { hrEmploymentContracts } from "@/db/schema/personnel-workforce";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { personnelReferenceWhere } from "@/lib/rh/reference-access";
import { personnelDepartmentWhere, personnelEmployeeWhere } from "@/lib/rh/personnel-scope";
import { referenceDefinitions, referenceKindSchema, listReferenceRecords } from "@/lib/rh/reference-records";
import { deletePersonnelReference } from "./actions";
import { ReferenceEditor } from "./ReferenceEditor";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { RhRemoteTablePanel } from "../_components/RhRemoteTablePanel";
import { rhColumn } from "../_components/operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
export const dynamic = "force-dynamic";
function referenceTableRows(source: Awaited<ReturnType<typeof listReferenceRecords>>, definition: typeof referenceDefinitions[keyof typeof referenceDefinitions], choices: Record<string, Array<{ id: string; name: string }>>, kind: string, q: string) {
  return source.filter(r => !q || `${r.code} ${r.name} ${Object.values(r.details).join(" ")}`.toLocaleLowerCase("pt-BR").includes(q)).map(r => ({ id: r.id, label: r.name, values: { code: r.code, name: r.name, details: definition.fields.map(f => `${f.label}: ${choices[f.name]?.find(choice => choice.id === r.details[f.name])?.name ?? r.details[f.name] ?? ""}`).join(" · ") }, links: [{ href: `/rh/cadastros?kind=${kind}&id=${r.id}`, label: "Editar" }] }));
}
export default async function PersonnelReferencePage({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string; q?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;
  const params = await searchParams;
  const requestedKind = referenceKindSchema.catch("FERIADO").parse(params.kind);
  const kind = requestedKind === "LICENCA_EDUCACAO" ? "FERIADO" : requestedKind;
  const definition = referenceDefinitions[kind];
  const scopedReferences = (referenceKind: typeof kind) => database.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.kind, referenceKind), personnelReferenceWhere(context.user, hrReferenceRecords.details))).orderBy(asc(hrReferenceRecords.name));
  const [records, teams, ranges, workers, appropriations, courses, conventions, persons, bankOptions, currencyOptions, contractOptions, roleOptions, departmentOptions] = await Promise.all([
    scopedReferences(kind), scopedReferences("EQUIPE"), scopedReferences("FAIXA"),
    database.select({ id: employees.id, name: employees.name }).from(employees).where(personnelEmployeeWhere(context.user, employees.departmentId, employees.id)).orderBy(asc(employees.name)), database.select({id:budgetAppropriations.id,name:budgetAppropriations.code}).from(budgetAppropriations).where(isSystemAdministrator(context.user) ? undefined : sql`${budgetAppropriations.budgetUnitId}=ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[])`).orderBy(asc(budgetAppropriations.code)),
    scopedReferences("GRADUACAO_CURSO"), scopedReferences("CONVENIO_BANCARIO"),
    database.select({ id: people.id, name: people.fullName }).from(people).where(sql`EXISTS (SELECT 1 FROM "HrReferenceRecord" r WHERE r.kind='PENSAO_VITALICIA' AND r.details->>'beneficiaryPersonId'=${people.id} AND ${personnelReferenceWhere(context.user, sql`r.details`)})`).orderBy(asc(people.fullName)),
    database.select({ id: banks.id, name: banks.name }).from(banks).orderBy(asc(banks.name)),
    database.select({ id: currencies.id, name: currencies.name }).from(currencies).orderBy(asc(currencies.name)),
    database.select({ id: hrEmploymentContracts.id, name: hrEmploymentContracts.registration }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(and(personnelEmployeeWhere(context.user, employees.departmentId, employees.id), personnelDepartmentWhere(context.user, hrEmploymentContracts.departmentId))).orderBy(asc(hrEmploymentContracts.registration)),
    database.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name)),
    database.select({ id: departments.id, name: departments.name }).from(departments).where(personnelDepartmentWhere(context.user, departments.id)).orderBy(asc(departments.name)),
  ]);
  const selected = records.find(r => r.id === params.id);
  const q = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const choices: Record<string, Array<{ id: string; name: string }>> = { teamId: teams, rangeId: ranges, employeeId: workers, appropriationId: appropriations, courseId: courses, conventionId: conventions, beneficiaryPersonId: persons, bankId: bankOptions, currencyId: currencyOptions, contractId: contractOptions, roleId: roleOptions, departmentId: departmentOptions };
  const rows = referenceTableRows(records, definition, choices, kind, q);
  async function loadPageAction(requestedPage: number) {
    "use server";
    const current = await getTenantContextForModule("RH");
    const source = await (current.database ?? db).select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.kind, kind), personnelReferenceWhere(current.user, hrReferenceRecords.details))).orderBy(asc(hrReferenceRecords.name));
    const prepared = referenceTableRows(source, definition, choices, kind, q);
    const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(prepared.length / OPERATIONAL_PAGE_SIZE)));
    return { rows: prepared.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE), page, total: prepared.length };
  }
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title={`Cadastros de RH · ${definition.title}`} description="Referências compartilhadas de pessoal, ponto e relatórios." action={<Link href="/rh/relatorios">Relatórios de RH</Link>} />
    <form className={styles.searchForm}><label>Cadastro<select name="kind" defaultValue={kind} className={styles.searchInput}>{referenceKindSchema.options.filter(k => k !== "LICENCA_EDUCACAO").map(k => <option value={k} key={k}>{referenceDefinitions[k].title}</option>)}</select></label><button className={styles.filterButton}>Abrir</button><Link href="/rh/documentos">Documentos por servidor</Link></form>
    <ReferenceEditor key={selected?.id || kind} title={selected ? `Editar ${selected.name}` : "Novo cadastro"} fields={[
      { name: "kind", label: "Tipo", type: "hidden", defaultValue: kind }, { name: "id", label: "Identificador", type: "hidden", defaultValue: selected?.id },
      { name: "code", label: "Código", required: true, defaultValue: selected?.code }, { name: "name", label: "Nome", required: true, defaultValue: selected?.name },
      ...definition.fields.map(f => ({ name: f.name, label: f.label, required: true, lookupKind: f.name === "beneficiaryPersonId" ? "person" : undefined, type: f.options || choices[f.name] ? "select" as const : f.type || "text" as const, defaultValue: selected?.details[f.name], options: f.options?.map(value => ({ value, label: value })) || choices[f.name]?.map(r => ({ value: r.id, label: r.name })) })),
    ]} />
    {selected && <form action={deletePersonnelReference}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={selected.id} /><button className={styles.filterButton}>Excluir cadastro selecionado</button></form>}
    <RhRemoteTablePanel title={definition.title} preferenceId={`rh-cadastros-${kind}`} initial={{ rows: rows.slice(0, OPERATIONAL_PAGE_SIZE), page: 1, total: rows.length }} loadPageAction={loadPageAction} columns={[rhColumn("code", "Código", 140, 90, "identifier"), rhColumn("name", "Nome", 270, 140), rhColumn("details", "Informações integrais", 600, 180), rhColumn("actions", "Ações", 100, 90, "actions")]} emptyMessage="Nenhum cadastro neste filtro." toolbar={<form className={styles.searchForm}><input type="hidden" name="kind" value={kind} /><input name="q" aria-label="Buscar cadastro" defaultValue={params.q} className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form>} />
  </div>;
}
