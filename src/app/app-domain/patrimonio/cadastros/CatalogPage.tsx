import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";
import { departments } from "@/db/schema/administration";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assetCatalogs, catalogDefinition } from "@/lib/patrimonio/catalog-definitions";
import { copyRequestersAction, saveCatalogAction } from "./actions";

export type CatalogSearch = Promise<{ kind?: string; year?: string; edit?: string }>;
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
  const records = await database.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, kind), eq(assetCatalogRecords.year, year), administrator ? undefined : eq(assetCatalogRecords.departmentId, context.user.departmentId!))).orderBy(asc(assetCatalogRecords.name));
  const departmentRows = await database.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.isActive, true), administrator ? undefined : eq(departments.id, context.user.departmentId!))).orderBy(asc(departments.name));
  const edit = records.find(record => record.id === query.edit);
  const base = module === "FROTAS" ? "/frotas/cadastros" : "/patrimonio/cadastros";
  const inputClass = "rounded border p-2 text-sm w-full";
  return <main className="space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Cadastros auxiliares — {module === "FROTAS" ? "Frotas" : "Patrimônio e Almoxarifado"}</h1>
    <nav className="flex flex-wrap gap-3" aria-label="Cadastros">{options.map(([key, item]) => <Link className="underline" aria-current={kind === key ? "page" : undefined} key={key} href={`${base}?kind=${key}&year=${year}`}>{item.title}</Link>)}</nav>
    <form className="flex items-end gap-3"><input type="hidden" name="kind" value={kind} /><label>Exercício<input className={inputClass} name="year" type="number" min="1900" max="2200" defaultValue={year} /></label><button className="rounded border p-2">Consultar</button></form>
    <h2 className="text-xl font-medium">{definition.title}</h2>
    <form action={saveCatalogAction} className="grid gap-3 rounded border p-4 md:grid-cols-2">
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="year" value={year} /><input type="hidden" name="id" value={edit?.id || ""} /><input type="hidden" name="version" value={edit?.updatedAt.toISOString() || ""} />
      <label>Setor<select className={inputClass} required name="departmentId" defaultValue={edit?.departmentId || context.user.departmentId || ""}>{departmentRows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Código<input className={inputClass} name="code" required maxLength={80} defaultValue={edit?.code || ""} /></label>
      <label>Nome<input className={inputClass} name="name" required maxLength={250} defaultValue={edit?.name || ""} /></label>
      {definition.fields.map(field => <label key={field.key}>{field.label}<input className={inputClass} name={field.key} required={field.required} type={field.type || "text"} step={field.type === "number" ? "any" : undefined} min={field.type === "number" ? "0" : undefined} maxLength={4000} defaultValue={edit?.details[field.key] || ""} /></label>)}
      <button className="rounded bg-blue-700 p-2 text-white">{edit ? "Salvar alterações" : "Cadastrar"}</button>{edit && <Link href={`${base}?kind=${kind}&year=${year}`}>Cancelar edição</Link>}
    </form>
    {kind === "requisitantes" && <form action={copyRequestersAction} className="flex gap-3"><input type="hidden" name="year" value={year} /><label>Setor<select name="departmentId" required>{departmentRows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="rounded border p-2">Copiar requisitantes para {year + 1}</button></form>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="text-left">{records.length} registros no exercício {year}</caption><thead><tr><th>Código</th><th>Nome</th><th>Setor</th>{definition.fields.map(field => <th key={field.key}>{field.label}</th>)}<th>Ações</th></tr></thead><tbody>{records.map(record => <tr key={record.id} className="border-t"><td>{record.code}</td><td>{record.name}</td><td>{departmentRows.find(row => row.id === record.departmentId)?.name || record.departmentId}</td>{definition.fields.map(field => <td key={field.key}>{record.details[field.key]}</td>)}<td><Link className="underline" href={`${base}?kind=${kind}&year=${year}&edit=${record.id}`}>Editar</Link></td></tr>)}</tbody></table></div>
  </main>;
}
