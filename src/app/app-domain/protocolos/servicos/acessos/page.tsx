import Link from "next/link";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { AccessApplicationPanel } from "./AccessApplicationPanel";

export const dynamic = "force-dynamic";
export default async function CitizenAccessApplicationsPage() {
  const context = await getTenantContextForSystemAdministration();
  const applications = await context.prisma.citizenAccessApplication.findMany({ where: { status: "PENDENTE" }, include: { process: { select: { protocolNumber: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  return <main className="mx-auto max-w-5xl space-y-5 p-4"><Link href="/protocolos/servicos" className="text-sm font-semibold text-emerald-800">← Serviços</Link><h1 className="text-2xl font-semibold">Conferência de acesso ao Autoatendimento</h1><p className="text-sm leading-6 text-slate-600">A identidade Firebase é verificada, mas o vínculo cadastral exige conferência municipal. A aprovação cria uma conta externa sem permissões ERP.</p>{await Promise.all(applications.map(async (application) => {
    const taxpayers = await context.prisma.taxpayer.findMany({ where: { status: "Ativo", OR: [{ person: { cpf: application.declaredDocument } }, { company: { cnpj: application.declaredDocument } }] }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } });
    return <section key={application.id} className="rounded border bg-white p-5"><h2 className="font-semibold">{application.process.protocolNumber} — {application.name}</h2><p className="mt-2 text-sm">E-mail verificado: {application.email} • Documento declarado: {application.declaredDocument}</p><AccessApplicationPanel id={application.id} taxpayers={taxpayers.map((item) => ({ id: item.id, name: item.person?.fullName || item.company?.corporateName || "Contribuinte" }))} /></section>;
  }))}{!applications.length && <p className="rounded border p-5 text-sm">Nenhuma solicitação de acesso pendente.</p>}</main>;
}
