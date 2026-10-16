import { FileText, Newspaper, FileOutput, Gavel, FileSignature } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

export default async function TransparenciaPage() {
  const { prisma } = await getTenantContextForModule("TRANSPARENCIA");
  const newsCount = await prisma.portalNews.count();
  const pagesCount = await prisma.portalPage.count();
  const diariesCount = await prisma.officialDiary.count();
  const biddingsCount = await prisma.bidding.count();
  const contractsCount = await prisma.contract.count();

  return (
    <PageFrame className="max-w-7xl space-y-2">
       <PageHeader title="Portal e Transparência" />
       <section className="rounded border border-sky-200 bg-white p-4">
         <h2 className="font-bold text-slate-900">Portal da Transparência — acesso público e gestão</h2>
         <p className="mt-1 text-sm text-slate-600">Configure as consultas e publique documentos municipais para consulta e download pelo cidadão.</p>
         <div className="mt-3 flex flex-wrap gap-3">
           <Link href="/transparencia/publicacoes" className="rounded bg-sky-900 px-4 py-2 text-sm font-semibold text-white">Configurações e upload de documentos</Link>
            <Link href="/portal/portaldatransparencia" target="_blank" className="rounded border px-4 py-2 text-sm font-semibold">Abrir portal público ↗</Link>
            <Link href="/transparencia/solicitacoes" className="rounded border px-4 py-2 text-sm font-semibold">Pedidos e-SIC e manifestações</Link>
            <Link href="/transparencia/acessos" className="rounded border px-4 py-2 text-sm font-semibold">Inventário e acessos</Link>
         </div>
       </section>
      
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-5">
        <Link href="/transparencia/noticias" className="block group">
          <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-blue-300 hover:shadow-md">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
              <Newspaper className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{newsCount}</h3>
            <p className="text-xs font-medium text-slate-500 uppercase mt-1">Notícias</p>
          </div>
        </Link>
        <Link href="/transparencia/diario-oficial" className="block group">
          <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{diariesCount}</h3>
            <p className="text-xs font-medium text-slate-500 uppercase mt-1">Diário Oficial</p>
          </div>
        </Link>
        <Link href="/transparencia/paginas" className="block group">
          <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-purple-300 hover:shadow-md">
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
              <FileOutput className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{pagesCount}</h3>
            <p className="text-xs font-medium text-slate-500 uppercase mt-1">Páginas</p>
          </div>
        </Link>
        <Link href="/transparencia/licitacoes" className="block group">
          <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-amber-300 hover:shadow-md">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
              <Gavel className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{biddingsCount}</h3>
            <p className="text-xs font-medium text-slate-500 uppercase mt-1">Licitações</p>
          </div>
        </Link>
        <Link href="/transparencia/contratos" className="block group">
          <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-3 text-center shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
            <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
              <FileSignature className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{contractsCount}</h3>
            <p className="text-xs font-medium text-slate-500 uppercase mt-1">Contratos</p>
          </div>
        </Link>
      </div>
    </PageFrame>
  );
}
