import Link from "next/link";
import { db } from "@/db/client";
import { readOwnNfsePage } from "@/db/repositories/taxation/nfse-documents";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";

export default async function OwnInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; competence?: string }>;
}) {
  const account = await getCitizenAccount("/portal/nfse");
  const query = await searchParams;
  const competence = typeof query.competence === "string" && /^\d{2}\/\d{4}$/.test(query.competence) ? query.competence : "";
  const { rows, total, page } = await readOwnNfsePage(db, account.id, competence, Number.parseInt(query.page || "1", 10) || 1);
  const href = (target: number) => `?${new URLSearchParams({ competence, page: String(target) })}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800 hover:underline">
          ← Minha área
        </Link>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link
            href="/portal/tributario/declaracoes"
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800"
          >
            Módulo CF09 — Gestão do ISSQN e Declarações &rarr;
          </Link>
          <Link
            href="/portal/tributario/declaracoes?tab=guia-parcial"
            className="rounded-lg border border-emerald-700 px-3 py-1.5 text-emerald-800 hover:bg-emerald-50"
          >
            Guia Parcial ISSQN (9.34)
          </Link>
        </div>
      </div>

      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Minhas NFS-e (Notas Fiscais de Serviços)</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Consulta de notas próprias como prestador ou tomador com autenticidade, emissão de guias, cópia de notas (9.91)
          e solicitação de cancelamento regulamentar (9.37 / 9.106 / 9.122).
        </p>
      </header>

      <form className="flex gap-3">
        <input
          name="competence"
          defaultValue={competence}
          placeholder="Competência MM/AAAA"
          aria-label="Competência"
          pattern="\d{2}/\d{4}"
          className="rounded border border-slate-300 p-2.5 text-sm"
        />
        <button className="rounded bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          Filtrar Competência
        </button>
      </form>

      <ul className="space-y-3">
        {rows.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-slate-900">
                NFS-e nº {item.invoiceNumber} &bull; Competência {item.competence}
              </p>
              <span className="rounded bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {item.status}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-700">
              Valor do Serviço: <strong>R$ {item.serviceValueDecimal?.toFixed(2) || "Valor não conciliado"}</strong> &bull;
              ISSQN: <strong>R$ {item.issValueDecimal?.toFixed(2) || "Valor não conciliado"}</strong> &bull;
              <span className="ml-1 text-xs text-slate-500">({item.issRetained ? "ISS Retido na Fonte" : "ISS Próprio a Recolher"})</span>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-2 text-xs font-semibold">
              <Link
                href={`/portal/nfse/${item.verificationCode}`}
                className="text-emerald-800 underline hover:text-emerald-900"
              >
                Consulta de autenticidade ({item.verificationCode})
              </Link>
              <Link
                href={`/portal/tributario/declaracoes?tab=guia-parcial`}
                className="text-emerald-800 underline hover:text-emerald-900"
              >
                Incluir em Guia Parcial (9.34)
              </Link>
              <Link
                href={`/portal/tributario/declaracoes`}
                className="text-red-700 underline hover:text-red-800"
              >
                Solicitar Cancelamento (9.37 / 9.106)
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {!rows.length && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Nenhuma nota fiscal localizada para o período e os vínculos autorizados.
        </div>
      )}

      <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="notas" />

      <div className="border-t pt-4">
        <Link href="/portal/minha-area/servicos?audience=CONTRIBUINTE" className="text-sm font-semibold text-emerald-800 underline">
          Solicitar novos serviços fiscais na Prefeitura &rarr;
        </Link>
      </div>
    </main>
  );
}
