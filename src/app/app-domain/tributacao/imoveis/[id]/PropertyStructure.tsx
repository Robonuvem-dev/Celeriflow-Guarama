import Link from "next/link";
import type { DatabaseConnection } from "@/db/connection";
import type { TaxActor } from "@/lib/tributacao";
import { readPropertyStructure } from "@/lib/tributacao/property-structure";

export default async function PropertyStructure({ database, actor, id }: { database: DatabaseConnection; actor: TaxActor; id: string }) {
  const structure = await readPropertyStructure(database, actor, id); if (!structure) return null;
  return <section className="shrink-0 space-y-2 rounded border bg-white p-3 text-xs"><h2 className="font-semibold">Terreno e unidades vinculadas</h2><p>Terreno: <Link href={`/tributacao/imoveis/${structure.land.id}`} className="text-emerald-700 underline">{structure.land.inscription}</Link> · {structure.units.length} unidades vigentes</p><p>Área edificada total das unidades: <strong>{structure.totalUnitBuiltArea === null ? "Área de unidade pendente de conciliação" : `${Number(structure.totalUnitBuiltArea).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} m²`}</strong></p><p className="text-slate-600">Soma das áreas próprias das unidades atualmente vinculadas. A área informada diretamente no terreno permanece separada.</p><ul className="flex flex-wrap gap-x-4 gap-y-1">{structure.units.map(unit => <li key={unit.id}><Link href={`/tributacao/imoveis/${unit.id}`} className="text-emerald-700 underline">{unit.inscription}</Link> · {unit.mode} · {unit.builtArea === null ? "Área não informada" : `${unit.builtArea.toLocaleString("pt-BR")} m²`}</li>)}</ul></section>;
}
