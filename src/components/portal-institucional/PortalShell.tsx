"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Accessibility,
  ChevronDown,
  ChevronRight,
  Cloud,
  Contrast,
  Home,
  Languages,
  Mail,
  Menu,
  Scale,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "./PortalShell.module.css";
import type { InstitutionalContact } from "@/lib/portal-institucional/public-content";
import { MUNICIPALITY_NAME, MUNICIPALITY_STATE } from "@/lib/municipality-identity";

type SubItem = { label: string; href: string; external?: boolean };
type MenuItem = { label: string; href: string; home?: boolean; children?: SubItem[] };

const MAIN_MENU: MenuItem[] = [
  { label: "Início", href: "/portal", home: true },
  {
    label: "O município",
    href: "/portal/historia",
    children: [
      { label: "História do município", href: "/portal/historia" },
      { label: "Dados do Município", href: "/portal/historia#dados" },
      { label: "Símbolos do Município", href: "/portal/historia#simbolos" },
      { label: "Acervo Histórico", href: "/portal/historia#acervo" },
      { label: "Hotéis e Hospedagem", href: "/portal/historia#hospedagem" },
      { label: "Pontos Turísticos", href: "/portal/historia#turismo" },
      { label: "Escolas", href: "/portal/servicos#educacao" },
      { label: "Posto de Saúde / Hospital", href: "/portal/servicos#saude" },
      { label: "Transporte Universitário", href: "/portal/servicos#transporte" },
      { label: "Empreendedor", href: "/portal/servicos#empreendedor" },
    ],
  },
  {
    label: "Departamentos",
    href: "/portal/secretarias",
    children: [
      { label: "Todas as Secretarias", href: "/portal/secretarias" },
      { label: "Saúde", href: "/portal/secretarias#saude" },
      { label: "Educação, Cultura e Esporte", href: "/portal/secretarias#educacao" },
      { label: "Assistência Social", href: "/portal/secretarias#assistencia-social" },
      { label: "Administração e Finanças", href: "/portal/secretarias#administracao" },
      { label: "Viação, Obras e Urbanismo", href: "/portal/secretarias#obras" },
      { label: "Agr., Abastecimento e Meio Ambiente", href: "/portal/secretarias#meio-ambiente" },
      { label: "Planejamento", href: "/portal/secretarias#planejamento" },
    ],
  },
  {
    label: "Informativos",
    href: "/portal/noticias",
    children: [
      { label: "Notícias", href: "/portal/noticias" },
      { label: "Eventos", href: "/portal/noticias?categoria=eventos" },
      { label: "Concursos e processos seletivos", href: "/portal/concursos" },
      { label: "Multimídia", href: "/portal/noticias?categoria=multimidia" },
    ],
  },
  {
    label: "Publicações Oficiais",
    href: "/portal/leis-municipais",
    children: [
      { label: "Leis e Atos Municipais", href: "/portal/leis-municipais" },
      { label: "Decretos e Portarias", href: "/portal/leis-municipais#decretos" },
      { label: "Lei Orgânica", href: "/portal/leis-municipais#lei-organica" },
      { label: "Diário Oficial", href: "/portal/dados-abertos#diario" },
    ],
  },
  {
    label: "Transparência",
    href: "/portal/portaldatransparencia",
    children: [
       { label: "Portal da Transparência", href: "/portal/portaldatransparencia" },
       { label: "Documentos e publicações", href: "/portal/portaldatransparencia?view=publicacoes&source=DOCUMENTOS" },
      { label: "Despesas", href: "/portal/portaldatransparencia?view=despesas" },
      { label: "Receitas", href: "/portal/portaldatransparencia?view=receitas" },
      { label: "Licitações e Contratos", href: "/portal/licitacoes-e-contratos" },
      { label: "Dados Abertos (CSV)", href: "/portal/dados-abertos" },
      { label: "Radar da Transparência", href: "/portal/portaldatransparencia#radar" },
    ],
  },
  {
    label: "Contatos",
    href: "/portal/contato",
    children: [
      { label: "Fale Conosco", href: "/portal/contato" },
      { label: "Ouvidoria (e-Ouv)", href: "/portal/ouvidoria" },
      { label: "Acesso à Informação (e-SIC)", href: "/portal/acesso-informacao" },
      { label: "Perguntas Frequentes", href: "/portal/perguntas-frequentes" },
    ],
  },
  { label: "Autoatendimento", href: "/portal/minha-area", children: [
    { label: "Solicitar serviço", href: "/portal/minha-area/servicos" },
    { label: "Acompanhar meus processos", href: "/portal/minha-area/processos" },
    { label: "Meus pedidos e respostas", href: "/portal/minha-area/solicitacoes" },
    { label: "Entrar na minha área", href: "/portal/entrar" },
  ] },
  { label: "Todos Serviços", href: "/portal/servicos" },
  { label: "Licitações", href: "/portal/licitacoes-e-contratos" },
];

const QUICK_ACCESS_BUTTONS = [
  {
    label: "Portal do\nServidor",
    href: "/portal/portaldoservidor",
    bg: "bg-[#1a5276]",
    hover: "hover:bg-[#154360]",
    icon: "👤",
  },
  {
    label: "Portal da\nTransparência",
    href: "/portal/portaldatransparencia",
    bg: "bg-[#1a5276]",
    hover: "hover:bg-[#154360]",
    icon: "📊",
  },
  {
    label: "Portal do\nContribuinte",
    href: "/portal/tributario",
    bg: "bg-[#2471a3]",
    hover: "hover:bg-[#1a5276]",
    icon: "🧾",
  },
  {
    label: "NFS-e: Nota\nFiscal Eletrônica",
    href: "/portal/nfse",
    bg: "bg-[#1e8449]",
    hover: "hover:bg-[#196f3d]",
    icon: "📋",
    wide: true,
  },
  {
    label: "Acesso à\nInformação",
    href: "/portal/acesso-informacao",
    bg: "bg-[#d68910]",
    hover: "hover:bg-[#b9770e]",
    icon: "ℹ️",
  },
  {
    label: "Ouvidoria",
    href: "/portal/ouvidoria",
    bg: "bg-[#2471a3]",
    hover: "hover:bg-[#1a5276]",
    icon: "📢",
  },
];

const FONT_STEPS = [0.875, 1, 1.125, 1.25];
const ACCESSIBILITY_EVENT = "portal:accessibility-preferences";
let accessibilityFallback = "1:0";

function readAccessibilitySnapshot() {
  try {
    const saved = Number(window.localStorage.getItem("portal-a11y-font-step") ?? "1");
    const step = Number.isInteger(saved) && saved >= 0 && saved < FONT_STEPS.length ? saved : 1;
    return `${step}:${window.localStorage.getItem("portal-a11y-contrast") === "1" ? "1" : "0"}`;
  } catch {
    return accessibilityFallback;
  }
}

function subscribeToAccessibility(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(ACCESSIBILITY_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ACCESSIBILITY_EVENT, callback);
  };
}

function updateAccessibility(fontStep: number, highContrast: boolean) {
  accessibilityFallback = `${fontStep}:${highContrast ? "1" : "0"}`;
  try {
    window.localStorage.setItem("portal-a11y-font-step", String(fontStep));
    window.localStorage.setItem("portal-a11y-contrast", highContrast ? "1" : "0");
  } catch {
    // Keep controls usable when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(ACCESSIBILITY_EVENT));
}

function TopAccessibilityBar({
  highContrast,
  onIncrease,
  onDecrease,
  onResetFont,
  onToggleContrast,
}: {
  highContrast: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
  onResetFont: () => void;
  onToggleContrast: () => void;
}) {
  return (
    <div className="bg-[#0e4c7e] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-[12.5px] sm:px-6">
        <p className="font-semibold tracking-wide">Poder Executivo Municipal</p>
        <nav aria-label="Acessibilidade e links institucionais" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1" role="group" aria-label="Tamanho da fonte">
            <button type="button" onClick={onIncrease} className="rounded px-1.5 py-0.5 font-bold hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white" aria-label="Aumentar tamanho da fonte (A+)">A+</button>
            <button type="button" onClick={onDecrease} className="rounded px-1.5 py-0.5 font-bold hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white" aria-label="Diminuir tamanho da fonte (A-)">A-</button>
            <button type="button" onClick={onResetFont} className="rounded px-1.5 py-0.5 font-bold hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white" aria-label="Restaurar tamanho padrão da fonte (Aa)">Aa</button>
          </span>
          <button
            type="button"
            onClick={onToggleContrast}
            aria-pressed={highContrast}
            title="Alto contraste"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
          >
            <Contrast className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Contraste</span>
          </button>
          <Link href="/portal/acessibilidade" className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:bg-white/15 hover:underline">
            <Accessibility className="size-3.5" aria-hidden="true" /> Acessibilidade
          </Link>
          <a href="https://www.gov.br/governodigital/pt-br/vlibras" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:bg-white/15 hover:underline" aria-label="Abrir ferramenta VLibras em nova aba">
            <Languages className="size-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Libras</span>
          </a>
          <Link href="/portal/dados-abertos" className="rounded px-1 py-0.5 font-semibold hover:bg-white/15 hover:underline">Dados Abertos</Link>
          <Link href="/portal/mapa-do-site" className="rounded px-1 py-0.5 font-semibold hover:bg-white/15 hover:underline">Mapa do Site</Link>
          <Link href="/portal/contato" title="Contato" aria-label="Contato institucional" className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:bg-white/15 hover:underline">
            <Mail className="size-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Contato</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

function InstitutionalLogo({ institutionName, inverted = false }: { institutionName: string; inverted?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3 sm:gap-4">
      <Image
        src="/aurora-das-veredas.svg"
        alt={`Símbolo de ${institutionName}`}
        width={96}
        height={104}
        preload={!inverted}
        className="h-[72px] w-auto shrink-0 sm:h-[84px]"
      />
      <span className="min-w-0">
        <span className={`block text-[10px] font-bold uppercase tracking-[0.15em] sm:text-xs ${inverted ? "text-emerald-200" : "text-[#00843d]"}`}>Prefeitura Municipal de</span>
        <span className={`mt-1 block text-xl font-bold leading-tight tracking-tight sm:text-2xl ${inverted ? "text-white" : "text-[#073b64]"}`}>{MUNICIPALITY_NAME}</span>
        <span className={`mt-1.5 block text-xs ${inverted ? "text-slate-200" : "text-slate-600"}`}>{MUNICIPALITY_STATE} · Nossa terra. Nosso futuro.</span>
      </span>
    </span>
  );
}

/** Widget de clima decorativo (POC) */
function WeatherWidget() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const day = now.toLocaleDateString("pt-BR", { weekday: "long" });
      const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      setTime(`${day.charAt(0).toUpperCase() + day.slice(1)}, ${date}`);
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <Cloud className="size-6 text-slate-400" aria-hidden="true" />
        <span className="text-2xl font-bold text-[#073b64]">22°C</span>
      </div>
      <p className="text-[11px] text-slate-500">
        {MUNICIPALITY_NAME}/{MUNICIPALITY_STATE} · Nublado
      </p>
      {time && <p className="text-[11px] text-slate-400">{time}</p>}
    </div>
  );
}

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "#",
    color: "#1877f2",
    svg: (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "#",
    color: "#e1306c",
    svg: (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "#",
    color: "#ff0000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    label: "WhatsApp",
    href: "#",
    color: "#25d366",
    svg: (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12.004 2C6.477 2 2 6.477 2 12.004c0 1.762.461 3.413 1.268 4.849L2 22l5.286-1.386A9.943 9.943 0 0012.004 22C17.526 22 22 17.527 22 12.004 22 6.477 17.526 2 12.004 2zm0 18.007a7.986 7.986 0 01-4.073-1.115l-.292-.173-3.138.822.838-3.063-.19-.313A7.996 7.996 0 014.002 12c0-4.41 3.594-8.003 8.002-8.003 4.409 0 8.002 3.594 8.002 8.003 0 4.41-3.593 8.007-8.002 8.007z" />
      </svg>
    ),
  },
] as const;

function SocialIcons() {
  return (
    <div className="flex items-center gap-2" aria-label="Redes sociais">
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.label}
          href={s.href}
          aria-label={s.label}
          title={s.label}
          className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:text-white"
          style={{ color: s.color }}
        >
          {s.svg}
        </a>
      ))}
      <Link href="/portal/contato" aria-label="E-mail de contato" title="Contato por e-mail" className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-700 hover:text-white hover:border-slate-700">
        <Mail className="size-4" />
      </Link>
    </div>
  );
}

function QuickAccessBar({ router, query, setQuery }: { router: ReturnType<typeof useRouter>; query: string; setQuery: (v: string) => void }) {
  return (
    <div className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-stretch gap-0">
          {/* Logo + quick buttons area */}
          <div className="flex flex-1 items-center gap-4 py-3 lg:gap-6">
            <Link
              href="/portal"
              className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-[#0e4c7e] focus-visible:outline-offset-4 shrink-0"
              aria-label={`Página inicial — Prefeitura Municipal de ${MUNICIPALITY_NAME}`}
            >
              <Image
                src="/aurora-das-veredas.svg"
                alt={`Brasão de ${MUNICIPALITY_NAME}`}
                width={64}
                height={70}
                preload
                className="h-16 w-auto shrink-0"
              />
              <span className="min-w-0 hidden sm:block">
                <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#00843d]">Prefeitura Municipal de</span>
                <span className="mt-0.5 block text-xl font-bold leading-tight tracking-tight text-[#073b64]">{MUNICIPALITY_NAME}</span>
                <span className="mt-1 block text-xs text-slate-500">{MUNICIPALITY_STATE} · Nossa terra. Nosso futuro.</span>
              </span>
            </Link>

            {/* Quick access colored buttons — espelho do pibema.pr.gov.br */}
            <div className="hidden xl:grid xl:grid-cols-3 xl:gap-px xl:rounded-lg xl:overflow-hidden xl:border xl:border-slate-200 xl:shadow-sm shrink-0" aria-label="Acesso rápido">
              {QUICK_ACCESS_BUTTONS.map((btn) => (
                <Link
                  key={btn.href}
                  href={btn.href}
                  className={`${btn.bg} ${btn.hover} flex flex-col items-center justify-center px-3 py-2 text-center text-white transition ${btn.wide ? "col-span-1 row-span-2" : ""}`}
                  style={{ minWidth: 110, minHeight: btn.wide ? "auto" : 44 }}
                >
                  <span className="text-[13px] leading-tight font-semibold whitespace-pre-line">{btn.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Right: climate + social + search */}
          <div className="flex flex-col items-end justify-center gap-3 py-3 pl-4 lg:pl-6 shrink-0">
            <div className="flex items-center gap-4">
              <WeatherWidget />
              <div className="hidden md:flex">
                <SocialIcons />
              </div>
            </div>
            <form
              role="search"
              aria-label="Pesquisa institucional"
              onSubmit={(event) => {
                event.preventDefault();
                router.push(`/portal/busca?q=${encodeURIComponent(query.trim())}`);
              }}
              className="flex w-full max-w-xs overflow-hidden rounded-md border border-slate-300 focus-within:border-[#0e4c7e] focus-within:ring-2 focus-within:ring-[#0e4c7e]/25"
            >
              <label htmlFor="pesquisa-portal-header" className="sr-only">Pesquisar no portal</label>
              <input
                id="pesquisa-portal-header"
                name="q"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Procurar no site…"
                className="min-w-0 flex-1 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button type="submit" aria-label="Pesquisar" className="flex items-center gap-2 bg-[#0e4c7e] px-3 text-sm font-bold text-white transition hover:bg-[#0a3a5f]">
                <Search className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline text-xs">Procurar</span>
              </button>
            </form>
          </div>
        </div>

        {/* Mobile quick access row */}
        <div className="flex gap-1 pb-2 xl:hidden overflow-x-auto" aria-label="Acesso rápido">
          {QUICK_ACCESS_BUTTONS.map((btn) => (
            <Link
              key={btn.href}
              href={btn.href}
              className={`${btn.bg} ${btn.hover} flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold text-white transition`}
            >
              <span>{btn.icon}</span>
              <span className="whitespace-nowrap">{btn.label.split("\n")[0]}</span>
            </Link>
          ))}
          <Link
            href="/portal/leis-municipais"
            className="flex shrink-0 items-center gap-1.5 rounded border border-[#0e4c7e]/25 bg-[#eef4f9] px-3 py-1.5 text-[11px] font-bold text-[#0e4c7e] transition hover:bg-[#0e4c7e] hover:text-white"
          >
            <Scale className="size-3" />
            <span className="whitespace-nowrap">SPL</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MainMenu() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openDropdown]);

  const toggle = useCallback((label: string) => {
    setOpenDropdown((current) => (current === label ? null : label));
  }, []);

  return (
    <nav aria-label="Menu principal" className="bg-[#1a5276] text-white">
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <div className="flex items-center justify-between xl:hidden">
          <span className="px-2 py-3 text-sm font-bold uppercase tracking-wide text-white/90">Menu</span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="menu-principal-movel"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            className="m-1 inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm font-bold text-white"
          >
            {mobileOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
            {mobileOpen ? "Fechar" : "Menu"}
          </button>
        </div>

        {/* Desktop */}
        <ul className="hidden flex-nowrap items-stretch xl:flex">
          {MAIN_MENU.map((item, index) => {
            const isOpen = openDropdown === item.label;
            const isActive = pathname === item.href || (item.href !== "/portal" && pathname.startsWith(item.href));
            return (
              <li key={item.label} className={`relative flex shrink-0 items-stretch ${index > 0 ? "border-l border-white/20" : ""}`}>
                {item.children ? (
                  <div className="flex items-stretch" onMouseLeave={() => setOpenDropdown(null)}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-1.5 whitespace-nowrap px-2 py-[13px] text-[13px] font-semibold transition ${isActive ? "bg-white/20 text-white" : "text-white/90 hover:bg-white/15 hover:text-white"}`}
                    >
                      {item.home && <Home className="size-4" aria-hidden="true" />}
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggle(item.label)}
                      onMouseEnter={() => setOpenDropdown(item.label)}
                      onFocus={() => setOpenDropdown(item.label)}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      aria-label={`Abrir submenu de ${item.label}`}
                      className={`px-1.5 text-white/70 hover:bg-white/15 hover:text-white ${isOpen ? "bg-white/20 text-white" : ""}`}
                    >
                      <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <ul className="absolute left-0 top-full z-40 min-w-56 rounded-b-lg border border-slate-200 bg-white py-1.5 shadow-xl" role="menu" aria-label={`Submenu ${item.label}`}>
                        {item.children.map((sub) => (
                          <li key={sub.label} role="none">
                            {sub.external ? (
                              <a href={sub.href} target="_blank" rel="noreferrer" role="menuitem" className="block px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-[#eaf3fa] hover:text-[#1a5276]">
                                {sub.label}
                              </a>
                            ) : (
                              <Link href={sub.href} role="menuitem" className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-[#eaf3fa] hover:text-[#1a5276]">
                                <ChevronRight className="size-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                {sub.label}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-2 py-[13px] text-[13px] font-semibold transition ${isActive ? "bg-white/20 text-white" : "text-white/90 hover:bg-white/15 hover:text-white"}`}
                  >
                    {item.home && <Home className="size-4" aria-hidden="true" />}
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
          <li className="ml-auto flex shrink-0 items-stretch border-l border-white/20">
            <Link href="/portal/mapa-do-site" aria-label="Todos os menus — mapa do site" title="Todos os menus" className="flex items-center px-4 text-white/70 hover:bg-white/15 hover:text-white">
              <Menu className="size-5" aria-hidden="true" />
            </Link>
          </li>
        </ul>

        {/* Mobile */}
        {mobileOpen && (
          <ul id="menu-principal-movel" className="divide-y divide-white/10 border-t border-white/20 bg-[#153e63] pb-2 xl:hidden">
            {MAIN_MENU.map((item) => {
              const expanded = mobileExpanded === item.label;
              return (
                <li key={item.label}>
                  <div className="flex items-center">
                    <Link href={item.href} className="flex flex-1 items-center gap-2 px-3 py-3 text-sm font-bold text-white">
                      {item.home && <Home className="size-4" aria-hidden="true" />}
                      {item.label}
                    </Link>
                    {item.children && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Recolher" : "Expandir"} submenu de ${item.label}`}
                        onClick={() => setMobileExpanded((c) => (c === item.label ? null : item.label))}
                        className="mr-2 rounded p-2 text-white/60 hover:bg-white/10"
                      >
                        <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {item.children && expanded && (
                    <ul className="bg-white/5 py-1">
                      {item.children.map((sub) => (
                        <li key={sub.label}>
                          {sub.external ? (
                            <a href={sub.href} target="_blank" rel="noreferrer" className="block px-6 py-2.5 text-sm text-white/80 hover:text-white">
                              {sub.label}
                            </a>
                          ) : (
                            <Link href={sub.href} className="block px-6 py-2.5 text-sm text-white/80 hover:text-white">
                              {sub.label}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            <li>
              <Link href="/portal/mapa-do-site" className="flex items-center gap-2 px-3 py-3 text-sm font-bold text-white/80">
                <Menu className="size-4" aria-hidden="true" /> Mapa do site
              </Link>
            </li>
          </ul>
        )}
      </div>

    </nav>
  );
}

export function PortalShell({ children, institution }: { children: React.ReactNode; institution: InstitutionalContact }) {
  const snapshot = useSyncExternalStore(subscribeToAccessibility, readAccessibilitySnapshot, () => "1:0");
  const [step, contrast] = snapshot.split(":");
  const fontStep = Number(step), highContrast = contrast === "1";
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const fontScale = FONT_STEPS[fontStep] ?? 1;
  const location = [institution.address, [institution.city, institution.state].filter(Boolean).join("/")].filter(Boolean).join(" · ");

  return (
    <div
      className={`${styles.shell} min-h-screen bg-[#eef1f4] text-slate-900 ${highContrast ? "portal-high-contrast" : ""}`}
      style={{ "--portal-font-scale": fontScale } as CSSProperties}
    >
      {highContrast && (
        <style>{`.portal-high-contrast, .portal-high-contrast main, .portal-high-contrast header, .portal-high-contrast nav, .portal-high-contrast footer, .portal-high-contrast section, .portal-high-contrast aside, .portal-high-contrast div, .portal-high-contrast input, .portal-high-contrast select, .portal-high-contrast textarea, .portal-high-contrast table, .portal-high-contrast th, .portal-high-contrast td, .portal-high-contrast details, .portal-high-contrast summary, .portal-high-contrast fieldset, .portal-high-contrast legend { background-color: #000 !important; background-image: none !important; color: #fff !important; border-color: #fff !important; } .portal-high-contrast a, .portal-high-contrast button { color: #ffe600 !important; } .portal-high-contrast img { filter: contrast(1.15); }`}</style>
      )}
      <a
        href="#conteudo-principal"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 font-semibold text-slate-950 shadow focus:not-sr-only focus:absolute focus:left-5 focus:top-4"
      >
        Ir para o conteúdo principal
      </a>

      <TopAccessibilityBar
        highContrast={highContrast}
        onIncrease={() => updateAccessibility(Math.min(FONT_STEPS.length - 1, fontStep + 1), highContrast)}
        onDecrease={() => updateAccessibility(Math.max(0, fontStep - 1), highContrast)}
        onResetFont={() => updateAccessibility(1, highContrast)}
        onToggleContrast={() => updateAccessibility(fontStep, !highContrast)}
      />

      <header>
        <QuickAccessBar router={router} query={query} setQuery={setQuery} />
        <MainMenu key={pathname} />
      </header>

      <div id="conteudo-principal" tabIndex={-1} className="outline-none">
        {children}
      </div>

      <footer className="mt-10 bg-[#0a3a5c] text-slate-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div>
            <InstitutionalLogo institutionName={institution.name} inverted />
            <p className="mt-4 text-sm leading-6 text-slate-200">
              Portal oficial de {institution.name}. Acesso público às informações institucionais, serviços e transparência.
            </p>
            <div className="mt-5 flex gap-2">
              {[
                { href: "#", label: "Facebook", symbol: "f" },
                { href: "#", label: "Instagram", symbol: "◎" },
                { href: "#", label: "YouTube", symbol: "▶" },
              ].map(({ href, label, symbol }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  title={label}
                  className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/25 hover:text-white"
                >
                  <span aria-hidden="true" className="text-base font-bold">{symbol}</span>
                </a>
              ))}
            </div>
            {institution.phone && (
              <p className="mt-4 text-sm text-slate-300">📞 {institution.phone}</p>
            )}
            {location && <p className="mt-2 text-[13px] leading-5 text-slate-400">{location}</p>}
          </div>

          <nav aria-label="Menu geral do rodapé">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-emerald-200">Menu geral</h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 text-sm">
              <li><Link href="/portal" className="hover:text-white hover:underline">Início</Link></li>
              <li><Link href="/portal/historia" className="hover:text-white hover:underline">O município</Link></li>
              <li><Link href="/portal/secretarias" className="hover:text-white hover:underline">Secretarias</Link></li>
              <li><Link href="/portal/servicos" className="hover:text-white hover:underline">Serviços</Link></li>
              <li><Link href="/portal/portaldatransparencia" className="hover:text-white hover:underline">Portal da Transparência</Link></li>
              <li><Link href="/portal/noticias" className="hover:text-white hover:underline">Notícias</Link></li>
              <li><Link href="/portal/mapa-do-site" className="hover:text-white hover:underline">Mapa do Site</Link></li>
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-emerald-200">Serviços</h2>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/portal/portaldatransparencia" className="hover:text-white hover:underline">Portal da Transparência</Link></li>
              <li><Link href="/portal/portaldoservidor" className="hover:text-white hover:underline">Portal do Servidor</Link></li>
              <li><Link href="/portal/ouvidoria" className="hover:text-white hover:underline">Ouvidoria municipal</Link></li>
              <li><Link href="/portal/acesso-informacao" className="hover:text-white hover:underline">Acesso à Informação (e-SIC)</Link></li>
              <li><Link href="/portal/contato" className="hover:text-white hover:underline">Fale Conosco</Link></li>
              <li><Link href="/portal/dados-abertos" className="hover:text-white hover:underline">Dados Abertos</Link></li>
              <li><Link href="/portal/acessibilidade" className="hover:text-white hover:underline">Acessibilidade</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/15 px-4 py-4 text-center text-xs text-slate-300">
          {institution.name} — Poder Executivo Municipal. Conteúdo institucional publicado e dados públicos autorizados.
        </div>
      </footer>
    </div>
  );
}

export function PortalBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Caminho de navegação" className="flex items-center gap-1.5 text-sm text-slate-600">
      <Link href="/portal" className="font-medium hover:text-[#1a5276] hover:underline">Portal</Link>
      <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
      <span aria-current="page" className="truncate text-slate-700">{current}</span>
    </nav>
  );
}

export function PortalTextContent({ content }: { content: string }) {
  const paragraphs = content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="space-y-5 text-[1.02rem] leading-8 text-slate-700">
      {(paragraphs.length ? paragraphs : [content]).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
    </div>
  );
}
