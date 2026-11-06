import "server-only";
import Link from "next/link";
export { getPortalPageAccess } from "@/lib/platform/page-access";

export function PortalPageAccessDenied() {
  return <main className="mx-auto max-w-3xl space-y-3 px-4 py-8">
    <h1 className="text-xl font-semibold">Acesso indisponível para esta conta</h1>
    <p>Esta área exige autorização ou habilitação específica. Consulte o setor responsável para verificar seu acesso.</p>
    <Link href="/portal" className="text-blue-700 underline">Voltar ao portal</Link>
  </main>;
}
