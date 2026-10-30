import Link from "next/link";
import { 
  Files, 
  HeadphonesIcon, 
  Lightbulb,
  ShoppingCart, 
  Eye, 
  Building2, 
  Settings,
  Landmark,
  CircleDollarSign,
  Users,
  Package,
  GraduationCap,
  HeartPulse,
  Handshake,
  Leaf,
  Droplets,
  HardHat,
  Palette,
  Shield,
  Lock,
  Truck,
  ArrowUpRight,
  BadgeCheck,
  Church,
  FileSignature,
  Headset,
  Globe
} from "lucide-react";
import { canShowDashboardCard, canViewModule, getOptionalTenantContext, isModuleBlockedForUser } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listModuleActivations } from "@/db/repositories/platform/identity";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import styles from "./dashboard.module.css";
import { compareDashboardCards } from "@/lib/platform/dashboard-order";

export const dynamic = "force-dynamic";

type MenuItem = {
  code: string;
  accessCode?: string;
  name: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  solid: string;
};

const menuItems: MenuItem[] = [
  { code: "ADMINISTRACAO", name: "Administração", description: "Gestão interna e controle", href: "/administracao", icon: Building2, color: "text-[#2563EB]", bg: "bg-[#DBEAFE]", solid: "bg-[#2563EB]" },
  { code: "PORTAL_CIDADAO", accessCode: "ATENDIMENTO", name: "Portal do Cidadão", description: "Gestão de notícias, páginas, banners e portal público", href: "/portal-cidadao", icon: Globe, color: "text-[#0284C7]", bg: "bg-[#E0F2FE]", solid: "bg-[#0284C7]" },
  { code: "PROCESSOS", name: "Processos e Protocolo", description: "Gestão de trâmites", href: "/protocolos", icon: Files, color: "text-[#0EA5E9]", bg: "bg-[#E0F2FE]", solid: "bg-[#0EA5E9]" },
  { code: "ATENDIMENTO", name: "Atendimento ao Cidadão", description: "Ouvidoria e chamados", href: "/atendimento", icon: HeadphonesIcon, color: "text-[#F97316]", bg: "bg-[#FFEDD5]", solid: "bg-[#F97316]" },
  { code: "TRANSPARENCIA", name: "Portal Transparência", description: "Acesso à informação", href: "/transparencia", icon: Eye, color: "text-[#06B6D4]", bg: "bg-[#CFFAFE]", solid: "bg-[#06B6D4]" },
  { code: "TRIBUTACAO", name: "Tributário", description: "Impostos e taxas", href: "/tributacao", icon: Landmark, color: "text-[#059669]", bg: "bg-[#D1FAE5]", solid: "bg-[#059669]" },
  { code: "FINANCEIRO", name: "Financeiro e Contábil", description: "Orçamento e caixa", href: "/financeiro", icon: CircleDollarSign, color: "text-[#16A34A]", bg: "bg-[#DCFCE7]", solid: "bg-[#16A34A]" },
  { code: "PLANEJAMENTO", name: "Planejamento e Orçamento", description: "PPA, LDO, LOA e gestão orçamentária", href: "/planejamento", icon: Landmark, color: "text-[#4338CA]", bg: "bg-[#E0E7FF]", solid: "bg-[#4338CA]" },
  { code: "SST", name: "Segurança e Medicina do Trabalho", description: "Saúde ocupacional e segurança dos servidores", href: "/sst", icon: HardHat, color: "text-[#0F766E]", bg: "bg-[#CCFBF1]", solid: "bg-[#0F766E]" },
  { code: "COMPRAS", name: "Compras e Contratos", description: "Gestão de compras", href: "/compras", icon: ShoppingCart, color: "text-[#9333EA]", bg: "bg-[#F3E8FF]", solid: "bg-[#9333EA]" },
  { code: "RH", name: "RH e Folha", description: "Servidores e folha", href: "/rh", icon: Users, color: "text-[#EC4899]", bg: "bg-[#FCE7F3]", solid: "bg-[#EC4899]" },
  { code: "PORTAL_SERVIDOR", name: "Portal do Servidor", description: "Autosserviço, documentos e solicitações funcionais", href: "/portal-servidor", icon: BadgeCheck, color: "text-[#0F3D61]", bg: "bg-[#E8F0F7]", solid: "bg-[#0F3D61]" },
  { code: "PATRIMONIO", name: "Almoxarifado e Patrimônio", description: "Estoque, bens e inventários", href: "/patrimonio", icon: Package, color: "text-[#D97706]", bg: "bg-[#FEF3C7]", solid: "bg-[#D97706]" },
  { code: "EDUCACAO", name: "Educação", description: "Escolas e alunos", href: "/educacao", icon: GraduationCap, color: "text-[#6366F1]", bg: "bg-[#E0E7FF]", solid: "bg-[#6366F1]" },
  { code: "SAUDE", name: "Saúde", description: "SUS, postos e pacientes", href: "/saude", icon: HeartPulse, color: "text-[#EF4444]", bg: "bg-[#FEE2E2]", solid: "bg-[#EF4444]" },
  { code: "SOCIAL", name: "Assistência Social", description: "Benefícios e CRAS", href: "/social", icon: Handshake, color: "text-[#DB2777]", bg: "bg-[#FCE7F3]", solid: "bg-[#DB2777]" },
  { code: "MEIO_AMBIENTE", name: "Meio Ambiente", description: "Licenças e fiscalização", href: "/meio-ambiente", icon: Leaf, color: "text-[#65A30D]", bg: "bg-[#ECFCCB]", solid: "bg-[#65A30D]" },
  { code: "SANEAMENTO", name: "Água e Saneamento", description: "Água e esgoto", href: "/saneamento", icon: Droplets, color: "text-[#0284C7]", bg: "bg-[#E0F2FE]", solid: "bg-[#0284C7]" },
  { code: "OBRAS", name: "Obras e Construção Civil", description: "Obras, infraestrutura e construção civil", href: "/obras", icon: HardHat, color: "text-[#B45309]", bg: "bg-[#FEF3C7]", solid: "bg-[#B45309]" },
  { code: "ILUMINACAO_PUBLICA", name: "Iluminação Pública", description: "Iluminação pública e ordens de serviço", href: "/iluminacao-publica", icon: Lightbulb, color: "text-[#CA8A04]", bg: "bg-[#FEF9C3]", solid: "bg-[#CA8A04]" },
  { code: "FROTAS", name: "Frotas", description: "Veículos, máquinas e manutenção", href: "/frotas", icon: Truck, color: "text-[#0F766E]", bg: "bg-[#CCFBF1]", solid: "bg-[#0F766E]" },
  { code: "CULTURA", name: "Esportes e Cultura", description: "AcessaFlow", href: "/cultura", icon: Palette, color: "text-[#E11D48]", bg: "bg-[#FFE4E6]", solid: "bg-[#E11D48]" },
  { code: "CEMITERIOS", name: "Cemitérios", description: "Gestão cemiterial", href: "/cemiterios", icon: Church, color: "text-[#57534E]", bg: "bg-[#E7E5E4]", solid: "bg-[#57534E]" },
  { code: "CAMARA", name: "Câmara Municipal", description: "Gestão Legislativa", href: "/camara", icon: Landmark, color: "text-[#9333EA]", bg: "bg-[#F3E8FF]", solid: "bg-[#9333EA]" },
  { code: "SEGURANCA", name: "Segurança e Mobilidade", description: "Guarda e trânsito", href: "/seguranca", icon: Shield, color: "text-[#0F766E]", bg: "bg-[#CCFBF1]", solid: "bg-[#0F766E]" },
  { code: "ASSINATURA_DIGITAL", name: "Assinatura Digital", description: "Central de assinatura de documentos", href: "/assinatura-digital", icon: FileSignature, color: "text-[#7C3AED]", bg: "bg-[#EDE9FE]", solid: "bg-[#7C3AED]" },
  { code: "SUPORTE_TECNICO", name: "Suporte Técnico", description: "Atendimento técnico especializado", href: "/suporte-tecnico", icon: Headset, color: "text-[#0369A1]", bg: "bg-[#E0F2FE]", solid: "bg-[#0369A1]" },
  { code: "CONFIGURACOES", name: "Configurações", description: "Gestão do sistema", href: "/configuracoes", icon: Settings, color: "text-[#475569]", bg: "bg-[#E2E8F0]", solid: "bg-[#475569]" },
];

export default async function PainelPage() {
  const context = await getOptionalTenantContext();
  const moduleActivationByCode = new Map<string, boolean>();

  try {
    const modulos = context ? await listModuleActivations(context.database ?? db) : [];
    modulos.forEach((module) => moduleActivationByCode.set(module.codigo.toUpperCase(), module.ativo));
  } catch (err) {
    console.warn("Notice: Failed to fetch configuracaoModulo status", err);
  }

  const visibleMenuItems = menuItems
    .filter((item) => moduleActivationByCode.get(item.accessCode ?? item.code) !== false)
    .filter((item) => context && canShowDashboardCard(context.user, item.accessCode ?? item.code))
    .sort(compareDashboardCards);

  return (
    <PageFrame className={`${styles.frame} flex min-h-0 flex-col gap-2 px-1 py-1 md:px-2`}>
      <PageHeader title="Módulos do sistema" className="shrink-0" />
      <div className={`${styles.grid} grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7`}>
        {visibleMenuItems.map((item) => {
          const accessCode = item.accessCode ?? item.code;
          const isProfileBlocked = !context || isModuleBlockedForUser(context.user, accessCode) || !canViewModule(context.user, accessCode);

          if (isProfileBlocked) {
            return (
              <div
                key={item.name}
                title="Acesso bloqueado ou sem permissão de visualização neste perfil."
                className={`${styles.card} relative flex h-full min-h-[126px] cursor-not-allowed flex-col justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-100/90 px-2 py-3 text-center opacity-60 grayscale select-none dark:border-slate-800 dark:bg-slate-900/60`}
              >
                {/* Top Gray Bar */}
                <div className="absolute top-0 left-0 h-[3px] w-full bg-slate-400/50" />

                {/* Lock Badge */}
                <div className={`${styles.lockBadge} absolute right-2 top-2 rounded-full bg-slate-200 p-1 text-slate-500 dark:bg-slate-800`}>
                  <Lock className="w-3.5 h-3.5" />
                </div>

                <div className={`${styles.content} flex flex-col items-center gap-2`}>
                  <div className={`${styles.icon} flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-200 ring-1 ring-inset ring-black/5 dark:bg-slate-800`}>
                    <item.icon className="size-[19px] text-slate-500" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`${styles.title} text-[12px] sm:text-[13px] font-bold leading-tight text-slate-600 dark:text-slate-400`}>
                      {item.name}
                    </h3>
                    <span className={`${styles.status} mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400`}>
                       Acesso Bloqueado
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link key={item.name} href={item.href} title={`${item.name} — ${item.description}`} className="group block min-h-0 min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <div className={`${styles.card} relative flex h-full min-h-[126px] cursor-pointer flex-col justify-center overflow-hidden rounded-md border border-slate-300 bg-white px-2 py-3 text-center shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-950`}>
                
                {/* Colored Top Bar */}
                <div className={`absolute top-0 left-0 h-[3px] w-full ${item.solid} opacity-85`} />
                
                <div className={`${styles.content} flex flex-col items-center gap-2`}>
                  <div className={`${styles.icon} flex size-10 shrink-0 items-center justify-center rounded-md ${item.bg} ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105`}>
                    <item.icon className={`size-[19px] ${item.color}`} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`${styles.title} text-[12px] font-bold leading-tight text-slate-800 transition-colors group-hover:text-primary sm:text-[13px]`}>
                      {item.name}
                    </h3>
                    <p className={`${styles.description} mt-1 line-clamp-2 px-1 text-[10px] font-medium leading-tight text-slate-500`}>
                      {item.description}
                    </p>
                  </div>
                  <span className={`${styles.access} flex items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 group-hover:text-emerald-700`}>
                    Acessar <ArrowUpRight className="size-3" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageFrame>
  );
}
