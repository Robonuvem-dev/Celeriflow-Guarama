import Link from "next/link";
import { ArrowLeft, CheckCircle2, QrCode, ShieldCheck } from "lucide-react";
import CentralValidationForm from "@/components/signatures/CentralValidationForm";

export default async function PublicReceiptValidationIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  const initialCode = typeof code === "string" ? code.slice(0, 256) : "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5" />
          Voltar ao Portal Institucional
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <ShieldCheck className="size-6 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Validação Pública de Contracheques</h1>
              <p className="mt-0.5 text-xs text-emerald-100">
                Verifique a autenticidade e a integridade de demonstrativos emitidos no Portal do Servidor.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm leading-6 text-slate-600">
            Informe o <strong>código identificador ou chave criptográfica</strong> impresso no rodapé do
            demonstrativo de pagamento (contracheque ou recibo funcional) para validar a emissão original.
          </p>

          <form action="/validar-recibo" method="GET" className="mt-5 space-y-4">
            <div>
              <label htmlFor="receipt-code" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Código de Autenticidade do Recibo
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="receipt-code"
                  name="code"
                  type="text"
                  required
                  defaultValue={initialCode}
                  placeholder="Ex: 550e8400-e29b-41d4-a716-446655440000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition-colors"
                >
                  Verificar
                </button>
              </div>
            </div>
          </form>

          {initialCode && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Link
                href={`/validar-recibo/${encodeURIComponent(initialCode)}`}
                className="inline-flex items-center gap-2 font-bold text-emerald-800 hover:underline text-sm"
              >
                <CheckCircle2 className="size-4" />
                Clique aqui para abrir o laudo de verificação do código &rarr;
              </Link>
            </div>
          )}

          <div className="mt-8 border-t border-slate-100 pt-5 text-xs text-slate-500 space-y-1.5">
            <p className="flex items-center gap-1.5 font-medium text-slate-700">
              <QrCode className="size-4 text-emerald-700" />
              Onde encontro este código?
            </p>
            <p>
              O código de autenticidade é emitido no rodapé de todos os contracheques oficiais gerados no Portal
              do Servidor, acompanhado do endereço público de verificação.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
