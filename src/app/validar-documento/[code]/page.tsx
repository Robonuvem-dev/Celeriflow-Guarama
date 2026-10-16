import { notFound } from "next/navigation";
import { findPublicDocumentValidation } from "@/lib/documents/document-flow-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicDocumentValidationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^CFV-[A-Z0-9]{20}$/.test(code)) notFound();
  const validation = await findPublicDocumentValidation(prisma, code);
  if (!validation) notFound();

  return (
    <main className="mx-auto max-w-xl p-6 sm:p-10">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">Validação de documento</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">{validation.publicLabel}</h1>
        <dl className="mt-6 space-y-3 text-sm text-slate-700">
          <div><dt className="font-semibold">Versão</dt><dd>{validation.version}</dd></div>
          <div><dt className="font-semibold">Hash SHA-256</dt><dd className="break-all font-mono text-xs">{validation.hashSha256}</dd></div>
          <div><dt className="font-semibold">Status</dt><dd>{validation.status}</dd></div>
          <div><dt className="font-semibold">Assinatura</dt><dd>{validation.signature.kind === "ICP_A1_VALID" ? "ICP-Brasil A1 válida" : validation.signature.kind === "ICP_A1_INVALID" ? "ICP-Brasil A1 inválida" : validation.signature.kind === "INTERNAL" ? "Manifestação eletrônica interna" : "Documento ainda não assinado"}</dd></div>
          {validation.signature.signedAt && <div><dt className="font-semibold">Data da assinatura</dt><dd>{new Date(validation.signature.signedAt).toLocaleString("pt-BR")}</dd></div>}
          {validation.signature.subject && <div><dt className="font-semibold">Titular do certificado</dt><dd className="break-all">{validation.signature.subject}</dd></div>}
          {validation.signature.issuer && <div><dt className="font-semibold">Emissor</dt><dd className="break-all">{validation.signature.issuer}</dd></div>}
          {validation.signature.fingerprint256 && <div><dt className="font-semibold">Impressão digital</dt><dd className="break-all font-mono text-xs">{validation.signature.fingerprint256}</dd></div>}
        </dl>
      </section>
    </main>
  );
}
