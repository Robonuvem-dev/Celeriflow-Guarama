import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CentralValidationForm from "@/components/signatures/CentralValidationForm";

export default async function SignatureValidationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getTenantContextForModule("ASSINATURA_DIGITAL");
  const { code } = await searchParams;
  return <section className="mx-auto max-w-3xl space-y-5 p-4"><h1 className="text-xl font-semibold">Validação de assinaturas</h1><CentralValidationForm initialCode={typeof code === "string" ? code.slice(0, 2048) : ""} /><a className="inline-block underline" href="/validar-assinatura" target="_blank" rel="noopener noreferrer">Abrir página pública externa</a></section>;
}
