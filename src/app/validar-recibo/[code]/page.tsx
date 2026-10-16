import { prisma } from "@/lib/prisma";
import { verifyPublicReceipt } from "@/lib/portal-servidor/receipt-verification";

export const dynamic = "force-dynamic";
export default async function PublicReceiptValidation({ params }: { params: Promise<{ code: string }> }) {
  const result = await verifyPublicReceipt(prisma, (await params).code);
  return <main className="mx-auto max-w-2xl p-6"><h1 className="text-xl font-bold">Autenticidade do recibo de pagamento</h1><section className="mt-4 space-y-3 rounded border border-slate-300 bg-white p-5">{result.valid ? <><p className="font-semibold text-emerald-800">Recibo emitido e versão disponível.</p><p className="text-sm">Tipo: {result.type} · Emissão: {new Date(result.issuedAt).toLocaleString("pt-BR")}</p><p className="text-xs text-slate-600">Impressão digital SHA-256 do arquivo original</p><p className="break-all font-mono text-xs">{result.fileHash}</p></> : <p className="font-semibold text-red-700">Não foi localizada uma versão válida e disponível para esta chave.</p>}</section></main>;
}
