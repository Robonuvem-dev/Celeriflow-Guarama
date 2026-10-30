import Link from "next/link";
import { db } from "@/db/client";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { parseRecyclingEntries, recyclingCatalogs, type RecyclingEntry } from "@/lib/environment/recycling-catalog";
import { saveRecyclingEntry } from "./actions";

export const dynamic = "force-dynamic";
function EntryForm({ kind, entry }: { kind: RecyclingEntry["kind"]; entry?: RecyclingEntry }) {
  return <form action={saveRecyclingEntry} className="grid gap-3 rounded border p-4 sm:grid-cols-2">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="mode" value={entry ? "update" : "create"} />
    <label>Código<input className="block w-full rounded border p-2" required name="code" maxLength={40} readOnly={!!entry} defaultValue={entry?.code} /></label>
    <label>Nome<input className="block w-full rounded border p-2" required name="name" minLength={2} maxLength={160} defaultValue={entry?.name} /></label>
    <label>Descrição<textarea className="block w-full rounded border p-2" name="description" maxLength={2000} defaultValue={entry?.description} /></label>
    {(kind === "centers" || kind === "depots") && <label>Endereço<input className="block w-full rounded border p-2" name="address" maxLength={500} defaultValue={entry?.address} /></label>}
    <label><input type="checkbox" name="active" defaultChecked={entry?.active ?? true} /> Ativo</label>
    <button className="rounded bg-emerald-800 p-2 text-white">{entry ? "Salvar alterações" : "Cadastrar"}</button>
  </form>;
}
export default async function RecyclingCatalogPage({ searchParams }: { searchParams: Promise<{ catalog?: string; q?: string }> }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const query = await searchParams;
  const kind: RecyclingEntry["kind"] = Object.hasOwn(recyclingCatalogs, query.catalog ?? "") ? query.catalog as RecyclingEntry["kind"] : "units";
  const instance = await findOperationalInstance(context.database ?? db);
  const entries = parseRecyclingEntries(instance?.parametros.filter(parameter => parameter.chave.startsWith("RECYCLING_CATALOG:")).map(parameter => parameter.valor) ?? [])
    .filter(entry => entry.kind === kind && `${entry.code} ${entry.name} ${entry.description} ${entry.address}`.toLocaleLowerCase("pt-BR").includes((query.q ?? "").toLocaleLowerCase("pt-BR")));
  return <main className="space-y-5 p-5"><h1 className="text-xl font-semibold">Cadastros de reciclagem</h1>
    <nav className="flex flex-wrap gap-3">{Object.entries(recyclingCatalogs).map(([key, label]) => <Link aria-current={key === kind ? "page" : undefined} className="underline" key={key} href={`?catalog=${key}`}>{label}</Link>)}</nav>
    <h2>{recyclingCatalogs[kind]}</h2><form><input type="hidden" name="catalog" value={kind} /><input aria-label="Buscar cadastro" name="q" defaultValue={query.q} className="rounded border p-2" /><button className="p-2">Buscar</button></form>
    {!instance ? <p>Configure a instância municipal para habilitar os cadastros.</p> : <><details><summary>Novo cadastro</summary><EntryForm kind={kind} /></details>
    <ul className="space-y-3">{entries.map(entry => <li key={entry.code} className="rounded border p-3"><p>{entry.code} · {entry.name} · {entry.active ? "Ativo" : "Inativo"}</p><p>{entry.description} {entry.address}</p><details><summary>Editar cadastro</summary><EntryForm kind={kind} entry={entry} /></details></li>)}</ul>{!entries.length && <p>Nenhum cadastro encontrado.</p>}</>}
  </main>;
}
