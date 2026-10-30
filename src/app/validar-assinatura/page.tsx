import CentralValidationForm from "@/components/signatures/CentralValidationForm";

export default async function PublicSignatureValidationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await searchParams;
  return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-2xl font-semibold">Validação pública de assinatura</h1><CentralValidationForm initialCode={typeof code === "string" ? code.slice(0, 2048) : ""} /></main>;
}
