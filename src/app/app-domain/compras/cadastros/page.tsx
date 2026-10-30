import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { procurementAuxiliaryCatalogs } from "@/lib/compras/auxiliary-catalogs";
export default async function Page() {
  await getTenantContextForModule("COMPRAS");
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">Cadastros de Compras e Licitação</h1><Link href="/compras">Voltar para Compras</Link><ul className="space-y-2">{Object.entries(procurementAuxiliaryCatalogs).map(([key, definition]) => <li key={key}><Link className="underline" href={`/compras/cadastros/${key}`}>{definition.title}</Link></li>)}</ul></main>;
}
