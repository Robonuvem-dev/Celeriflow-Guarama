import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { procurementAuxiliaryCatalogs } from "@/lib/compras/auxiliary-catalogs";
import { Gavel } from "lucide-react";

export default async function Page() {
  await getTenantContextForModule("COMPRAS");
  return (
    <main className="space-y-4 p-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h1 className="text-xl font-semibold">Cadastros de Compras e Licitação</h1>
        <Link className="text-sm underline text-muted-foreground hover:text-foreground" href="/compras">Voltar para Compras</Link>
      </div>

      <div className="rounded-md border p-4 bg-amber-50/50 border-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 text-amber-900">
              <Gavel className="size-4 text-amber-600" />
              Gestão Especializada de Alienações (11.20 a 11.27)
            </h2>
            <p className="text-xs text-amber-800 mt-1">
              Painel integrado de processos de receita por alienação, leilão e concorrência, planilha de bens/sucatas, participantes e mapas de apuração.
            </p>
          </div>
          <Link
            href="/compras/cadastros/alienacoes"
            className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-semibold hover:bg-amber-700 transition-colors shadow-sm"
          >
            Acessar Módulo de Alienações &rarr;
          </Link>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(procurementAuxiliaryCatalogs).map(([key, definition]) => (
          <li key={key} className="rounded border p-2.5 bg-card hover:bg-muted/40 transition-colors">
            <Link className="text-sm font-medium hover:underline text-foreground block" href={`/compras/cadastros/${key}`}>
              {definition.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
