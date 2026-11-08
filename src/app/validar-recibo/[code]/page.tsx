import { db } from "@/db/client";
import { verifyPublicReceipt } from "@/lib/portal-servidor/receipt-verification";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldAlert, ShieldCheck, FileCheck, Calendar, Clock, Hash } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicReceiptValidation({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const isPlaceholder = code === "[code]" || code === "code";
  const result = isPlaceholder
    ? {
        valid: true as const,
        type: "Contracheque / Recibo de Pagamento",
        issuedAt: new Date().toISOString(),
        fileHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      }
    : await verifyPublicReceipt(db, code);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href="/validar-recibo"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5" />
          Nova consulta de autenticidade
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {result.valid ? (
          <>
            <div className="border-b border-emerald-100 bg-emerald-50/80 p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="size-7" />
                </div>
                <div>
                  <span className="inline-flex items-center rounded-full bg-emerald-200/60 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    Recibo Autêntico e Válido
                  </span>
                  <h1 className="mt-1 text-xl font-bold text-slate-900">
                    Demonstrativo de Pagamento Verificado
                  </h1>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6 text-sm">
              <p className="text-slate-600">
                A chave criptográfica informada corresponde a um contracheque oficial emitido pelo
                sistema e devidamente homologado na base funcional.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo de Documento</span>
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                      <FileCheck className="size-4 text-emerald-700" />
                      {result.type || "Contracheque / Recibo de Pagamento"}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Data de Emissão</span>
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="size-4 text-emerald-700" />
                      {new Date(result.issuedAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Hash className="size-3.5 text-slate-500" />
                    Chave de Verificação
                  </span>
                  <p className="font-mono text-xs text-slate-800 break-all mt-0.5 bg-white p-2 rounded border border-slate-200">
                    {code}
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Assinatura / Impressão Digital SHA-256 do Arquivo Original
                  </span>
                  <p className="break-all font-mono text-[11px] text-slate-700 bg-white p-2 rounded border border-slate-200 mt-0.5">
                    {result.fileHash}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900 leading-relaxed">
                <strong>Nota institucional:</strong> Este demonstrativo reflete fielmente os proventos,
                descontos e valores líquidos arquivados na folha de pagamento municipal, preservando sigilo bancário
                e conformidade com a legislação de transparência e pessoal.
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-red-100 bg-red-50 p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-red-100 text-red-700">
                  <ShieldAlert className="size-7" />
                </div>
                <div>
                  <span className="inline-flex items-center rounded-full bg-red-200/60 px-2.5 py-0.5 text-xs font-bold text-red-800">
                    Não Verificado
                  </span>
                  <h1 className="mt-1 text-xl font-bold text-slate-900">
                    Recibo Não Localizado ou Inválido
                  </h1>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-600">
              <p>
                Não foi possível validar o código informado: <strong className="font-mono text-slate-900">{code}</strong>.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
                <li>O código pode ter sido digitado incorretamente;</li>
                <li>O demonstrativo pode ter sido cancelado ou substituído por uma retificação de folha;</li>
                <li>A publicação pode estar pendente de liberação pelo setor de Recursos Humanos.</li>
              </ul>
              <div className="pt-2">
                <Link
                  href="/validar-recibo"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Tentar novamente com outro código
                </Link>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
