import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";
import { departments } from "@/db/schema/administration";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assetCatalogs, catalogDefinition } from "@/lib/patrimonio/catalog-definitions";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { CatalogEditor } from "./CatalogEditor";
import { copyRequestersAction } from "./actions";

export type CatalogSearch = Promise<{ kind?: string; year?: string; edit?: string; page?: string }>;
export async function CatalogPage({ searchParams, module }: { searchParams: CatalogSearch; module: "PATRIMONIO" | "FROTAS" }) {
  const context = await getTenantContextForModule(module);
  const query = await searchParams;
  const options = Object.entries(assetCatalogs).filter(([, value]) => value.module === module);
  const kind = options.some(([key]) => key === query.kind) ? query.kind! : options[0][0];
  const definition = catalogDefinition(kind);
  const year = /^\d{4}$/.test(query.year || "") && Number(query.year) >= 1900 && Number(query.year) <= 2200 ? Number(query.year) : new Date().getUTCFullYear();
  const administrator = isSystemAdministrator(context.user);
  if (!administrator && !context.user.departmentId) throw new Error("Vincule o usuário a um setor.");
  const database = context.database ?? db;
  const records = await database.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, kind), eq(assetCatalogRecords.year, year), administrator ? undefined : eq(assetCatalogRecords.departmentId, context.user.departmentId!))).orderBy(asc(assetCatalogRecords.name), asc(assetCatalogRecords.id));
  const departmentRows = await database.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.isActive, true), administrator ? undefined : eq(departments.id, context.user.departmentId!))).orderBy(asc(departments.name));
  const edit = records.find(record => record.id === query.edit);
  const base = module === "FROTAS" ? "/frotas/cadastros" : "/patrimonio/cadastros";
  const page = Math.min(Math.max(1, Math.trunc(Number(query.page) || 1)), Math.max(1, Math.ceil(records.length / OPERATIONAL_PAGE_SIZE)));
  const columns: OperationalColumn[] = [
    { key: "code", label: "Código", type: "identifier", initialWidth: 120, minWidth: 70, resizable: true, sortable: false, details: "overflow" },
    { key: "name", label: "Nome", type: "text", initialWidth: 220, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
    { key: "department", label: "Setor", type: "text", initialWidth: 180, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
    { key: "details", label: "Dados do cadastro", type: "text", initialWidth: 380, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
    { key: "actions", label: "Ações", type: "actions", initialWidth: 90, minWidth: 70, resizable: false, sortable: false, details: "none" },
  ];
  return <OperationalListFrame label={definition.title} toolbar={<>
    <form className="flex items-center gap-2"><label className="sr-only" htmlFor="catalog-kind">Cadastro</label><select id="catalog-kind" name="kind" defaultValue={kind} className="rounded border p-1 text-sm">{options.map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}</select><label className="flex items-center gap-1 text-sm">Exercício<input className="w-20 rounded border p-1" name="year" type="number" min="1900" max="2200" defaultValue={year} /></label><button className="rounded border px-2 py-1 text-sm">Consultar</button></form>
    <CatalogEditor key={`${kind}:${year}:${edit?.id || "new"}`} kind={kind} year={year} base={base} title={definition.title} fields={definition.fields} departments={departmentRows} initial={{ ...edit?.details, id: edit?.id || "", version: edit?.updatedAt.toISOString() || "", code: edit?.code || "", name: edit?.name || "", departmentId: edit?.departmentId || context.user.departmentId || departmentRows[0]?.id || "" }} />
    {kind === "requisitantes" && <OperationalFilters label="Copiar exercício"><form action={copyRequestersAction} className="space-y-3"><input type="hidden" name="year" value={year} /><label>Setor<select name="departmentId" required>{departmentRows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="rounded border p-2">Copiar requisitantes para {year + 1}</button></form></OperationalFilters>}
  </>} pagination={<OperationalLinkPagination pathname={base} page={page} total={records.length} values={{ kind, year, edit: edit?.id }} />}>
    <OperationalTable preferenceId={`catalogos-${module}-${kind}`} caption={definition.title} columns={columns} rows={records.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(record => ({ id: record.id, label: record.name, values: { code: record.code, name: record.name, department: departmentRows.find(row => row.id === record.departmentId)?.name || record.departmentId, details: definition.fields.map(field => `${field.label}: ${record.details[field.key] || "—"}`).join("\n") }, actions: <Link className="underline" href={`${base}?kind=${kind}&year=${year}&page=${page}&edit=${encodeURIComponent(record.id)}`}>Editar</Link> }))} />
  </OperationalListFrame>;
}
