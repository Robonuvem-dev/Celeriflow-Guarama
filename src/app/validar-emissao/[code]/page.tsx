import { db } from "@/db/client";
import { verifyGeneratedDocument } from "@/lib/portal-servidor/generated-documents";
export const dynamic = "force-dynamic";
export default async function GeneratedDocumentValidation({ params }: { params: Promise<{ code: string }> }) {
  const result = await verifyGeneratedDocument(db, (await params).code);
  return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-bold">Autenticidade de emissão funcional</h1>{result.valid ? <section className="mt-5 space-y-3 rounded border bg-white p-5"><p className="font-semibold text-emerald-800">Versão documental registrada e disponível.</p><p>Tipo: {result.kind}</p><p>Emissão: {result.issuedAt}</p><p>Assinatura GED: {result.signed ? "Concluída" : "Documento de emissão do sistema"}</p><p className="break-all text-xs">SHA-256: {result.hash}</p></section> : <p className="mt-5 rounded border p-5">Código indisponível, documento revogado, expirado ou assinatura pendente.</p>}</main>;
}
