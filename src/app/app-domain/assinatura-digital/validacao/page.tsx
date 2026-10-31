import { getUnifiedSignatureContext } from "@/lib/documents/ged-access";
import { GedValidationSelector } from "@/components/signatures/ged/GedValidationSelector";

export default async function SignatureValidationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getUnifiedSignatureContext();
  const { code } = await searchParams;
  return <section className="mx-auto max-w-3xl space-y-5 p-4"><h1 className="text-xl font-semibold">Validação de documentos e assinaturas</h1><GedValidationSelector initialCode={typeof code === "string" ? code.slice(0, 2048) : ""} /><a className="inline-block underline" href="/validar-assinatura" target="_blank" rel="noopener noreferrer">Abrir página pública externa</a></section>;
}
