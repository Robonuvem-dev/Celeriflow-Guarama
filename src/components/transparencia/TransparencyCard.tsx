import Link from "next/link";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Banknote, BookOpen, BriefcaseBusiness,
  Building2, CarFront, ChartNoAxesCombined, FileText, Gavel, GraduationCap,
  HeartPulse, Info, Mail, Map, MessageCircle, ReceiptText, ShieldCheck, Users,
  type LucideIcon,
} from "lucide-react";
import type { DiscoveryItem, DiscoverySection } from "@/lib/transparencia/discovery";

const icons: Record<string, LucideIcon> = {
  revenue: ArrowDownToLine, expense: Banknote, receipt: ReceiptText, people: Users,
  travel: BriefcaseBusiness, gavel: Gavel, contract: FileText, building: Building2,
  vehicle: CarFront, health: HeartPulse, education: GraduationCap, law: BookOpen,
  document: FileText, info: Info, message: MessageCircle, contact: Mail,
  services: BriefcaseBusiness, chart: ChartNoAxesCombined, map: Map, shield: ShieldCheck,
};

const tones = {
  blue: "bg-sky-50 text-sky-800", green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-800", violet: "bg-violet-50 text-violet-800",
};

export function TransparencyCard({ item, tone = "blue", sectionTitle }: { item: DiscoveryItem; tone?: DiscoverySection["tone"]; sectionTitle?: string }) {
  const Icon = icons[item.icon] || FileText;
  return (
    <Link id={item.id === "radar" ? "radar" : undefined} href={item.href} prefetch={false} className="group flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 text-left transition-[border-color,box-shadow] hover:border-sky-700 hover:shadow-md focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sky-800 motion-reduce:transition-none">
      <span className={`mb-4 flex size-11 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="size-5" aria-hidden="true" /></span>
      {sectionTitle && <span className="mb-2 text-xs font-semibold text-slate-600">{sectionTitle}</span>}
      <h3 className="text-base font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.description}</p>
      {item.source === "API_IBEMA" && <span className="mt-3 text-xs font-semibold text-slate-600">Dados de referência · API de Ibema</span>}
      {item.source === "EXEMPLO" && <span className="mt-3 text-xs font-semibold text-amber-800">Demonstração · dados fictícios</span>}
      <span className="mt-auto flex items-center gap-2 pt-4 text-sm font-bold text-[#0e4c7e]">{item.external ? <>Acessar site externo <ArrowUpRight className="size-4" aria-hidden="true" /></> : <>Acessar <ArrowRight className="size-4" aria-hidden="true" /></>}</span>
    </Link>
  );
}

export function TransparencySection({ section }: { section: DiscoverySection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-titulo`} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <header className="mx-auto mb-6 max-w-3xl text-center">
        <h2 id={`${section.id}-titulo`} className="text-xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-2xl">{section.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
        {section.legalBasis && <p className="mt-2 text-xs leading-5 text-slate-600">{section.legalBasis}</p>}
      </header>
      <div className={`grid gap-3 sm:grid-cols-2 ${section.featured ? "" : "xl:grid-cols-4"}`}>
        {section.items.map(item => <TransparencyCard key={item.id} item={item} tone={section.tone} />)}
      </div>
    </section>
  );
}

export function TransparencyHelp() {
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-bold text-slate-900">Não encontrou o que procura?</h2><p className="mt-1 text-sm leading-6 text-slate-700">Você pode solicitar informações pelo e-SIC ou falar com a Ouvidoria.</p></div>
      <Link href="/portal/acesso-informacao" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-sky-800 px-4 py-2 text-sm font-bold text-sky-900 hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sky-800">Solicitar informação <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
    </aside>
  );
}
